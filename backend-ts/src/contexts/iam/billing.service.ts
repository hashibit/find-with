import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingSubscription } from '../../database/entities/billing/subscription.entity.js';
import { PAYMENT_GATEWAY, PaymentGateway } from '../../adapters/payment/payment.interface.js';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(BillingSubscription)
    private readonly repo: Repository<BillingSubscription>,
    @Inject(PAYMENT_GATEWAY) private readonly payment: PaymentGateway,
  ) {}

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

      let sub = await this.repo.findOne({ where: { userId } });
      if (!sub) return;

      // Idempotency: skip stale events
      if (sub.lastEventAt && sub.lastEventAt > new Date(event.created * 1000)) return;

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
      sub.state = 'CANCELLED';
      sub.lastEventId = event.id;
      sub.lastEventAt = new Date(event.created * 1000);
      await this.repo.save(sub);
    }
  }

  private tierFromStatus(obj: Record<string, unknown>): string {
    const items =
      (obj['items'] as { data: Array<{ price: { id: string } }> } | undefined)?.data ?? [];
    const priceId = items[0]?.price?.id ?? '';
    if (priceId.includes('pro_plus')) return 'PRO_PLUS';
    if (priceId.includes('pro')) return 'PRO';
    return 'FREE';
  }
}
