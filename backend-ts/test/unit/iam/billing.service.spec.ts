import { vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { BillingService } from '../../../src/contexts/iam/billing.service.js';
import { BillingSubscription } from '../../../src/database/entities/billing/subscription.entity.js';

const USER = 'unit_test_user';

function makeSub(override = {}): BillingSubscription {
  return {
    id: 'sub_01',
    userId: USER,
    tier: 'FREE',
    state: 'ACTIVE',
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    lastEventId: null,
    lastEventAt: null,
    ...override,
  } as any;
}

function buildService() {
  const repo = {
    findOne: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };

  const payment = {
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    cancelSubscription: vi.fn(),
    pauseSubscription: vi.fn(),
    resumeSubscription: vi.fn().mockResolvedValue(undefined),
  };

  const config = {
    get: vi.fn().mockReturnValue({ secretKey: 'sk_test_fake', webhookSecret: 'whsec_fake' }),
  };

  const service = new BillingService(repo as any, payment as any, config as any);

  return { service, repo, payment, config };
}

// ---------------------------------------------------------------------------

describe('BillingService', () => {
  describe('getSubscription', () => {
    it('returns null when repo.findOne returns null', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);
      const result = await service.getSubscription(USER);
      expect(result).toBeNull();
    });

    it('returns subscription when found', async () => {
      const { service, repo } = buildService();
      const sub = makeSub();
      repo.findOne.mockResolvedValue(sub);
      const result = await service.getSubscription(USER);
      expect(result).toBe(sub);
    });
  });

  describe('createPortalSession', () => {
    it('throws NotFoundException when no subscription exists', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);
      await expect(service.createPortalSession(USER, 'https://return.url')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when subscription has no stripeCustomerId', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(makeSub({ stripeCustomerId: null }));
      await expect(service.createPortalSession(USER, 'https://return.url')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('calls payment.createPortalSession with customerId', async () => {
      const { service, repo, payment } = buildService();
      const customerId = 'cus_abc123';
      repo.findOne.mockResolvedValue(makeSub({ stripeCustomerId: customerId }));
      payment.createPortalSession.mockResolvedValue({ url: 'https://portal.url' });

      await service.createPortalSession(USER, 'https://return.url');

      expect(payment.createPortalSession).toHaveBeenCalledWith(customerId, 'https://return.url');
    });
  });

  describe('resumeSubscription', () => {
    it('throws NotFoundException when no subscription exists', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);
      await expect(service.resumeSubscription(USER)).rejects.toThrow(NotFoundException);
    });

    it('calls payment.resumeSubscription when state is PAUSED', async () => {
      const { service, repo, payment } = buildService();
      const sub = makeSub({ state: 'PAUSED', stripeSubscriptionId: 'sub_stripe_01' });
      repo.findOne.mockResolvedValue(sub);

      await service.resumeSubscription(USER);

      expect(payment.resumeSubscription).toHaveBeenCalledWith('sub_stripe_01');
    });

    it('does NOT call payment.resumeSubscription when state is not PAUSED', async () => {
      const { service, repo, payment } = buildService();
      repo.findOne.mockResolvedValue(makeSub({ state: 'ACTIVE', stripeSubscriptionId: 'sub_stripe_01' }));

      await service.resumeSubscription(USER);

      expect(payment.resumeSubscription).not.toHaveBeenCalled();
    });

    it('sets state to ACTIVE', async () => {
      const { service, repo } = buildService();
      const sub = makeSub({ state: 'PAUSED', stripeSubscriptionId: 'sub_stripe_01' });
      repo.findOne.mockResolvedValue(sub);

      await service.resumeSubscription(USER);

      expect(sub.state).toBe('ACTIVE');
      expect(repo.save).toHaveBeenCalledWith(sub);
    });
  });

  describe('handleStripeEvent — customer.subscription.created', () => {
    function makeSubscriptionCreatedEvent(priceId: string, overrides: Record<string, unknown> = {}) {
      return {
        type: 'customer.subscription.created',
        id: 'evt_001',
        created: 1_700_000_000,
        data: {
          object: {
            id: 'sub_stripe_01',
            customer: 'cus_abc',
            status: 'active',
            current_period_end: 1_700_086_400,
            metadata: { userId: USER },
            items: { data: [{ price: { id: priceId } }] },
            ...overrides,
          },
        },
      };
    }

    it('writes tier PRO when priceId contains "pro" but not "pro_plus"', async () => {
      const { service, repo } = buildService();
      const sub = makeSub();
      repo.findOne.mockResolvedValue(sub);

      await service.handleStripeEvent(makeSubscriptionCreatedEvent('price_pro_monthly'));

      expect(sub.tier).toBe('PRO');
    });

    it('writes tier PRO_PLUS when priceId contains "pro_plus"', async () => {
      const { service, repo } = buildService();
      const sub = makeSub();
      repo.findOne.mockResolvedValue(sub);

      await service.handleStripeEvent(makeSubscriptionCreatedEvent('price_pro_plus_monthly'));

      expect(sub.tier).toBe('PRO_PLUS');
    });

    it('writes tier FREE for unknown priceId', async () => {
      const { service, repo } = buildService();
      const sub = makeSub();
      repo.findOne.mockResolvedValue(sub);

      await service.handleStripeEvent(makeSubscriptionCreatedEvent('price_unknown_xyz'));

      expect(sub.tier).toBe('FREE');
    });

    it('is a no-op when no subscription record exists for userId', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(null);

      await service.handleStripeEvent(makeSubscriptionCreatedEvent('price_pro_monthly'));

      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('handleStripeEvent — tie-breaker', () => {
    function makeUpdatedEvent(eventId: string, created: number) {
      return {
        type: 'customer.subscription.updated',
        id: eventId,
        created,
        data: {
          object: {
            id: 'sub_stripe_01',
            customer: 'cus_abc',
            status: 'active',
            current_period_end: 1_700_086_400,
            metadata: { userId: USER },
            items: { data: [{ price: { id: 'price_pro' } }] },
          },
        },
      };
    }

    it('rejects an older event (created < lastEventAt)', async () => {
      const { service, repo } = buildService();
      const lastEventAt = new Date(1_700_000_000 * 1000);
      repo.findOne.mockResolvedValue(
        makeSub({ lastEventAt, lastEventId: 'evt_old' }),
      );

      await service.handleStripeEvent(makeUpdatedEvent('evt_new', 1_699_999_999));

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a lex-lower eventId at the same timestamp', async () => {
      const { service, repo } = buildService();
      const ts = 1_700_000_000;
      repo.findOne.mockResolvedValue(
        makeSub({ lastEventAt: new Date(ts * 1000), lastEventId: 'evt_zzz' }),
      );

      await service.handleStripeEvent(makeUpdatedEvent('evt_aaa', ts));

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('applies a lex-greater eventId at the same timestamp', async () => {
      const { service, repo } = buildService();
      const ts = 1_700_000_000;
      const sub = makeSub({ lastEventAt: new Date(ts * 1000), lastEventId: 'evt_aaa' });
      repo.findOne.mockResolvedValue(sub);

      await service.handleStripeEvent(makeUpdatedEvent('evt_zzz', ts));

      expect(repo.save).toHaveBeenCalledWith(sub);
    });
  });

  describe('handleStripeEvent — invoice.payment_failed', () => {
    it('sets state PAST_DUE', async () => {
      const { service, repo } = buildService();
      const sub = makeSub({ stripeSubscriptionId: 'sub_stripe_01' });
      repo.findOne.mockResolvedValue(sub);

      await service.handleStripeEvent({
        type: 'invoice.payment_failed',
        id: 'evt_fail_01',
        created: 1_700_000_000,
        data: { object: { subscription: 'sub_stripe_01' } },
      });

      expect(sub.state).toBe('PAST_DUE');
      expect(repo.save).toHaveBeenCalledWith(sub);
    });
  });

  describe('handleStripeEvent — invoice.payment_succeeded', () => {
    it('transitions PAST_DUE → ACTIVE', async () => {
      const { service, repo } = buildService();
      const sub = makeSub({ state: 'PAST_DUE', stripeSubscriptionId: 'sub_stripe_01' });
      repo.findOne.mockResolvedValue(sub);

      await service.handleStripeEvent({
        type: 'invoice.payment_succeeded',
        id: 'evt_pay_01',
        created: 1_700_000_000,
        data: { object: { subscription: 'sub_stripe_01' } },
      });

      expect(sub.state).toBe('ACTIVE');
      expect(repo.save).toHaveBeenCalledWith(sub);
    });

    it('is a no-op when state is already ACTIVE', async () => {
      const { service, repo } = buildService();
      const sub = makeSub({ state: 'ACTIVE', stripeSubscriptionId: 'sub_stripe_01' });
      repo.findOne.mockResolvedValue(sub);

      await service.handleStripeEvent({
        type: 'invoice.payment_succeeded',
        id: 'evt_pay_02',
        created: 1_700_000_000,
        data: { object: { subscription: 'sub_stripe_01' } },
      });

      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('handleStripeEvent — customer.subscription.deleted', () => {
    it('sets state CANCELLED on the matching stripeSubscriptionId', async () => {
      const { service, repo } = buildService();
      const sub = makeSub({ state: 'ACTIVE', stripeSubscriptionId: 'sub_stripe_01' });
      repo.findOne.mockResolvedValue(sub);

      await service.handleStripeEvent({
        type: 'customer.subscription.deleted',
        id: 'evt_del_01',
        created: 1_700_000_000,
        data: { object: { id: 'sub_stripe_01' } },
      });

      expect(sub.state).toBe('CANCELLED');
      expect(repo.save).toHaveBeenCalledWith(sub);
    });
  });
});
