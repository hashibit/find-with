import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import type { AssistantMessage, Message, ToolResultMessage } from '@earendil-works/pi-ai';
import { ConvMessage } from '../database/entities/conversation/message.entity.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../common/crypto/crypto.interface.js';

@Injectable()
export class ConvMessageRepository {
  constructor(
    @InjectRepository(ConvMessage) private readonly repo: Repository<ConvMessage>,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {}

  async saveUser(conversationId: string, plainText: string): Promise<void> {
    const encryptedText = await this.crypto.encrypt(plainText);
    await this.repo.save(
      this.repo.create({ id: ulid(), conversationId, role: 'USER', text: null, encryptedText }),
    );
  }

  async saveAssistant(
    conversationId: string,
    finalMessage: AssistantMessage,
    fullText: string,
  ): Promise<void> {
    const encryptedText = fullText ? await this.crypto.encrypt(fullText) : null;
    await this.repo.save(
      this.repo.create({
        id: ulid(),
        conversationId,
        role: 'ASSISTANT',
        text: null,
        encryptedText,
        payload: finalMessage,
      }),
    );
  }

  async saveToolResult(conversationId: string, toolResultMsg: ToolResultMessage): Promise<void> {
    await this.repo.save(
      this.repo.create({
        id: ulid(),
        conversationId,
        role: 'TOOL_RESULT',
        payload: toolResultMsg,
      }),
    );
  }

  /**
   * Load and decrypt recent messages for LLM context building.
   * USER messages are decrypted. ASSISTANT and TOOL_RESULT messages use their stored payload.
   * Malformed payloads are silently dropped (matches existing behaviour in ContextBuilderService).
   */
  async findRecentForContext(conversationId: string, limit: number): Promise<Message[]> {
    const rows = await this.repo.find({
      where: { conversationId, archived: false },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    rows.reverse(); // DESC → ASC

    return Promise.all(
      rows.flatMap((msg): Array<Promise<Message>> => {
        if (msg.role === 'USER') {
          return [
            (async (): Promise<Message> => ({
              role: 'user' as const,
              content: msg.encryptedText
                ? await this.crypto.decrypt(msg.encryptedText)
                : (msg.text ?? ''),
              timestamp: msg.createdAt.getTime(),
            }))(),
          ];
        }
        if (msg.payload) {
          const p = msg.payload as unknown;
          if (typeof p !== 'object' || !p || !('role' in p) || !('content' in p)) {
            return [];
          }
          return [Promise.resolve(p as Message)];
        }
        return [];
      }),
    );
  }
}
