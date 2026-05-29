import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { type AppConfig } from '../../config/configuration.js';
import { type AuthVerifier, type VerifiedToken } from './auth.interface.js';

@Injectable()
export class ClerkAuthAdapter implements AuthVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const { jwksUrl } = this.config.get('clerk', { infer: true })!;
    this.jwks = createRemoteJWKSet(new URL(jwksUrl), {
      cacheMaxAge: 3_600_000, // 1 hour
    });
  }

  async verify(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        algorithms: ['RS256'],
      });
      const userId = payload.sub;
      if (!userId) throw new UnauthorizedException('Missing sub claim');
      return { userId, email: payload['email'] as string | undefined };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid token');
    }
  }
}
