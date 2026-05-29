/* global React, SidePanel, Q, U, Sys, I, Frame, QuinnIcon */

// ============= EASY APPLY confirmation =============
function EasyApplyA({ tweaks }) {
  const job = { title: 'Senior Product Manager', meta: 'Stripe · Easy Apply · 准备填表' };
  return (
    <Frame variant="a">
      <SidePanel
        variant="a"
        tab="chat"
        qStyle={tweaks.qStyle}
        qColor={tweaks.aColor}
        jobContext={job}
      >
        <Sys>简历定制完成 · 匹配度 89%</Sys>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div>简历好了。我帮你填表？</div>
          <div className="qcard" style={{ marginTop: 10 }}>
            <div className="qcard-h">
              <span>填写计划 · 4 个字段</span>
              <span style={{ flex: 1 }}></span>
              <span
                className="muted"
                style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: 10 }}
              >
                预计 ~12s
              </span>
            </div>
            <div className="qcard-b" style={{ padding: 0 }}>
              <PlanRow
                label="简历"
                value="Stripe-PM-tailored.pdf"
                sub="刚才生成的定制版"
                tag="新"
              />
              <PlanRow label="电话" value="+1 (415) 555-0143" sub="档案里的" />
              <PlanRow
                label="Why interested?"
                value="Stripe's docs raised the bar for developer-first products. After 4 years building API surfaces at Stripe and growth tools at Linear, I'd love to bring …"
                sub="基于 JD 草拟"
                multiline
                expandable
              />
              <PlanRow label="Years with B2B SaaS PM?" value="5" sub="从档案推断" />
            </div>
            <div
              style={{
                padding: '10px 12px',
                borderTop: '1px solid var(--line-2)',
                display: 'flex',
                gap: 6,
              }}
            >
              <button className="btn primary" style={{ flex: 1 }}>
                填进表单
              </button>
              <button className="btn">改一改</button>
            </div>
          </div>
          <div className="muted tiny" style={{ marginTop: 10, lineHeight: 1.5 }}>
            填完之后会停在 Submit 按钮前——
            <strong style={{ color: 'var(--ink-2)' }}>那一下你自己点</strong>。
          </div>
        </Q>
      </SidePanel>
    </Frame>
  );
}

function PlanRow({ label, value, sub, tag, multiline, expandable }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderTop: '1px solid var(--line-2)',
        display: 'grid',
        gridTemplateColumns: '88px 1fr',
        gap: 10,
      }}
    >
      <div>
        <div className="lab" style={{ fontSize: 9.5 }}>
          {label}
        </div>
        {sub && (
          <div className="muted tiny" style={{ marginTop: 3, fontSize: 10 }}>
            {sub}
          </div>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="h between gap-6" style={{ alignItems: 'flex-start' }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--ink)',
              ...(multiline
                ? {
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.45,
                  }
                : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
            }}
          >
            {value}
          </div>
          {tag && (
            <span className="chip good" style={{ fontSize: 9, padding: '1px 5px', flexShrink: 0 }}>
              {tag}
            </span>
          )}
        </div>
        {expandable && (
          <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, cursor: 'pointer' }}>
            展开 / 编辑
          </div>
        )}
      </div>
    </div>
  );
}

function EasyApplyB({ tweaks }) {
  const job = { title: 'Senior Product Manager', meta: 'Stripe · Easy Apply · 准备填表' };
  return (
    <Frame variant="b">
      <SidePanel
        variant="b"
        tab="chat"
        qStyle={tweaks.qStyle}
        qColor={tweaks.bColor}
        jobContext={job}
      >
        <Sys>简历定制完成 · 匹配度 89%</Sys>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.bColor}>
          <div className="serif" style={{ fontSize: 13.5 }}>
            简历好了。我帮你填表？
          </div>

          <div
            style={{
              marginTop: 10,
              background: 'var(--bg-soft)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div
                className="serif"
                style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)' }}
              >
                填写计划
              </div>
              <div className="muted tiny">· 4 个字段</div>
              <div style={{ flex: 1 }}></div>
              <div className="muted tiny tnum italic">~12s</div>
            </div>
            <PlanRowB label="简历" value="Stripe-PM-tailored.pdf" sub="刚才生成的定制版" tag="新" />
            <PlanRowB label="电话" value="+1 (415) 555-0143" sub="档案里的" />
            <PlanRowB
              label="Why interested?"
              value={
                '"Stripe\'s docs raised the bar for developer-first products. After 4 years building API surfaces at Stripe and growth tools at Linear, I\'d love to bring…"'
              }
              sub="基于 JD 草拟"
              multiline
              expandable
            />
            <PlanRowB label="Years B2B SaaS?" value="5" sub="从档案推断" />
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
            <button className="btn primary" style={{ flex: 1 }}>
              填进表单
            </button>
            <button className="btn">改一改</button>
          </div>

          <div
            className="muted tiny serif italic"
            style={{
              marginTop: 12,
              lineHeight: 1.5,
              paddingLeft: 8,
              borderLeft: '2px solid var(--line)',
            }}
          >
            填完之后会停在 Submit 按钮前——那一下你自己点。
          </div>
        </Q>
      </SidePanel>
    </Frame>
  );
}

function PlanRowB({ label, value, sub, tag, multiline, expandable }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--line-2)',
        display: 'grid',
        gridTemplateColumns: '82px 1fr',
        gap: 10,
      }}
    >
      <div>
        <div className="serif" style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-2)' }}>
          {label}
        </div>
        {sub && (
          <div className="muted tiny italic" style={{ marginTop: 3, fontSize: 10 }}>
            {sub}
          </div>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="h between gap-6" style={{ alignItems: 'flex-start' }}>
          <div
            className={multiline ? 'serif italic' : ''}
            style={{
              fontSize: 12,
              color: 'var(--ink)',
              ...(multiline
                ? {
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.45,
                  }
                : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
            }}
          >
            {value}
          </div>
          {tag && (
            <span className="chip good" style={{ fontSize: 9, padding: '1px 5px', flexShrink: 0 }}>
              {tag}
            </span>
          )}
        </div>
        {expandable && (
          <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, cursor: 'pointer' }}>
            展开 / 编辑
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { EasyApplyA, EasyApplyB });
