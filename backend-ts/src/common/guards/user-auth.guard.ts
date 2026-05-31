import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { type Request } from 'express';
import { AUTH_VERIFIER, type AuthVerifier } from '../../adapters/auth/auth.interface.js';
import { RedisService } from '../../redis/redis.module.js';

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing Bearer token');

    // Extension session tokens are 64 hex chars (32 CSPRNG bytes).
    // Validate against Redis — they are never sent to Clerk.
    if (this.isSessionToken(token)) {
      const userId = await this.redisService.client.get(`session:${token}`);
      if (!userId) throw new UnauthorizedException('Invalid or expired session token');
      request.user = { userId };
      return true;
    }

    // Web requests carry Clerk JWTs — delegate to the Clerk adapter.
    const payload = await this.verifier.verify(token);
    request.user = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return undefined;
    return auth.slice(7);
  }

  /** Extension session tokens are exactly 64 lowercase hex characters. */
  private isSessionToken(token: string): boolean {
    return /^[0-9a-f]{64}$/.test(token);
  }
}
