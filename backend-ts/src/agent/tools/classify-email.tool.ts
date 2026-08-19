import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from '@sinclair/typebox';
import { FollowupEmail } from '../../database/entities/followup/followup-email.entity.js';
import { LLM_PROVIDER, type LlmProvider } from '../../llm/llm-provider.interface.js';
import { FIELD_CRYPTO, type FieldCrypto } from '../../common/crypto/crypto.interface.js';

import type { ToolExecutor } from '../tool-registry.js';
export const CLASSIFY_EMAIL_TOOL_NAME = 'classify_email';

export const EmailClassificationSchema = Type.Object({
  kind: Type.String(),
  keyInfo: Type.Object({}, { additionalProperties: true }),
  summary: Type.String(),
});

@Injectable()
export class ClassifyEmailTool implements ToolExecutor {
  constructor(
    @InjectRepository(FollowupEmail)
    private readonly repo: Repository<FollowupEmail>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {}

  readonly name = CLASSIFY_EMAIL_TOOL_NAME;
  readonly scenes = ['FOLLOWUP'] as const;
  readonly description = 'Classify a captured email and extract key information.';
  readonly parameters = Type.Object({
    email_capture_id: Type.String(),
  });

  async execute(
    _toolCallId: string,
    params: { email_capture_id: string },
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: Record<string, unknown> }> {
    const email = await this.repo.findOne({ where: { id: params.email_capture_id } });
    if (!email) {
      return {
        content: [{ type: 'text', text: 'Email not found.' }],
        details: {},
      };
    }

    let bodyText = '';
    if (email.bodyText) {
      bodyText = await this.crypto.decrypt(email.bodyText);
    }

    const prompt = `Classify this recruitment email:

Subject: ${email.subject ?? '(no subject)'}
From: ${email.fromAddr ?? 'unknown'}
Body: ${bodyText.slice(0, 2000)}

Classify this as one of: INTERVIEW_INVITE, REJECTION, TEMPLATE_REJECTION, HR_FOLLOWUP, OFFER, or OTHER.
Extract relevant metadata (interview date, format, next steps, offer details, etc.) into keyInfo.`;

    const parsed = await this.llm.structuredComplete(
      {
        systemPrompt: 'You classify recruitment emails.',
        messages: [{ role: 'user', content: prompt, timestamp: Date.now() }],
      },
      EmailClassificationSchema,
    );

    email.kind = parsed.kind ?? 'OTHER';
    email.parsed = { keyInfo: parsed.keyInfo ?? {}, summary: parsed.summary ?? '' };
    await this.repo.save(email);

    return {
      content: [{ type: 'text', text: parsed.summary ?? `Email classified as: ${email.kind}` }],
      details: { emailId: email.id, kind: email.kind, keyInfo: parsed.keyInfo },
    };
  }
}
