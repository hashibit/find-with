import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service.js';
import { LLM_PROVIDER } from './llm-provider.interface.js';

@Global()
@Module({
  providers: [
    LlmService,
    { provide: LLM_PROVIDER, useExisting: LlmService },
  ],
  exports: [LlmService, LLM_PROVIDER],
})
export class LlmModule {}
