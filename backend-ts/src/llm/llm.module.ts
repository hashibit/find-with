import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service.js';
import { TokenCostService } from './token-cost.service.js';
import { LLM_PROVIDER } from './llm-provider.interface.js';

@Global()
@Module({
  providers: [
    LlmService,
    TokenCostService,
    { provide: LLM_PROVIDER, useExisting: LlmService },
  ],
  exports: [LlmService, TokenCostService, LLM_PROVIDER],
})
export class LlmModule {}
