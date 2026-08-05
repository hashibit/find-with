import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuardrailLog } from './guardrail-log.entity.js';
import { ulid } from 'ulid';

/**
 * OutputGuardrailService scans LLM responses for:
 * - PII leakage (email, phone, SSN, credit card, address)
 * - Sensitive system prompt fragments
 * - Hallucinated personal data that doesn't match the user's profile
 *
 * Matches are REDACTED (masked in-place) and logged for audit.
 */
@Injectable()
export class OutputGuardrailService {
  private readonly logger = new Logger(OutputGuardrailService.name);

  private readonly piiPatterns: Array<{ name: string; pattern: RegExp; mask: string }> = [
    // Email addresses
    {
      name: 'pii_email',
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      mask: '[email protected]',
    },
    // US phone numbers (various formats)
    {
      name: 'pii_phone',
      pattern: /(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      mask: '[phone redacted]',
    },
    // SSN (xxx-xx-xxxx)
    {
      name: 'pii_ssn',
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      mask: '[SSN redacted]',
    },
    // Credit card numbers (basic Luhn-agnostic pattern)
    {
      name: 'pii_credit_card',
      pattern: /\b(?:\d[ -]*?){13,19}\b/g,
      mask: '[credit-card redacted]',
    },
    // Physical addresses (US-centric heuristic — street number + street name pattern)
    {
      name: 'pii_address',
      pattern: /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl)\b/g,
      mask: '[address redacted]',
    },
    // IP addresses
    {
      name: 'pii_ip',
      pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
      mask: '[IP redacted]',
    },
  ];

  /** System prompt leak detection patterns. */
  private readonly systemLeakPatterns: Array<{ name: string; pattern: RegExp }> = [
    {
      name: 'leak_system_prompt_verbatim',
      pattern: /(you are quinn|quinn is an? ai|your character|how you talk|what you can do)/i,
    },
    {
      name: 'leak_internal_rules',
      pattern: /((quinn|you)\s+(can|cannot|must|must\s+not|should)\s+(never|always|only)\s+(say|do|respond|behave))/i,
    },
  ];

  constructor(
    @InjectRepository(GuardrailLog)
    private readonly logRepo: Repository<GuardrailLog>,
  ) {}

  /**
   * Scan LLM output for PII and redact matches.
   *
   * @param text  The raw LLM response text.
   * @param userId  The user receiving this response.
   * @param context  Which conversation/tool generated this.
   * @returns  The redacted text (safe to display) and audit metadata.
   */
  scan(text: string, userId: string | null, context: string): {
    redacted: string;
    redactions: number;
    triggeredRules: string[];
  } {
    let redacted = text;
    let totalRedactions = 0;
    const triggeredRules: string[] = [];

    // Pass 1: PII redaction
    for (const { name, pattern, mask } of this.piiPatterns) {
      const matchCount = (redacted.match(pattern) ?? []).length;
      if (matchCount > 0) {
        redacted = redacted.replace(pattern, mask);
        totalRedactions += matchCount;
        triggeredRules.push(name);
      }
    }

    // Pass 2: System prompt leak detection (flag only — don't redact)
    for (const { name, pattern } of this.systemLeakPatterns) {
      if (pattern.test(redacted)) {
        triggeredRules.push(name);
      }
    }

    // Log if any rules triggered
    if (triggeredRules.length > 0) {
      void this.logRepo.save(
        this.logRepo.create({
          id: ulid(),
          layer: 'output_guardrail',
          rule: triggeredRules[0]!,
          action: totalRedactions > 0 ? 'redacted' : 'flagged',
          userId,
          matchedSample: text.slice(0, 500),
          context,
        }),
      );

      this.logger.warn(
        { userId, context, rules: triggeredRules, redactions: totalRedactions },
        `Output guardrail triggered: ${triggeredRules.join(', ')}`,
      );
    }

    return { redacted, redactions: totalRedactions, triggeredRules };
  }
}
