import { create } from 'zustand';
import { runtimeCall } from '../../lib/runtime';

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
  type: 'resume' | 'cover_letter' | 'linkedin_summary' | 'shining_point';
  label: string;
  content: string;
  tags: string[];
  status: 'PROPOSED' | 'CONFIRMED' | 'USER_EDITED';
  createdAt: number;
  updatedAt: number;
  jobId?: string;
}

export interface BaseResume {
  id: string;
  name: string;
  selectedMaterialIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface ProfileState {
  profile: UserProfile | null;
  materials: Material[];
  baseResumes: BaseResume[];
  isLoading: boolean;
  error: string | null;
  fetchProfile: () => Promise<void>;
  fetchMaterials: () => Promise<void>;
  fetchBaseResumes: () => Promise<void>;
  createMaterial: (payload: CreateMaterialPayload) => Promise<void>;
  updateMaterial: (id: string, patch: Partial<Material>) => Promise<void>;
  deleteMaterial: (id: string) => Promise<void>;
  createBaseResume: (name: string, selectedMaterialIds?: string[]) => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => void;
}

interface CreateMaterialPayload {
  rawText?: string;
  shiningText?: string;
  rationale?: string;
  tags?: string[];
  provenanceKind: string;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  materials: [],
  baseResumes: [],
  isLoading: false,
  error: null,

  fetchProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await runtimeCall({ type: 'PROFILE_FETCH' });
      if (result.error) {
        set({ error: result.error, isLoading: false });
        return;
      }
      const profile: UserProfile = {
        userId: result.id || result.userId,
        displayName: result.basicInfo?.fullName || result.displayName || '',
        email: result.basicInfo?.email || result.email || '',
        targetRoles: result.targetRoles || [],
        targetLocations: result.targetLocations || [],
        yearsExperience: result.yearsExperience,
      };
      set({ profile, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  fetchMaterials: async () => {
    try {
      const result = await runtimeCall({ type: 'MATERIALS_FETCH' });
      if (result.error) return;
      const materials: Material[] = (result.items || result || []).map((m: any) => ({
        id: m.id,
        type: m.provenanceKind || 'shining_point',
        label: m.shiningText || m.rawText || '',
        content: m.shiningText || m.rawText || '',
        tags: m.tags || [],
        status: m.status || 'CONFIRMED',
        createdAt: new Date(m.createdAt).getTime(),
        updatedAt: new Date(m.updatedAt).getTime(),
        jobId: m.jobId,
      }));
      set({ materials });
    } catch (e) {
      console.error('[Profile] Failed to fetch materials', e);
    }
  },

  fetchBaseResumes: async () => {
    try {
      const result = await runtimeCall({ type: 'BASE_RESUMES_FETCH' });
      if (result.error) return;
      const baseResumes: BaseResume[] = (result.items || result || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        selectedMaterialIds: r.selectedMaterialIds || [],
        createdAt: new Date(r.createdAt).getTime(),
        updatedAt: new Date(r.updatedAt).getTime(),
      }));
      set({ baseResumes });
    } catch (e) {
      console.error('[Profile] Failed to fetch base resumes', e);
    }
  },

  createMaterial: async (payload: CreateMaterialPayload) => {
    try {
      const result = await runtimeCall({ type: 'MATERIALS_CREATE', payload });
      if (!result.error) {
        set((state) => ({
          materials: [
            ...state.materials,
            {
              id: result.id,
              type: payload.provenanceKind as Material['type'],
              label: payload.shiningText || payload.rawText || '',
              content: payload.shiningText || payload.rawText || '',
              tags: payload.tags || [],
              status: 'PROPOSED' as Material['status'],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        }));
      }
    } catch (e) {
      console.error('[Profile] Failed to create material', e);
    }
  },

  updateMaterial: async (id: string, patch: Partial<Material>) => {
    try {
      await runtimeCall({ type: 'MATERIALS_UPDATE', payload: { id, ...patch } });
      set((state) => ({
        materials: state.materials.map((m) =>
          m.id === id ? { ...m, ...patch, updatedAt: Date.now() } : m,
        ),
      }));
    } catch (e) {
      console.error('[Profile] Failed to update material', e);
    }
  },

  deleteMaterial: async (id: string) => {
    try {
      await runtimeCall({ type: 'MATERIALS_DELETE', payload: { id } });
      set((state) => ({
        materials: state.materials.filter((m) => m.id !== id),
      }));
    } catch (e) {
      console.error('[Profile] Failed to delete material', e);
    }
  },

  createBaseResume: async (name: string, selectedMaterialIds?: string[]) => {
    try {
      const result = await runtimeCall({ type: 'BASE_RESUMES_CREATE', payload: { name, selectedMaterialIds } });
      if (!result.error) {
        set((state) => ({
          baseResumes: [
            ...state.baseResumes,
            {
              id: result.id,
              name,
              selectedMaterialIds: selectedMaterialIds || [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        }));
      }
    } catch (e) {
      console.error('[Profile] Failed to create base resume', e);
    }
  },

  updateProfile: (patch: Partial<UserProfile>) => {
    set((state) => ({
      profile: state.profile ? { ...state.profile, ...patch } : null,
    }));
  },
}));
