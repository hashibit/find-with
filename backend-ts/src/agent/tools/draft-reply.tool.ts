import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type, Static } from '@sinclair/typebox';
import { FollowupEmail } from '../../database/entities/followup/followup-email.entity';
import { FollowupDraft } from '../../database/entities/followup/followup-draft.entity';
import { LlmService, MODEL_WRITE } from '../../llm/llm.service';
import { FIELD_CRYPTO, FieldCrypto } from '../../common/crypto/crypto.interface';
import { Inject } from '@nestjs/common';
import { ulid } from 'ulid';

export const DRAFT_REPLY_TOOL_NAME = 'draft_reply';

const IntentEnum = Type.Union([
  Type.Literal('accept_interview'),
  Type.Literal('ask_reschedule'),
  Type.Literal('accept_offer'),
  Type.Literal('negotiate_offer'),
  Type.Literal('decline_politely'),
  Type.Literal('request_info'),
]);

@Injectable()
export class DraftReplyTool {
  constructor(
    @InjectRepository(FollowupEmail)
    private readonly emailRepo: Repository<FollowupEmail>,
    @InjectRepository(FollowupDraft)
    private readonly draftRepo: Repository<FollowupDraft>,
    private readonly llm: LlmService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {}

  readonly name = DRAFT_REPLY_TOOL_NAME;
  readonly description = "Draft an email reply based on the user's intent.";
  readonly parameters = Type.Object({
    email_capture_id: Type.String(),
    intent: IntentEnum,
  });

  async execute(
    _toolCallId: string,
    params: { email_capture_id: string; intent: Static<typeof IntentEnum> },
    context: { userId: string },
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: Record<string, unknown> }> {
    const email = await this.emailRepo.findOne({ where: { id: params.email_capture_id } });
    if (!email) {
      return { content: [{ type: 'text', text: 'Email not found.' }], details: {} };
    }

    let originalBody = '';
    if (email.bodyText) {
      originalBody = await this.crypto.decrypt(email.bodyText);
    }

    const intentPrompts: Record<string, string> = {
      accept_interview: 'Confirm attendance at the interview. Be professional and brief.',
      ask_reschedule: 'Politely request to reschedule. Suggest flexibility without specifying times.',
      accept_offer: 'Accept the job offer formally. Express genuine (not gushing) appreciation.',
      negotiate_offer: 'Express interest while indicating you would like to discuss compensation.',
      decline_politely: 'Decline the opportunity gracefully. Keep the door open for the future.',
      request_info: 'Ask for more information about the role, process, or next steps.',
    };

    const draft = await this.llm.complete(MODEL_WRITE, [
      {
        role: 'system',
        content: `You write professional email replies for job seekers. Quinn's style: direct, no fluff, authentic. ${intentPrompts[params.intent] ?? ''}`,
      },
      {
        role: 'user',
        content: `Write a reply to this email:\n\nSubject: ${email.subject}\nFrom: ${email.fromAddr}\n\n${originalBody.slice(0, 1500)}\n\nIntent: ${params.intent}`,
      },
    ]);

    const saved = this.draftRepo.create({
      id: ulid(),
      emailId: email.id,
      userId: context.userId,
      text: draft.trim(),
      intent: params.intent,
    });
    await this.draftRepo.save(saved);

    return {
      content: [
        {
          type: 'text',
          text: `Here's a draft reply:\n\n---\n${draft.trim()}\n---\n\nCopy this and paste it into Gmail to send. I don't send emails on your behalf.`,
        },
      ],
      details: { draftId: saved.id, intent: params.intent },
    };
  }
}
