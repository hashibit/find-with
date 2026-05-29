/* global React */

// ---------- Quinn icon ----------
function QuinnIcon({ style = 'circle', size = 28, color }) {
  // style: 'circle' | 'glyph' | 'block'
  const fill = color || 'var(--accent)';
  if (style === 'glyph') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
        <circle cx="16" cy="16" r="11" fill="none" stroke={fill} strokeWidth="1.6" />
        <line
          x1="22"
          y1="22"
          x2="27"
          y2="27"
          stroke={fill}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="16" cy="16" r="3" fill={fill} />
      </svg>
    );
  }
  if (style === 'block') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
        <rect x="3" y="3" width="26" height="26" rx="6" fill={fill} />
        <path
          d="M11 12.5h10M11 16.5h10M11 20.5h6"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity="0.95"
        />
      </svg>
    );
  }
  // default circle with Q
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
      <circle cx="16" cy="16" r="14" fill={fill} />
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fill="#fff"
        fontFamily="Source Serif 4, Georgia, serif"
        fontSize="16"
        fontWeight="500"
        fontStyle="italic"
      >
        Q
      </text>
      <line x1="20" y1="22" x2="24" y2="26" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// tiny icons
const I = {
  chevDown: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M3 5l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  ),
  chevRight: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M5 3l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  minimize: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <path d="M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  more: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <circle cx="3" cy="7" r="1.2" fill="currentColor" />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" />
      <circle cx="11" cy="7" r="1.2" fill="currentColor" />
    </svg>
  ),
  send: (
    <svg width="11" height="11" viewBox="0 0 12 12">
      <path
        d="M2 6h7m0 0L6 3m3 3L6 9"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  paperclip: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <path
        d="M9.5 4l-4 4a1.8 1.8 0 002.5 2.5l4.5-4.5a3 3 0 00-4.2-4.2L3 6.5a4 4 0 005.7 5.7l3.8-3.8"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  ),
  search: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M9 9l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  doc: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <path
        d="M3 1.5h5l3 3V12a.5.5 0 01-.5.5h-7A.5.5 0 013 12V2a.5.5 0 010-.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
      <path d="M8 1.5v3h3" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  ),
  link: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M5 7l2-2M4.5 5L3 6.5a2 2 0 102.8 2.8L7 8M7.5 7L9 5.5a2 2 0 10-2.8-2.8L5 4"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M2.5 6.5l2.5 2.5L9.5 4"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  spark: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M6 1v3M6 8v3M1 6h3M8 6h3M2.5 2.5l2 2M7.5 7.5l2 2M9.5 2.5l-2 2M4.5 7.5l-2 2"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  ),
  filter: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M2 3h8M3.5 6h5M5 9h2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  plus: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  arrowR: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M2 6h8m0 0L7 3m3 3L7 9"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  upload: (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <path
        d="M7 9V2m0 0L4 5m3-3l3 3M2.5 11.5h9"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  briefcase: (
    <svg width="13" height="13" viewBox="0 0 14 14">
      <rect
        x="2"
        y="4.5"
        width="10"
        height="7.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
      <path
        d="M5.5 4.5V3a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1.5M2 7.5h10"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  ),
  clock: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <path
        d="M6 3.5V6l1.5 1"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  ),
  star: (
    <svg width="11" height="11" viewBox="0 0 12 12">
      <path
        d="M6 1.5l1.4 2.9 3.1.4-2.3 2.2.6 3.1L6 8.7 3.2 10.1l.6-3.1L1.5 4.8l3.1-.4z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  ),
  edit: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path
        d="M2 10h2l6-6-2-2-6 6v2z"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

// ---------- Side Panel chrome ----------
function SidePanel({
  variant = 'a',
  density = 'standard',
  densityLabel,
  qStyle = 'circle',
  qColor,
  tab,
  children,
  hideTabs = false,
  hideInput = false,
  inputPlaceholder = 'Ask Quinn anything…',
  inputDim = true,
  jobContext,
  status = '在线',
}) {
  return (
    <div className={`sp ${variant}`}>
      <div className="sp-top">
        <div className="qicon">
          <QuinnIcon style={qStyle} color={qColor} size={28} />
        </div>
        <div className="meta">
          <div className={variant === 'b' ? 'name serif-name' : 'name'}>Quinn</div>
          <div className="status">
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: 99,
                background: 'var(--good)',
                marginRight: 6,
                verticalAlign: 1,
              }}
            ></span>
            {status}
          </div>
        </div>
        <div className="actions">
          <button className="iconbtn" title="settings">
            {I.more}
          </button>
          <button className="iconbtn" title="minimize">
            {I.minimize}
          </button>
        </div>
      </div>

      {!hideTabs && (
        <div className="sp-tabs">
          {tabs(variant).map((t) => (
            <div key={t.k} className={`sp-tab ${tab === t.k ? 'active' : ''}`}>
              <span>{t.label}</span>
              {t.badge != null && <span className="badge tnum">{t.badge}</span>}
            </div>
          ))}
        </div>
      )}

      {jobContext && (
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--line)',
            background: 'var(--bg-soft)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 12,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 5,
              background: '#635BFF',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: -0.5,
              fontFamily: 'Source Serif 4, Georgia, serif',
            }}
          >
            S
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 500,
                color: 'var(--ink)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {jobContext.title}
            </div>
            <div className="muted tiny" style={{ marginTop: 1 }}>
              {jobContext.meta}
            </div>
          </div>
          <button className="iconbtn">{I.close}</button>
        </div>
      )}

      <div className="sp-body">
        <div className="sp-conv">{children}</div>

        {!hideInput && (
          <div className="sp-bottom">
            <div className={`sp-input ${inputDim ? 'dim' : ''}`}>
              <span style={{ color: 'var(--mute-2)' }}>{I.paperclip}</span>
              <input placeholder={inputPlaceholder} readOnly />
              <button className="send">{I.send}</button>
            </div>
            <div className="sp-density">
              <span>陪伴密度</span>
              <span className={`dot ${density === 'engaged' ? 'on' : ''}`}></span>
              <span className={`dot ${density === 'standard' ? 'on' : ''}`}></span>
              <span className={`dot ${density === 'quiet' ? 'on' : ''}`}></span>
              <span style={{ marginLeft: 4, color: 'var(--ink-2)' }}>{densityLabel || '标准'}</span>
              <span style={{ flex: 1 }}></span>
              <span className="kbd">⌘K</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function tabs(v) {
  return [
    { k: 'chat', label: '对话' },
    { k: 'radar', label: '雷达', badge: 14 },
    { k: 'profile', label: '档案' },
  ];
}

// ---------- Messages ----------
function Q({ children, qStyle = 'circle', qColor }) {
  return (
    <div className="msg quinn">
      <div className="qavatar">
        <QuinnIcon style={qStyle} color={qColor} size={22} />
      </div>
      <div className="bubble">{children}</div>
    </div>
  );
}
function U({ children }) {
  return (
    <div className="msg user">
      <div className="bubble">{children}</div>
    </div>
  );
}
function Sys({ children }) {
  return <div className="sys-line">{children}</div>;
}

// ---------- Frame wrapper for artboards ----------
function Frame({ variant, children }) {
  return <div className={`frame-shell ${variant === 'b' ? 'b-shell' : ''}`}>{children}</div>;
}

Object.assign(window, {
  QuinnIcon,
  I,
  SidePanel,
  Q,
  U,
  Sys,
  Frame,
});
