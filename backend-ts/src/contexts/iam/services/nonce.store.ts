import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.module.js';

/**
 * NonceStore provides Redis-based nonce validation with TTL.
 * Nonces are single-use tokens with a 5-minute expiration.
 */
@Injectable()
export class NonceStore {
  private readonly logger = new Logger(NonceStore.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Store a nonce in Redis with TTL.
   * @param nonce The nonce string to store
   * @param userId The user ID associated with this nonce
   * @param ttlSeconds Time-to-live in seconds (default: 300 = 5 minutes)
   */
  async store(nonce: string, userId: string, ttlSeconds = 300): Promise<void> {
    try {
      const client = this.redisService.client;
      await client.setex(`nonce:${nonce}`, ttlSeconds, userId);
      this.logger.log(`Stored nonce for user ${userId} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      this.logger.error(`Failed to store nonce: ${error instanceof Error ? error.message : 'unknown'}`);
      throw error;
    }
  }

  /**
   * Validate and consume a nonce atomically using GETDEL.
   * Returns the user ID if valid, null if expired or already used.
   * Nonces are single-use: GETDEL atomically retrieves and removes the key,
   * preventing replay attacks from concurrent requests.
   * @param nonce The nonce string to validate
   * @returns The user ID if valid, null otherwise
   */
  async validate(nonce: string): Promise<string | null> {
    try {
      const client = this.redisService.client;
      // GETDEL is atomic: concurrent requests both racing on the same nonce
      // will see at most one non-null result.
      const userId = await client.getdel(`nonce:${nonce}`);

      if (userId) {
        this.logger.log(`Validated and consumed nonce for user ${userId}`);
        return userId;
      }

      this.logger.warn(`Invalid or expired nonce: ${nonce}`);
      return null;
    } catch (error) {
      this.logger.error(`Failed to validate nonce: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }
}
