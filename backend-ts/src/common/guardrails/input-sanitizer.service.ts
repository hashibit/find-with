import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuardrailLog } from './guardrail-log.entity.js';
import { ulid } from 'ulid';

/**
 * Result of input sanitization.
 */
export interface SanitizeResult {
  /** Whether the input passed all checks (false = blocked). */
  allowed: boolean;
  /** The sanitized content (or empty string if blocked). */
  content: string;
  /** Which rules were triggered (empty if clean). */
  triggeredRules: string[];
}

/**
 * InputSanitizerService protects against prompt injection attacks.
 *
 * Three categories of threats:
 * 1. Direct injection — "ignore previous instructions", "you are now DAN", etc.
 * 2. Indirect injection — hidden text in scraped JDs or emails
 * 3. System override — attempts to extract or overwrite the system prompt
 *
 * When a pattern matches, the request is BLOCKED and logged.
 */
@Injectable()
export class InputSanitizerService {
  private readonly logger = new Logger(InputSanitizerService.name);

  /** Maximum user message length (characters). Longer messages are likely attacks. */
  private static readonly MAX_MESSAGE_LENGTH = 8_000;

  /** Prompt injection patterns — compiled once at module init. */
  private readonly injectionPatterns: Array<{ name: string; pattern: RegExp }> = [
    // Direct injection — "ignore all previous instructions"
    {
      name: 'injection_ignore_instructions',
      pattern: /ignore\s+(all\s+)?(previous|prior|above|the)\s+(instructions?|prompts?|directives?)/i,
    },
    {
      name: 'injection_dan_mode',
      pattern: /\b(you\s+are\s+now|act\s+as\s+if\s+you\s+are|pretend\s+you\s+are)\s+(DAN|an?\s+unfiltered|a\s+different)\b/i,
    },
    {
      name: 'injection_new_system',
      pattern: /(from\s+now\s+on|starting\s+now).*(your\s+(new\s+)?(role|persona|system\s+prompt|instructions?))/i,
    },
    {
      name: 'injection_role_override',
      pattern: /\byou\s+(are|must|will|should)\s+(not|never|always|only)\s+(act|behave|respond|answer|follow)\b/i,
    },
    // System prompt extraction
    {
      name: 'injection_extract_system',
      pattern: /(repeat|output|print|write|tell\s+me|show\s+me|reveal).*(your\s+(system\s+prompt|instructions?|prompt)|above|beginning)/i,
    },
    {
      name: 'injection_system_leak',
      pattern: /\b(write\s+the\s+system\s+prompt|output\s+your\s+base\s+instructions?|what\s+(was|is)\s+(your|the)\s+(initial|first)\s+(prompt|message))/i,
    },
    // Hidden text injection (common in scraped content)
    {
      name: 'injection_hidden_text',
      pattern: /\[SYSTEM\].*\[END\s*SYSTEM\]/is,
    },
    // Recursive instruction injection
    {
      name: 'injection_recursive',
      pattern: /when\s+(a\s+)?user\s+(asks?|says?|types?|inputs?).*(you\s+(must|should|will|are|always|never))/i,
    },
    // Jailbreak patterns
    {
      name: 'injection_token_overflow',
      pattern: /^(.){30000,}$/s,
    },
  ];

  constructor(
    @InjectRepository(GuardrailLog)
    private readonly logRepo: Repository<GuardrailLog>,
  ) {}

  /**
   * Sanitize user input before it reaches the LLM.
   *
   * @param text  The raw user message or scraped content.
   * @param userId  The user who submitted it (null for system-initiated).
   * @param context  Which endpoint/tool is processing this (for audit).
   * @returns  SanitizeResult indicating whether the content is safe.
   */
  sanitize(text: string, userId: string | null, context: string): SanitizeResult {
    const triggeredRules: string[] = [];

    // Check 1: Length limit (prevents token overflow attacks)
    if (text.length > InputSanitizerService.MAX_MESSAGE_LENGTH) {
      triggeredRules.push('injection_token_overflow');
    }

    // Check 2: Pattern matching against known injection signatures
    for (const { name, pattern } of this.injectionPatterns) {
      if (pattern.test(text)) {
        triggeredRules.push(name);
      }
    }

    // Check 3: Repeated instruction markers (common in multi-turn injection)
    const systemLikeCount = (text.match(/system\s*(prompt|message|instruction|role)/gi) ?? []).length;
    if (systemLikeCount >= 3) {
      triggeredRules.push('injection_repeated_system_mentions');
    }

    if (triggeredRules.length > 0) {
      this.logBlocked(text, userId, context, triggeredRules);
      return { allowed: false, content: '', triggeredRules };
    }

    return { allowed: true, content: text, triggeredRules: [] };
  }

  /**
   * Sanitize scraped/external content (JD text, email body) before it enters the LLM context.
   * Less strict than user input — we flag but don't block.
   */
  sanitizeExternal(text: string, userId: string | null, context: string): string {
    // Remove hidden text markers common in HTML scraping artifacts
    let cleaned = text
      .replace(/display:\s*none[^>]*>[^<]*<\/[^>]+>/gi, '') // hidden HTML elements
      .replace(/visibility:\s*hidden[^>]*>[^<]*<\/[^>]+>/gi, '')
      .replace(/opacity:\s*0[^>]*>[^<]*<\/[^>]+>/gi, '')
      .trim();

    // Check for hidden prompt-injection attempts in scraped content
    const injectionCheck = this.sanitize(cleaned, userId, context);
    if (!injectionCheck.allowed) {
      this.logger.warn(
        { context, triggeredRules: injectionCheck.triggeredRules },
        'Potential injection in external content — content sanitized',
      );
      // For external content, strip problematic sections rather than blocking
      cleaned = this.stripInjectionPatterns(cleaned, injectionCheck.triggeredRules);
    }

    return cleaned;
  }

  // ── Private helpers ──────────────────────────────────────────

  private logBlocked(
    text: string,
    userId: string | null,
    context: string,
    rules: string[],
  ): void {
    const sample = text.slice(0, 200).replace(/\n/g, ' ');
    this.logger.warn(
      { userId, context, rules, sample },
      `Prompt injection blocked: ${rules.join(', ')}`,
    );

    void this.logRepo.save(
      this.logRepo.create({
        id: ulid(),
        layer: 'input_sanitizer',
        rule: rules[0]!,
        action: 'blocked',
        userId,
        matchedSample: text.slice(0, 500),
        context,
      }),
    );
  }

  private stripInjectionPatterns(text: string, rules: string[]): string {
    let cleaned = text;
    for (const ruleName of rules) {
      for (const { name, pattern } of this.injectionPatterns) {
        if (name === ruleName) {
          cleaned = cleaned.replace(pattern, '[redacted]');
        }
      }
    }
    return cleaned;
  }
}
