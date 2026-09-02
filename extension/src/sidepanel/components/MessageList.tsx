import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useConversationStore, type ConversationMessage } from '../stores/conversation';

interface MessageListProps {
  /** Static content rendered above the messages, inside the same scroll area (e.g. onboarding cards). */
  prepend?: ReactNode;
  /** Extra content rendered under a specific message bubble (e.g. the deep-analyze button). */
  renderMessageExtra?: (msg: ConversationMessage) => ReactNode;
  /** data-testid for the scroll container. */
  testId?: string;
}

/**
 * Shared chat message list: scroll container, Quinn avatar, streaming indicator.
 * Scrolls to the bottom on any content change (new messages, streaming deltas,
 * prepend cards growing) via MutationObserver — callers don't manage scrolling.
 * Also registers the Playwright e2e hooks, so every chat surface exposes them.
 */
export function MessageList({ prepend, renderMessageExtra, testId }: MessageListProps) {
  const { messages, isStreaming, loadConversation } = useConversationStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Keep pinned to the bottom as content grows (messages, deltas, prepended cards)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Scroll once on mount for content already present (restored conversations, cards)
    messagesEndRef.current?.scrollIntoView();
    const observer = new MutationObserver(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="sp-conv" data-testid={testId}>
      {prepend}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, alignItems: 'flex-start' }}>
            <div className="bubble">{msg.text}</div>
            {renderMessageExtra?.(msg)}
          </div>
        </div>
      ))}
      {isStreaming && (
        <div data-testid="streaming-indicator" className="sys-line">
          Quinn 正在输入…
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
