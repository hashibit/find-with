import { vi } from 'vitest';

// current-user.decorator.ts imports `express` types which can't be resolved by vitest.
// Mock it here; redis.module is pre-mocked globally in test/setup.ts.
vi.mock('../../../src/common/decorators/current-user.decorator.js', () => ({
  CurrentUser: () => () => {},
}));
vi.mock('../../../src/contexts/iam/services/nonce.store.js', () => ({
  NonceStore: class {},
}));

import { BadRequestException } from '@nestjs/common';
import { IamController } from '../../../src/contexts/iam/iam.controller.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeIamService = () => ({
  upsert: vi.fn().mockResolvedValue({ id: 'db_user_01', clerkId: 'clerk_u1' }),
  findByClerkId: vi.fn().mockResolvedValue({ id: 'db_user_01' }),
  getSettings: vi.fn().mockResolvedValue({ density: 'BALANCED', locale: 'en', timezone: 'UTC' }),
  updateSettings: vi.fn().mockImplementation((_, dto) => Promise.resolve(dto)),
});

const makeAuthVerifier = () => ({
  verify: vi.fn().mockResolvedValue({ userId: 'clerk_u1', email: 'user@example.com' }),
});

const makeNonceStore = () => ({
  validate: vi.fn().mockResolvedValue(null),
});

const makeRedisService = () => ({
  client: {
    setex: vi.fn().mockResolvedValue('OK'),
  },
});

function buildController(overrides: Partial<{
  iamService: ReturnType<typeof makeIamService>;
  authVerifier: ReturnType<typeof makeAuthVerifier>;
  nonceStore: ReturnType<typeof makeNonceStore>;
  redisService: ReturnType<typeof makeRedisService>;
}> = {}) {
  const iamService = overrides.iamService ?? makeIamService();
  const authVerifier = overrides.authVerifier ?? makeAuthVerifier();
  const nonceStore = overrides.nonceStore ?? makeNonceStore();
  const redisService = overrides.redisService ?? makeRedisService();

  const controller = new IamController(
    iamService as any,
    authVerifier as any,
    nonceStore as any,
    redisService as any,
  );

  return { controller, iamService, authVerifier, nonceStore, redisService };
}

const MOCK_USER = { userId: 'clerk_u1' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IamController', () => {
  describe('upsert()', () => {
    it('delegates to IamService.upsert with user id and email', async () => {
      const { controller, iamService } = buildController();
      await controller.upsert(MOCK_USER as any, { email: 'a@b.com' } as any);
      expect(iamService.upsert).toHaveBeenCalledWith('clerk_u1', 'a@b.com', undefined);
    });

    it('passes fullName when provided', async () => {
      const { controller, iamService } = buildController();
      await controller.upsert(MOCK_USER as any, { email: 'a@b.com', fullName: 'Alice' } as any);
      expect(iamService.upsert).toHaveBeenCalledWith('clerk_u1', 'a@b.com', 'Alice');
    });
  });

  describe('me()', () => {
    it('returns user from IamService.findByClerkId', async () => {
      const { controller, iamService } = buildController();
      const result = await controller.me(MOCK_USER as any);
      expect(iamService.findByClerkId).toHaveBeenCalledWith('clerk_u1');
      expect(result).toMatchObject({ id: 'db_user_01' });
    });
  });

  describe('getSettings()', () => {
    it('returns user settings', async () => {
      const { controller } = buildController();
      const result = await controller.getSettings(MOCK_USER as any);
      expect(result).toMatchObject({ density: 'BALANCED' });
    });
  });

  describe('updateSettings()', () => {
    it('delegates settings update to IamService', async () => {
      const { controller, iamService } = buildController();
      await controller.updateSettings(MOCK_USER as any, { density: 'QUIET' } as any);
      expect(iamService.updateSettings).toHaveBeenCalledWith('db_user_01', { density: 'QUIET' });
    });
  });

  describe('authExchange()', () => {
    it('throws BadRequestException for invalid or expired nonce', async () => {
      const nonceStore = makeNonceStore();
      nonceStore.validate.mockResolvedValue(null);
      const { controller } = buildController({ nonceStore });

      await expect(
        controller.authExchange({ nonce: 'invalid-nonce-12345' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns a token and expiry for valid nonce', async () => {
      const nonceStore = makeNonceStore();
      nonceStore.validate.mockResolvedValue('user_01');
      const { controller, redisService } = buildController({ nonceStore });

      const result = await controller.authExchange({ nonce: 'valid-nonce-12345' } as any);

      expect(result.token).toBeTruthy();
      expect(typeof result.token).toBe('string');
      expect(result.token).toHaveLength(64); // 32 bytes → 64 hex chars
      expect(result.user_id).toBe('user_01');
      expect(result.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('stores session token in Redis with 24-hour TTL', async () => {
      const nonceStore = makeNonceStore();
      nonceStore.validate.mockResolvedValue('user_01');
      const { controller, redisService } = buildController({ nonceStore });

      const result = await controller.authExchange({ nonce: 'valid-nonce-12345' } as any);

      expect(redisService.client.setex).toHaveBeenCalledWith(
        `session:${result.token}`,
        86400,
        'user_01',
      );
    });

    it('issues a different token on each call (CSPRNG)', async () => {
      const nonceStore = makeNonceStore();
      nonceStore.validate
        .mockResolvedValueOnce('user_01')
        .mockResolvedValueOnce('user_01');
      const { controller } = buildController({ nonceStore });

      const r1 = await controller.authExchange({ nonce: 'nonce-aaaaaa-1234' } as any);
      const r2 = await controller.authExchange({ nonce: 'nonce-bbbbbb-1234' } as any);

      expect(r1.token).not.toBe(r2.token);
    });
  });

  describe('authVerify()', () => {
    it('verifies Clerk JWT and returns session token', async () => {
      const { controller } = buildController();
      const result = await controller.authVerify({ clerkToken: 'jwt.token.here' } as any);

      expect(result.token).toHaveLength(64);
      expect(result.user_id).toBe('clerk_u1');
      expect(result.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('stores session token in Redis for verified user', async () => {
      const { controller, redisService } = buildController();
      const result = await controller.authVerify({ clerkToken: 'jwt.token.here' } as any);

      expect(redisService.client.setex).toHaveBeenCalledWith(
        `session:${result.token}`,
        86400,
        'clerk_u1',
      );
    });

    it('upserts user in IAM after Clerk verification', async () => {
      const { controller, iamService } = buildController();
      await controller.authVerify({ clerkToken: 'jwt.token.here' } as any);
      expect(iamService.upsert).toHaveBeenCalledWith('clerk_u1', 'user@example.com');
    });

    it('falls back to unknown email when Clerk returns no email', async () => {
      const authVerifier = makeAuthVerifier();
      authVerifier.verify.mockResolvedValue({ userId: 'clerk_u1', email: null });
      const { controller, iamService } = buildController({ authVerifier });

      await controller.authVerify({ clerkToken: 'jwt.token.here' } as any);

      expect(iamService.upsert).toHaveBeenCalledWith('clerk_u1', 'unknown@findwith.com');
    });

    it('propagates AuthVerifier errors', async () => {
      const authVerifier = makeAuthVerifier();
      authVerifier.verify.mockRejectedValue(new Error('Invalid JWT'));
      const { controller } = buildController({ authVerifier });

      await expect(
        controller.authVerify({ clerkToken: 'bad.token' } as any),
      ).rejects.toThrow('Invalid JWT');
    });
  });
});
