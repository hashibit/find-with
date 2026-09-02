import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { type AppConfig } from '../../config/configuration.js';
import { type FieldCrypto } from './crypto.interface.js';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LEN = 12;
const TAG_LEN = 16;

/**
 * Envelope encryption: DEK (Data Encryption Key) is itself encrypted
 * with a KEK (Key Encryption Key). Both are stored in env vars as base64.
 *
 * Wire format (bytea): nonce[12] + ciphertext + authTag[16]
 */
@Injectable()
export class EnvelopeCryptoService implements FieldCrypto {
  private dek: Buffer;

  constructor(private readonly config: ConfigService<AppConfig>) {
    this.dek = this.decryptDek();
  }

  async encrypt(plaintext: string): Promise<Buffer> {
    const nonce = randomBytes(NONCE_LEN);
    const cipher = createCipheriv(ALGORITHM, this.dek, nonce);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, encrypted, tag]);
  }

  async decrypt(data: Buffer): Promise<string> {
    const nonce = data.subarray(0, NONCE_LEN);
    const tag = data.subarray(data.length - TAG_LEN);
    const ciphertext = data.subarray(NONCE_LEN, data.length - TAG_LEN);
    const decipher = createDecipheriv(ALGORITHM, this.dek, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  async verify(): Promise<void> {
    // Sanity check on startup — must be awaited by the module bootstrap hook.
    // An unhandled rejection here means the DEK is misconfigured; the app must not start.
    const test = 'envelope-crypto-verify';
    const enc = await this.encrypt(test);
    const dec = await this.decrypt(enc);
    if (dec !== test) throw new Error('EnvelopeCrypto self-test failed: round-trip mismatch');
  }

  private decryptDek(): Buffer {
    const cryptoConfig = this.config.get('crypto', { infer: true });
    if (!cryptoConfig?.kek || !cryptoConfig?.dekCiphertext) {
      throw new Error(
        'Crypto config incomplete: CRYPTO_KEK and CRYPTO_DEK_CIPHERTEXT are required',
      );
    }
    let kek: Buffer;
    let dekBlob: Buffer;
    try {
      kek = Buffer.from(cryptoConfig.kek, 'base64');
      dekBlob = Buffer.from(cryptoConfig.dekCiphertext, 'base64');
    } catch (err) {
      throw new Error(`Failed to decode crypto config as base64: ${(err as Error).message}`);
    }

    const nonce = dekBlob.subarray(0, NONCE_LEN);
    const tag = dekBlob.subarray(dekBlob.length - TAG_LEN);
    const ciphertext = dekBlob.subarray(NONCE_LEN, dekBlob.length - TAG_LEN);

    const decipher = createDecipheriv(ALGORITHM, kek, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
