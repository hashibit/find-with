import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useRadarStore, type RadarItem } from '../../src/sidepanel/stores/radar';

const INITIAL_STATE = {
  radarItems: [],
  isLoading: false,
  error: null,
} as const;

const makeItem = (overrides: Partial<RadarItem> = {}): RadarItem => ({
  id: 'job_001',
  jobTitle: 'Software Engineer',
  company: 'Stripe',
  status: 'saved',
  appliedAt: undefined,
  lastActivity: 1_700_000_000_000,
  sourceUrl: 'https://linkedin.com/jobs/view/123',
  ...overrides,
});

beforeEach(() => {
  useRadarStore.setState({ ...INITIAL_STATE });
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('starts with an empty radar', () => {
    expect(useRadarStore.getState().radarItems).toEqual([]);
  });

  it('starts not loading', () => {
    expect(useRadarStore.getState().isLoading).toBe(false);
  });

  it('starts with no error', () => {
    expect(useRadarStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateItemStatus
// ---------------------------------------------------------------------------

describe('updateItemStatus', () => {
  it('updates the status of the matching item', async () => {
    useRadarStore.setState({ radarItems: [makeItem({ id: 'job_001', status: 'saved' })] });
    await useRadarStore.getState().updateItemStatus('job_001', 'applied');
    expect(useRadarStore.getState().radarItems[0].status).toBe('applied');
  });

  it('updates lastActivity on the changed item', async () => {
    const before = 1_000;
    useRadarStore.setState({
      radarItems: [makeItem({ id: 'job_001', lastActivity: before })],
    });
    const beforeUpdate = Date.now();
    await useRadarStore.getState().updateItemStatus('job_001', 'interview');
    const after = useRadarStore.getState().radarItems[0].lastActivity!;
    expect(after).toBeGreaterThanOrEqual(beforeUpdate);
  });

  it('does not mutate items that do not match the id', async () => {
    useRadarStore.setState({
      radarItems: [
        makeItem({ id: 'job_001', status: 'saved' }),
        makeItem({ id: 'job_002', status: 'saved', company: 'Linear' }),
      ],
    });
    await useRadarStore.getState().updateItemStatus('job_001', 'applied');
    expect(useRadarStore.getState().radarItems[1].status).toBe('saved');
  });

  it('is a no-op when the id does not exist', async () => {
    const item = makeItem({ id: 'job_001' });
    useRadarStore.setState({ radarItems: [item] });
    await useRadarStore.getState().updateItemStatus('no_such_id', 'offer');
    // Status unchanged
    expect(useRadarStore.getState().radarItems[0].status).toBe('saved');
  });

  it('supports all valid status transitions', async () => {
    const statuses: RadarItem['status'][] = ['saved', 'applied', 'interview', 'offer', 'rejected'];
    for (const status of statuses) {
      useRadarStore.setState({ radarItems: [makeItem({ id: 'j1', status: 'saved' })] });
      await useRadarStore.getState().updateItemStatus('j1', status);
      expect(useRadarStore.getState().radarItems[0].status).toBe(status);
    }
  });

  it('handles multiple items — updates only the target', async () => {
    useRadarStore.setState({
      radarItems: [
        makeItem({ id: 'a', status: 'saved' }),
        makeItem({ id: 'b', status: 'applied' }),
        makeItem({ id: 'c', status: 'interview' }),
      ],
    });
    await useRadarStore.getState().updateItemStatus('b', 'offer');
    const items = useRadarStore.getState().radarItems;
    expect(items[0].status).toBe('saved');
    expect(items[1].status).toBe('offer');
    expect(items[2].status).toBe('interview');
  });
});

// ---------------------------------------------------------------------------
// fetchRadar (stub)
// ---------------------------------------------------------------------------

describe('fetchRadar', () => {
  it('sets isLoading to true immediately', () => {
    vi.useFakeTimers();
    useRadarStore.getState().fetchRadar(); // do not await
    expect(useRadarStore.getState().isLoading).toBe(true);
  });

  it('clears any prior error when fetching starts', async () => {
    vi.useFakeTimers();
    useRadarStore.setState({ error: 'network error' });
    const promise = useRadarStore.getState().fetchRadar();
    expect(useRadarStore.getState().error).toBeNull();
    await vi.runAllTimersAsync();
    await promise;
  });

  it('sets isLoading to false after the stub resolves', async () => {
    vi.useFakeTimers();
    const promise = useRadarStore.getState().fetchRadar();
    await vi.runAllTimersAsync();
    await promise;
    expect(useRadarStore.getState().isLoading).toBe(false);
  });
});
