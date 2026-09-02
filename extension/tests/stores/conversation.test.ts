import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useConversationStore } from '../../src/sidepanel/stores/conversation';
import { chromeMock } from '../setup';

const INITIAL_STATE = {
  messages: [],
  isStreaming: false,
  currentConversationId: null,
  recentConversations: [],
} as const;

beforeEach(() => {
  useConversationStore.setState({ ...INITIAL_STATE });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('has no messages', () => {
    expect(useConversationStore.getState().messages).toEqual([]);
  });

  it('is not streaming', () => {
    expect(useConversationStore.getState().isStreaming).toBe(false);
  });

  it('has no active conversation ID', () => {
    expect(useConversationStore.getState().currentConversationId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setStreaming
// ---------------------------------------------------------------------------

describe('setStreaming', () => {
  it('sets isStreaming to true', () => {
    useConversationStore.getState().setStreaming(true);
    expect(useConversationStore.getState().isStreaming).toBe(true);
  });

  it('sets isStreaming to false', () => {
    useConversationStore.setState({ isStreaming: true });
    useConversationStore.getState().setStreaming(false);
    expect(useConversationStore.getState().isStreaming).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// appendAssistantChunk
// ---------------------------------------------------------------------------

describe('appendAssistantChunk', () => {
  it('creates a new assistant message when there are no messages', () => {
    useConversationStore.getState().appendAssistantChunk('Hello');
    const { messages } = useConversationStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].text).toBe('Hello');
  });

  it('appends to the last message when the last message is from assistant', () => {
    useConversationStore.getState().appendAssistantChunk('Hello');
    useConversationStore.getState().appendAssistantChunk(', world');
    const { messages } = useConversationStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('Hello, world');
  });

  it('creates a new assistant message when the last message is from the user', () => {
    useConversationStore.setState({
      messages: [{ role: 'user', text: 'Hi Quinn', timestamp: 1000 }],
    });
    useConversationStore.getState().appendAssistantChunk('Hey there');
    const { messages } = useConversationStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].text).toBe('Hey there');
  });

  it('accumulates multiple chunks into a single assistant message', () => {
    const chunks = ['chunk1', ' chunk2', ' chunk3'];
    chunks.forEach((c) => useConversationStore.getState().appendAssistantChunk(c));
    const { messages } = useConversationStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('chunk1 chunk2 chunk3');
  });
});

// ---------------------------------------------------------------------------
// startNewConversation
// ---------------------------------------------------------------------------

describe('startNewConversation', () => {
  it('clears all existing messages', () => {
    useConversationStore.setState({
      messages: [{ role: 'user', text: 'old', timestamp: 1 }],
    });
    useConversationStore.getState().startNewConversation();
    expect(useConversationStore.getState().messages).toEqual([]);
  });

  it('resets isStreaming to false', () => {
    useConversationStore.setState({ isStreaming: true });
    useConversationStore.getState().startNewConversation();
    expect(useConversationStore.getState().isStreaming).toBe(false);
  });

  it('clears the conversation ID (new conversation will be created on next message)', () => {
    useConversationStore.setState({ currentConversationId: 'conv_123' });
    useConversationStore.getState().startNewConversation();
    expect(useConversationStore.getState().currentConversationId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sendMessage (stub implementation)
// ---------------------------------------------------------------------------

describe('sendMessage', () => {
  it('immediately adds a user message with the correct text', async () => {
    vi.useFakeTimers();
    const promise = useConversationStore.getState().sendMessage('Hello Quinn');
    // Check state synchronously before the stub resolves
    const { messages, isStreaming } = useConversationStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].text).toBe('Hello Quinn');
    expect(isStreaming).toBe(true);

    await vi.runAllTimersAsync();
    await promise;
  });

  it('sets isStreaming to false after the stub resolves', async () => {
    vi.useFakeTimers();
    const promise = useConversationStore.getState().sendMessage('test');
    await vi.runAllTimersAsync();
    await promise;
    expect(useConversationStore.getState().isStreaming).toBe(false);
  });

  it('adds an assistant message after the stub resolves', async () => {
    vi.useFakeTimers();
    const promise = useConversationStore.getState().sendMessage('test input');
    await vi.runAllTimersAsync();
    await promise;
    const { messages } = useConversationStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe('assistant');
  });

  it('user message timestamp is a positive number', async () => {
    vi.useFakeTimers();
    const promise = useConversationStore.getState().sendMessage('timestamp test');
    const { messages } = useConversationStore.getState();
    expect(messages[0].timestamp).toBeGreaterThan(0);
    await vi.runAllTimersAsync();
    await promise;
  });
});

// ---------------------------------------------------------------------------
// fetchRecentConversations
// ---------------------------------------------------------------------------

/** One-shot storage.get mock that supplies a sessionToken AND still invokes the
 *  callback form used by lib/auth getToken. */
function mockStorageGetOnce(result: object) {
  (chromeMock.storage.local.get as ReturnType<typeof vi.fn>).mockImplementationOnce(
    (_keys: string[], cb?: (res: object) => void) => {
      if (typeof cb === 'function') cb(result);
      return Promise.resolve(result);
    },
  );
}

describe('fetchRecentConversations', () => {
  it('maps the backend list into summaries and stores them', async () => {
    mockStorageGetOnce({ sessionToken: 'tok' });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          { id: 'conv_2', kind: 'ONBOARDING', lastActivity: '2026-09-01T10:00:00Z' },
          { id: 'conv_1', kind: 'FREE_CHAT', lastActivity: '2026-08-31T10:00:00Z' },
        ]),
    });

    const summaries = await useConversationStore.getState().fetchRecentConversations();
    expect(summaries).toEqual([
      { id: 'conv_2', kind: 'ONBOARDING', lastActivity: '2026-09-01T10:00:00Z' },
      { id: 'conv_1', kind: 'FREE_CHAT', lastActivity: '2026-08-31T10:00:00Z' },
    ]);
    expect(useConversationStore.getState().recentConversations).toEqual(summaries);
  });

  it('returns an empty list when not authenticated', async () => {
    const summaries = await useConversationStore.getState().fetchRecentConversations();
    expect(summaries).toEqual([]);
    expect(useConversationStore.getState().recentConversations).toEqual([]);
  });

  it('returns an empty list when the backend responds with an error body', async () => {
    mockStorageGetOnce({ sessionToken: 'tok' });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('boom'),
      json: () => Promise.resolve({}),
    });

    const summaries = await useConversationStore.getState().fetchRecentConversations();
    expect(summaries).toEqual([]);
  });
});
