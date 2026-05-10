import { create } from 'zustand';

export interface UserProfile {
  userId: string;
  displayName: string;
  email: string;
  targetRoles: string[];
  targetLocations: string[];
  yearsExperience?: number;
}

export interface Material {
  id: string;
  type: 'resume' | 'cover_letter' | 'linkedin_summary';
  label: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  jobId?: string;
}

interface ProfileState {
  profile: UserProfile | null;
  materials: Material[];
  isLoading: boolean;
  error: string | null;
  fetchProfile: () => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  materials: [],
  isLoading: false,
  error: null,

  fetchProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      // Stub: real implementation fetches from SW via chrome.runtime.sendMessage
      // which proxies to API /v1/me/profile
      await new Promise((resolve) => setTimeout(resolve, 200));
      set({ profile: null, materials: [], isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  updateProfile: (patch: Partial<UserProfile>) => {
    set((state) => ({
      profile: state.profile ? { ...state.profile, ...patch } : null,
    }));
  },
}));
