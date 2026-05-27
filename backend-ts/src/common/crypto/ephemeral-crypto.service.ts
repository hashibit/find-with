import { Injectable } from '@nestjs/common';
import { FieldCrypto } from './crypto.interface.js';

/**
 * Dev-only identity "crypto" — stores plaintext as UTF-8 bytes.
 * Never use in production.
 */
@Injectable()
export class EphemeralCryptoService implements FieldCrypto {
  async encrypt(plaintext: string): Promise<Buffer> {
    return Buffer.from(plaintext, 'utf8');
  }

  async decrypt(data: Buffer): Promise<string> {
    return data.toString('utf8');
  }

  verify(): void {
    // No-op for dev
  }
}
