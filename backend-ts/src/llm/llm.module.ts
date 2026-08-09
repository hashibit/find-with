import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service.js';
import { TokenCostService } from './token-cost.service.js';
import { LLM_PROVIDER } from './llm-provider.interface.js';

@Global()
@Module({
  providers: [TokenCostService, { provide: LLM_PROVIDER, useClass: LlmService }],
  exports: [TokenCostService, LLM_PROVIDER],
})
export class LlmModule {}
