export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export interface PortalSession {
  url: string;
}

export interface PaymentGateway {
  createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<CheckoutSession>;
  createPortalSession(customerId: string, returnUrl: string): Promise<PortalSession>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  pauseSubscription(subscriptionId: string): Promise<void>;
  resumeSubscription(subscriptionId: string): Promise<void>;
}
