import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from '@sinclair/typebox';
import { FollowupEmail } from '../../database/entities/followup/followup-email.entity';
import { LlmService, MODEL_PARSE } from '../../llm/llm.service';
import { FIELD_CRYPTO, FieldCrypto } from '../../common/crypto/crypto.interface';
import { Inject } from '@nestjs/common';

export const CLASSIFY_EMAIL_TOOL_NAME = 'classify_email';

@Injectable()
export class ClassifyEmailTool {
  constructor(
    @InjectRepository(FollowupEmail)
    private readonly repo: Repository<FollowupEmail>,
    private readonly llm: LlmService,
    @Inject(FIELD_CRYPTO) private readonly crypto: FieldCrypto,
  ) {}

  readonly name = CLASSIFY_EMAIL_TOOL_NAME;
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

Return JSON with:
- kind: one of INTERVIEW_INVITE | REJECTION | TEMPLATE_REJECTION | HR_FOLLOWUP | OFFER | OTHER
- keyInfo: object with relevant fields (e.g., interviewDate, interviewFormat, nextSteps)
- summary: 1-2 sentence plain-English summary`;

    const raw = await this.llm.complete(MODEL_PARSE, [
      { role: 'system', content: 'You classify recruitment emails. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ]);

    let parsed: { kind?: string; keyInfo?: Record<string, unknown>; summary?: string } = {};
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
    } catch {
      parsed = { kind: 'OTHER', summary: raw };
    }

    email.kind = parsed.kind ?? 'OTHER';
    email.parsed = { keyInfo: parsed.keyInfo ?? {}, summary: parsed.summary ?? '' };
    await this.repo.save(email);

    return {
      content: [{ type: 'text', text: parsed.summary ?? `Email classified as: ${email.kind}` }],
      details: { emailId: email.id, kind: email.kind, keyInfo: parsed.keyInfo },
    };
  }
}
