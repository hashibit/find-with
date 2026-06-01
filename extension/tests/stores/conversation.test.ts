import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useConversationStore } from '../../src/sidepanel/stores/conversation';

const INITIAL_STATE = {
  messages: [],
  isStreaming: false,
  currentConversationId: null,
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

  it('sets a new non-null conversation ID', () => {
    useConversationStore.getState().startNewConversation();
    expect(useConversationStore.getState().currentConversationId).not.toBeNull();
  });

  it('generates a different conversation ID on each call', () => {
    useConversationStore.getState().startNewConversation();
    const id1 = useConversationStore.getState().currentConversationId;
    useConversationStore.getState().startNewConversation();
    const id2 = useConversationStore.getState().currentConversationId;
    expect(id1).not.toBe(id2);
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
