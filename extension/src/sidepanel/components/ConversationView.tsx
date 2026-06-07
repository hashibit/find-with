import React, { useState, useRef, useEffect } from 'react';
import { useConversationStore } from '../stores/conversation';
import { Icons } from './Quinn';

export function ConversationView() {
  const { messages, isStreaming, sendMessage, loadConversation } = useConversationStore();
  const [input, setInput] = useState('');
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Expose test hooks for Playwright e2e tests
  useEffect(() => {
    (window as any).findwithLoadConversation = (id: string) => loadConversation(id);
    (window as any).findwithSetConversationMessages = (
      msgs: Array<{ role: 'user' | 'assistant'; text: string; timestamp: number }>,
      id: string,
    ) => {
      useConversationStore.setState({ messages: msgs, currentConversationId: id, isStreaming: false });
    };
    return () => {
      delete (window as any).findwithLoadConversation;
      delete (window as any).findwithSetConversationMessages;
    };
  }, [loadConversation]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  return (
    <div data-testid="conversation-view" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Message list — scrollable */}
      <div className="sp-conv">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`msg ${msg.role === 'assistant' ? 'quinn' : 'user'}`}
            data-testid={msg.role === 'assistant' ? 'agent-message' : 'user-message'}
          >
            {msg.role === 'assistant' && (
              <div className="qavatar">
                <svg width="22" height="22" viewBox="0 0 32 32" style={{ display: 'block' }}>
                  <circle cx="16" cy="16" r="14" fill="var(--accent)" />
                  <text
                    x="16"
                    y="21"
                    textAnchor="middle"
                    fill="#fff"
                    fontFamily="Source Serif 4, Georgia, serif"
                    fontSize="16"
                    fontWeight="500"
                    fontStyle="italic"
                  >
                    Q
                  </text>
                  <line x1="20" y1="22" x2="24" y2="26" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </div>
            )}
            <div className="bubble">{msg.text}</div>
          </div>
        ))}
        {isStreaming && (
          <div
            data-testid="streaming-indicator"
            className="sys-line"
          >
            Quinn 正在输入…
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      {/* Input area */}
      <div className="sp-bottom">
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
    </div>
  );
}
