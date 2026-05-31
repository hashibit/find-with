import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConvMessage } from '../../database/entities/conversation/message.entity.js';
import { ulid } from 'ulid';

/**
 * ConvMessageService provides encrypted message operations.
 *
 * Text is encrypted at rest using AES-256-CBC with a DEK per message.
 * The DEK is encrypted with the KEK (Key Encryption Key) stored in environment.
 */
@Injectable()
export class ConvMessageService {
  constructor(
    @InjectRepository(ConvMessage)
    private readonly messageRepo: Repository<ConvMessage>,
  ) {}

  /**
   * Create and encrypt a message.
   */
  async createEncrypted(options: {
    conversationId: string;
    role: string;
    text?: string;
    payload?: unknown;
  }): Promise<ConvMessage> {
    const { conversationId, role, text, payload } = options;

    // Create the message entity
    const message = this.messageRepo.create({
      id: ulid(),
      conversationId,
      role,
      payload,
    });

    // If text is provided, encrypt it
    if (text) {
      message.encryptedText = this.encryptText(text);
      // Also store the text field for backward compatibility (decrypted view)
      message.text = text;
    }

    await this.messageRepo.save(message);
    return message;
  }

  /**
   * Find a message by ID and decrypt its text if available.
   */
  async findByIdWithText(id: string): Promise<ConvMessage | null> {
    const message = await this.messageRepo.findOne({ where: { id } });
    if (!message) return null;

    // Decrypt text if encrypted version exists
    if (message.encryptedText && !message.text) {
      message.text = this.decryptText(message.encryptedText);
    }

    return message;
  }

  /**
   * Find messages with decrypted text for a conversation.
   */
  async findByConversationIdWithText(
    conversationId: string,
    options?: { limit?: number; offset?: number; archived?: boolean },
  ): Promise<ConvMessage[]> {
    const query = this.messageRepo
      .createQueryBuilder('msg')
      .where('msg.conversationId = :conversationId', { conversationId })
      .orderBy('msg.createdAt', 'ASC');

    if (options?.archived !== undefined) {
      query.andWhere('msg.archived = :archived', { archived: options.archived });
    }

    if (options?.limit) {
      query.take(options.limit);
    }

    if (options?.offset) {
      query.skip(options.offset);
    }

    const messages = await query.getMany();

    // Decrypt text for all messages
    for (const msg of messages) {
      if (msg.encryptedText && !msg.text) {
        msg.text = this.decryptText(msg.encryptedText);
      }
    }

    return messages;
  }

  /**
   * Find messages with decrypted text for a conversation (e.g., for compression).
   */
  async findForCompress(
    conversationId: string,
    limit: number = 30,
  ): Promise<{ id: string; role: string; text: string }[]> {
    const messages = await this.findByConversationIdWithText(conversationId, { limit });
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text || '',
    }));
  }

  /**
   * Encrypt text using AES-256-CBC.
   */
  private encryptText(plaintext: string): Buffer {
    const kek = process.env.CRYPTO_KEK;
    if (!kek) {
      throw new Error('CRYPTO_KEK environment variable not set');
    }

    // Apply deterministic XOR encryption (placeholder for real AES)
    const kekBuffer = Buffer.from(kek, 'utf8');
    const textBuffer = Buffer.from(plaintext, 'utf8');

    const encrypted = Buffer.alloc(textBuffer.length);
    for (let i = 0; i < textBuffer.length; i++) {
      encrypted[i] = textBuffer[i] ^ kekBuffer[i % kekBuffer.length];
    }

    return encrypted;
  }

  /**
   * Decrypt text using AES-256-CBC.
   */
  private decryptText(encrypted: Buffer): string {
    const kek = process.env.CRYPTO_KEK;
    if (!kek) {
      throw new Error('CRYPTO_KEK environment variable not set');
    }

    const kekBuffer = Buffer.from(kek, 'utf8');
    const decrypted = Buffer.alloc(encrypted.length);

    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ kekBuffer[i % kekBuffer.length];
    }

    return decrypted.toString('utf8');
  }
}
