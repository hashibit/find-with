import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FollowupEmail } from '../../database/entities/followup/followup-email.entity.js';
import { FollowupDraft } from '../../database/entities/followup/followup-draft.entity.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../../common/crypto/crypto.interface.js';
import { Inject } from '@nestjs/common';
import { ulid } from 'ulid';

@Injectable()
export class FollowupService {
  constructor(
    @InjectRepository(FollowupEmail) private readonly emailRepo: Repository<FollowupEmail>,
    @InjectRepository(FollowupDraft) private readonly draftRepo: Repository<FollowupDraft>,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {}

  async captureEmail(
    userId: string,
    data: {
      subject?: string;
      fromAddr?: string;
      bodyText?: string;
      radarItemId?: string;
      receivedAt?: Date;
      source?: string;
    },
  ): Promise<FollowupEmail> {
    const encryptedBody = data.bodyText ? await this.crypto.encrypt(data.bodyText) : null;
    const knownSources = new Set(['gmail-web', 'gmail-api', 'outlook-web', 'other']);
    const source = data.source ? (knownSources.has(data.source) ? data.source : 'other') : undefined;
    const email = this.emailRepo.create({
      id: ulid(),
      userId,
      subject: data.subject ?? null,
      fromAddr: data.fromAddr ?? null,
      bodyText: encryptedBody,
      radarItemId: data.radarItemId ?? null,
      receivedAt: data.receivedAt ?? null,
      ...(source !== undefined && { source }),
    });
    return this.emailRepo.save(email);
  }

  async listEmails(userId: string): Promise<Array<Omit<FollowupEmail, 'bodyText'> & { bodyText?: string }>> {
    const emails = await this.emailRepo.find({ where: { userId }, order: { receivedAt: 'DESC' } });
    return Promise.all(
      emails.map(async (e) => {
        const { bodyText, ...rest } = e;
        return {
          ...rest,
          bodyText: bodyText ? await this.crypto.decrypt(bodyText) : undefined,
        };
      }),
    );
  }

  async listDrafts(userId: string): Promise<FollowupDraft[]> {
    return this.draftRepo.find({ where: { userId } });
  }
}
