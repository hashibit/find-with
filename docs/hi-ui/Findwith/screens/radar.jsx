/* global React, SidePanel, Q, U, Sys, I, Frame, QuinnIcon */

// ============= JOB RADAR =============
const RADAR_DATA = [
  {
    co: 'Stripe',
    logo: { ch: 'S', bg: '#635BFF' },
    role: 'Senior PM · Developer Products',
    loc: 'SF · Hybrid',
    status: 'tailoring',
    when: '今天 · 02:14',
    match: 78,
    salary: '$210–260k',
  },
  {
    co: 'Linear',
    logo: { ch: 'L', bg: '#5E6AD2' },
    role: 'Product Engineer · Growth',
    loc: 'Remote (US)',
    status: 'submitted',
    when: '昨天',
    match: 84,
    salary: '$190–230k',
  },
  {
    co: 'Notion',
    logo: { ch: 'N', bg: '#000000' },
    role: 'Senior PM · AI Surface',
    loc: 'NY · Onsite',
    status: 'interview',
    when: '2 天前',
    match: 72,
    salary: '$220–270k',
  },
  {
    co: 'Figma',
    logo: { ch: 'F', bg: '#F24E1E' },
    role: 'Product Manager II',
    loc: 'SF · Hybrid',
    status: 'analyzed',
    when: '3 天前',
    match: 69,
  },
  {
    co: 'Vercel',
    logo: { ch: 'V', bg: '#000000' },
    role: 'PM, Developer Experience',
    loc: 'Remote (Global)',
    status: 'shortlist',
    when: '4 天前',
    match: 81,
  },
  {
    co: 'Anthropic',
    logo: { ch: 'A', bg: '#D97757' },
    role: 'Product Lead, API',
    loc: 'SF · Hybrid',
    status: 'rejected',
    when: '1 周前',
    match: 65,
  },
  {
    co: 'Plaid',
    logo: { ch: 'P', bg: '#111928' },
    role: 'Senior PM, Identity',
    loc: 'NY · Hybrid',
    status: 'declined',
    when: '1 周前',
    match: 54,
  },
];

const STATUS_MAP = {
  shortlist: { label: '已分析', tone: 'soft' },
  analyzed: { label: '已分析', tone: 'soft' },
  tailoring: { label: '定制中', tone: 'warn' },
  submitted: { label: '已投递', tone: 'good' },
  interview: { label: '进入面试', tone: 'good' },
  rejected: { label: '已拒', tone: 'bad' },
  declined: { label: '决定不投', tone: 'soft' },
};

function StatusChip({ s }) {
  const m = STATUS_MAP[s];
  return <span className={`chip ${m.tone} dot`}>{m.label}</span>;
}

function RadarCard({ j, highlight }) {
  return (
    <div
      style={{
        padding: '12px 12px',
        borderBottom: '1px solid var(--line-2)',
        cursor: 'pointer',
        background: highlight ? 'var(--accent-soft)' : 'transparent',
        borderLeft: highlight ? '2px solid var(--accent)' : '2px solid transparent',
        paddingLeft: highlight ? 10 : 12,
      }}
    >
      <div className="h gap-8" style={{ alignItems: 'flex-start' }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: j.logo.bg,
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {j.logo.ch}
        </div>
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
              {j.co} · <span style={{ fontWeight: 400 }}>{j.role}</span>
            </div>
          </div>
          <div className="h between" style={{ marginTop: 3, gap: 6 }}>
            <div className="muted tiny">{j.loc}</div>
            <div className="muted tiny tnum">{j.when}</div>
          </div>
          <div className="h between" style={{ marginTop: 8, gap: 6, alignItems: 'center' }}>
            <StatusChip s={j.status} />
            {j.match != null && (
              <div className="h gap-6" style={{ fontSize: 11, color: 'var(--mute)' }}>
                <div
                  style={{
                    width: 48,
                    height: 3,
                    background: 'var(--bg-sunk)',
                    borderRadius: 99,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{ width: `${j.match}%`, height: '100%', background: 'var(--accent)' }}
                  ></div>
                </div>
                <span className="tnum" style={{ color: 'var(--ink-2)' }}>
                  {j.match}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== STATE 1 — 默认列表 ==============
function RadarA({ tweaks }) {
  return (
    <Frame variant="a">
      <SidePanel variant="a" tab="radar" qStyle={tweaks.qStyle} qColor={tweaks.aColor} hideInput>
        <div className="msg quinn" style={{ marginBottom: 4 }}>
          <div className="qavatar">
            <QuinnIcon style={tweaks.qStyle} color={tweaks.aColor} size={22} />
          </div>
          <div className="bubble">
            3 天前你投了 <strong>Linear</strong> 的 Product Engineer，有回复吗？
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn">还没</button>
              <button className="btn primary">回了，看 Gmail</button>
            </div>
          </div>
        </div>

        <div
          style={{
            margin: '4px -14px 0',
            borderTop: '1px solid var(--line)',
            background: 'var(--bg)',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div className="h between" style={{ padding: '10px 14px 8px' }}>
            <div className="lab">求职雷达 · 14</div>
            <div className="h gap-4 muted">
              <button
                className="iconbtn"
                style={{
                  width: 24,
                  height: 24,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--mute)',
                  cursor: 'pointer',
                }}
              >
                {I.filter}
              </button>
              <button
                className="iconbtn"
                style={{
                  width: 24,
                  height: 24,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--mute)',
                  cursor: 'pointer',
                }}
              >
                {I.search}
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {RADAR_DATA.map((j, i) => (
              <RadarCard key={i} j={j} />
            ))}
          </div>
        </div>
      </SidePanel>
    </Frame>
  );
}

// ---- shared detail header ----
function DetailHeader({ co, role, loc, status, qStyle, qColor }) {
  return (
    <div
      style={{
        margin: '-16px -14px 0',
        padding: '12px 14px 12px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: 'var(--mute)',
          marginBottom: 8,
        }}
      >
        <button
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--mute)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: 0,
            fontSize: 11,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12">
            <path
              d="M7.5 3l-3 3 3 3"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          雷达
        </button>
        <span>·</span>
        <span>{co.name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: co.bg,
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: 14,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {co.ch}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            {co.name} · <span style={{ fontWeight: 400 }}>{role}</span>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
            {loc}
          </div>
          <div style={{ marginTop: 6 }}>
            <StatusChip s={status} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== shared mock-interview section ==============
const LINEAR_QS = [
  { q: '为什么对 Linear 感兴趣？', tag: '动机' },
  { q: '你怎么看产品工程师跟 PM 的边界？举个具体例子。', tag: '行为', expand: true },
  { q: '你最自豪的一次 ship 是什么？', tag: '故事' },
];
const NOTION_QS_LIGHT = [
  { q: '为什么想加入 Notion？', tag: '动机' },
  { q: '你最自豪的产品决定是什么？为什么？', tag: '故事', expand: true },
  { q: '怎么处理产品方向上的分歧？举一个具体的例子。', tag: '行为' },
  { q: '为什么离开当前公司？', tag: '动机' },
];

function MockQSection({ qs, title = '标准答案 · 面试前 warm up' }) {
  return (
    <div style={{ padding: '12px 0 0' }}>
      <div className="lab" style={{ marginBottom: 8, display: 'flex', alignItems: 'center' }}>
        <span>{title}</span>
        <span style={{ flex: 1 }}></span>
        <span
          className="muted"
          style={{ textTransform: 'none', fontWeight: 400, letterSpacing: 0, fontSize: 10.5 }}
        >
          {qs.length} 题
        </span>
      </div>
      <div className="qcard" style={{ margin: 0 }}>
        {qs.map((it, i) => (
          <MockQRow key={i} q={it} expanded={!!it.expand} />
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--mute)', textAlign: 'center' }}>
        点任一条看 Quinn 起的标准答案 ·{' '}
        <span style={{ color: 'var(--accent)' }}>完整模拟面试 →</span>
      </div>
    </div>
  );
}

function MockQRow({ q, expanded }) {
  return (
    <div
      style={{
        borderTop: '1px solid var(--line-2)',
        background: expanded ? 'var(--bg-soft)' : 'transparent',
      }}
    >
      <div
        style={{
          padding: '9px 12px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 12,
        }}
      >
        <div style={{ flex: 1, lineHeight: 1.5 }}>
          <div style={{ color: 'var(--ink)', fontWeight: expanded ? 500 : 400 }}>{q.q}</div>
          <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--mute)' }}>{q.tag}</div>
        </div>
        <span
          className="muted"
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform .15s',
            marginTop: 2,
          }}
        >
          {I.chevRight}
        </span>
      </div>
      {expanded && (
        <div style={{ padding: '0 12px 11px 12px' }}>
          <div className="lab muted" style={{ fontSize: 9.5, marginBottom: 5 }}>
            Quinn 起的标准答案 · 60s
          </div>
          <div
            style={{
              padding: '9px 11px',
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              fontSize: 11.5,
              lineHeight: 1.6,
              color: 'var(--ink)',
            }}
          >
            "在 Mercury 推 onboarding 改版那次——我们三个 product team 都想优先做自己的，
            <span style={{ background: 'var(--accent-soft)', padding: '0 2px', borderRadius: 2 }}>
              我没强行对齐路线图，而是开了个 metrics 对账
            </span>
            ，让数据自己说话。最后大家自愿砍了 40% 的
            scope。我学到的是：跨团队协作不是说服，是让对的信息出现在对的桌子上。"
          </div>
          <div
            style={{
              marginTop: 6,
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
              fontSize: 10.5,
            }}
          >
            <span className="muted">引用素材：</span>
            <span className="chip soft" style={{ fontSize: 10 }}>
              #22 onboarding 改版
            </span>
            <span style={{ flex: 1 }}></span>
            <button className="btn" style={{ padding: '2px 7px', fontSize: 10 }}>
              {I.edit} 改写
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- shared "用了什么" section ----
function UsedFiles({ resumeTitle, resumeSub, coverSub, mainAngle, mainAngleEm }) {
  return (
    <div
      style={{
        margin: '12px -14px 0',
        padding: '12px 14px',
        background: 'var(--bg-soft)',
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div className="lab" style={{ marginBottom: 8 }}>
        用了什么{' '}
        <span
          className="muted"
          style={{ textTransform: 'none', fontWeight: 400, letterSpacing: 0 }}
        >
          · 已存档
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <FileRow icon={I.doc} title={resumeTitle} sub={resumeSub} />
        <FileRow icon={I.doc} title="Cover Letter" sub={coverSub} />
        <FileRow
          icon={I.link}
          title="Portfolio · ship-it 案例"
          sub="bento.me/findwith-portfolio"
          link
        />
      </div>
      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px dashed var(--line)',
          fontSize: 11.5,
          color: 'var(--ink-2)',
          lineHeight: 1.55,
        }}
      >
        <div className="lab muted" style={{ marginBottom: 4 }}>
          主推角度
        </div>
        <div>
          "<strong>{mainAngleEm}</strong>"{mainAngle}
        </div>
      </div>
    </div>
  );
}

// ============== STATE 2 — 已投递详情（Linear） ==============
function RadarA_Submitted({ tweaks }) {
  const co = { ch: 'L', bg: '#5E6AD2', name: 'Linear' };
  return (
    <Frame variant="a">
      <SidePanel variant="a" tab="radar" qStyle={tweaks.qStyle} qColor={tweaks.aColor} hideInput>
        <DetailHeader
          co={co}
          role="Product Engineer · Growth"
          loc="Remote (US) · $190–230k"
          status="submitted"
          qStyle={tweaks.qStyle}
          qColor={tweaks.aColor}
        />

        {/* timeline */}
        <div style={{ margin: '12px 0 4px' }}>
          <div className="lab" style={{ marginBottom: 6 }}>
            时间线
          </div>
          <div style={{ position: 'relative', paddingLeft: 14, fontSize: 12, lineHeight: 1.5 }}>
            <div
              style={{
                position: 'absolute',
                left: 4,
                top: 6,
                bottom: 6,
                width: 1,
                background: 'var(--line)',
              }}
            ></div>
            <TimelineRow dot="var(--ink-2)" time="4/13 14:08" txt="提交申请 · 21 小时前" emph />
            <TimelineRow
              dot="var(--accent)"
              time="4/13 02:32"
              txt="完成简历定制（用 4 条素材 + 1 条新挖）"
            />
            <TimelineRow dot="var(--mute-2)" time="4/13 02:14" txt="在 LinkedIn 发现这个岗位" />
          </div>
        </div>

        <UsedFiles
          resumeTitle="简历 v3 · Linear 定制版"
          resumeSub="4 条素材命中 · 1 条新挖（Stakeholder mgmt）"
          coverSub="156 字 · 引用 Linear 公开博客 1 处"
          mainAngleEm="跨 3 个 product team 推动 onboarding 改版对齐"
          mainAngle="——这是他们 JD 里 cross-functional leadership 的最强对应。"
        />

        <MockQSection qs={LINEAR_QS} />

        {/* Quinn next */}
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
            如果 <strong>3 天</strong>没回音，要不要我帮你起一封跟进？我会基于你简历主推那条 +
            Linear 最近发的 changelog 写。
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn primary">3 天后提醒我</button>
            <button className="btn">现在就起草</button>
          </div>
        </Q>
      </SidePanel>
    </Frame>
  );
}

function TimelineRow({ dot, time, txt, emph }) {
  return (
    <div style={{ position: 'relative', padding: '4px 0 4px 14px' }}>
      <span
        style={{
          position: 'absolute',
          left: -10,
          top: 9,
          width: 8,
          height: 8,
          borderRadius: 99,
          background: dot,
          border: '2px solid var(--bg)',
        }}
      ></span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span className="muted tnum" style={{ fontSize: 10.5, minWidth: 64 }}>
          {time}
        </span>
        <span
          style={{
            flex: 1,
            color: emph ? 'var(--ink)' : 'var(--ink-2)',
            fontWeight: emph ? 500 : 400,
          }}
        >
          {txt}
        </span>
      </div>
    </div>
  );
}

function FileRow({ icon, title, sub, link }) {
  return (
    <div
      style={{
        padding: '8px 10px',
        background: 'var(--bg)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ color: 'var(--mute)' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: link ? 'var(--accent)' : 'var(--ink)', fontWeight: 500 }}>{title}</div>
        <div className="muted" style={{ fontSize: 10.5, marginTop: 1 }}>
          {sub}
        </div>
      </div>
      <span className="muted">{I.arrowR}</span>
    </div>
  );
}

// ============== STATE 3 — 进入面试详情（Notion） ==============
function RadarA_Interview({ tweaks }) {
  const co = { ch: 'N', bg: '#000000', name: 'Notion' };
  return (
    <Frame variant="a">
      <SidePanel variant="a" tab="radar" qStyle={tweaks.qStyle} qColor={tweaks.aColor} hideInput>
        <DetailHeader
          co={co}
          role="Senior PM · AI Surface"
          loc="NY · Onsite"
          status="interview"
          qStyle={tweaks.qStyle}
          qColor={tweaks.aColor}
        />

        {/* timeline */}
        <div style={{ margin: '12px 0 4px' }}>
          <div className="lab" style={{ marginBottom: 6 }}>
            时间线
          </div>
          <div style={{ position: 'relative', paddingLeft: 14, fontSize: 12, lineHeight: 1.5 }}>
            <div
              style={{
                position: 'absolute',
                left: 4,
                top: 6,
                bottom: 6,
                width: 1,
                background: 'var(--line)',
              }}
            ></div>
            <TimelineRow
              dot="var(--accent)"
              time="4/16 10:30"
              txt="第 1 轮 Phone Screen · 30 分钟"
              emph
              future
            />
            <TimelineRow
              dot="var(--good)"
              time="4/14 09:12"
              txt="收到面试邀请（Maya Chen, PM Lead）"
            />
            <TimelineRow dot="var(--ink-2)" time="4/12 18:40" txt="提交申请" />
            <TimelineRow dot="var(--mute-2)" time="4/12 16:22" txt="完成简历定制" />
          </div>
        </div>

        <UsedFiles
          resumeTitle="简历 v2 · Notion 定制版"
          resumeSub="3 条素材命中 · 主推 AI surface 经验"
          coverSub="142 字 · 引用 Notion AI Drawer release"
          mainAngleEm="Notion 是我做 Billing webhook 重写时每天用的工具"
          mainAngle={'——把"自己是用户"作为切入点。'}
        />

        <MockQSection qs={NOTION_QS_LIGHT} title="标准答案 · 面试前 warm up" />

        {/* Quinn next */}
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
            <strong>Maya</strong> 在 Stripe 工作过 4
            年——我帮你查了她最近发的几条推，喜欢用具体数字。要不要我把上面的标准答案都改一遍，每条加一个数字？
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn primary">好，加数字</button>
            <button className="btn">完整模拟一次</button>
          </div>
        </Q>
      </SidePanel>
    </Frame>
  );
}

Object.assign(window, { RadarA, RadarA_Submitted, RadarA_Interview });
