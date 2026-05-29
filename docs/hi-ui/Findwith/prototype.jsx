/* global React, ReactDOM */
/* Interactive prototype runner — wires existing screen components into a clickable flow */

const { useState, useEffect, useMemo, useRef } = React;

// --------- FLOW: ordered list of scenes ---------
// Each scene has: key, label, sectionTitle, component name (resolved at render), size, frame ('popup'|'full'), hotspots[]
// Hotspots: { x, y, w, h, to, label }  (coords inside the screen)

const FLOW = [
  {
    key: 'onboarding',
    section: '① 上手',
    label: 'Onboarding',
    comp: 'OnboardingA',
    w: 420,
    h: 760,
    frame: 'popup',
    hotspots: [{ x: 24, y: 686, w: 372, h: 50, to: 'analysis-default', label: '开始 →' }],
  },

  {
    key: 'analysis-default',
    section: '② 岗位分析',
    label: '三层匹配 · 默认',
    comp: 'JobAnalysisA',
    w: 420,
    h: 760,
    frame: 'popup',
    hotspots: [
      { x: 16, y: 152, w: 388, h: 118, to: 'analysis-company', label: '公司速读 →' },
      { x: 16, y: 282, w: 388, h: 160, to: 'analysis-jd', label: 'JD 关键能力 →' },
      { x: 16, y: 454, w: 388, h: 160, to: 'analysis-gap', label: '缺口 →' },
      { x: 24, y: 686, w: 372, h: 50, to: 'tailoring', label: '开始定制简历 →' },
    ],
  },
  {
    key: 'analysis-company',
    section: '② 岗位分析',
    label: '公司速读 · 抽屉展开',
    comp: 'JobAnalysisA_Company',
    w: 420,
    h: 760,
    frame: 'popup',
    hotspots: [{ x: 16, y: 140, w: 388, h: 60, to: 'analysis-default', label: '← 收起' }],
  },
  {
    key: 'analysis-jd',
    section: '② 岗位分析',
    label: 'JD 命中你的素材',
    comp: 'JobAnalysisA_JD',
    w: 420,
    h: 760,
    frame: 'popup',
    hotspots: [{ x: 16, y: 140, w: 388, h: 60, to: 'analysis-default', label: '← 返回' }],
  },
  {
    key: 'analysis-gap',
    section: '② 岗位分析',
    label: '缺口 → 启动挖掘',
    comp: 'JobAnalysisA_Gap',
    w: 420,
    h: 760,
    frame: 'popup',
    hotspots: [{ x: 16, y: 140, w: 388, h: 60, to: 'analysis-default', label: '← 返回' }],
  },

  {
    key: 'tailoring',
    section: '③ 简历定制',
    label: '双栏对比工作区',
    comp: 'ResumeTailoringA',
    w: 1280,
    h: 820,
    frame: 'full',
    hotspots: [],
  },

  {
    key: 'easyapply',
    section: '④ 投递',
    label: 'Easy Apply 自动填表',
    comp: 'EasyApplyA',
    w: 420,
    h: 760,
    frame: 'popup',
    hotspots: [{ x: 24, y: 686, w: 372, h: 50, to: 'radar-default', label: '已投递 →' }],
  },

  {
    key: 'radar-default',
    section: '⑤ 求职雷达',
    label: '雷达 · 默认列表',
    comp: 'RadarA',
    w: 420,
    h: 760,
    frame: 'popup',
    hotspots: [
      { x: 16, y: 280, w: 388, h: 90, to: 'radar-submitted', label: '已投递 / Linear →' },
      { x: 16, y: 380, w: 388, h: 90, to: 'radar-interview', label: '进入面试 / Notion →' },
    ],
  },
  {
    key: 'radar-submitted',
    section: '⑤ 求职雷达',
    label: '已投递详情 (Linear)',
    comp: 'RadarA_Submitted',
    w: 420,
    h: 760,
    frame: 'popup',
    hotspots: [{ x: 16, y: 120, w: 388, h: 40, to: 'radar-default', label: '← 返回' }],
  },
  {
    key: 'radar-interview',
    section: '⑤ 求职雷达',
    label: '进入面试 (Notion)',
    comp: 'RadarA_Interview',
    w: 420,
    h: 760,
    frame: 'popup',
    hotspots: [{ x: 16, y: 120, w: 388, h: 40, to: 'radar-default', label: '← 返回' }],
  },

  {
    key: 'archive',
    section: '⑥ 档案',
    label: '素材库工作区',
    comp: 'ArchiveA',
    w: 1280,
    h: 800,
    frame: 'full',
    hotspots: [],
  },
];

const SCREEN_INDEX = Object.fromEntries(FLOW.map((s, i) => [s.key, i]));

// --------- Tweaks (synced with main canvas) ---------
const PROTO_TWEAKS = {
  qStyle: 'circle',
  aColor: '#1E40AF',
  bColor: '#1E40AF',
};

// --------- Frame chrome ---------
function PopupFrame({ children, scene }) {
  // Render the popup screen as a Chrome side panel pinned to the right of a fake browser
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #14141A, #0B0B10)',
        padding: '40px 24px',
        gap: 24,
      }}
    >
      <FakeBrowser />
      <div
        style={{
          width: scene.w,
          height: scene.h,
          position: 'relative',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)',
          borderRadius: 12,
          overflow: 'hidden',
          flexShrink: 0,
          background: '#fff',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FullFrame({ children, scene }) {
  // Scale full workspace down to fit viewport
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const padX = 80,
        padY = 80;
      const sx = (window.innerWidth - padX) / scene.w;
      const sy = (window.innerHeight - padY) / scene.h;
      setScale(Math.min(1, sx, sy));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [scene.w, scene.h]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0B0B10',
        overflow: 'hidden',
      }}
    >
      <div
        ref={ref}
        style={{
          width: scene.w,
          height: scene.h,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          position: 'relative',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FakeBrowser() {
  return (
    <div
      style={{
        flex: 1,
        maxWidth: 880,
        height: 760,
        alignSelf: 'center',
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #2A2A2E',
        boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        opacity: 0.55,
      }}
    >
      <div
        style={{
          height: 38,
          background: '#F4F4F5',
          borderBottom: '1px solid #E4E4E7',
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          gap: 8,
        }}
      >
        <span style={{ width: 11, height: 11, borderRadius: 99, background: '#FF5F56' }}></span>
        <span style={{ width: 11, height: 11, borderRadius: 99, background: '#FFBD2E' }}></span>
        <span style={{ width: 11, height: 11, borderRadius: 99, background: '#27C93F' }}></span>
        <div
          style={{
            flex: 1,
            marginLeft: 16,
            height: 24,
            background: '#fff',
            borderRadius: 6,
            border: '1px solid #E4E4E7',
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            fontSize: 11,
            color: '#71717A',
            fontFamily: 'Inter',
          }}
        >
          🔒 linkedin.com/jobs/view/3897234
        </div>
      </div>
      <div style={{ flex: 1, padding: '40px 60px', fontFamily: 'Inter', color: '#27272A' }}>
        <div style={{ fontSize: 11, color: '#71717A', marginBottom: 8 }}>
          Stripe · San Francisco · Full-time · Posted 2 days ago
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: '#09090B',
            marginBottom: 6,
            letterSpacing: '-0.01em',
          }}
        >
          Senior Software Engineer, Billing Platform
        </div>
        <div style={{ fontSize: 13, color: '#52525B', marginBottom: 20 }}>
          $210K – $295K · 4+ years experience
        </div>
        <div style={{ height: 1, background: '#E4E4E7', margin: '16px 0' }}></div>
        <div style={{ fontSize: 13, color: '#71717A', lineHeight: 1.7 }}>
          About the role
          <br />
          <span
            style={{
              display: 'inline-block',
              width: '90%',
              height: 8,
              background: '#F4F4F5',
              borderRadius: 4,
              margin: '8px 0',
            }}
          ></span>
          <span
            style={{
              display: 'inline-block',
              width: '78%',
              height: 8,
              background: '#F4F4F5',
              borderRadius: 4,
              margin: '4px 0',
            }}
          ></span>
          <span
            style={{
              display: 'inline-block',
              width: '85%',
              height: 8,
              background: '#F4F4F5',
              borderRadius: 4,
              margin: '4px 0',
            }}
          ></span>
          <span
            style={{
              display: 'inline-block',
              width: '60%',
              height: 8,
              background: '#F4F4F5',
              borderRadius: 4,
              margin: '4px 0',
            }}
          ></span>
          <div style={{ height: 24 }}></div>
          <span
            style={{
              display: 'inline-block',
              width: '70%',
              height: 8,
              background: '#F4F4F5',
              borderRadius: 4,
              margin: '4px 0',
            }}
          ></span>
          <span
            style={{
              display: 'inline-block',
              width: '88%',
              height: 8,
              background: '#F4F4F5',
              borderRadius: 4,
              margin: '4px 0',
            }}
          ></span>
        </div>
      </div>
    </div>
  );
}

// --------- Hotspots overlay ---------
function Hotspots({ hotspots, onGo, showLabels }) {
  if (!hotspots || !hotspots.length) return null;
  return (
    <>
      {hotspots.map((h, i) => (
        <div
          key={i}
          onClick={(e) => {
            e.stopPropagation();
            onGo(h.to);
          }}
          title={h.label}
          style={{
            position: 'absolute',
            left: h.x,
            top: h.y,
            width: h.w,
            height: h.h,
            cursor: 'pointer',
            zIndex: 5,
            borderRadius: 8,
            background: showLabels ? 'rgba(255, 177, 122, 0.18)' : 'transparent',
            outline: showLabels ? '2px dashed rgba(255, 177, 122, 0.7)' : 'none',
            transition: 'background 120ms, outline 120ms',
          }}
          onMouseEnter={(e) => {
            if (!showLabels) e.currentTarget.style.background = 'rgba(255, 177, 122, 0.12)';
          }}
          onMouseLeave={(e) => {
            if (!showLabels) e.currentTarget.style.background = 'transparent';
          }}
        >
          {showLabels && (
            <span
              style={{
                position: 'absolute',
                left: 8,
                top: 8,
                fontSize: 10,
                fontWeight: 600,
                color: '#FFB17A',
                background: '#1A1A1F',
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: 'Inter, sans-serif',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
              }}
            >
              {h.label}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

// --------- Top nav ---------
function TopNav({ idx, scene, onGo, onPrev, onNext, showHotspots, setShowHotspots }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 48,
        zIndex: 100,
        background: 'rgba(14,14,16,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        fontFamily: 'Inter, sans-serif',
        color: '#C7C7CC',
        fontSize: 12,
      }}
    >
      <span
        style={{
          fontFamily: 'Source Serif 4, serif',
          fontStyle: 'italic',
          fontWeight: 500,
          color: '#fff',
          fontSize: 14,
        }}
      >
        FindWith
      </span>
      <span style={{ color: '#3A3A3F' }}>·</span>
      <span style={{ color: '#8A8A8E' }}>Quinn 交互原型</span>

      <span style={{ flex: 1 }}></span>

      <button onClick={onPrev} disabled={idx === 0} style={navBtn(idx === 0)}>
        ← 上一步
      </button>
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ ...navBtn(false), minWidth: 240, justifyContent: 'space-between' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <span style={{ color: '#FFB17A', fontWeight: 600, flexShrink: 0 }}>
              {scene.section}
            </span>
            <span
              style={{
                color: '#fff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {scene.label}
            </span>
          </span>
          <span style={{ color: '#71717A', fontSize: 10 }}>▾</span>
        </button>
        {open && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              width: 340,
              background: '#17171A',
              border: '1px solid #2A2A2E',
              borderRadius: 8,
              padding: 6,
              boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
          >
            {FLOW.map((s, i) => {
              const sel = i === idx;
              return (
                <button
                  key={s.key}
                  onClick={() => {
                    onGo(s.key);
                    setOpen(false);
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: sel ? 'rgba(255,177,122,0.12)' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: sel ? '#FFB17A' : '#C7C7CC',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  <span style={{ fontSize: 10.5, color: '#71717A' }}>{s.section}</span>
                  <span style={{ fontSize: 12.5, fontWeight: sel ? 600 : 500 }}>{s.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        onClick={onNext}
        disabled={idx === FLOW.length - 1}
        style={navBtn(idx === FLOW.length - 1)}
      >
        下一步 →
      </button>

      <span style={{ width: 1, height: 24, background: '#2A2A2E', margin: '0 6px' }}></span>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: '#8A8A8E',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <input
          type="checkbox"
          checked={showHotspots}
          onChange={(e) => setShowHotspots(e.target.checked)}
          style={{ accentColor: '#FFB17A' }}
        />
        显示热区
      </label>

      <span
        className="tnum"
        style={{
          fontSize: 11,
          color: '#71717A',
          fontFamily: 'JetBrains Mono',
          minWidth: 48,
          textAlign: 'right',
        }}
      >
        {String(idx + 1).padStart(2, '0')} / {String(FLOW.length).padStart(2, '0')}
      </span>
    </div>
  );
}
function navBtn(disabled) {
  return {
    background: disabled ? 'transparent' : '#1F1F23',
    border: '1px solid #2A2A2E',
    color: disabled ? '#3A3A3F' : '#C7C7CC',
    padding: '6px 10px',
    borderRadius: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11.5,
    fontFamily: 'Inter, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };
}

// --------- Bottom progress dots ---------
function ProgressDots({ idx, onGo }) {
  // group by section
  const sections = [];
  let cur = null;
  FLOW.forEach((s, i) => {
    if (!cur || cur.section !== s.section) {
      cur = { section: s.section, items: [] };
      sections.push(cur);
    }
    cur.items.push({ ...s, idx: i });
  });
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        background: 'rgba(14,14,16,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 99,
        padding: '8px 14px',
        zIndex: 90,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {sections.map((sec, si) => (
        <React.Fragment key={si}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{
                fontSize: 9.5,
                color: '#71717A',
                fontWeight: 600,
                marginRight: 2,
                letterSpacing: '0.05em',
              }}
            >
              {sec.section.split(' ')[0]}
            </span>
            {sec.items.map((it) => {
              const active = it.idx === idx;
              return (
                <button
                  key={it.key}
                  onClick={() => onGo(it.key)}
                  title={it.label}
                  style={{
                    width: active ? 18 : 6,
                    height: 6,
                    borderRadius: 99,
                    background: active ? '#FFB17A' : '#3A3A3F',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'all 180ms',
                  }}
                ></button>
              );
            })}
          </div>
          {si < sections.length - 1 && <span style={{ color: '#3A3A3F' }}>·</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

// --------- Root ---------
function Prototype() {
  const [key, setKey] = useState(() => {
    const h = (window.location.hash || '').replace('#', '');
    return SCREEN_INDEX[h] != null ? h : FLOW[0].key;
  });
  const [showHotspots, setShowHotspots] = useState(false);
  const idx = SCREEN_INDEX[key];
  const scene = FLOW[idx];

  const go = (k) => {
    if (SCREEN_INDEX[k] == null) return;
    setKey(k);
    window.location.hash = k;
  };
  const next = () => idx < FLOW.length - 1 && go(FLOW[idx + 1].key);
  const prev = () => idx > 0 && go(FLOW[idx - 1].key);

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'h' || e.key === 'H') setShowHotspots((s) => !s);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx]);

  // hash sync
  useEffect(() => {
    const onHash = () => {
      const h = (window.location.hash || '').replace('#', '');
      if (SCREEN_INDEX[h] != null && h !== key) setKey(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [key]);

  const Comp = window[scene.comp];

  const screen = Comp ? (
    <>
      <Comp tweaks={PROTO_TWEAKS} />
      <Hotspots hotspots={scene.hotspots} onGo={go} showLabels={showHotspots} />
    </>
  ) : (
    <div style={{ padding: 40, fontFamily: 'Inter', color: '#999' }}>
      缺少组件 <code>{scene.comp}</code>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0B0B10' }}>
      <div style={{ paddingTop: 48, height: '100%' }}>
        {scene.frame === 'full' ? (
          <FullFrame scene={scene}>{screen}</FullFrame>
        ) : (
          <PopupFrame scene={scene}>{screen}</PopupFrame>
        )}
      </div>
      <TopNav
        idx={idx}
        scene={scene}
        onGo={go}
        onPrev={prev}
        onNext={next}
        showHotspots={showHotspots}
        setShowHotspots={setShowHotspots}
      />
      <ProgressDots idx={idx} onGo={go} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('proto-root')).render(<Prototype />);
