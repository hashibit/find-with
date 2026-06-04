/**
 * Shared bootstrap for HTTP integration tests.
 *
 * Boots the full NestJS AppModule with real DB + Redis.
 * Mocks only hard external dependencies (Clerk auth verifier, Stripe, S3, LLM).
 * Applies the same global middleware chain as main.ts so Controller /
 * ZodValidationPipe / HttpExceptionFilter are all exercised end-to-end.
 *
 * Auth guard note
 * ──────────────
 * APP_GUARD is overridden with TestSessionGuard — a purposely minimal guard
 * that replicates the session-token branch of the real UserAuthGuard:
 *   - No Authorization header → 401
 *   - Non-session-token (not 64 hex chars) → 401
 *   - Valid 64-hex token present in Redis → sets request.user, allows through
 *
 * UserAuthGuard (the real guard) requires ConfigService, which is not
 * resolvable for APP_GUARD providers in NestJS TestingModule due to how
 * global enhancers are injected in the application context.  The test guard
 * exercises the identical auth path used by the Chrome extension in prod
 * without needing ConfigService.
 */
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  type INestApplication,
  Inject,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import { vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter.js';
import { AUTH_VERIFIER } from '../../src/adapters/auth/auth.interface.js';
import { PAYMENT_GATEWAY } from '../../src/adapters/payment/payment.interface.js';
import { STORAGE } from '../../src/adapters/storage/storage.interface.js';
import { LLM_PROVIDER } from '../../src/llm/llm-provider.interface.js';
import { LlmService } from '../../src/llm/llm.service.js';
import { RedisService } from '../../src/redis/redis.module.js';
import { IamService } from '../../src/contexts/iam/iam.service.js';

// Fixed test credentials — all HTTP tests share one user seeded into DB + Redis.
export const TEST_USER_ID = 'http_test_clerkid_001';
// 64 lowercase hex chars — matches the guard's session-token regex
export const TEST_SESSION_TOKEN = 'b'.repeat(64);
export const AUTH = { Authorization: `Bearer ${TEST_SESSION_TOKEN}` };

/**
 * Minimal test guard: only implements the Redis session-token path.
 * No ConfigService, no Clerk JWT, no dev-mode bypass.
 */
@Injectable()
export class TestSessionGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const authHeader: string | undefined = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!token) throw new UnauthorizedException('Missing Bearer token');

    if (!/^[0-9a-f]{64}$/.test(token)) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const userId = await this.redis.client.get(`session:${token}`);
    if (!userId) throw new UnauthorizedException('Invalid or expired session token');

    req.user = { userId };
    return true;
  }
}

let _app: INestApplication | undefined;

export const mockPayment = {
  createCheckoutSession: vi.fn().mockResolvedValue({ url: 'https://stripe.test/checkout', sessionId: 'cs_test_001' }),
  createPortalSession: vi.fn().mockResolvedValue({ url: 'https://stripe.test/portal' }),
  cancelSubscription: vi.fn().mockResolvedValue(undefined),
  pauseSubscription: vi.fn().mockResolvedValue(undefined),
  resumeSubscription: vi.fn().mockResolvedValue(undefined),
};

export const mockStorage = {
  upload: vi.fn().mockResolvedValue('s3://test-bucket/resumes/test.pdf'),
  download: vi.fn().mockResolvedValue(Buffer.from('test')),
  presignedUrl: vi.fn().mockResolvedValue('https://s3.test/presigned'),
  delete: vi.fn().mockResolvedValue(undefined),
};

export const mockLlm = {
  streamContextWithModel: vi.fn(),
  streamContext: vi.fn(),
  completeContext: vi.fn().mockResolvedValue('{}'),
  embed: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
  recordError: vi.fn(),
  clearErrors: vi.fn(),
  ready: vi.fn().mockResolvedValue(undefined),
};

export const mockAuthVerifier = {
  verify: vi.fn().mockResolvedValue({ userId: TEST_USER_ID, email: 'http-test@findwith.local' }),
};

export async function getApp(): Promise<INestApplication> {
  if (_app) return _app;

  let module: TestingModule;
  try {
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_VERIFIER).useValue(mockAuthVerifier)
      .overrideProvider(PAYMENT_GATEWAY).useValue(mockPayment)
      .overrideProvider(STORAGE).useValue(mockStorage)
      .overrideProvider(LlmService).useValue(mockLlm)
      .overrideProvider(LLM_PROVIDER).useValue(mockLlm)
      // Replace the real UserAuthGuard (which needs ConfigService) with
      // TestSessionGuard (which only needs RedisService).
      .overrideProvider(APP_GUARD).useClass(TestSessionGuard)
      .compile();
  } catch (err) {
    console.error('[bootstrap] TestingModule compilation failed:', err);
    throw err;
  }

  _app = module.createNestApplication({ rawBody: true });
  _app.useGlobalPipes(new ZodValidationPipe());
  _app.useGlobalFilters(new HttpExceptionFilter());
  _app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'ready', 'webhooks/:path*', 'ingest/:path*'],
  });

  await _app.init();

  // Seed: ensure the test user exists in DB + Redis
  const iam = _app.get(IamService);
  await iam.upsert(TEST_USER_ID, 'http-test@findwith.local', 'HTTP Test User');

  const redis = _app.get(RedisService);
  await redis.client.setex(`session:${TEST_SESSION_TOKEN}`, 3600, TEST_USER_ID);

  return _app;
}

export async function closeApp(): Promise<void> {
  if (_app) {
    await _app.close();
    _app = undefined;
  }
}
