import React from 'react';
import { useRadarStore } from '../stores/radar';
import { QMsg, Icons } from '../components/Quinn';
import { ConversationView } from '../components/ConversationView';

const STATUS_MAP: Record<string, { label: string; tone: string }> = {
  saved:     { label: '已分析',   tone: 'soft' },
  applied:   { label: '已投递',   tone: 'good' },
  interview: { label: '进入面试', tone: 'good' },
  offer:     { label: '接 offer', tone: 'good' },
  rejected:  { label: '已拒',     tone: 'bad'  },
};

// Map the backend STATUS values to our display map
const BACKEND_STATUS_MAP: Record<string, { label: string; tone: string }> = {
  BROWSED:        { label: '已浏览',   tone: 'soft' },
  ANALYZED:       { label: '已分析',   tone: 'soft' },
  TAILORING:      { label: '定制中',   tone: 'warn' },
  SUBMITTED:      { label: '已投递',   tone: 'good' },
  INTERVIEW:      { label: '进入面试', tone: 'good' },
  REJECTED:       { label: '已拒',     tone: 'bad'  },
  DECLINED:       { label: '决定不投', tone: 'soft' },
  OFFER:          { label: '接 offer', tone: 'good' },
};

function getStatusDisplay(status: string): { label: string; tone: string } {
  return (
    BACKEND_STATUS_MAP[status] ||
    STATUS_MAP[status] ||
    { label: status, tone: 'soft' }
  );
}

interface CompanyBadgeProps {
  company: string;
}

function CompanyBadge({ company }: CompanyBadgeProps) {
  // Simple color palette based on first char
  const PALETTE: Record<string, string> = {
    A: '#D97757', B: '#2563EB', C: '#7C3AED', D: '#0E7490',
    E: '#16A34A', F: '#F24E1E', G: '#635BFF', H: '#B45309',
    I: '#A21CAF', J: '#0E7490', K: '#2563EB', L: '#5E6AD2',
    M: '#16A34A', N: '#111928', O: '#D97757', P: '#111928',
    Q: '#635BFF', R: '#7C3AED', S: '#635BFF', T: '#0E7490',
    U: '#2563EB', V: '#111928', W: '#A21CAF', X: '#16A34A',
    Y: '#B45309', Z: '#D97757',
  };
  const letter = company.slice(0, 1).toUpperCase();
  const bg = PALETTE[letter] || '#71717a';

  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: bg,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}

interface RadarCardProps {
  id: string;
  company: string;
  jobTitle: string;
  status: string;
  lastActivity?: number;
  appliedAt?: number;
}

function RadarCard({ id, company, jobTitle, status, lastActivity, appliedAt }: RadarCardProps) {
  const { label, tone } = getStatusDisplay(status);
  const ts = lastActivity || appliedAt;
  const dateStr = ts
    ? new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
    : '';

  return (
    <div
      data-testid="radar-item"
      data-item-id={id}
      data-item-status={status}
      style={{
        padding: '12px 12px',
        borderBottom: '1px solid var(--line-2)',
        cursor: 'pointer',
        background: 'transparent',
        borderLeft: '2px solid transparent',
      }}
    >
      <div className="h gap-8" style={{ alignItems: 'flex-start' }}>
        <CompanyBadge company={company} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="h between" style={{ gap: 6 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--ink)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {company} · <span style={{ fontWeight: 400 }}>{jobTitle}</span>
            </div>
          </div>
          <div className="h between" style={{ marginTop: 8, gap: 6, alignItems: 'center' }}>
            <span
              data-testid="radar-status-badge"
              data-status={status}
              className={`chip ${tone} dot`}
            >
              {label}
            </span>
            {dateStr && (
              <span className="muted tnum" style={{ fontSize: 10.5 }}>{dateStr}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Radar() {
  const { radarItems, fetchRadar } = useRadarStore();
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    fetchRadar();
  }, [fetchRadar]);

  const handleRefresh = async () => {
    setLoading(true);
    await fetchRadar();
    setLoading(false);
  };

  // Check if any items are in "applied/submitted" state to show Quinn follow-up
  const submittedItems = radarItems.filter(
    (i) => i.status === 'applied' || i.status === 'interview'
  );
  const recentSubmitted = submittedItems[0];

  return (
    <>
    <div className="sp-conv" data-testid="radar-view">
      {/* Quinn follow-up message if there are submitted items */}
      {recentSubmitted && (
        <div className="msg quinn" style={{ marginBottom: 4 }}>
          <div className="qavatar" style={{ width: 22, height: 22 }}>
            <svg width="22" height="22" viewBox="0 0 32 32" style={{ display: 'block' }}>
              <circle cx="16" cy="16" r="14" fill="var(--accent)" />
              <text x="16" y="21" textAnchor="middle" fill="#fff" fontFamily="Source Serif 4, Georgia, serif" fontSize="16" fontWeight="500" fontStyle="italic">Q</text>
              <line x1="20" y1="22" x2="24" y2="26" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="bubble">
            3 天前你投了 <strong>{recentSubmitted.company}</strong> 的 {recentSubmitted.jobTitle}，有回复吗？
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn">还没</button>
              <button className="btn primary">回了，看 Gmail</button>
            </div>
          </div>
        </div>
      )}

      {/* Radar list section */}
      <div
        style={{
          margin: '4px -14px 0',
          borderTop: '1px solid var(--line)',
          background: 'var(--bg)',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="h between" style={{ padding: '10px 14px 8px' }}>
          <div className="lab">求职雷达 · {radarItems.length}</div>
          <div className="h gap-4 muted">
            <button
              data-testid="refresh-btn"
              className="iconbtn"
              onClick={handleRefresh}
              disabled={loading}
              title={loading ? '刷新中…' : '刷新'}
              style={{ width: 24, height: 24 }}
            >
              {Icons.search}
            </button>
            <button
              className="iconbtn"
              title="筛选"
              style={{ width: 24, height: 24 }}
            >
              {Icons.filter}
            </button>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {radarItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--mute-2)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>○</div>
              <div style={{ fontSize: 13 }}>
                还没有岗位。去 LinkedIn 浏览岗位，点"Ask Quinn"开始。
              </div>
            </div>
          ) : (
            radarItems.map((item) => (
              <RadarCard
                key={item.id}
                id={item.id}
                company={item.company}
                jobTitle={item.jobTitle}
                status={item.status}
                lastActivity={item.lastActivity}
                appliedAt={item.appliedAt}
              />
            ))
          )}
        </div>
      </div>
    </div>
    <ConversationView />
    </>
  );
}
