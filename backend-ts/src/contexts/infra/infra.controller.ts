import { Body, Controller, Headers, Post, type RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { type Request } from 'express';
import Stripe from 'stripe';
import { Webhook } from 'svix';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TelemetryEvent } from '../../database/entities/telemetry/telemetry-event.entity.js';
import { IamWebhookEvent } from '../../database/entities/iam/webhook-event.entity.js';
import { IamService } from '../iam/iam.service.js';
import { BillingService } from '../iam/billing.service.js';
import { type AppConfig } from '../../config/configuration.js';
import { MEMORY_QUEUE, type MemoryJobData } from '../memory/memory.constants.js';
import { ulid } from 'ulid';

@ApiTags('infra')
@Controller()
export class InfraController {
  private readonly stripe: Stripe;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly iamService: IamService,
    private readonly billingService: BillingService,
    @InjectRepository(TelemetryEvent)
    private readonly telemetryRepo: Repository<TelemetryEvent>,
    @InjectRepository(IamWebhookEvent)
    private readonly webhookEventRepo: Repository<IamWebhookEvent>,
    @InjectQueue(MEMORY_QUEUE) private readonly memoryQueue: Queue<MemoryJobData>,
  ) {
    const stripeConfig = this.config.get('stripe', { infer: true })!;
    this.stripe = new Stripe(stripeConfig.secretKey, { apiVersion: '2024-06-20' });
  }

  /** Returns false if the event was already processed (duplicate). */
  private async dedup(provider: string, eventId: string, eventType: string): Promise<boolean> {
    const result = await this.webhookEventRepo
      .createQueryBuilder()
      .insert()
      .into(IamWebhookEvent)
      .values({ id: ulid(), provider, eventId, eventType })
      .orIgnore()
      .execute();
    // TypeORM bug: identifiers contains the attempted ID even when ON CONFLICT DO NOTHING fires.
    // Reliable signal: raw array is non-empty on success, empty array on conflict.
    const rawArray = result.raw as unknown[];
    const hasRealData = rawArray.length > 0 && Object.keys(rawArray[0] ?? {}).length > 0;
    return hasRealData;
  }

  @Post('webhooks/clerk')
  @ApiOperation({ summary: 'Clerk webhook (user.created, user.deleted)' })
  async clerkWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
    @Body() body: unknown,
  ) {
    const svixConfig = this.config.get('svix', { infer: true })!;
    const wh = new Webhook(svixConfig.signingSecret);

    const rawBody = req.rawBody?.toString() ?? JSON.stringify(body);
    wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });

    const event = body as { type: string; data: Record<string, unknown> };

    // Idempotency: skip already-processed events
    if (svixId && !(await this.dedup('clerk', svixId, event.type))) {
      return { ok: true };
    }

    if (event.type === 'user.created') {
      const d = event.data;
      const email =
        (d['email_addresses'] as Array<{ email_address: string }>)?.[0]?.email_address ?? '';
      const fullName = [d['first_name'], d['last_name']].filter(Boolean).join(' ') || undefined;
      const user = await this.iamService.upsert(d['id'] as string, email, fullName);
      // Backfill embeddings for any existing materials (no-op for new users)
      await this.memoryQueue.add('backfill', { type: 'BACKFILL_EMBEDDINGS', userId: user.id });
    }

    if (event.type === 'user.deleted') {
      const d = event.data;
      try {
        const user = await this.iamService.findByClerkId(d['id'] as string);
        await this.iamService.softDelete(user.id);
      } catch {
        /* user may not exist */
      }
    }

    return { ok: true };
  }

  @Post('webhooks/stripe')
  @ApiOperation({ summary: 'Stripe webhook (subscription events)' })
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig: string,
  ) {
    const stripeConfig = this.config.get('stripe', { infer: true })!;
    const rawBody = req.rawBody ?? Buffer.from('');
    const event = this.stripe.webhooks.constructEvent(rawBody, sig, stripeConfig.webhookSecret);

    // Idempotency: skip already-processed events
    if (!(await this.dedup('stripe', event.id, event.type))) {
      return { ok: true };
    }

    await this.billingService.handleStripeEvent(
      event as unknown as Parameters<typeof this.billingService.handleStripeEvent>[0],
    );
    return { ok: true };
  }

  @Post('ingest/events')
  @ApiOperation({ summary: 'Ingest telemetry events from Chrome extension' })
  async ingestEvents(
    @Body()
    body: {
      events: Array<{ eventType: string; userId?: string; payload?: Record<string, unknown> }>;
    },
  ) {
    const entities = (body.events ?? []).map((e) =>
      this.telemetryRepo.create({ id: ulid(), ...e }),
    );
    await this.telemetryRepo.save(entities);
    return { ok: true, count: entities.length };
  }
}
