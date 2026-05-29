export type Density = 'ENGAGED' | 'BALANCED' | 'QUIET';

/**
 * Resolves the effective density for a conversation.
 *
 * Per-conversation override (ConvConversation.effectiveDensity, set by the
 * set_conversation_density tool) wins over the user's global preference
 * (IamSettings.density). Falls back to BALANCED if neither is provided.
 *
 * This is the single place that encodes the precedence rule. Tests can call it
 * directly without any DI or DB setup.
 */
export function resolveDensity(
  conversationDensity: string | null | undefined,
  globalDensity: string | null | undefined,
): Density {
  const value = conversationDensity ?? globalDensity ?? 'BALANCED';
  if (value === 'ENGAGED' || value === 'QUIET') return value;
  return 'BALANCED';
}

/**
 * Maps a density level to the system-prompt instruction fragment appended by
 * ContextBuilderService. BALANCED maps to empty string — it is the default
 * described in the base Quinn system prompt.
 */
export function densityInstruction(density: Density): string {
  switch (density) {
    case 'ENGAGED':
      return (
        '\n\n# Engagement mode: ENGAGED\n' +
        'Be proactive: ask follow-up questions, flag things the user might have missed, ' +
        'suggest next steps without waiting to be asked.'
      );
    case 'QUIET':
      return (
        '\n\n# Engagement mode: QUIET\n' +
        'Be minimal. Answer only what is directly asked. Do not offer unsolicited ' +
        'suggestions, follow-up questions, or observations unless something is critical.'
      );
    default:
      return '';
  }
}
