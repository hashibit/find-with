export const FIELD_CRYPTO = Symbol('FIELD_CRYPTO');

export interface FieldCrypto {
  /** Encrypt plaintext → nonce[12] + ciphertext bytes (AES-256-GCM). */
  encrypt(plaintext: string): Promise<Buffer>;
  /** Decrypt nonce[12] + ciphertext bytes → plaintext string. */
  decrypt(data: Buffer): Promise<string>;
  /** Verify the key pair is functional on startup. Must be awaited by module bootstrap. */
  verify(): Promise<void>;
}
