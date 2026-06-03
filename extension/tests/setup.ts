import { vi } from 'vitest';

// Mock Chrome APIs for unit tests
const chromeMock = {
  runtime: {
    sendMessage: vi.fn().mockResolvedValue({ items: [] }),
    connect: vi.fn().mockReturnValue({
      onMessage: { addListener: vi.fn() },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    }),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    onConnect: { addListener: vi.fn() },
    getURL: vi.fn().mockReturnValue(''),
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({}),
  },
  windows: {
    getCurrent: vi.fn().mockResolvedValue({ id: 1 }),
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
    setIcon: vi.fn(),
  },
  sidePanel: {
    open: vi.fn(),
    setOptions: vi.fn(),
  },
};

// Assign to global
(globalThis as any).chrome = chromeMock;

// Re-export for test files to use for custom mock setups
export { chromeMock };