import { create } from 'zustand';
import { runtimeCall } from '../../lib/runtime';

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
  updateItemStatus: (id: string, status: RadarItem['status']) => Promise<void>;
}

const STATUS_MAP: Record<string, RadarItem['status']> = {
  BROWSED: 'saved',
  ANALYZED: 'saved',
  DECIDED: 'saved',
  DECIDED_NO: 'saved',
  APPLIED: 'applied',
  INTERVIEWING: 'interview',
  OFFER_RECEIVED: 'offer',
  OFFER_ACCEPTED: 'offer',
  OFFER_REJECTED: 'rejected',
  REJECTED: 'rejected',
};

export const useRadarStore = create<RadarState>((set) => ({
  radarItems: [],
  isLoading: false,
  error: null,

  fetchRadar: async () => {
    set({ isLoading: true, radarItems: [], error: null });
    try {
      const result = await runtimeCall({ type: 'RADAR_FETCH' });
      if (result.error) {
        set({ error: result.error, isLoading: false });
        return;
      }
      const items: RadarItem[] = (result.items || result || []).map((item: any) => ({
        id: item.id,
        jobTitle: item.jobTitle || item.title || 'Unknown',
        company: item.companyName || item.company || 'Unknown',
        status: STATUS_MAP[item.status] || 'saved',
        appliedAt: item.appliedAt ? new Date(item.appliedAt).getTime() : undefined,
        lastActivity: item.lastActivity ? new Date(item.lastActivity).getTime() : undefined,
        sourceUrl: item.sourceUrl,
      }));
      set({ radarItems: items, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  updateItemStatus: async (id: string, status: RadarItem['status']) => {
    const backendStatusMap: Record<RadarItem['status'], string> = {
      saved: 'ANALYZED',
      applied: 'APPLIED',
      interview: 'INTERVIEWING',
      offer: 'OFFER_RECEIVED',
      rejected: 'REJECTED',
    };
    try {
      await runtimeCall({
        type: 'RADAR_UPDATE',
        payload: { id, status: backendStatusMap[status] },
      });
      set((state) => ({
        radarItems: state.radarItems.map((item) =>
          item.id === id ? { ...item, status, lastActivity: Date.now() } : item,
        ),
      }));
    } catch (e) {
      console.error('[Radar] Failed to update status', e);
    }
  },
}));
