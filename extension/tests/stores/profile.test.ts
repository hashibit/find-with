import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useProfileStore, type UserProfile } from '../../src/sidepanel/stores/profile';

const INITIAL_STATE = {
  profile: null,
  materials: [],
  isLoading: false,
  error: null,
} as const;

const SAMPLE_PROFILE: UserProfile = {
  userId: 'user_001',
  displayName: 'Jane Doe',
  email: 'jane@example.com',
  targetRoles: ['Software Engineer', 'Product Engineer'],
  targetLocations: ['San Francisco', 'Remote'],
  yearsExperience: 4,
};

beforeEach(() => {
  useProfileStore.setState({ ...INITIAL_STATE });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('starts with no profile', () => {
    expect(useProfileStore.getState().profile).toBeNull();
  });

  it('starts with an empty materials array', () => {
    expect(useProfileStore.getState().materials).toEqual([]);
  });

  it('starts not loading', () => {
    expect(useProfileStore.getState().isLoading).toBe(false);
  });

  it('starts with no error', () => {
    expect(useProfileStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateProfile
// ---------------------------------------------------------------------------

describe('updateProfile', () => {
  it('is a no-op when profile is null', () => {
    useProfileStore.getState().updateProfile({ displayName: 'New Name' });
    expect(useProfileStore.getState().profile).toBeNull();
  });

  it('merges a partial patch onto an existing profile', () => {
    useProfileStore.setState({ profile: { ...SAMPLE_PROFILE } });
    useProfileStore.getState().updateProfile({ displayName: 'Jane Smith' });
    const { profile } = useProfileStore.getState();
    expect(profile?.displayName).toBe('Jane Smith');
    expect(profile?.email).toBe('jane@example.com'); // untouched
  });

  it('can update multiple fields at once', () => {
    useProfileStore.setState({ profile: { ...SAMPLE_PROFILE } });
    useProfileStore.getState().updateProfile({
      targetRoles: ['Engineering Manager'],
      yearsExperience: 8,
    });
    const { profile } = useProfileStore.getState();
    expect(profile?.targetRoles).toEqual(['Engineering Manager']);
    expect(profile?.yearsExperience).toBe(8);
    expect(profile?.email).toBe('jane@example.com'); // untouched
  });

  it('does not mutate the original profile object', () => {
    const original = { ...SAMPLE_PROFILE };
    useProfileStore.setState({ profile: original });
    useProfileStore.getState().updateProfile({ displayName: 'Changed' });
    // Zustand creates a new object — original reference should be replaced
    const stored = useProfileStore.getState().profile;
    expect(stored).not.toBe(original);
    expect(stored?.displayName).toBe('Changed');
  });

  it('can clear an optional field by setting it to undefined', () => {
    useProfileStore.setState({ profile: { ...SAMPLE_PROFILE } });
    useProfileStore.getState().updateProfile({ yearsExperience: undefined });
    expect(useProfileStore.getState().profile?.yearsExperience).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// fetchProfile (stub)
// ---------------------------------------------------------------------------

describe('fetchProfile', () => {
  it('sets isLoading to true immediately', () => {
    vi.useFakeTimers();
    useProfileStore.getState().fetchProfile(); // do not await
    expect(useProfileStore.getState().isLoading).toBe(true);
  });

  it('clears any prior error when fetching starts', async () => {
    vi.useFakeTimers();
    useProfileStore.setState({ error: 'previous error' });
    const promise = useProfileStore.getState().fetchProfile();
    expect(useProfileStore.getState().error).toBeNull();
    await vi.runAllTimersAsync();
    await promise;
  });

  it('sets isLoading to false after the stub resolves', async () => {
    vi.useFakeTimers();
    const promise = useProfileStore.getState().fetchProfile();
    await vi.runAllTimersAsync();
    await promise;
    expect(useProfileStore.getState().isLoading).toBe(false);
  });
});
