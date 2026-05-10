import { create } from 'zustand';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface ConversationState {
  messages: ConversationMessage[];
  isStreaming: boolean;
  currentConversationId: string | null;
  sendMessage: (text: string) => Promise<void>;
  setStreaming: (streaming: boolean) => void;
  appendAssistantChunk: (chunk: string) => void;
  startNewConversation: () => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentConversationId: null,

  sendMessage: async (text: string) => {
    const userMsg: ConversationMessage = { role: 'user', text, timestamp: Date.now() };
    set((state) => ({
      messages: [...state.messages, userMsg],
      isStreaming: true,
    }));

    // Placeholder: real implementation sends to SW via chrome.runtime.sendMessage
    // and streams response back via port
    try {
      // Stub: echo response after a short delay
      await new Promise((resolve) => setTimeout(resolve, 500));
      const assistantMsg: ConversationMessage = {
        role: 'assistant',
        text: `(stub) You said: "${text}"`,
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: [...state.messages, assistantMsg],
        isStreaming: false,
      }));
    } catch (e) {
      set({ isStreaming: false });
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
      currentConversationId: crypto.randomUUID(),
    });
  },
}));
