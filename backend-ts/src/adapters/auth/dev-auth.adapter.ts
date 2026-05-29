import { Injectable } from '@nestjs/common';
import { type AuthVerifier, type VerifiedToken } from './auth.interface.js';

/**
 * Dev-only: treats the raw token string as the userId.
 * Never use in production.
 */
@Injectable()
export class DevAuthAdapter implements AuthVerifier {
  async verify(token: string): Promise<VerifiedToken> {
    return { userId: token };
  }
}
