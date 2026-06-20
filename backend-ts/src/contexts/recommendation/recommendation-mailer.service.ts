import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IamUser } from '../../database/entities/iam/iam-user.entity.js';
import { BillingSubscription } from '../../database/entities/billing/subscription.entity.js';
import { RecommendationService } from './recommendation.service.js';
import { MailService } from '../../common/mail/mail.service.js';
import { type AppConfig } from '../../config/configuration.js';

@Injectable()
export class RecommendationMailerService {
  private readonly logger = new Logger(RecommendationMailerService.name);

  constructor(
    @InjectRepository(IamUser) private readonly userRepo: Repository<IamUser>,
    @InjectRepository(BillingSubscription) private readonly subRepo: Repository<BillingSubscription>,
    private readonly recoService: RecommendationService,
    private readonly mail: MailService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  /** Daily at 08:00 UTC — build recommendations and email active PRO/PRO_PLUS users. */
  @Cron('0 8 * * *')
  async dispatchDailyRecommendations(): Promise<void> {
    this.logger.log('Starting daily recommendation dispatch…');

    const activeSubs = await this.subRepo.find({
      where: { state: 'ACTIVE' },
    });

    let sent = 0;
    for (const sub of activeSubs) {
      // FREE users: skip (recommendations are a paid feature)
      if (sub.tier === 'FREE') continue;

      const user = await this.userRepo.findOne({ where: { id: sub.userId, isActive: true } });
      if (!user?.email) continue;

      try {
        const reco = await this.recoService.buildDailyRecommendations(
          user.id,
          'software engineer product manager',
        );

        const items = (reco.items ?? []) as Array<{
          title: string;
          company: string;
          location: string;
          url: string;
          snippet: string;
        }>;

        if (items.length === 0) continue;

        const apiBase = this.config.get('apiBaseUrl', { infer: true }) ?? 'http://localhost:14607';
        const trackUrl = (idx: number) => {
          const t = this.recoService.buildTrackingId(user.id, reco.id, idx);
          return `${apiBase}/api/v1/recommendations/r/${reco.id}` +
            `?t=${t}&uid=${encodeURIComponent(user.id)}&i=${idx}`;
        };

        const itemsText = items
          .map((j, i) => `${i + 1}. ${j.title} at ${j.company} (${j.location})\n   ${trackUrl(i)}\n   ${j.snippet}`)
          .join('\n\n');

        const itemsHtml = items
          .map(
            (j, idx) => `
            <div style="margin-bottom:16px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;">
              <div style="font-weight:600;font-size:14px;">${j.title}</div>
              <div style="color:#6b7280;font-size:13px;margin:2px 0;">${j.company} · ${j.location}</div>
              <div style="font-size:13px;margin-top:6px;">${j.snippet}</div>
              <a href="${trackUrl(idx)}" style="display:inline-block;margin-top:8px;color:#4f46e5;font-size:13px;">View job →</a>
            </div>`,
          )
          .join('');

        await this.mail.send({
          to: user.email,
          subject: `Quinn found ${items.length} job${items.length > 1 ? 's' : ''} for you today`,
          text: `Hi,\n\nHere are today's job recommendations:\n\n${itemsText}\n\n—Quinn`,
          html: `
            <div style="font-family:sans-serif;max-width:540px;margin:0 auto;">
              <h2 style="font-size:18px;margin-bottom:4px;">Today's picks</h2>
              <p style="color:#6b7280;font-size:13px;margin-bottom:20px;">
                Quinn found ${items.length} role${items.length > 1 ? 's' : ''} that match your profile.
              </p>
              ${itemsHtml}
              <p style="color:#9ca3af;font-size:11px;margin-top:24px;">
                You're receiving this because you have an active FindWith subscription.<br>
                Reply to this email to adjust your preferences.
              </p>
            </div>`,
        });

        // Mark as sent
        reco.sentAt = new Date();
        sent++;
      } catch (err) {
        this.logger.error(`Failed to dispatch recommendation for user ${user.id}: ${String(err)}`);
      }
    }

    this.logger.log(`Daily recommendation dispatch complete — sent ${sent} emails`);
  }
}
