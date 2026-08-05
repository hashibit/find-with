import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InputSanitizerService } from './input-sanitizer.service.js';
import { OutputGuardrailService } from './output-guardrail.service.js';
import { GuardrailLog } from './guardrail-log.entity.js';

/**
 * GuardrailModule provides input sanitization and output filtering for all LLM interactions.
 *
 * Three-layer protection:
 * 1. Input: detects and blocks prompt injection patterns before reaching the LLM
 * 2. Prompt: injects boundary markers to reinforce system prompt separation
 * 3. Output: scans LLM responses for PII leakage and sensitive content
 *
 * All interception events are logged to GuardrailLog for audit.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([GuardrailLog])],
  providers: [InputSanitizerService, OutputGuardrailService],
  exports: [InputSanitizerService, OutputGuardrailService],
})
export class GuardrailModule {}
