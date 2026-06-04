import { create } from 'zustand';
import { runtimeCall, runtimeStream } from '../../lib/runtime';

/** Shape of a message as returned by the backend GET /conversations/:id endpoint. */
interface BackendMessage {
  role: 'USER' | 'ASSISTANT';
  createdAt: string;
  text?: string;
  payload?: {
    content?: Array<{ type: string; text?: string }>;
  };
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface ConversationState {
  messages: ConversationMessage[];
  isStreaming: boolean;
  currentConversationId: string | null;
  sendMessage: (text: string, conversationKind?: string) => Promise<void>;
  setStreaming: (streaming: boolean) => void;
  appendAssistantChunk: (chunk: string) => void;
  startNewConversation: () => void;
  loadConversation: (id: string) => Promise<void>;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentConversationId: null,

  sendMessage: async (text: string, conversationKind = 'FREE_CHAT') => {
    const userMsg: ConversationMessage = { role: 'user', text, timestamp: Date.now() };
    set((state) => ({
      messages: [...state.messages, userMsg],
      isStreaming: true,
    }));

    try {
      // 1. Create conversation if none exists
      let conversationId = get().currentConversationId;
      if (!conversationId) {
        const createResult = await runtimeCall({
          type: 'CONVERSATION_CREATE',
          payload: { kind: conversationKind },
        });
        if (createResult.error) {
          set({ isStreaming: false });
          set((state) => ({
            messages: [
              ...state.messages,
              { role: 'assistant', text: `Error: ${createResult.error}`, timestamp: Date.now() },
            ],
          }));
          return;
        }
        conversationId = createResult.id;
        set({ currentConversationId: conversationId });
      }

      // 2. Stream response via runtime seam
      let assistantText = '';

      runtimeStream(
        conversationId!,
        text,
        (msg) => {
          if (msg.type === 'SSE_EVENT') {
            try {
              const parsed = JSON.parse(msg.data) as unknown;
              if (typeof parsed !== 'object' || !parsed || !('kind' in parsed)) {
                console.warn('[Conversation] Unexpected SSE event format', msg.data);
                return;
              }
              const event = parsed as { kind: string; delta?: string; message?: string };
              if (event.kind === 'text_delta') {
                assistantText += event.delta ?? '';
                set((state) => {
                  const messages = [...state.messages];
                  const last = messages[messages.length - 1];
                  if (last?.role === 'assistant' && last.timestamp === 0) {
                    messages[messages.length - 1] = { ...last, text: assistantText };
                  } else {
                    messages.push({ role: 'assistant', text: assistantText, timestamp: 0 });
                  }
                  return { messages };
                });
              } else if (event.kind === 'done') {
                set((state) => {
                  const messages = [...state.messages];
                  const last = messages[messages.length - 1];
                  if (last?.role === 'assistant') {
                    messages[messages.length - 1] = { ...last, timestamp: Date.now() };
                  }
                  return { messages, isStreaming: false };
                });
              } else if (event.kind === 'error') {
                set((state) => ({
                  messages: [
                    ...state.messages,
                    { role: 'assistant', text: `Error: ${event.message ?? 'unknown'}`, timestamp: Date.now() },
                  ],
                  isStreaming: false,
                }));
              }
            } catch (e) {
              console.error('[Conversation] Failed to parse SSE event', e);
            }
          }

          if (msg.type === 'SSE_ERROR') {
            set((state) => ({
              messages: [
                ...state.messages,
                { role: 'assistant', text: `Error: ${msg.error}`, timestamp: Date.now() },
              ],
              isStreaming: false,
            }));
          }
        },
        () => {
          set({ isStreaming: false });
        },
      );
    } catch (e) {
      set((state) => ({
        messages: [
          ...state.messages,
          { role: 'assistant', text: `Error: ${String(e)}`, timestamp: Date.now() },
        ],
        isStreaming: false,
      }));
    }
  },

  setStreaming: (streaming: boolean) => set({ isStreaming: streaming }),

  appendAssistantChunk: (chunk: string) => {
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') {
        messages[messages.length - 1] = { ...last, text: last.text + chunk };
      } else {
        messages.push({ role: 'assistant', text: chunk, timestamp: Date.now() });
      }
      return { messages };
    });
  },

  startNewConversation: () => {
    set({
      messages: [],
      isStreaming: false,
      currentConversationId: null,
    });
  },

  loadConversation: async (id: string) => {
    set({ isStreaming: true });
    try {
      const result = await runtimeCall({
        type: 'CONVERSATION_GET',
        payload: { conversationId: id },
      });
      if (result.error) {
        set({ isStreaming: false });
        return;
      }
      const messages: ConversationMessage[] = (result.messages as BackendMessage[]).map((m) => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        text:
          m.text ||
          m.payload?.content
            ?.filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('') ||
          '',
        timestamp: new Date(m.createdAt).getTime(),
      }));
      set({
        messages,
        currentConversationId: id,
        isStreaming: false,
      });
    } catch (e) {
      set({ isStreaming: false });
    }
  },
}));
