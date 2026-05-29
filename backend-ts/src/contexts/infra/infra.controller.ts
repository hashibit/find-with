import { Body, Controller, Headers, Post, type RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { type Request } from 'express';
import Stripe from 'stripe';
import { Webhook } from 'svix';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelemetryEvent } from '../../database/entities/telemetry/telemetry-event.entity.js';
import { IamService } from '../iam/iam.service.js';
import { BillingService } from '../iam/billing.service.js';
import { type AppConfig } from '../../config/configuration.js';
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
  ) {
    const stripeConfig = this.config.get('stripe', { infer: true })!;
    this.stripe = new Stripe(stripeConfig.secretKey, { apiVersion: '2024-06-20' });
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

    if (event.type === 'user.created') {
      const d = event.data;
      const email =
        (d['email_addresses'] as Array<{ email_address: string }>)?.[0]?.email_address ?? '';
      const fullName = [d['first_name'], d['last_name']].filter(Boolean).join(' ') || undefined;
      await this.iamService.upsert(d['id'] as string, email, fullName);
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
