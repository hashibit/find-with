import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service.js';

@Global()
@Module({
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
