import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AUTH_VERIFIER, AuthVerifier } from '../../adapters/auth/auth.interface';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_VERIFIER) private readonly verifier: AuthVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing Bearer token');

    const payload = await this.verifier.verify(token);
    request.user = payload;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return undefined;
    return auth.slice(7);
  }
}
