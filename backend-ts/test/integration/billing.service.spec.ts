/**
 * Integration test: BillingService against a real PostgreSQL DB.
 *
 * Stripe API calls are mocked — the integration value here is the real DB
 * reads/writes and the tie-breaker idempotency logic:
 *
 *   - handleStripeEvent writes subscription fields correctly.
 *   - Stale events (older timestamp, or equal timestamp + lex-lower ID) are rejected.
 *   - invoice.payment_failed → PAST_DUE; invoice.payment_succeeded → ACTIVE.
 *   - finalizeCheckout updates tier + state for a paid session.
 */
import { DataSource, Repository } from 'typeorm';
import { vi, beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { BillingService } from '../../src/contexts/iam/billing.service.js';
import { BillingSubscription } from '../../src/database/entities/billing/subscription.entity.js';
import { ALL_ENTITIES } from '../../src/database/database.module.js';
import { PAYMENT_GATEWAY } from '../../src/adapters/payment/payment.interface.js';
import { ulid } from 'ulid';

const USER = 'int_test_user_billing';

const mockPayment = {
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  cancelSubscription: vi.fn(),
  pauseSubscription: vi.fn(),
  resumeSubscription: vi.fn(),
};

const mockConfig = {
  get: vi.fn().mockImplementation((key: string) => {
    if (key === 'stripe') return { secretKey: 'sk_test_fake_key', webhookSecret: 'whsec_fake' };
    return undefined;
  }),
} as any;

let ds: DataSource;
let repo: Repository<BillingSubscription>;
let service: BillingService;

function makeSubEvent(
  type: string,
  overrides: Partial<{
    id: string;
    created: number;
    subscriptionId: string;
    customerId: string;
    status: string;
    userId: string;
  }> = {},
) {
  const {
    id = 'evt_stripe_sub_001',
    created = 1_700_000_000,
    subscriptionId = 'sub_test_001',
    customerId = 'cus_test_001',
    status = 'active',
    userId = USER,
  } = overrides;

  return {
    id,
    type,
    created,
    data: {
      object: {
        id: subscriptionId,
        customer: customerId,
        status,
        current_period_end: created + 2_592_000,
        metadata: { userId },
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      },
    },
  };
}

function makeInvoiceEvent(
  type: string,
  subscriptionId: string,
  overrides: Partial<{ id: string; created: number }> = {},
) {
  const { id = 'evt_inv_001', created = 1_700_000_000 } = overrides;
  return {
    id,
    type,
    created,
    data: { object: { subscription: subscriptionId } },
  };
}

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ALL_ENTITIES,
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  repo = ds.getRepository(BillingSubscription);
  service = new BillingService(repo, mockPayment as any, mockConfig);
});

afterAll(async () => {
  await ds.destroy();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await repo.delete({ userId: USER });
  // Seed a FREE subscription row (created at user registration)
  await repo.save(
    repo.create({
      id: ulid(),
      userId: USER,
      tier: 'FREE',
      state: 'ACTIVE',
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      lastEventId: null,
      lastEventAt: null,
    }),
  );
});

afterEach(async () => {
  await repo.delete({ userId: USER });
});

describe('BillingService.handleStripeEvent — integration', () => {
  describe('customer.subscription.created', () => {
    it('writes subscriptionId, customerId, tier, state, and periodEnd', async () => {
      await service.handleStripeEvent(
        makeSubEvent('customer.subscription.created') as any,
      );

      const sub = await repo.findOne({ where: { userId: USER } });
      expect(sub!.stripeSubscriptionId).toBe('sub_test_001');
      expect(sub!.stripeCustomerId).toBe('cus_test_001');
      expect(sub!.tier).toBe('PRO');
      expect(sub!.state).toBe('ACTIVE');
      expect(sub!.lastEventId).toBe('evt_stripe_sub_001');
    });

    it('maps price_pro_plus_* to PRO_PLUS tier', async () => {
      const event = makeSubEvent('customer.subscription.created', {
        id: 'evt_plus_001',
      });
      (event.data.object as any).items = { data: [{ price: { id: 'price_pro_plus_monthly' } }] };

      await service.handleStripeEvent(event as any);

      const sub = await repo.findOne({ where: { userId: USER } });
      expect(sub!.tier).toBe('PRO_PLUS');
    });

    it('is a no-op when no subscription row exists for the userId', async () => {
      const event = makeSubEvent('customer.subscription.created', { userId: 'no_such_user' });
      await expect(service.handleStripeEvent(event as any)).resolves.not.toThrow();
    });
  });

  describe('customer.subscription.updated — tie-breaker', () => {
    it('rejects an event older than lastEventAt', async () => {
      const t = 1_700_000_000;
      // Apply the first event
      await service.handleStripeEvent(
        makeSubEvent('customer.subscription.created', { id: 'evt_a', created: t }) as any,
      );

      // Try applying an older event — should be ignored
      await service.handleStripeEvent(
        makeSubEvent('customer.subscription.updated', {
          id: 'evt_old',
          created: t - 1,
          status: 'paused',
        }) as any,
      );

      const sub = await repo.findOne({ where: { userId: USER } });
      // State should remain ACTIVE from the first event
      expect(sub!.state).toBe('ACTIVE');
      expect(sub!.lastEventId).toBe('evt_a');
    });

    it('rejects an event with equal timestamp but lex-lower event ID', async () => {
      const t = 1_700_000_000;
      await service.handleStripeEvent(
        makeSubEvent('customer.subscription.created', { id: 'evt_zzz', created: t }) as any,
      );

      // 'evt_aaa' < 'evt_zzz' lexicographically → rejected
      await service.handleStripeEvent(
        makeSubEvent('customer.subscription.updated', {
          id: 'evt_aaa',
          created: t,
          status: 'paused',
        }) as any,
      );

      const sub = await repo.findOne({ where: { userId: USER } });
      expect(sub!.state).toBe('ACTIVE');
      expect(sub!.lastEventId).toBe('evt_zzz');
    });

    it('applies an event with equal timestamp but lex-greater event ID', async () => {
      const t = 1_700_000_000;
      await service.handleStripeEvent(
        makeSubEvent('customer.subscription.created', { id: 'evt_aaa', created: t }) as any,
      );

      await service.handleStripeEvent(
        makeSubEvent('customer.subscription.updated', {
          id: 'evt_zzz',
          created: t,
          status: 'paused',
        }) as any,
      );

      const sub = await repo.findOne({ where: { userId: USER } });
      expect(sub!.state).toBe('PAUSED');
      expect(sub!.lastEventId).toBe('evt_zzz');
    });
  });

  describe('customer.subscription.deleted', () => {
    it('sets state to CANCELLED on the matching stripeSubscriptionId', async () => {
      // First, attach a subscription via created event
      await service.handleStripeEvent(
        makeSubEvent('customer.subscription.created', {
          id: 'evt_del_create',
          created: 1_700_000_000,
        }) as any,
      );

      await service.handleStripeEvent({
        id: 'evt_del_001',
        type: 'customer.subscription.deleted',
        created: 1_700_001_000,
        data: { object: { id: 'sub_test_001', customer: 'cus_test_001' } },
      } as any);

      const sub = await repo.findOne({ where: { userId: USER } });
      expect(sub!.state).toBe('CANCELLED');
    });
  });

  describe('invoice.payment_failed', () => {
    it('sets state to PAST_DUE', async () => {
      // Attach subscription first
      await service.handleStripeEvent(
        makeSubEvent('customer.subscription.created', { id: 'evt_base' }) as any,
      );

      await service.handleStripeEvent(
        makeInvoiceEvent('invoice.payment_failed', 'sub_test_001', {
          id: 'evt_fail_001',
          created: 1_700_001_000,
        }) as any,
      );

      const sub = await repo.findOne({ where: { userId: USER } });
      expect(sub!.state).toBe('PAST_DUE');
    });
  });

  describe('invoice.payment_succeeded', () => {
    it('transitions PAST_DUE → ACTIVE on successful payment', async () => {
      // Set up PAST_DUE state directly
      await repo.update({ userId: USER }, {
        stripeSubscriptionId: 'sub_test_001',
        state: 'PAST_DUE',
        lastEventId: 'evt_fail_base',
        lastEventAt: new Date(1_700_000_000 * 1000),
      });

      await service.handleStripeEvent(
        makeInvoiceEvent('invoice.payment_succeeded', 'sub_test_001', {
          id: 'evt_pay_001',
          created: 1_700_001_000,
        }) as any,
      );

      const sub = await repo.findOne({ where: { userId: USER } });
      expect(sub!.state).toBe('ACTIVE');
      expect(sub!.lastEventId).toBe('evt_pay_001');
    });

    it('does not change state when already ACTIVE', async () => {
      await repo.update({ userId: USER }, {
        stripeSubscriptionId: 'sub_test_001',
        state: 'ACTIVE',
        lastEventId: 'evt_active_base',
        lastEventAt: new Date(1_700_000_000 * 1000),
      });

      await service.handleStripeEvent(
        makeInvoiceEvent('invoice.payment_succeeded', 'sub_test_001', {
          id: 'evt_pay_002',
          created: 1_700_001_000,
        }) as any,
      );

      const sub = await repo.findOne({ where: { userId: USER } });
      // State unchanged, lastEventId unchanged (payment_succeeded only acts on PAUSED/PAST_DUE)
      expect(sub!.state).toBe('ACTIVE');
      expect(sub!.lastEventId).toBe('evt_active_base');
    });
  });
});

describe('BillingService.finalizeCheckout — integration', () => {
  it('throws NotFoundException when no subscription row exists', async () => {
    const fakeSession = {
      payment_status: 'paid',
      subscription: 'sub_finalize_001',
      customer: 'cus_finalize_001',
      line_items: { data: [{ price: { id: 'price_pro_monthly' } }] },
    };
    vi.spyOn((service as any).stripe.checkout.sessions, 'retrieve').mockResolvedValueOnce(
      fakeSession as any,
    );

    await expect(service.finalizeCheckout('no_such_user', 'cs_test_session')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns FREE tier without DB changes when session is unpaid', async () => {
    const fakeSession = { payment_status: 'unpaid', subscription: null };
    vi.spyOn((service as any).stripe.checkout.sessions, 'retrieve').mockResolvedValueOnce(
      fakeSession as any,
    );

    const result = await service.finalizeCheckout(USER, 'cs_test_unpaid');
    expect(result).toEqual({ ok: true, tier: 'FREE' });

    const sub = await repo.findOne({ where: { userId: USER } });
    expect(sub!.tier).toBe('FREE');
    expect(sub!.stripeSubscriptionId).toBeNull();
  });

  it('upgrades tier and state in DB for a paid session', async () => {
    const fakeSession = {
      payment_status: 'paid',
      subscription: 'sub_finalize_002',
      customer: 'cus_finalize_002',
      line_items: { data: [{ price: { id: 'price_pro_monthly' } }] },
    };
    vi.spyOn((service as any).stripe.checkout.sessions, 'retrieve').mockResolvedValueOnce(
      fakeSession as any,
    );

    const result = await service.finalizeCheckout(USER, 'cs_test_paid');
    expect(result).toEqual({ ok: true, tier: 'PRO' });

    const sub = await repo.findOne({ where: { userId: USER } });
    expect(sub!.tier).toBe('PRO');
    expect(sub!.state).toBe('ACTIVE');
    expect(sub!.stripeSubscriptionId).toBe('sub_finalize_002');
    expect(sub!.stripeCustomerId).toBe('cus_finalize_002');
  });
});

describe('BillingService.resumeSubscription — integration', () => {
  it('throws NotFoundException when no subscription row exists', async () => {
    await expect(service.resumeSubscription('no_such_user')).rejects.toThrow(NotFoundException);
  });

  it('sets state to ACTIVE and calls payment.resumeSubscription when PAUSED', async () => {
    await repo.update({ userId: USER }, {
      stripeSubscriptionId: 'sub_paused_001',
      state: 'PAUSED',
    });

    const result = await service.resumeSubscription(USER);
    expect(result).toEqual({ ok: true });
    expect(mockPayment.resumeSubscription).toHaveBeenCalledWith('sub_paused_001');

    const sub = await repo.findOne({ where: { userId: USER } });
    expect(sub!.state).toBe('ACTIVE');
  });

  it('sets state to ACTIVE without calling gateway when not PAUSED', async () => {
    await repo.update({ userId: USER }, { state: 'CANCELLED' });

    await service.resumeSubscription(USER);
    expect(mockPayment.resumeSubscription).not.toHaveBeenCalled();

    const sub = await repo.findOne({ where: { userId: USER } });
    expect(sub!.state).toBe('ACTIVE');
  });
});
