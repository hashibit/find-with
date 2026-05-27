export const STORAGE = Symbol('STORAGE');

export interface Storage {
  upload(key: string, buffer: Buffer, contentType: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  presignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
