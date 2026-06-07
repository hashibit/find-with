import React, { useEffect, useState } from 'react';
import { useProfileStore, Material } from '../../sidepanel/stores/profile';
import { QuinnIcon, Icons } from '../../sidepanel/components/Quinn';

const TAG_COLORS: Record<string, string> = {
  '主动性': '#2563EB',
  'Cross-fn': '#7C3AED',
  '技术深度': '#16A34A',
  'Ownership': '#0E7490',
  '工具思维': '#B45309',
  'Mentor': '#A21CAF',
  'Data': '#0E7490',
  '流程': '#2563EB',
};

function getTagColor(tag: string): string {
  return TAG_COLORS[tag] || TAG_COLORS[tag.toLowerCase()] || 'var(--mute)';
}

// ---------- Workspace shell ----------
function ArchiveShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="sp a"
      style={{
        width: '100vw',
        height: '100vh',
        borderRadius: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-soft)',
      }}
    >
      <div
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--bg)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => window.close()}
          style={{
            width: 24,
            height: 24,
            display: 'grid',
            placeItems: 'center',
            border: 'none',
            background: 'transparent',
            color: 'var(--mute)',
            cursor: 'pointer',
            borderRadius: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M9 3l-4 4 4 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <QuinnIcon variant="circle" color="var(--accent)" size={16} />
          <span className="muted">Quinn</span>
          <span className="muted">/</span>
          <span style={{ color: 'var(--ink)', fontWeight: 600 }}>档案</span>
          <span className="muted">/</span>
          <span style={{ color: 'var(--ink)' }}>素材库</span>
        </div>
        <span style={{ flex: 1 }} />
        <span className="muted tnum" style={{ fontSize: 11 }}>
          已自动同步
        </span>
        <span className="kbd">⌘K</span>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

// ---------- Left rail ----------
function LeftRail({ activeKey: activeKey }: { activeKey: string }) {
  const { materials } = useProfileStore();
  const unconfirmedCount = materials.filter((m) => m.status === 'PROPOSED').length;

  const sections = [
    { k: 'base', label: '基础档案', sub: '基本信息 · 经历 · 项目 · 技能', n: null },
    { k: 'lib', label: '素材库', sub: `${materials.length} 条${unconfirmedCount > 0 ? ` · ${unconfirmedCount} 待确认` : ''}`, n: String(materials.length), active: true },
  ];

  return (
    <div
      style={{
        width: 208,
        flexShrink: 0,
        borderRight: '1px solid var(--line)',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 0',
      }}
    >
      <div
        style={{
          padding: '0 16px 10px',
          fontSize: 9.5,
          fontWeight: 600,
          color: 'var(--mute)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        档案
      </div>

      {sections.map((s) => (
        <div
          key={s.k}
          style={{
            padding: '9px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            cursor: 'pointer',
            color: s.active ? 'var(--ink)' : 'var(--ink-2)',
            background: s.active ? 'var(--bg-sunk)' : 'transparent',
            borderLeft: s.active ? '2px solid var(--ink)' : '2px solid transparent',
            paddingLeft: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 13, fontWeight: s.active ? 600 : 500 }}>
              {s.label}
            </span>
            {s.n && (
              <span className="muted tnum" style={{ fontSize: 11 }}>
                {s.n}
              </span>
            )}
          </div>
          <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.4 }}>
            {s.sub}
          </div>
        </div>
      ))}

      <span style={{ flex: 1 }} />
      <div
        style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--line)',
          fontSize: 11,
          color: 'var(--mute)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 99, background: 'var(--good)' }} />
        <span>素材库已同步</span>
      </div>
    </div>
  );
}

// ---------- Filter bar ----------
function FilterBar({ searchQuery, setSearchQuery }: { searchQuery: string; setSearchQuery: (q: string) => void }) {
  return (
    <div
      style={{
        padding: '12px 24px',
        borderBottom: '1px solid var(--line)',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          flex: 1,
          maxWidth: 340,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          border: '1px solid var(--line)',
          borderRadius: 6,
          fontSize: 12,
          color: 'var(--mute)',
          background: 'var(--bg)',
        }}
      >
        {Icons.search}
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索素材、原话、标签…"
          style={{
            border: 'none',
            background: 'transparent',
            outline: 'none',
            fontSize: 12,
            color: 'var(--ink)',
            flex: 1,
            fontFamily: 'inherit',
          }}
        />
        <span className="kbd">/</span>
      </div>

      <span style={{ flex: 1 }} />

      <button className="btn" style={{ fontSize: 11.5, padding: '5px 9px', gap: 5 }}>
        {Icons.filter}
        <span>筛选</span>
      </button>
      <button className="btn primary" style={{ fontSize: 11.5, padding: '5px 10px', gap: 5 }}>
        {Icons.plus}
        <span>新建</span>
      </button>
    </div>
  );
}

// ---------- Table ----------
function ArchiveTable({ materials, selectedId, onSelect }: { materials: Material[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const grid = '24px 20px 1fr 96px 88px 56px 64px';

  const confirmedCount = materials.filter((m) => m.status === 'CONFIRMED' || m.status === 'USER_EDITED').length;
  const unconfirmedCount = materials.filter((m) => m.status === 'PROPOSED').length;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: grid,
          gap: 10,
          padding: '10px 24px',
          fontSize: 9.5,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--mute)',
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
          background: 'var(--bg)',
        }}
      >
        <span />
        <span />
        <span>素材</span>
        <span>标签</span>
        <span>发生</span>
        <span style={{ textAlign: 'right' }}>用</span>
        <span style={{ textAlign: 'right' }}>录入</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {materials.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--mute-2)', fontSize: 14 }}>
            还没有素材。完成 Quinn 的档案对话来建立你的素材库。
          </div>
        ) : (
          materials.map((m) => {
            const isSel = m.id === selectedId;
            const confirmed = m.status === 'CONFIRMED' || m.status === 'USER_EDITED';
            const primaryTag = m.tags[0] || '';
            const dateStr = new Date(m.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });

            return (
              <div
                key={m.id}
                onClick={() => onSelect(m.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: grid,
                  gap: 10,
                  padding: '10px 24px',
                  fontSize: 12.5,
                  lineHeight: 1.4,
                  borderBottom: '1px solid var(--line-2)',
                  alignItems: 'center',
                  background: isSel ? 'var(--bg-sunk)' : 'transparent',
                  borderLeft: isSel ? '2px solid var(--ink)' : '2px solid transparent',
                  paddingLeft: 22,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 3,
                    border: '1px solid var(--line)',
                    display: 'inline-block',
                    background: 'var(--bg)',
                  }}
                />
                <span
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    borderRadius: 99,
                    background: confirmed ? 'var(--good)' : 'var(--warn)',
                  }}
                />
                <span
                  style={{
                    color: 'var(--ink)',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 12.5,
                    fontWeight: isSel ? 500 : 400,
                  }}
                >
                  {m.content}
                </span>
                <span
                  style={{
                    fontSize: 10.5,
                    color: getTagColor(primaryTag),
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {primaryTag}
                </span>
                <span className="tnum" style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                  —
                </span>
                <span
                  className="tnum"
                  style={{
                    fontSize: 11,
                    textAlign: 'right',
                    color: 'var(--mute-2)',
                  }}
                >
                  —
                </span>
                <span className="muted tnum" style={{ fontSize: 11, textAlign: 'right' }}>
                  {dateStr}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div
        style={{
          padding: '8px 24px',
          borderTop: '1px solid var(--line)',
          fontSize: 11,
          color: 'var(--mute)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--bg-soft)',
          flexShrink: 0,
        }}
      >
        <span className="tnum">{materials.length} 条</span>
        <span>·</span>
        <span style={{ color: 'var(--good)' }}>{confirmedCount} 已确认</span>
        {unconfirmedCount > 0 && (
          <>
            <span>·</span>
            <span style={{ color: 'var(--warn)' }}>{unconfirmedCount} 待确认</span>
          </>
        )}
        <span style={{ flex: 1 }} />
        <span>排序 · 录入时间 ↓</span>
      </div>
    </div>
  );
}

// ---------- Detail drawer ----------
function DetailDrawer({ material, onClose }: { material: Material; onClose: () => void }) {
  const confirmed = material.status === 'CONFIRMED' || material.status === 'USER_EDITED';
  const primaryTag = material.tags[0] || '';
  const dateStr = new Date(material.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        background: 'var(--bg)',
        borderLeft: '1px solid var(--line)',
        boxShadow: '-12px 0 28px rgba(0,0,0,0.08), -2px 0 6px rgba(0,0,0,0.04)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 10,
      }}
    >
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span className="muted tnum" style={{ fontSize: 11 }}>
          #{material.id.slice(0, 6)}
        </span>
        <span className="muted">·</span>
        <span
          style={{
            fontSize: 10.5,
            color: confirmed ? 'var(--good)' : 'var(--warn)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 99, background: confirmed ? 'var(--good)' : 'var(--warn)' }} />
          {confirmed ? '已确认' : '待确认'}
        </span>
        <span style={{ flex: 1 }} />
        <button
          style={{
            width: 24,
            height: 24,
            display: 'grid',
            placeItems: 'center',
            border: 'none',
            background: 'transparent',
            color: 'var(--mute)',
            cursor: 'pointer',
            borderRadius: 6,
          }}
        >
          {Icons.edit}
        </button>
        <button
          style={{
            width: 24,
            height: 24,
            display: 'grid',
            placeItems: 'center',
            border: 'none',
            background: 'transparent',
            color: 'var(--mute)',
            cursor: 'pointer',
            borderRadius: 6,
          }}
        >
          {Icons.more}
        </button>
        <button
          onClick={onClose}
          style={{
            width: 24,
            height: 24,
            display: 'grid',
            placeItems: 'center',
            border: 'none',
            background: 'transparent',
            color: 'var(--mute)',
            cursor: 'pointer',
            borderRadius: 6,
            marginLeft: 2,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: '18px 20px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* fact */}
        <div>
          <div className="lab">事实</div>
          <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.5, color: 'var(--ink)' }}>
            {material.content}
          </div>
        </div>

        {/* original quote */}
        {material.label !== material.content && (
          <div
            className="italic"
            style={{
              marginTop: 6,
              fontSize: 11.5,
              lineHeight: 1.55,
              color: 'var(--mute)',
              paddingLeft: 10,
              borderLeft: '2px solid var(--line)',
            }}
          >
            "{material.label}"
          </div>
        )}

        {/* tags */}
        <div>
          <div className="lab">标签</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {material.tags.map((t) => (
              <span
                key={t}
                className="chip"
                style={{
                  fontSize: 10.5,
                  color: getTagColor(t),
                  borderColor: `color-mix(in srgb, ${getTagColor(t)} 25%, transparent)`,
                  background: `color-mix(in srgb, ${getTagColor(t)} 6%, transparent)`,
                }}
              >
                {t}
              </span>
            ))}
            <span
              className="chip"
              style={{ fontSize: 10.5, color: 'var(--mute)', borderStyle: 'dashed' }}
            >
              + 加
            </span>
          </div>
        </div>

        {/* meta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
          <div>
            <div className="lab" style={{ fontSize: 9.5 }}>录入</div>
            <div className="tnum" style={{ marginTop: 4, fontSize: 12 }}>{dateStr}</div>
          </div>
          <div>
            <div className="lab" style={{ fontSize: 9.5 }}>状态</div>
            <div style={{ marginTop: 4, fontSize: 12, color: confirmed ? 'var(--good)' : 'var(--warn)' }}>
              {confirmed ? '已确认' : '待确认'}
            </div>
          </div>
        </div>

        {/* source */}
        <div>
          <div className="lab">来源</div>
          <div
            style={{
              marginTop: 6,
              padding: '8px 10px',
              border: '1px solid var(--line)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11.5,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: 5,
                background: 'var(--bg-sunk)',
                color: 'var(--mute)',
                flexShrink: 0,
              }}
            >
              {Icons.doc}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--ink)', fontWeight: 500 }}>与 Quinn 对话</div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          margin: '14px 16px 16px',
          padding: '10px 12px',
          background: 'var(--bg-sunk)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          fontSize: 11.5,
          lineHeight: 1.5,
          color: 'var(--ink-2)',
          display: 'flex',
          gap: 8,
        }}
      >
        <QuinnIcon variant="circle" color="var(--accent)" size={16} />
        <div>
          这条素材可以补充更多细节——比如当时的具体挑战是什么？要我帮你回忆一下吗？
        </div>
      </div>
    </div>
  );
}

// ---------- Main component ----------
export function Archive() {
  const { materials, fetchMaterials, isLoading } = useProfileStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const filteredMaterials = searchQuery
    ? materials.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : materials;

  const selectedMaterial = selectedId ? materials.find((m) => m.id === selectedId) : null;

  // Auto-select first material if none selected
  useEffect(() => {
    if (!selectedId && filteredMaterials.length > 0) {
      setSelectedId(filteredMaterials[0].id);
    }
  }, [filteredMaterials, selectedId]);

  return (
    <ArchiveShell>
      <LeftRail activeKey="lib" />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--bg)',
          position: 'relative',
        }}
      >
        <FilterBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mute-2)', fontSize: 14 }}>
            Loading...
          </div>
        ) : (
          <ArchiveTable materials={filteredMaterials} selectedId={selectedId} onSelect={setSelectedId} />
        )}
        {selectedMaterial && <DetailDrawer material={selectedMaterial} onClose={() => setSelectedId(null)} />}
      </div>
    </ArchiveShell>
  );
}