import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConvConversation } from '../../database/entities/conversation/conversation.entity.js';
import { ConvMessage } from '../../database/entities/conversation/message.entity.js';
import { ulid } from 'ulid';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(ConvConversation)
    private readonly convRepo: Repository<ConvConversation>,
    @InjectRepository(ConvMessage)
    private readonly messageRepo: Repository<ConvMessage>,
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
  ): Promise<{ conversation: ConvConversation; messages: ConvMessage[] }> {
    const conv = await this.convRepo.findOne({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.userId !== userId) throw new ForbiddenException();

    const messages = await this.messageRepo.find({
      where: { conversationId: id },
      order: { createdAt: 'ASC' },
    });

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
