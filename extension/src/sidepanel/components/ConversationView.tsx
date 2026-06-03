import React, { useState, useRef, useEffect } from 'react';
import { useConversationStore } from '../stores/conversation';

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
    // Direct store injection — bypasses chrome.runtime for reliability in e2e
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
    <div
      data-testid="conversation-view"
      style={{
        borderTop: '1px solid #e5e7eb',
        maxHeight: '50vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            data-testid={msg.role === 'assistant' ? 'agent-message' : 'user-message'}
            style={{
              margin: '8px 0',
              padding: '8px 12px',
              borderRadius: 8,
              background: msg.role === 'user' ? '#e0e7ff' : '#f3f4f6',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{ fontSize: 13 }}>{msg.text}</div>
          </div>
        ))}
        {isStreaming && (
          <div data-testid="streaming-indicator" style={{ color: '#6b7280', fontSize: 12, padding: 8 }}>
            Quinn is typing...
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      <div style={{ display: 'flex', padding: '8px 16px', gap: 8 }}>
        <input
          data-testid="message-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask Quinn..."
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          data-testid="send-btn"
          onClick={handleSend}
          disabled={isStreaming}
          style={{
            padding: '8px 16px',
            background: '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
