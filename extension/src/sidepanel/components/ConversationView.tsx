import React from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

/**
 * Plain chat surface used by Radar / JobAnalysis / Tailoring routes.
 * Chat composes MessageList + ChatInput directly instead (it interleaves
 * onboarding cards above the messages).
 */
export function ConversationView() {
  return (
    <div data-testid="conversation-view" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <MessageList />
      <ChatInput />
    </div>
  );
}
