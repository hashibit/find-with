import React, { useState } from 'react';
import { useConversationStore } from '../stores/conversation';
import { Icons } from './Quinn';

interface ChatInputProps {
  /** data-testid for the bottom bar. */
  testId?: string;
}

/** Shared chat input bar: text field + send button + companion-density footer. */
export function ChatInput({ testId }: ChatInputProps) {
  const { isStreaming, sendMessage } = useConversationStore();
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="sp-bottom" data-testid={testId}>
      <div className={`sp-input${!input.trim() ? ' dim' : ''}`}>
        <span style={{ color: 'var(--mute-2)' }}>{Icons.paperclip}</span>
        <input
          data-testid="message-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask Quinn anything…"
        />
        <button
          data-testid="send-btn"
          className="send"
          onClick={handleSend}
          disabled={isStreaming}
        >
          {Icons.send}
        </button>
      </div>
      <div className="sp-density">
        <span>陪伴密度</span>
        <span className="dot" />
        <span className="dot on" />
        <span className="dot" />
        <span style={{ marginLeft: 4, color: 'var(--ink-2)' }}>标准</span>
        <span style={{ flex: 1 }} />
        <span className="kbd">⌘K</span>
      </div>
    </div>
  );
}
