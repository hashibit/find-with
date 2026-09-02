import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConvConversation } from '../../database/entities/conversation/conversation.entity.js';
import { ConvMessage } from '../../database/entities/conversation/message.entity.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../../common/crypto/crypto.interface.js';
import { ulid } from 'ulid';

/** A chat turn as returned by findOne — plaintext text, no ciphertext. */
export interface ConversationMessageView {
  id: string;
  conversationId: string;
  role: string;
  text: string | null;
  payload: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(ConvConversation)
    private readonly convRepo: Repository<ConvConversation>,
    @InjectRepository(ConvMessage)
    private readonly messageRepo: Repository<ConvMessage>,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {}

  async create(userId: string, kind: string, anchorId?: string): Promise<ConvConversation> {
    const conv = this.convRepo.create({
      id: ulid(),
      userId,
      kind,
      anchorId: anchorId ?? null,
      effectiveDensity: 'BALANCED',
      lastActivity: new Date(),
    });
    return this.convRepo.save(conv);
  }

  async findOne(
    userId: string,
    id: string,
  ): Promise<{ conversation: ConvConversation; messages: ConversationMessageView[] }> {
    const conv = await this.convRepo.findOne({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.userId !== userId) throw new ForbiddenException();

    // Display view: chat turns with decrypted text, so clients can restore the
    // transcript (text is null on write; plaintext only lives in encryptedText).
    // TOOL_RESULT rows are agent-internal plumbing, not chat turns, and
    // encryptedText is ciphertext — neither belongs in the response.
    const rows = await this.messageRepo.find({
      where: { conversationId: id, role: In(['USER', 'ASSISTANT']) },
      order: { createdAt: 'ASC' },
    });

    const messages = await Promise.all(
      rows.map(async (m) => {
        if (m.encryptedText) {
          m.text = await this.crypto.decrypt(m.encryptedText);
        }
        const { encryptedText, ...rest } = m;
        void encryptedText;
        return rest;
      }),
    );

    return { conversation: conv, messages };
  }

  async listByUser(userId: string): Promise<ConvConversation[]> {
    return this.convRepo.find({
      where: { userId },
      order: { lastActivity: 'DESC' },
      take: 50,
    });
  }

  /** Returns the conversation kind for a given id, or 'FREE_CHAT' if not found. */
  async getKind(id: string): Promise<string> {
    const conv = await this.convRepo.findOne({ where: { id }, select: ['kind'] });
    return conv?.kind ?? 'FREE_CHAT';
  }

  /** Returns the conversation if it belongs to userId, throws otherwise. */
  async close(userId: string, id: string): Promise<ConvConversation> {
    const conv = await this.convRepo.findOne({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.userId !== userId) throw new ForbiddenException();
    return conv;
  }
}
