import { create } from 'zustand';

export interface RadarItem {
  id: string;
  jobTitle: string;
  company: string;
  status: 'saved' | 'applied' | 'interview' | 'offer' | 'rejected';
  appliedAt?: number;
  lastActivity?: number;
  sourceUrl?: string;
}

interface RadarState {
  radarItems: RadarItem[];
  isLoading: boolean;
  error: string | null;
  fetchRadar: () => Promise<void>;
  updateItemStatus: (id: string, status: RadarItem['status']) => void;
}

export const useRadarStore = create<RadarState>((set) => ({
  radarItems: [],
  isLoading: false,
  error: null,

  fetchRadar: async () => {
    set({ isLoading: true, error: null });
    try {
      // Stub: real implementation fetches from SW via chrome.runtime.sendMessage
      // which proxies to API /v1/radar
      await new Promise((resolve) => setTimeout(resolve, 200));
      set({ radarItems: [], isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  updateItemStatus: (id: string, status: RadarItem['status']) => {
    set((state) => ({
      radarItems: state.radarItems.map((item) =>
        item.id === id ? { ...item, status, lastActivity: Date.now() } : item,
      ),
    }));
  },
}));
