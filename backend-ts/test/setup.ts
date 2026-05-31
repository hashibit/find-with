/**
 * Global vitest setup: pre-mock modules that vite-tsconfig-paths v5 cannot resolve
 * transitively (resolved id stays relative instead of being normalised to an absolute
 * path, causing a load failure before vi.mock in individual test files can intercept).
 *
 * redis/redis.module.ts is the main culprit: it lives outside the default resolution
 * scope when imported as a .js extension from a deeply nested source file.
 */
import { vi } from 'vitest';

vi.mock('@/redis/redis.module.js', () => ({
  RedisService: class RedisService {
    get client() {
      return {};
    }
  },
  REDIS_CLIENT: Symbol('REDIS_CLIENT'),
  RedisModule: class {},
}));
