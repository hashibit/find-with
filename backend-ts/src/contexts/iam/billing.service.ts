import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { BillingSubscription } from '../../database/entities/billing/subscription.entity.js';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../../adapters/payment/payment.interface.js';
import { type AppConfig } from '../../config/configuration.js';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe;

  constructor(
    @InjectRepository(BillingSubscription)
    private readonly repo: Repository<BillingSubscription>,
    @Inject(PAYMENT_GATEWAY) private readonly payment: PaymentGateway,
    private readonly config: ConfigService<AppConfig>,
  ) {
    const stripeConfig = this.config.get('stripe', { infer: true })!;
    this.stripe = new Stripe(stripeConfig.secretKey, { apiVersion: '2024-06-20' });
  }

  async getSubscription(userId: string): Promise<BillingSubscription | null> {
    return this.repo.findOne({ where: { userId } });
  }

  async createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    return this.payment.createCheckoutSession(userId, priceId, successUrl, cancelUrl);
  }

  async createPortalSession(userId: string, returnUrl: string) {
    const sub = await this.repo.findOne({ where: { userId } });
    if (!sub?.stripeCustomerId) throw new NotFoundException('No billing customer found');
    return this.payment.createPortalSession(sub.stripeCustomerId, returnUrl);
  }

  async finalizeCheckout(userId: string, sessionId: string): Promise<{ ok: boolean; tier: string }> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items'],
    });

    if (session.payment_status !== 'paid' || !session.subscription) {
      return { ok: true, tier: 'FREE' };
    }

    const sub = await this.repo.findOne({ where: { userId } });
    if (!sub) throw new NotFoundException('No subscription record found');

    const subscriptionId =
      typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
    const customerId =
      typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);

    const priceId = session.line_items?.data[0]?.price?.id ?? '';
    const tier = this.tierFromPriceId(priceId);

    sub.stripeSubscriptionId = subscriptionId;
    if (customerId) sub.stripeCustomerId = customerId;
    sub.tier = tier;
    sub.state = 'ACTIVE';
    sub.lastEventId = session.id;
    sub.lastEventAt = new Date();
    await this.repo.save(sub);

    return { ok: true, tier };
  }

  async resumeSubscription(userId: string): Promise<{ ok: boolean }> {
    const sub = await this.repo.findOne({ where: { userId } });
    if (!sub) throw new NotFoundException('No subscription record found');

    if (sub.state === 'PAUSED' && sub.stripeSubscriptionId) {
      await this.payment.resumeSubscription(sub.stripeSubscriptionId);
    }

    sub.state = 'ACTIVE';
    await this.repo.save(sub);
    return { ok: true };
  }

  async handleStripeEvent(event: {
    type: string;
    data: { object: Record<string, unknown> };
    id: string;
    created: number;
  }): Promise<void> {
    const obj = event.data.object;

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated'
    ) {
      const subscriptionId = obj['id'] as string;
      const customerId = obj['customer'] as string;
      const status = obj['status'] as string;
      const periodEnd = obj['current_period_end'] as number;
      const metadata = obj['metadata'] as Record<string, string> | undefined;
      const userId = metadata?.['userId'];

      if (!userId) return;

      const sub = await this.repo.findOne({ where: { userId } });
      if (!sub) return;

      if (!this.shouldApplyEvent(sub, event)) return;

      sub.stripeSubscriptionId = subscriptionId;
      sub.stripeCustomerId = customerId;
      sub.state = status === 'active' ? 'ACTIVE' : status === 'paused' ? 'PAUSED' : 'CANCELLED';
      sub.tier = this.tierFromStatus(obj);
      sub.periodEnd = new Date(periodEnd * 1000);
      sub.lastEventId = event.id;
      sub.lastEventAt = new Date(event.created * 1000);
      await this.repo.save(sub);
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscriptionId = obj['id'] as string;
      const sub = await this.repo.findOne({ where: { stripeSubscriptionId: subscriptionId } });
      if (!sub) return;

      if (!this.shouldApplyEvent(sub, event)) return;

      sub.state = 'CANCELLED';
      sub.lastEventId = event.id;
      sub.lastEventAt = new Date(event.created * 1000);
      await this.repo.save(sub);
    }

    if (event.type === 'checkout.session.completed') {
      const sessionObj = obj as Record<string, unknown>;
      const subscriptionId = sessionObj['subscription'] as string | undefined;
      const customerId = sessionObj['customer'] as string | undefined;
      const metadata = sessionObj['metadata'] as Record<string, string> | undefined;
      const userId = metadata?.['userId'] ?? (sessionObj['client_reference_id'] as string | undefined);

      if (!userId || !subscriptionId) return;

      const sub = await this.repo.findOne({ where: { userId } });
      if (!sub) return;

      if (!this.shouldApplyEvent(sub, event)) return;

      // Retrieve full subscription to get line items / price
      const stripeSub = await this.stripe.subscriptions.retrieve(subscriptionId);
      const priceId = stripeSub.items.data[0]?.price?.id ?? '';
      const tier = this.tierFromPriceId(priceId);

      sub.stripeSubscriptionId = subscriptionId;
      if (customerId) sub.stripeCustomerId = customerId;
      sub.tier = tier;
      sub.state = 'ACTIVE';
      sub.lastEventId = event.id;
      sub.lastEventAt = new Date(event.created * 1000);
      await this.repo.save(sub);
    }

    if (event.type === 'invoice.payment_succeeded') {
      const subscriptionId = obj['subscription'] as string | undefined;
      if (!subscriptionId) return;

      const sub = await this.repo.findOne({ where: { stripeSubscriptionId: subscriptionId } });
      if (!sub) return;

      if (!this.shouldApplyEvent(sub, event)) return;

      if (sub.state === 'PAUSED' || sub.state === 'PAST_DUE') {
        sub.state = 'ACTIVE';
        sub.lastEventId = event.id;
        sub.lastEventAt = new Date(event.created * 1000);
        await this.repo.save(sub);
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const subscriptionId = obj['subscription'] as string | undefined;
      if (!subscriptionId) return;

      const sub = await this.repo.findOne({ where: { stripeSubscriptionId: subscriptionId } });
      if (!sub) return;

      if (!this.shouldApplyEvent(sub, event)) return;

      sub.state = 'PAST_DUE';
      sub.lastEventId = event.id;
      sub.lastEventAt = new Date(event.created * 1000);
      await this.repo.save(sub);
    }
  }

  /**
   * Returns true if the incoming event should be applied based on the
   * tie-breaker logic: later created timestamp wins; on equal timestamps,
   * the lexicographically greater event ID wins.
   */
  private shouldApplyEvent(
    sub: BillingSubscription,
    event: { id: string; created: number },
  ): boolean {
    if (!sub.lastEventAt) return true;

    const incomingMs = event.created * 1000;
    const lastMs = sub.lastEventAt.getTime();

    if (incomingMs > lastMs) return true;
    if (incomingMs < lastMs) return false;

    // Equal timestamps: compare event IDs lexicographically
    return event.id > (sub.lastEventId ?? '');
  }

  private tierFromStatus(obj: Record<string, unknown>): string {
    const items =
      (obj['items'] as { data: Array<{ price: { id: string } }> } | undefined)?.data ?? [];
    const priceId = items[0]?.price?.id ?? '';
    return this.tierFromPriceId(priceId);
  }

  private tierFromPriceId(priceId: string): string {
    if (priceId.includes('pro_plus')) return 'PRO_PLUS';
    if (priceId.includes('pro')) return 'PRO';
    return 'FREE';
  }
}
