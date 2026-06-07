import React, { useEffect, useState } from 'react';
import { useProfileStore, Material } from '../stores/profile';
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
  const { materials, baseResumes, fetchMaterials, fetchBaseResumes, isLoading } = useProfileStore();
  const [activeProfileTab, setActiveProfileTab] = useState<ProfileNavTab>('素材库');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchMaterials();
    fetchBaseResumes();
  }, [fetchMaterials, fetchBaseResumes]);

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

      {activeProfileTab !== '素材库' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--mute-2)',
            fontSize: 13,
            padding: 24,
            textAlign: 'center',
          }}
        >
          {activeProfileTab} 功能即将推出
        </div>
      )}
    </>
  );
}
