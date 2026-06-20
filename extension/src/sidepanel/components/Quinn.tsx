import React from 'react';

// ---------- Quinn icon ----------
interface QuinnIconProps {
  style?: 'circle' | 'glyph' | 'block';
  size?: number;
  color?: string;
}

export function QuinnIcon({ style = 'circle', size = 28, color }: QuinnIconProps) {
  const fill = color || 'var(--accent)';
  if (style === 'glyph') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: 'block' }}>
        <circle cx="16" cy="16" r="11" fill="none" stroke={fill} strokeWidth="1.6" />
        <line x1="22" y1="22" x2="27" y2="27" stroke={fill} strokeWidth="1.6" strokeLinecap="round" />
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

// ---------- Tiny icon set ----------
export const Icons = {
  chevDown: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  ),
  chevRight: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path d="M5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
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
  filter: (
    <svg width="12" height="12" viewBox="0 0 12 12">
      <path d="M2 3h8M3.5 6h5M5 9h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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

// ---------- Message components ----------
interface QMsgProps {
  children: React.ReactNode;
  iconStyle?: 'circle' | 'glyph' | 'block';
  iconColor?: string;
}

export function QMsg({ children, iconStyle = 'circle', iconColor }: QMsgProps) {
  return (
    <div className="msg quinn">
      <div className="qavatar">
        <QuinnIcon style={iconStyle} color={iconColor} size={22} />
      </div>
      <div className="bubble">{children}</div>
    </div>
  );
}

interface UMsgProps {
  children: React.ReactNode;
}

export function UMsg({ children }: UMsgProps) {
  return (
    <div className="msg user">
      <div className="bubble">{children}</div>
    </div>
  );
}

interface SysLineProps {
  children: React.ReactNode;
  'data-testid'?: string;
}

export function SysLine({ children, 'data-testid': testId }: SysLineProps) {
  return <div className="sys-line" data-testid={testId}>{children}</div>;
}

// ---------- Card components ----------
interface QCardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function QCard({ children, style }: QCardProps) {
  return (
    <div className="qcard" style={style}>
      {children}
    </div>
  );
}

interface QCardHeaderProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function QCardHeader({ children, style }: QCardHeaderProps) {
  return (
    <div className="qcard-h" style={style}>
      {children}
    </div>
  );
}

type QCardBodyProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
};

export function QCardBody({ children, style, ...rest }: QCardBodyProps) {
  return (
    <div className="qcard-b" style={style} {...rest}>
      {children}
    </div>
  );
}
