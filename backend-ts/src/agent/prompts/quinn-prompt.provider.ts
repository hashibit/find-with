import { QUINN_SYSTEM_PROMPT } from './quinn-v1.js';

export const QUINN_PROMPT_PROVIDER = Symbol('QUINN_PROMPT_PROVIDER');

export interface QuinnPromptProvider {
  readonly systemPrompt: string;
}

export const defaultQuinnPromptProvider: QuinnPromptProvider = {
  systemPrompt: QUINN_SYSTEM_PROMPT,
};
