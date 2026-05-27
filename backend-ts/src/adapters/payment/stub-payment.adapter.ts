import { Injectable, Logger } from '@nestjs/common';
import { CheckoutSession, PaymentGateway, PortalSession } from './payment.interface';

@Injectable()
export class StubPaymentAdapter implements PaymentGateway {
  private readonly logger = new Logger(StubPaymentAdapter.name);

  async createCheckoutSession(userId: string): Promise<CheckoutSession> {
    this.logger.debug(`[stub] createCheckoutSession userId=${userId}`);
    return { url: 'http://localhost:3000/billing/stub', sessionId: 'stub_session' };
  }

  async createPortalSession(): Promise<PortalSession> {
    return { url: 'http://localhost:3000/billing/portal/stub' };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    this.logger.debug(`[stub] cancelSubscription ${subscriptionId}`);
  }

  async pauseSubscription(subscriptionId: string): Promise<void> {
    this.logger.debug(`[stub] pauseSubscription ${subscriptionId}`);
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    this.logger.debug(`[stub] resumeSubscription ${subscriptionId}`);
  }
}
