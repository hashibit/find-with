import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import nodemailer, { type Transporter } from 'nodemailer';

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const smtp = this.config.get('smtp', { infer: true })!;
    if (!smtp.host) {
      this.logger.warn('SMTP_HOST not configured — email dispatch disabled');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    this.logger.log(`Mail service ready: ${smtp.host}:${smtp.port} from=${smtp.from}`);
  }

  async send(opts: MailOptions): Promise<void> {
    if (!this.transporter) {
      this.logger.debug(`Email skipped (no SMTP): ${opts.subject} → ${opts.to}`);
      return;
    }
    const smtp = this.config.get('smtp', { infer: true })!;
    await this.transporter.sendMail({ from: smtp.from, ...opts });
    this.logger.log(`Email sent: ${opts.subject} → ${opts.to}`);
  }
}
