/* global React, SidePanel, Q, U, Sys, I, Frame, QuinnIcon */

// ============= RESUME TAILORING (wide) =============
// Side-by-side: original resume vs tailored, with sourcing + Quinn pane on right
// 1280×820 wide artboard

const ORIGINAL_BULLETS = [
  { id:'o1', text:'Designed and shipped backend services for Stripe Billing.' },
  { id:'o2', text:'Owned key API endpoints, supporting payments at scale.' },
  { id:'o3', text:'Worked with cross-functional teams to ship features.' },
  { id:'o4', text:'Mentored junior engineers and reviewed code regularly.' },
];

const TAILORED_BULLETS = [
  {
    id:'t1', kind:'kept',
    text:'Designed and shipped backend services for Stripe Billing, processing $4B+ in monthly volume.',
    src:{ from:'原 bullet · 加上量化', when:'你 4/12 的对话里提过' },
  },
  {
    id:'t2', kind:'rewritten',
    text:'Led RFC and architectural migration of payments service from MySQL to Postgres, navigating 3 stakeholder teams to alignment.',
    src:{ from:'素材库 · "Postgres RFC"', when:'2026-03-30 对话' },
  },
  {
    id:'t3', kind:'sourced',
    text:'Identified recurring oncall pattern; shipped internal diagnostic tool that cut same-class incidents by 50% MoM.',
    src:{ from:'素材库 · "oncall 工具"', when:'2026-04-08 对话' },
    label:'闪光点',
  },
  {
    id:'t4', kind:'pending',
    text:'Drove cross-functional alignment across 3 product teams on onboarding redesign — quantitative impact pending confirmation.',
    src:{ from:'素材库 · 未确认', when:'缺口：Stakeholder mgmt' },
  },
];

const KIND_COLORS = {
  kept:       { dot:'var(--good)',  label:'保留 · 已溯源' },
  rewritten:  { dot:'var(--accent)', label:'重写 · 已溯源' },
  sourced:    { dot:'var(--good)',  label:'素材库新增 · 已溯源' },
  pending:    { dot:'var(--warn)',  label:'待确认' },
  edited:     { dot:'#3B82F6',      label:'你改过' },
};

function ResumeTailoringA({ tweaks }) {
  return <ResumeTailoring variant="a" tweaks={tweaks} />;
}
function ResumeTailoringB({ tweaks }) {
  return <ResumeTailoring variant="b" tweaks={tweaks} />;
}

function ResumeTailoring({ variant, tweaks }) {
  const isB = variant === 'b';
  const aColor = tweaks.aColor;
  const bColor = tweaks.bColor;
  const accent = isB ? bColor : aColor;

  return (
    <div className={`wide ${isB ? 'b-shell' : ''}`} style={{
      width:1280, height:820, display:'flex',
      background: isB ? 'var(--b-bg-soft)' : '#F4F4F5',
      fontFamily: 'Inter, sans-serif',
      color: isB ? 'var(--b-ink)' : 'var(--a-ink)',
    }}>
      {/* left: workspace */}
      <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>
        {/* top bar */}
        <div style={{
          height:52, padding:'0 24px',
          borderBottom:`1px solid ${isB ? 'var(--b-line)' : 'var(--a-line)'}`,
          background: isB ? 'var(--b-bg)' : '#fff',
          display:'flex', alignItems:'center', gap:12
        }}>
          <button style={{
            background:'transparent', border:'none', color: isB ? 'var(--b-mute)' : 'var(--a-mute)',
            cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:12.5
          }}>← 回到对话</button>
          <span style={{color: isB ? 'var(--b-mute-2)' : 'var(--a-mute-2)'}}>·</span>
          <div className={isB ? 'serif' : ''} style={{fontSize:14, fontWeight:600}}>
            为 <span style={{fontWeight: isB ? 500 : 600}}>Stripe</span> 定制 · Senior PM
          </div>
          <div style={{flex:1}}></div>

          {/* match meter */}
          <div style={{display:'flex', alignItems:'center', gap:14, marginRight:8}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <div style={{fontSize:10.5, color: isB ? 'var(--b-mute)':'var(--a-mute)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600}}>匹配度</div>
              <div style={{display:'flex', alignItems:'baseline', gap:4}}>
                <span style={{fontSize:13, color: isB ? 'var(--b-mute-2)':'var(--a-mute-2)', textDecoration:'line-through'}}>62</span>
                <span style={{color: isB ? 'var(--b-mute-2)':'var(--a-mute-2)'}}>{I.arrowR}</span>
                <span className={isB ? 'serif' : ''} style={{fontSize:22, fontWeight:isB?500:600, color: accent, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em'}}>89</span>
              </div>
            </div>
          </div>
          <button className="btn">{I.doc}<span style={{marginLeft:4}}>纯文本</span></button>
          <button className="btn primary" style={{background: isB ? bColor : '#09090B', borderColor: isB ? bColor : '#09090B', color:'#fff'}}>导出 PDF</button>
        </div>

        {/* dual pane */}
        <div style={{flex:1, display:'flex', overflow:'hidden'}}>
          {/* original */}
          <div style={{flex:1, padding:'24px 28px 24px 32px', overflow:'hidden', borderRight:`1px solid ${isB ? 'var(--b-line)' : 'var(--a-line)'}`}}>
            <PaneHeader variant={variant} label="原版" sub="resume_2026.pdf" muted />
            <ResumeBody variant={variant} mode="original" />
          </div>

          {/* tailored */}
          <div style={{flex:1, padding:'24px 32px 24px 28px', overflow:'hidden', background: isB ? 'var(--b-bg)' : '#fff'}}>
            <PaneHeader variant={variant} label="为 Stripe 定制" sub="实时 · 89% 匹配" accent />
            <ResumeBody variant={variant} mode="tailored" accent={accent} />
          </div>
        </div>
      </div>

      {/* right: Quinn coach pane */}
      <div style={{
        width:380, flexShrink:0,
        borderLeft:`1px solid ${isB ? 'var(--b-line)' : 'var(--a-line)'}`,
        background: isB ? 'var(--b-bg-soft)' : '#FAFAFA',
        display:'flex', flexDirection:'column'
      }}>
        <CoachPane variant={variant} tweaks={tweaks} />
      </div>
    </div>
  );
}

function PaneHeader({ variant, label, sub, accent, muted }) {
  const isB = variant === 'b';
  const color = accent ? (isB ? 'var(--b-accent)' : 'var(--a-accent)') : (isB ? 'var(--b-ink)' : 'var(--a-ink)');
  return (
    <div style={{marginBottom:18, paddingBottom:12, borderBottom:`1px solid ${isB ? 'var(--b-line-2)' : 'var(--a-line-2)'}`}}>
      <div style={{
        fontSize:10.5, fontWeight:600, textTransform:'uppercase',
        letterSpacing:'0.1em',
        color: muted ? (isB ? 'var(--b-mute)' : 'var(--a-mute)') : color,
        marginBottom:5
      }}>{label}</div>
      <div className={isB ? 'serif italic' : ''} style={{fontSize:12, color: isB ? 'var(--b-mute)' : 'var(--a-mute)'}}>{sub}</div>
    </div>
  );
}

function ResumeBody({ variant, mode, accent }) {
  const isB = variant === 'b';
  const muted = isB ? 'var(--b-mute)' : 'var(--a-mute)';
  const ink = isB ? 'var(--b-ink)' : 'var(--a-ink)';
  const accentC = accent || (isB ? 'var(--b-accent)' : 'var(--a-accent)');

  // header always
  const Header = (
    <div>
      <div className={isB ? 'serif' : ''} style={{fontSize:22, fontWeight:600, letterSpacing:'-0.02em', color:ink}}>Marcus Chen</div>
      <div style={{fontSize:11.5, color:muted, marginTop:4}}>San Francisco · marcus.chen@email.com · linkedin.com/in/marcuschen</div>
    </div>
  );

  if (mode === 'original') {
    return (
      <div style={{fontSize:12, lineHeight:1.55, color:ink, opacity:0.78}}>
        {Header}
        <div style={{marginTop:18}}>
          <SectionTitle variant={variant}>EXPERIENCE</SectionTitle>
          <div style={{marginTop:10}}>
            <RoleHeader variant={variant} co="Linear" role="Product Engineer" date="2024 — Present" />
            <Bullet variant={variant} text="Built growth surface features used by 100k+ users." />
            <Bullet variant={variant} text="Improved onboarding flow conversion." />
          </div>
          <div style={{marginTop:14}}>
            <RoleHeader variant={variant} co="Stripe" role="Software Engineer" date="2022 — 2024" />
            {ORIGINAL_BULLETS.map(b => <Bullet key={b.id} variant={variant} text={b.text} />)}
          </div>
        </div>
      </div>
    );
  }

  // tailored
  return (
    <div style={{fontSize:12, lineHeight:1.55, color:ink}}>
      {Header}
      <div style={{marginTop:18}}>
        <SectionTitle variant={variant}>EXPERIENCE</SectionTitle>
        <div style={{marginTop:10}}>
          <RoleHeader variant={variant} co="Linear" role="Product Engineer" date="2024 — Present" />
          <TailoredBullet variant={variant} kind="rewritten" accent={accentC}
            text="Led 0→1 launch of Linear's growth surface, owning roadmap across PM/Eng/Design — drove activation rate +14% in two quarters."
          />
          <TailoredBullet variant={variant} kind="sourced" accent={accentC} label="闪光点"
            text="Within first 60 days, redesigned dev workflow used by 32 engineers; cut median PR-to-prod time by 38%."
          />
        </div>
        <div style={{marginTop:16}}>
          <RoleHeader variant={variant} co="Stripe" role="Software Engineer" date="2022 — 2024" />
          {TAILORED_BULLETS.map(b => (
            <TailoredBullet key={b.id} variant={variant} kind={b.kind} accent={accentC} label={b.label} text={b.text} src={b.src} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ variant, children }) {
  const isB = variant === 'b';
  return (
    <div style={{
      fontSize:10.5, fontWeight:600, letterSpacing:'0.14em',
      paddingBottom:6, borderBottom:`1px solid ${isB ? 'var(--b-ink)' : 'var(--a-ink)'}`,
      color: isB ? 'var(--b-ink)' : 'var(--a-ink)',
    }}>{children}</div>
  );
}

function RoleHeader({ variant, co, role, date }) {
  const isB = variant === 'b';
  return (
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6}}>
      <div className={isB ? 'serif' : ''} style={{fontSize:13, fontWeight:600}}>
        {co} <span style={{fontWeight:400, color: isB ? 'var(--b-mute)' : 'var(--a-mute)'}}>· {role}</span>
      </div>
      <div style={{fontSize:11, color: isB ? 'var(--b-mute)' : 'var(--a-mute)', fontVariantNumeric:'tabular-nums'}}>{date}</div>
    </div>
  );
}

function Bullet({ variant, text }) {
  return (
    <div style={{display:'flex', gap:8, marginTop:5, fontSize:12, lineHeight:1.5}}>
      <span style={{color: variant === 'b' ? 'var(--b-mute-2)' : 'var(--a-mute-2)', flexShrink:0}}>—</span>
      <span>{text}</span>
    </div>
  );
}

function TailoredBullet({ variant, kind, text, src, accent, label }) {
  const isB = variant === 'b';
  const k = KIND_COLORS[kind] || KIND_COLORS.kept;
  return (
    <div style={{
      position:'relative',
      display:'flex', gap:10, marginTop:6,
      padding:'5px 6px 5px 10px',
      marginLeft:-10,
      borderRadius:4,
    }}>
      <div style={{
        position:'absolute', left:0, top:8, bottom:8,
        width:2, borderRadius:99, background: k.dot,
      }}></div>
      <div style={{flex:1, fontSize:12, lineHeight:1.5}}>
        {text}
        <div style={{
          marginTop:4, display:'flex', alignItems:'center', gap:8,
          fontSize:10.5, color: isB ? 'var(--b-mute)' : 'var(--a-mute)',
        }}>
          <span style={{display:'inline-flex', alignItems:'center', gap:4}}>
            {I.link}<span>{src?.from}</span>
          </span>
          {label && (
            <span className="chip" style={{fontSize:9, padding:'1px 6px',
              color: kind === 'sourced' ? 'var(--good)' : 'var(--ink)',
              borderColor: kind === 'sourced' ? 'color-mix(in srgb, var(--good) 30%, transparent)' : 'var(--line)',
              background: kind === 'sourced' ? 'color-mix(in srgb, var(--good) 8%, transparent)' : 'transparent'
            }}>{label}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function CoachPane({ variant, tweaks }) {
  const isB = variant === 'b';
  const accent = isB ? tweaks.bColor : tweaks.aColor;
  return (
    <>
      <div style={{
        padding:'14px 18px', borderBottom:`1px solid ${isB ? 'var(--b-line)' : 'var(--a-line)'}`,
        display:'flex', alignItems:'center', gap:10
      }}>
        <QuinnIcon style={tweaks.qStyle} color={accent} size={26} />
        <div style={{flex:1}}>
          <div className={isB ? 'serif' : ''} style={{fontSize:13, fontWeight:600}}>Quinn 在帮你定制</div>
          <div style={{fontSize:11, color: isB ? 'var(--b-mute)' : 'var(--a-mute)', marginTop:1}}>4 处建议 · 2 处缺口 · 1 处待确认</div>
        </div>
      </div>

      <div style={{flex:1, overflow:'hidden', padding:'14px 18px', display:'flex', flexDirection:'column', gap:14}}>
        {/* match summary */}
        <div style={{
          padding:14,
          background: isB ? 'transparent' : '#fff',
          border:`1px solid ${isB ? 'var(--b-line)' : 'var(--a-line)'}`,
          borderRadius:8
        }}>
          <div style={{fontSize:10.5, fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color: isB ? 'var(--b-mute)' : 'var(--a-mute)', marginBottom:10}}>匹配度变化</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, fontSize:11}}>
            <MeterRow variant={variant} k="表面" was={62} now={71} />
            <MeterRow variant={variant} k="深层" was={78} now={89} highlight accent={accent} />
            <MeterRow variant={variant} k="缺口" was="2" now="1" inverse />
          </div>
        </div>

        {/* gap dialogue */}
        <div style={{
          padding:14,
          background: isB ? `color-mix(in srgb, ${accent} 8%, transparent)` : 'var(--a-accent-soft)',
          border:`1px solid ${isB ? `color-mix(in srgb, ${accent} 25%, transparent)` : '#DDE3FF'}`,
          borderRadius:8
        }}>
          <div className="lab" style={{color: accent, marginBottom:6}}>缺口挖掘 · 1/2</div>
          <div className={isB ? 'serif' : ''} style={{fontSize:13, lineHeight:1.55, color: isB ? 'var(--b-ink)' : 'var(--a-ink)'}}>
            这个岗位强调 <strong>data-informed decision making</strong>，但你档案里这块还薄。
          </div>
          <div style={{fontSize:12.5, marginTop:6, lineHeight:1.55, color: isB ? 'var(--b-ink-2)' : 'var(--a-ink-2)'}}>
            想想：哪个项目里你用一个数据决策推翻了团队的"直觉"？
          </div>
          <div style={{
            marginTop:12, padding:'8px 10px',
            background: isB ? 'var(--b-bg)' : '#fff',
            borderRadius:6,
            fontSize:11.5, color: isB ? 'var(--b-mute)' : 'var(--a-mute)',
            display:'flex', alignItems:'center', gap:8
          }}>
            <span style={{color: accent}}>{I.spark}</span>
            <span>回答 → 我会沉淀到素材库 + 实时更新简历</span>
          </div>
        </div>

        {/* recent action log */}
        <div>
          <div className="lab" style={{color: isB ? 'var(--b-mute)' : 'var(--a-mute)', marginBottom:8}}>本次定制做了什么</div>
          <div style={{fontSize:12, color: isB ? 'var(--b-ink-2)' : 'var(--a-ink-2)', lineHeight:1.7}}>
            <LogLine kind="rewritten">改写 4 条 Stripe bullets，强化 ownership 语言</LogLine>
            <LogLine kind="sourced">从素材库引入 2 条："Postgres RFC"、"oncall 工具"</LogLine>
            <LogLine kind="rewritten">将量化数据从对话补回（$4B/月、38%、50%）</LogLine>
            <LogLine kind="pending">标记 1 处待你确认的 stakeholder 数据</LogLine>
          </div>
        </div>

        <div style={{flex:1}}></div>

        {/* input */}
        <div style={{
          padding:'8px 10px', display:'flex', alignItems:'center', gap:8,
          border:`1px solid ${isB ? 'var(--b-line)' : 'var(--a-line)'}`,
          borderRadius:8, background: isB ? 'var(--b-bg)' : '#fff'
        }}>
          <span style={{color: isB ? 'var(--b-mute-2)' : 'var(--a-mute-2)'}}>{I.spark}</span>
          <span style={{flex:1, fontSize:12, color: isB ? 'var(--b-mute-2)' : 'var(--a-mute-2)'}}>
            "把第 3 条改短一点" / 直接点 bullet 编辑
          </span>
          <span className="kbd">↵</span>
        </div>
      </div>
    </>
  );
}

function MeterRow({ variant, k, was, now, highlight, inverse, accent }) {
  const isB = variant === 'b';
  return (
    <div style={{
      padding:'8px 10px',
      background: highlight ? (isB ? 'var(--b-bg)' : '#FAFAFA') : 'transparent',
      border: highlight ? `1px solid ${accent}` : '1px solid transparent',
      borderRadius:6
    }}>
      <div style={{fontSize:9.5, color: isB ? 'var(--b-mute)':'var(--a-mute)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600}}>{k}</div>
      <div style={{display:'flex', alignItems:'baseline', gap:4, marginTop:4, fontVariantNumeric:'tabular-nums'}}>
        <span style={{fontSize:11, color: isB ? 'var(--b-mute-2)':'var(--a-mute-2)', textDecoration:'line-through'}}>{was}</span>
        <span style={{fontSize:18, fontWeight: isB ? 500 : 600, color: highlight ? accent : (isB ? 'var(--b-ink)' : 'var(--a-ink)')}}>{now}</span>
      </div>
    </div>
  );
}

function LogLine({ kind, children }) {
  const c = KIND_COLORS[kind] || KIND_COLORS.kept;
  return (
    <div style={{display:'flex', gap:8, alignItems:'flex-start', marginTop:4}}>
      <span style={{display:'inline-block', width:5, height:5, borderRadius:99, background:c.dot, marginTop:8, flexShrink:0}}></span>
      <span>{children}</span>
    </div>
  );
}

Object.assign(window, { ResumeTailoringA, ResumeTailoringB });
