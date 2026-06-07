import React, { useEffect, useState } from 'react';
import { useProfileStore, Material, UserProfile, Education, WorkExperience, Project, Skill } from '../stores/profile';
import { Icons } from '../components/Quinn';

const TAG_COLORS: Record<string, string> = {
  '主动性': '#2563EB',
  'Cross-fn': '#7C3AED',
  '技术深度': '#16A34A',
  'Ownership': '#0E7490',
  '工具思维': '#B45309',
  'Mentor': '#A21CAF',
  'Data': '#0E7490',
  '流程': '#2563EB',
  'leadership': '#7C3AED',
  'initiative': '#2563EB',
};

function getTagColor(tag: string): string {
  return TAG_COLORS[tag] || TAG_COLORS[tag.toLowerCase()] || 'var(--mute)';
}

const PROFILE_NAV_TABS = ['基本', '工作', '项目', '技能', '素材库'] as const;
type ProfileNavTab = typeof PROFILE_NAV_TABS[number];

interface ProfileNavProps {
  active: ProfileNavTab;
  onSelect: (tab: ProfileNavTab) => void;
}

function ProfileNav({ active, onSelect }: ProfileNavProps) {
  return (
    <div
      style={{
        margin: '0 -14px',
        borderBottom: '1px solid var(--line)',
        background: 'var(--bg)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 0, padding: '4px 14px 0', overflowX: 'auto' }}>
        {PROFILE_NAV_TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <button
              key={tab}
              onClick={() => onSelect(tab)}
              style={{
                padding: '10px 10px',
                fontSize: 12,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--ink)' : 'var(--mute)',
                borderBottom: isActive ? '2px solid var(--ink)' : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: isActive ? 'var(--ink)' : 'transparent',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {tab}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface MaterialRowProps {
  material: Material;
  expanded: boolean;
  onToggle: () => void;
}

function MaterialRow({ material, expanded, onToggle }: MaterialRowProps) {
  const confirmed = material.status === 'CONFIRMED' || material.status === 'USER_EDITED';
  const dateStr = new Date(material.createdAt).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });
  const primaryTag = material.tags[0] || '';

  if (expanded) {
    return (
      <div
        style={{
          padding: '12px 16px 14px',
          borderBottom: '1px solid var(--line-2)',
          background: 'var(--bg-sunk)',
          borderLeft: '2px solid var(--ink)',
          marginLeft: -2,
          cursor: 'pointer',
        }}
        onClick={onToggle}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: 99,
              background: 'var(--good)',
              flexShrink: 0,
              transform: 'translateY(-1px)',
            }}
          />
          <span style={{ color: 'var(--ink)', flex: 1, fontSize: 12, lineHeight: 1.5 }}>
            {material.content}
          </span>
          <span className="muted tnum" style={{ fontSize: 10.5 }}>
            {dateStr}
          </span>
        </div>

        {/* Original quote (label field as "raw") */}
        {material.label !== material.content && (
          <div
            style={{
              paddingLeft: 12,
              marginTop: 6,
              fontSize: 10.5,
              color: 'var(--mute)',
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}
          >
            原话："{material.label}"
          </div>
        )}

        {/* Tags */}
        {material.tags.length > 0 && (
          <div
            style={{
              paddingLeft: 12,
              marginTop: 8,
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {material.tags.map((tag, i) => (
              <React.Fragment key={tag}>
                {i > 0 && (
                  <span className="muted" style={{ fontSize: 10 }}>·</span>
                )}
                <span
                  style={{
                    fontSize: 10,
                    color: getTagColor(tag),
                    fontWeight: 500,
                  }}
                >
                  {tag}
                </span>
              </React.Fragment>
            ))}
            <span style={{ flex: 1 }} />
            <span className="muted" style={{ fontSize: 10 }}>
              {dateStr}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 36px',
        gap: 10,
        padding: '10px 16px',
        fontSize: 12,
        lineHeight: 1.4,
        borderBottom: '1px solid var(--line-2)',
        alignItems: 'center',
        cursor: 'pointer',
      }}
      onClick={onToggle}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: 99,
            flexShrink: 0,
            background: confirmed ? 'var(--good)' : 'var(--warn)',
            transform: 'translateY(-1px)',
          }}
        />
        <span
          style={{
            color: 'var(--ink)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {material.content}
        </span>
        {primaryTag && (
          <span
            style={{
              fontSize: 10,
              color: getTagColor(primaryTag),
              flexShrink: 0,
              fontWeight: 500,
            }}
          >
            {primaryTag}
          </span>
        )}
      </div>
      <span className="muted tnum" style={{ fontSize: 10.5, textAlign: 'right' }}>
        {dateStr}
      </span>
    </div>
  );
}

export function Library() {
  const { profile, materials, baseResumes, fetchProfile, fetchMaterials, fetchBaseResumes, isLoading } = useProfileStore();
  const [activeProfileTab, setActiveProfileTab] = useState<ProfileNavTab>('素材库');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchProfile();
    fetchMaterials();
    fetchBaseResumes();
  }, [fetchProfile, fetchMaterials, fetchBaseResumes]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredMaterials = searchQuery
    ? materials.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : materials;

  const unconfirmedCount = materials.filter((m) => m.status === 'PROPOSED').length;

  return (
    <>
      {/* Profile sub-nav */}
      <ProfileNav active={activeProfileTab} onSelect={setActiveProfileTab} />

      {activeProfileTab === '素材库' && (
        <>
          {/* Toolbar */}
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--line)',
              background: 'var(--bg)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 8px',
                border: '1px solid var(--line)',
                borderRadius: 6,
                fontSize: 11.5,
                color: 'var(--mute)',
                background: 'var(--bg)',
              }}
            >
              {Icons.search}
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索 · 标签 · 时间"
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: 11.5,
                  color: 'var(--ink)',
                  width: '100%',
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <button className="btn" style={{ padding: '5px 9px', fontSize: 11 }}>
              {Icons.plus}
            </button>
          </div>

          {/* Table */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: 'var(--bg)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 36px',
                gap: 10,
                padding: '9px 16px',
                fontSize: 9.5,
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.08em',
                color: 'var(--mute)',
                borderBottom: '1px solid var(--line)',
                flexShrink: 0,
              }}
            >
              <span>素材</span>
              <span style={{ textAlign: 'right' }}>日期</span>
            </div>

            {/* Rows */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {isLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--mute-2)', fontSize: 13 }}>
                  Loading...
                </div>
              ) : filteredMaterials.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--mute-2)', fontSize: 13 }}>
                  {searchQuery
                    ? '没有匹配的素材'
                    : '还没有素材。完成 Quinn 的档案对话来建立你的素材库。'}
                </div>
              ) : (
                filteredMaterials.map((m) => (
                  <MaterialRow
                    key={m.id}
                    material={m}
                    expanded={expandedIds.has(m.id)}
                    onToggle={() => toggleExpanded(m.id)}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '7px 16px',
                borderTop: '1px solid var(--line)',
                fontSize: 10.5,
                color: 'var(--mute)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--bg-soft)',
                flexShrink: 0,
              }}
            >
              <span className="tnum">{materials.length} 条</span>
              {unconfirmedCount > 0 && (
                <>
                  <span>·</span>
                  <span style={{ color: 'var(--warn)' }}>{unconfirmedCount} 待确认</span>
                </>
              )}
              <span style={{ flex: 1 }} />
              <span className="kbd">⌘K</span>
            </div>
          </div>
        </>
      )}

      {activeProfileTab === '基本' && <BasicInfoSection />}
      {activeProfileTab === '工作' && <WorkExperienceSection />}
      {activeProfileTab === '项目' && <ProjectsSection />}
      {activeProfileTab === '技能' && <SkillsSection />}
    </>
  );
}

// ============= Basic Info Section =============
function BasicInfoSection() {
  const { profile, isLoading } = useProfileStore();

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--mute-2)', fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--mute-2)', fontSize: 13 }}>
        请先上传简历建立档案
      </div>
    );
  }

  const { basic } = profile;
  const fields = [
    { label: '姓名', value: basic.fullName },
    { label: '邮箱', value: basic.email },
    { label: '电话', value: basic.phone },
    { label: '地点', value: basic.location },
    { label: 'LinkedIn', value: basic.linkedinUrl },
    { label: '网站', value: basic.website },
  ];

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 0' }}>
      {fields.map((f) => (
        <div
          key={f.label}
          style={{
            display: 'flex',
            padding: '10px 16px',
            borderBottom: '1px solid var(--line-2)',
            fontSize: 12,
          }}
        >
          <span style={{ width: 72, color: 'var(--mute)', flexShrink: 0 }}>{f.label}</span>
          <span style={{ color: 'var(--ink)', flex: 1 }}>
            {f.value || <span style={{ color: 'var(--mute-2)' }}>—</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============= Work Experience Section =============
function WorkExperienceSection() {
  const { profile, isLoading } = useProfileStore();

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--mute-2)', fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  if (!profile || profile.experience.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--mute-2)', fontSize: 13 }}>
        请先上传简历建立档案
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {profile.experience.map((exp) => (
        <div key={exp.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--line-2)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{exp.title}</span>
            <span style={{ fontSize: 12, color: 'var(--mute)' }}>@ {exp.company}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--mute-2)', marginTop: 2 }}>
            {exp.location} · {formatDateRange(exp.start, exp.end)}
          </div>
          {exp.bullets.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 16, fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>
              {exp.bullets.map((b, i) => (
                <li key={i} style={{ marginBottom: 4 }}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// ============= Projects Section =============
function ProjectsSection() {
  const { profile, isLoading } = useProfileStore();

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--mute-2)', fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  if (!profile || profile.projects.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--mute-2)', fontSize: 13 }}>
        请先上传简历建立档案
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {profile.projects.map((proj) => (
        <div key={proj.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--line-2)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{proj.name}</div>
          <div style={{ fontSize: 11, color: 'var(--mute-2)', marginTop: 2 }}>
            {formatDateRange(proj.start, proj.end)}
          </div>
          {proj.description && (
            <div style={{ fontSize: 12, color: 'var(--ink)', marginTop: 8, lineHeight: 1.5 }}>
              {proj.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============= Skills Section =============
function SkillsSection() {
  const { profile, isLoading } = useProfileStore();

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--mute-2)', fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  if (!profile || profile.skills.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--mute-2)', fontSize: 13 }}>
        请先上传简历建立档案
      </div>
    );
  }

  const hardSkills = profile.skills.filter((s) => s.kind === 'HARD' || s.kind === 'TOOL');
  const softSkills = profile.skills.filter((s) => s.kind === 'SOFT');

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
      {hardSkills.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', marginBottom: 8 }}>
            硬技能 / 工具
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {hardSkills.map((s) => (
              <span
                key={s.name}
                className="chip soft"
                style={{ fontSize: 11, padding: '4px 8px' }}
              >
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {softSkills.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', marginBottom: 8 }}>
            软技能
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {softSkills.map((s) => (
              <span
                key={s.name}
                className="chip soft"
                style={{ fontSize: 11, padding: '4px 8px' }}
              >
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {profile.certifications.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--mute)', marginBottom: 8 }}>
            证书
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5 }}>
            {profile.certifications.join(', ')}
          </div>
        </div>
      )}
    </div>
  );
}

// ============= Helpers =============
function formatDateRange(start: string, end: string): string {
  const fmt = (d: string) => {
    if (!d) return '';
    const [y, m] = d.split('-');
    return `${y}年${m ? parseInt(m) : ''}月`;
  };
  return `${fmt(start)} – ${end === 'present' ? '至今' : fmt(end)}`;
}
