import { vi } from 'vitest';
// redis.module is pre-mocked in test/setup.ts to work around a vite-tsconfig-paths v5
// resolution bug where transitive .js imports from source files are not normalised to
// absolute paths, causing vite to fail before vi.mock in this file can intercept.
import { NonceStore } from '../../../src/contexts/iam/services/nonce.store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRedisClient = () => ({
  setex: vi.fn().mockResolvedValue('OK'),
  getdel: vi.fn().mockResolvedValue(null),
});

function buildStore(redisClient = makeRedisClient()) {
  const redisService = { client: redisClient };
  const store = new NonceStore(redisService as any);
  return { store, redisClient };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NonceStore', () => {
  describe('store()', () => {
    it('stores nonce with default 5-minute TTL', async () => {
      const { store, redisClient } = buildStore();
      await store.store('abc123', 'user_01');
      expect(redisClient.setex).toHaveBeenCalledWith('nonce:abc123', 300, 'user_01');
    });

    it('stores nonce with custom TTL', async () => {
      const { store, redisClient } = buildStore();
      await store.store('xyz789', 'user_02', 60);
      expect(redisClient.setex).toHaveBeenCalledWith('nonce:xyz789', 60, 'user_02');
    });

    it('prefixes key with "nonce:" to prevent key collision', async () => {
      const { store, redisClient } = buildStore();
      await store.store('mytoken', 'u1');
      const [key] = redisClient.setex.mock.calls[0] as [string, number, string];
      expect(key).toMatch(/^nonce:/);
    });

    it('propagates Redis errors to caller', async () => {
      const redisClient = makeRedisClient();
      redisClient.setex.mockRejectedValue(new Error('Redis connection lost'));
      const { store } = buildStore(redisClient);
      await expect(store.store('n1', 'u1')).rejects.toThrow('Redis connection lost');
    });
  });

  describe('validate()', () => {
    it('returns userId for a valid (existing) nonce', async () => {
      const redisClient = makeRedisClient();
      redisClient.getdel.mockResolvedValue('user_01');
      const { store } = buildStore(redisClient);

      const result = await store.validate('valid_nonce');

      expect(result).toBe('user_01');
    });

    it('returns null for an expired or missing nonce', async () => {
      const { store, redisClient } = buildStore();
      redisClient.getdel.mockResolvedValue(null);

      const result = await store.validate('expired_nonce');

      expect(result).toBeNull();
    });

    it('calls GETDEL with the correct key prefix', async () => {
      const { store, redisClient } = buildStore();

      await store.validate('mynonce');

      expect(redisClient.getdel).toHaveBeenCalledWith('nonce:mynonce');
    });

    it('consumes the nonce atomically — second call returns null', async () => {
      const redisClient = makeRedisClient();
      // GETDEL: first call returns userId, second call returns null (key already deleted)
      redisClient.getdel
        .mockResolvedValueOnce('user_01')
        .mockResolvedValueOnce(null);
      const { store } = buildStore(redisClient);

      const first = await store.validate('one_time_nonce');
      const second = await store.validate('one_time_nonce');

      expect(first).toBe('user_01');
      expect(second).toBeNull();
    });

    it('returns null (does not throw) when Redis call fails', async () => {
      const redisClient = makeRedisClient();
      redisClient.getdel.mockRejectedValue(new Error('timeout'));
      const { store } = buildStore(redisClient);

      const result = await store.validate('some_nonce');

      expect(result).toBeNull();
    });
  });
});
