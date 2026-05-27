import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { AppConfig } from '../../config/configuration';
import { FieldCrypto } from './crypto.interface';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LEN = 12;
const TAG_LEN = 16;

/**
 * Envelope encryption: DEK (Data Encryption Key) is itself encrypted
 * with a KEK (Key Encryption Key). Both are stored in env vars as base64.
 *
 * Wire format (bytea): nonce[12] + ciphertext + authTag[16]
 * This matches the Python crypto.py implementation exactly.
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

  verify(): void {
    // Sanity check on startup
    const test = 'envelope-crypto-verify';
    this.encrypt(test).then((enc) =>
      this.decrypt(enc).then((dec) => {
        if (dec !== test) throw new Error('EnvelopeCrypto self-test failed');
      }),
    );
  }

  private decryptDek(): Buffer {
    const cryptoConfig = this.config.get('crypto', { infer: true })!;
    const kek = Buffer.from(cryptoConfig.kek, 'base64');
    const dekBlob = Buffer.from(cryptoConfig.dekCiphertext, 'base64');

    const nonce = dekBlob.subarray(0, NONCE_LEN);
    const tag = dekBlob.subarray(dekBlob.length - TAG_LEN);
    const ciphertext = dekBlob.subarray(NONCE_LEN, dekBlob.length - TAG_LEN);

    const decipher = createDecipheriv(ALGORITHM, kek, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
