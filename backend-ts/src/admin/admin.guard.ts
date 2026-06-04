import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelemetryEvent } from '../database/entities/telemetry/telemetry-event.entity.js';
import { type AppConfig } from '../config/configuration.js';
import { ulid } from 'ulid';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService<AppConfig>,
    @InjectRepository(TelemetryEvent)
    private readonly telemetryRepo: Repository<TelemetryEvent>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-admin-secret'];
    const secret = this.configService.get('admin', { infer: true })!.secret;

    const provided = typeof header === 'string' ? header : '';

    let isValid = false;
    try {
      // Use fixed-length buffers to avoid length-based timing leaks.
      // Encode both as UTF-8; timingSafeEqual requires equal lengths.
      const a = Buffer.from(provided, 'utf8');
      const b = Buffer.from(secret, 'utf8');
      // Constant-time comparison only works when lengths match.
      // If lengths differ, we still do the comparison on padded buffers
      // so no early exit, but record as invalid.
      const len = Math.max(a.length, b.length);
      const pa = Buffer.alloc(len);
      const pb = Buffer.alloc(len);
      a.copy(pa);
      b.copy(pb);
      isValid = timingSafeEqual(pa, pb) && a.length === b.length;
    } catch {
      isValid = false;
    }

    if (!isValid) {
      await this.telemetryRepo.save(
        this.telemetryRepo.create({
          id: ulid(),
          eventType: 'admin.auth.failure',
          userId: null,
          payload: { ip: request.ip },
        }),
      );
      throw new UnauthorizedException('Invalid admin secret');
    }

    return true;
  }
}
