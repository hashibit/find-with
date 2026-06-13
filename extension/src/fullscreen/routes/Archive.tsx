import React, { useEffect, useState, useRef } from 'react';
import { useProfileStore, Material, UserProfile } from '../../sidepanel/stores/profile';
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

// ---------- Auth prompt (shown when no token) ----------
function AuthPrompt() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, padding: 40,
    }}>
      <QuinnIcon variant="circle" color="var(--accent)" size={48} />
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>请先登录</h2>
      <p style={{ fontSize: 13, color: 'var(--mute)', margin: 0, textAlign: 'center', maxWidth: 340 }}>
        你需要先通过网站登录，才能让档案页面读取你的数据。
      </p>
      <button
        className="btn primary"
        onClick={() => window.open('http://localhost:14606/auth/extension-callback', '_blank')}
        style={{ fontSize: 13, padding: '8px 20px' }}
      >
        去登录
      </button>
    </div>
  );
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
function LeftRail({ activeKey, onSwitch }: { activeKey: string; onSwitch: (key: string) => void }) {
  const { materials, profile } = useProfileStore();
  const unconfirmedCount = materials.filter((m) => m.status === 'PROPOSED').length;
  const expCount = profile?.experience?.length ?? 0;
  const eduCount = profile?.education?.length ?? 0;
  const skillCount = profile?.skills?.length ?? 0;

  const sections = [
    {
      k: 'base', label: '基础档案',
      sub: `${expCount} 段经历 · ${eduCount} 段教育 · ${skillCount} 项技能`,
      active: activeKey === 'base',
    },
    {
      k: 'lib', label: '素材库',
      sub: `${materials.length} 条${unconfirmedCount > 0 ? ` · ${unconfirmedCount} 待确认` : ''}`,
      n: String(materials.length),
      active: activeKey === 'lib',
    },
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
          onClick={() => onSwitch(s.k)}
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

// ---------- Profile view (基础档案) ----------
function ProfileView({ profile }: { profile: UserProfile }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      {/* Basic info */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>基本信息</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
          {[
            ['姓名', profile.basic.fullName],
            ['邮箱', profile.basic.email],
            ['电话', profile.basic.phone || '—'],
            ['地点', profile.basic.location || '—'],
            ['LinkedIn', profile.basic.linkedinUrl || '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
              <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Work experience */}
      {profile.experience.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>工作经历</h3>
          {profile.experience.map((exp) => (
            <div key={exp.id} style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--bg-sunk)', borderRadius: 8, border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{exp.title}</span>
                <span className="muted tnum" style={{ fontSize: 11 }}>{exp.start} — {exp.end}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{exp.company}{exp.location ? ` · ${exp.location}` : ''}</div>
              {exp.bullets.length > 0 && (
                <ul style={{ margin: '8px 0 0', padding: '0 0 0 16px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                  {exp.bullets.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Education */}
      {profile.education.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>教育背景</h3>
          {profile.education.map((edu) => (
            <div key={edu.id} style={{ marginBottom: 12, padding: '12px 14px', background: 'var(--bg-sunk)', borderRadius: 8, border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{edu.school}</span>
                <span className="muted tnum" style={{ fontSize: 11 }}>{edu.start} — {edu.end}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>
                {edu.degree}{edu.major ? `, ${edu.major}` : ''}{edu.gpa ? ` · GPA ${edu.gpa}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Skills */}
      {profile.skills.length > 0 && (
        <div>
          <h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>技能</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {profile.skills.map((s, i) => (
              <span key={i} className="chip" style={{
                fontSize: 11, color: s.kind === 'HARD' ? '#2563EB' : s.kind === 'TOOL' ? '#7C3AED' : '#16A34A',
                borderColor: `color-mix(in srgb, ${s.kind === 'HARD' ? '#2563EB' : s.kind === 'TOOL' ? '#7C3AED' : '#16A34A'} 25%, transparent)`,
                background: `color-mix(in srgb, ${s.kind === 'HARD' ? '#2563EB' : s.kind === 'TOOL' ? '#7C3AED' : '#16A34A'} 6%, transparent)`,
              }}>{s.name}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Filter bar ----------
function FilterBar({
  searchQuery, setSearchQuery,
  statusFilter, onStatusFilter,
  onNewMaterial,
}: {
  searchQuery: string; setSearchQuery: (q: string) => void;
  statusFilter: string; onStatusFilter: (s: string) => void;
  onNewMaterial: () => void;
}) {
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const statusOptions = [
    { key: 'ALL', label: '全部状态' },
    { key: 'CONFIRMED', label: '已确认' },
    { key: 'USER_EDITED', label: '已编辑' },
    { key: 'PROPOSED', label: '待确认' },
  ];
  const activeStatus = statusOptions.find(s => s.key === statusFilter) ?? statusOptions[0];

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

      <div style={{ position: 'relative' }}>
        <button className="btn" style={{ fontSize: 11.5, padding: '5px 9px', gap: 5 }}
          onClick={() => setShowStatusDropdown(v => !v)}>
          {Icons.filter}
          <span>{activeStatus.label}</span>
        </button>
        {showStatusDropdown && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 20, minWidth: 120,
            padding: '4px 0',
          }}>
            {statusOptions.map(s => (
              <div key={s.key}
                onClick={() => { onStatusFilter(s.key); setShowStatusDropdown(false); }}
                style={{
                  padding: '7px 14px', fontSize: 12, cursor: 'pointer',
                  color: s.key === statusFilter ? 'var(--ink)' : 'var(--ink-2)',
                  background: s.key === statusFilter ? 'var(--bg-sunk)' : 'transparent',
                }}>
                {s.label}
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="btn primary" style={{ fontSize: 11.5, padding: '5px 10px', gap: 5 }}
        onClick={onNewMaterial}>
        {Icons.plus}
        <span>新建</span>
      </button>
    </div>
  );
}

// ---------- Create material dialog ----------
function CreateMaterialDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (rawText: string, tags: string[]) => void }) {
  const [rawText, setRawText] = useState('');
  const [tagsStr, setTagsStr] = useState('');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--line)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.15)', width: 440, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>新建素材</span>
          <button onClick={onClose} style={{
            width: 24, height: 24, display: 'grid', placeItems: 'center',
            border: 'none', background: 'transparent', color: 'var(--mute)', cursor: 'pointer',
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', display: 'block', marginBottom: 6 }}>素材内容</label>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder="描述这段经历或闪光点…"
              style={{
                width: '100%', minHeight: 80, padding: '8px 10px',
                border: '1px solid var(--line)', borderRadius: 6,
                fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)',
                background: 'var(--bg)', resize: 'vertical',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', display: 'block', marginBottom: 6 }}>标签（逗号分隔）</label>
            <input
              value={tagsStr}
              onChange={e => setTagsStr(e.target.value)}
              placeholder="主动性, 技术深度, Ownership"
              style={{
                width: '100%', padding: '8px 10px',
                border: '1px solid var(--line)', borderRadius: 6,
                fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)',
                background: 'var(--bg)',
              }}
            />
          </div>
        </div>
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--line)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button className="btn" onClick={onClose} style={{ fontSize: 12, padding: '6px 14px' }}>取消</button>
          <button className="btn primary" onClick={() => {
            const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
            onSubmit(rawText, tags);
          }} style={{ fontSize: 12, padding: '6px 14px' }}
            disabled={!rawText.trim()}>
            创建
          </button>
        </div>
      </div>
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
function DetailDrawer({
  material, onClose, onEdit, onDelete, onAddTag, onToggleStatus,
}: {
  material: Material;
  onClose: () => void;
  onEdit: (id: string, patch: Partial<Material>) => void;
  onDelete: (id: string) => void;
  onAddTag: (id: string, tag: string) => void;
  onToggleStatus: (id: string) => void;
}) {
  const confirmed = material.status === 'CONFIRMED' || material.status === 'USER_EDITED';
  const primaryTag = material.tags[0] || '';
  const dateStr = new Date(material.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(material.content);
  const [newTag, setNewTag] = useState('');
  const [showMore, setShowMore] = useState(false);

  const handleSave = () => {
    onEdit(material.id, { content: editText, status: 'USER_EDITED' });
    setEditing(false);
  };

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
          onClick={() => { if (editing) handleSave(); else setEditing(true); }}
          style={{
            width: 24, height: 24, display: 'grid', placeItems: 'center',
            border: 'none', background: 'transparent', color: editing ? 'var(--accent)' : 'var(--mute)',
            cursor: 'pointer', borderRadius: 6,
          }}
          title={editing ? '保存' : '编辑'}
        >
          {editing ? (
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          ) : Icons.edit}
        </button>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMore(v => !v)}
            style={{
              width: 24, height: 24, display: 'grid', placeItems: 'center',
              border: 'none', background: 'transparent', color: 'var(--mute)',
              cursor: 'pointer', borderRadius: 6,
            }}
            title="更多操作"
          >
            {Icons.more}
          </button>
          {showMore && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 20, minWidth: 140, padding: '4px 0',
            }}>
              <div onClick={() => { onToggleStatus(material.id); setShowMore(false); }}
                style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--ink)' }}>
                {confirmed ? '标记为待确认' : '标记为已确认'}
              </div>
              <div onClick={() => { onDelete(material.id); setShowMore(false); onClose(); }}
                style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer', color: 'var(--bad)' }}>
                删除素材
              </div>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            width: 24, height: 24, display: 'grid', placeItems: 'center',
            border: 'none', background: 'transparent', color: 'var(--mute)',
            cursor: 'pointer', borderRadius: 6, marginLeft: 2,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        style={{
          flex: 1, overflow: 'hidden', padding: '18px 20px 0',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        {/* fact */}
        <div>
          <div className="lab">素材内容</div>
          {editing ? (
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              style={{
                marginTop: 6, width: '100%', minHeight: 60, padding: '8px 10px',
                border: '1px solid var(--line)', borderRadius: 6,
                fontSize: 14, lineHeight: 1.5, color: 'var(--ink)',
                fontFamily: 'inherit', background: 'var(--bg)', resize: 'vertical',
              }}
              autoFocus
            />
          ) : (
            <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.5, color: 'var(--ink)' }}>
              {material.content}
            </div>
          )}
        </div>

        {/* original quote */}
        {material.label !== material.content && (
          <div
            className="italic"
            style={{
              marginTop: 6, fontSize: 11.5, lineHeight: 1.55,
              color: 'var(--mute)', paddingLeft: 10,
              borderLeft: '2px solid var(--line)',
            }}
          >
            "{material.label}"
          </div>
        )}

        {/* tags */}
        <div>
          <div className="lab">标签</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTag.trim()) {
                    onAddTag(material.id, newTag.trim());
                    setNewTag('');
                  }
                }}
                placeholder="+ 加"
                style={{
                  width: 60, padding: '3px 8px', fontSize: 10.5,
                  border: '1px dashed var(--line)', borderRadius: 6,
                  background: 'transparent', color: 'var(--ink)',
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
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
              marginTop: 6, padding: '8px 10px', border: '1px solid var(--line)',
              borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5,
            }}
          >
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: 5,
                background: 'var(--bg-sunk)', color: 'var(--mute)', flexShrink: 0,
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
          margin: '14px 16px 16px', padding: '10px 12px',
          background: 'var(--bg-sunk)', border: '1px solid var(--line)',
          borderRadius: 8, fontSize: 11.5, lineHeight: 1.5,
          color: 'var(--ink-2)', display: 'flex', gap: 8,
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
  const {
    profile, materials, isLoading,
    fetchProfile, fetchMaterials,
    createMaterial, updateMaterial, deleteMaterial,
  } = useProfileStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState('lib');
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Check auth on mount
  useEffect(() => {
    chrome.storage.local.get(['token'], (res) => {
      setHasToken(!!res.token);
    });
  }, []);

  // Fetch data when authenticated
  useEffect(() => {
    if (hasToken) {
      fetchProfile();
      fetchMaterials();
    }
  }, [hasToken, fetchProfile, fetchMaterials]);

  // Filter materials
  const filteredMaterials = materials
    .filter(m => {
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return m.content.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q));
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  const selectedMaterial = selectedId ? materials.find(m => m.id === selectedId) : null;

  // Auto-select first material when list changes
  useEffect(() => {
    if (!selectedId && filteredMaterials.length > 0 && activeTab === 'lib') {
      setSelectedId(filteredMaterials[0].id);
    }
  }, [filteredMaterials, selectedId, activeTab]);

  // Close more-dropdown on outside click
  useEffect(() => {
    const handler = () => {};
    return () => handler();
  }, []);

  const handleCreate = (rawText: string, tags: string[]) => {
    createMaterial({ rawText, provenanceKind: 'CONVERSATION', tags });
    setShowCreateDialog(false);
  };

  const handleEdit = (id: string, patch: Partial<Material>) => {
    updateMaterial(id, {
      ...(patch.content && { shiningText: patch.content }),
      status: patch.status,
    });
  };

  const handleDelete = (id: string) => {
    deleteMaterial(id);
    if (selectedId === id) setSelectedId(null);
  };

  const handleAddTag = (id: string, tag: string) => {
    const mat = materials.find(m => m.id === id);
    if (!mat || mat.tags.includes(tag)) return;
    updateMaterial(id, { tags: [...mat.tags, tag] } as Partial<Material>);
  };

  const handleToggleStatus = (id: string) => {
    const mat = materials.find(m => m.id === id);
    if (!mat) return;
    const newStatus = (mat.status === 'CONFIRMED' || mat.status === 'USER_EDITED') ? 'PROPOSED' : 'CONFIRMED';
    updateMaterial(id, { status: newStatus } as Partial<Material>);
  };

  if (hasToken === false) return <ArchiveShell><AuthPrompt /></ArchiveShell>;
  if (hasToken === null) return <ArchiveShell><div style={{ flex: 1 }} /></ArchiveShell>;

  return (
    <ArchiveShell>
      <LeftRail activeKey={activeTab} onSwitch={setActiveTab} />
      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', background: 'var(--bg)', position: 'relative',
        }}
      >
        {activeTab === 'lib' && (
          <FilterBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            onNewMaterial={() => setShowCreateDialog(true)}
          />
        )}

        {isLoading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mute-2)', fontSize: 14 }}>
            Loading…
          </div>
        ) : activeTab === 'base' && profile ? (
          <ProfileView profile={profile} />
        ) : (
          <ArchiveTable materials={filteredMaterials} selectedId={selectedId} onSelect={setSelectedId} />
        )}

        {selectedMaterial && activeTab === 'lib' && (
          <DetailDrawer
            material={selectedMaterial}
            onClose={() => setSelectedId(null)}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAddTag={handleAddTag}
            onToggleStatus={handleToggleStatus}
          />
        )}

        {showCreateDialog && (
          <CreateMaterialDialog
            onClose={() => setShowCreateDialog(false)}
            onSubmit={handleCreate}
          />
        )}
      </div>
    </ArchiveShell>
  );
}
