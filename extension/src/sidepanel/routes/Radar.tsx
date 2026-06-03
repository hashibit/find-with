import React from 'react';
import { useRadarStore } from '../stores/radar';

interface RadarItem {
  id: string;
  jobTitle: string;
  company: string;
  status: 'saved' | 'applied' | 'interview' | 'offer' | 'rejected';
  appliedAt?: number;
  lastActivity?: number;
  sourceUrl?: string;
}

export function Radar() {
  const { radarItems, fetchRadar } = useRadarStore();
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    fetchRadar();
  }, [fetchRadar]);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { color: string; label: string }> = {
      saved: { color: '#6b7280', label: 'Saved' },
      applied: { color: '#4f46e5', label: 'Applied' },
      interview: { color: '#f59e0b', label: 'Interview' },
      offer: { color: '#10b981', label: 'Offer' },
      rejected: { color: '#dc2626', label: 'Rejected' },
    };
    return labels[status] || { color: '#6b7280', label: status };
  };

  const handleRefresh = async () => {
    setLoading(true);
    await fetchRadar();
    setLoading(false);
  };

  return (
    <div data-testid="radar-view" style={{ padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>My Radar</h2>
        <button
          onClick={handleRefresh}
          disabled={loading}
          style={{
            padding: '6px 12px',
            background: '#f3f4f6',
            color: '#374151',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
        Track all jobs you've analyzed and applied to.
      </p>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, padding: 12, background: '#f3f4f6', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#374151' }}>
            {radarItems.filter((i) => i.status === 'saved').length}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Saved</div>
        </div>
        <div style={{ flex: 1, padding: 12, background: '#e0e7ff', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#4f46e5' }}>
            {radarItems.filter((i) => i.status === 'applied').length}
          </div>
          <div style={{ fontSize: 11, color: '#4f46e5' }}>Applied</div>
        </div>
        <div style={{ flex: 1, padding: 12, background: '#fef3c7', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>
            {radarItems.filter((i) => i.status === 'interview').length}
          </div>
          <div style={{ fontSize: 11, color: '#f59e0b' }}>Interviews</div>
        </div>
      </div>

      {/* Status Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 12, color: '#6b7280' }}>
        <span><span style={{ background: '#6b7280', width: 10, height: 10, display: 'inline-block', borderRadius: 2, marginRight: 4 }}></span>Saved</span>
        <span><span style={{ background: '#4f46e5', width: 10, height: 10, display: 'inline-block', borderRadius: 2, marginRight: 4 }}></span>Applied</span>
        <span><span style={{ background: '#f59e0b', width: 10, height: 10, display: 'inline-block', borderRadius: 2, marginRight: 4 }}></span>Interview</span>
        <span><span style={{ background: '#10b981', width: 10, height: 10, display: 'inline-block', borderRadius: 2, marginRight: 4 }}></span>Offer</span>
        <span><span style={{ background: '#dc2626', width: 10, height: 10, display: 'inline-block', borderRadius: 2, marginRight: 4 }}></span>Rejected</span>
      </div>

      {/* Radar Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {radarItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>○</div>
            <div style={{ fontSize: 14 }}>No jobs yet. Browse LinkedIn and click "Ask Quinn"</div>
          </div>
        ) : (
          radarItems.map((item) => {
            const statusInfo = getStatusLabel(item.status);
            return (
              <div key={item.id} data-testid="radar-item" data-item-id={item.id} data-item-status={item.status}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      background: '#e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      color: '#6b7280',
                      fontSize: 14,
                    }}
                  >
                    {item.company.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.jobTitle}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{item.company}</div>
                  </div>
                  <span
                    data-testid="radar-status-badge"
                    style={{
                      background: statusInfo.color,
                      color: 'white',
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {statusInfo.label}
                  </span>
                </div>
                {item.appliedAt && (
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    Applied: {new Date(item.appliedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
