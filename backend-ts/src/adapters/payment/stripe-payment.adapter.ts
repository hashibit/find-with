import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { type AppConfig } from '../../config/configuration.js';
import { type CheckoutSession, type PaymentGateway, type PortalSession } from './payment.interface.js';

@Injectable()
export class StripePaymentAdapter implements PaymentGateway {
  private readonly stripe: Stripe;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const stripeConfig = this.config.get('stripe', { infer: true })!;
    const options: Stripe.StripeConfig = { apiVersion: '2024-06-20' };
    if (stripeConfig.mockUrl) {
      // Point the SDK at the local mock instead of api.stripe.com.
      const u = new URL(stripeConfig.mockUrl);
      options.host = u.hostname;
      options.port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
      options.protocol = u.protocol.replace(':', '') as 'http' | 'https';
    }
    this.stripe = new Stripe(stripeConfig.secretKey, options);
  }

  async createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
    });
    return { url: session.url!, sessionId: session.id };
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.cancel(subscriptionId);
  }

  async pauseSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, {
      pause_collection: { behavior: 'void' },
    });
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, {
      pause_collection: '',
    } as never);
  }
}
