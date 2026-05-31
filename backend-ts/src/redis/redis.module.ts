import { Global, Module, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { type AppConfig } from '../config/configuration.js';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * RedisService provides Redis connectivity operations.
 * Used for health checks and Redis-dependent operations.
 */
@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  /**
   * Get the underlying Redis client.
   */
  get client(): any {
    return this.redis;
  }

  /**
   * Test Redis connection by pinging the server.
   * Throws if connection is unavailable.
   */
  async testConnection(): Promise<void> {
    try {
      await this.redis.ping();
    } catch (error) {
      throw new Error(`Redis connection failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const url = config.get('redis', { infer: true })!.url;
        return new Redis(url, { maxRetriesPerRequest: null });
      },
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
