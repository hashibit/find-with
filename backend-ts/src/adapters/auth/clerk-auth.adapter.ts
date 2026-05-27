import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import JwksRsa from 'jwks-rsa';
import { AppConfig } from '../../config/configuration.js';
import { AuthVerifier, VerifiedToken } from './auth.interface.js';

@Injectable()
export class ClerkAuthAdapter implements AuthVerifier {
  private readonly client: JwksRsa.JwksClient;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const clerkConfig = this.config.get('clerk', { infer: true })!;
    this.client = JwksRsa({
      jwksUri: clerkConfig.jwksUrl,
      cache: true,
      cacheMaxAge: 3600000, // 1 hour
      rateLimit: true,
    });
  }

  async verify(token: string): Promise<VerifiedToken> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        (header, callback) => {
          this.client.getSigningKey(header.kid, (err, key) => {
            if (err) return callback(err);
            callback(null, key?.getPublicKey());
          });
        },
        { algorithms: ['RS256'] },
        (err, decoded) => {
          if (err || !decoded) {
            return reject(new UnauthorizedException('Invalid token'));
          }
          const payload = decoded as jwt.JwtPayload;
          // Clerk stores the internal user ID in `sub`
          const userId = payload['sub'] as string;
          const email = payload['email'] as string | undefined;
          if (!userId) {
            return reject(new UnauthorizedException('Missing sub claim'));
          }
          resolve({ userId, email });
        },
      );
    });
  }
}
