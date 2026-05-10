/* global React, SidePanel, Q, U, Sys, I, Frame */

// ============= JOB ANALYSIS — "灵魂瞬间" with click states =============

const JOB_CTX = { title: 'Senior Product Manager', meta: 'Stripe · San Francisco · Hybrid' };

// ---- shared base content blocks ----
function CompanyCard({ tweaks, active, onClickHint }) {
  return (
    <div className="qcard" style={{
      borderColor: active ? 'var(--accent)' : 'var(--line)',
      boxShadow: active ? '0 0 0 3px var(--accent-soft)' : 'none',
      transition:'all .15s'
    }}>
      <div className="qcard-h">
        <span>公司速读</span>
        <span style={{flex:1}}></span>
        <span style={{
          textTransform:'none', letterSpacing:0, fontWeight:500, fontSize:10,
          color: active ? 'var(--accent)' : 'var(--mute)',
          display:'flex', alignItems:'center', gap:3,
          padding:'2px 6px', borderRadius:99,
          background: active ? 'var(--accent-soft)' : 'transparent',
        }}>{active ? '已展开' : '3 个来源 ↗'}</span>
      </div>
      <div className="qcard-b" style={{padding:'10px 12px', fontSize:12.5, lineHeight:1.6}}>
        <div><span className="muted">在做什么 · </span>支付基础设施，B2B / 开发者产品</div>
        <div><span className="muted">规模 · </span>~8,400 人 · 增长放缓但未大规模裁员</div>
        <div><span className="muted">Glassdoor · </span>4.1 ⭐ · 面试评价"流程长但人专业"</div>
        <div style={{marginTop:6, paddingTop:8, borderTop:'1px solid var(--line-2)', display:'flex', gap:6, flexWrap:'wrap'}}>
          <span className="chip good dot">健康</span>
          <span className="chip warn dot">面试周期长</span>
        </div>
      </div>
    </div>
  );
}

function JDCard({ tweaks, activeIdx }) {
  const items = [
    { txt: <>5+ 年 PM 经验，B2B / 开发者产品优先</> },
    { txt: <>强调 <strong>cross-functional leadership</strong></> },
    { txt: <>"Comfort with ambiguity" — 我读出来：内部模糊地带不少</> },
  ];
  return (
    <div className="qcard" style={{marginTop:8}}>
      <div className="qcard-b" style={{padding:'10px 12px', fontSize:12.5, lineHeight:1.7}}>
        {items.map((it, i) => {
          const isActive = i === activeIdx;
          return (
            <div key={i} className="h" style={{
              gap:8, alignItems:'flex-start',
              margin:'0 -12px', padding:'4px 12px',
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              paddingLeft: 10,
              transition:'all .15s'
            }}>
              <span style={{width:14, color: isActive ? 'var(--accent)' : 'var(--mute)'}}>·</span>
              <span style={{flex:1, color: isActive ? 'var(--ink)' : 'var(--ink-2)'}}>{it.txt}</span>
              {isActive && <span style={{fontSize:10, color:'var(--accent)', whiteSpace:'nowrap'}}>↓ 展开</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({ tweaks, gapHover }) {
  return (
    <div className="qcard" style={{marginTop:8}}>
      <div className="qcard-b" style={{padding:'12px 14px'}}>
        <div className="meter" style={{marginBottom:10}}>
          <div className="lbl">表面</div>
          <div className="bar"><i style={{width:'62%'}}></i></div>
          <div className="val">62</div>
        </div>
        <div className="meter" style={{marginBottom:10}}>
          <div className="lbl">深层</div>
          <div className="bar accent"><i style={{width:'78%'}}></i></div>
          <div className="val" style={{color:'var(--accent)'}}>78</div>
        </div>
        <div className="meter">
          <div className="lbl">缺口</div>
          <div className="bar" style={{background:'transparent'}}>
            <div style={{display:'flex', gap:4, height:4}}>
              <div style={{flex:1, background:'var(--bg-sunk)', borderRadius:99}}></div>
              <div style={{flex:1, background:'var(--bg-sunk)', borderRadius:99}}></div>
              <div style={{flex:1, background:'var(--bg-sunk)', borderRadius:99}}></div>
            </div>
          </div>
          <div className="val muted">2 处</div>
        </div>
        <div style={{marginTop:12, paddingTop:10, borderTop:'1px solid var(--line-2)', fontSize:11.5, color:'var(--ink-2)', lineHeight:1.6}}>
          <div className="muted lab" style={{marginBottom:6}}>关键缺口 <span style={{color:'var(--mute-2)', fontWeight:400, textTransform:'none', letterSpacing:0}}>· 点击可挖掘</span></div>
          {[
            { sym:'◐', symColor:'var(--warn)', name:'Stakeholder management', tail:'你提过但没量化', key:'stake' },
            { sym:'○', symColor:'var(--bad)',  name:'Data-informed decisions', tail:'还没素材，需要挖掘', key:'data' },
          ].map(g => {
            const active = g.key === gapHover;
            return (
              <div key={g.key} style={{
                display:'flex', gap:6, marginBottom:5,
                padding:'4px 6px', margin:'0 -6px 5px',
                borderRadius:6,
                background: active ? 'var(--accent-soft)' : 'transparent',
                cursor:'pointer',
                transition:'all .15s'
              }}>
                <span style={{color:g.symColor, marginTop:1}}>{g.sym}</span>
                <span style={{flex:1}}><strong>{g.name}</strong> <span className="muted">· {g.tail}</span></span>
                {active && <span style={{fontSize:10, color:'var(--accent)', whiteSpace:'nowrap'}}>挖掘 →</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CTABubble({ tweaks }) {
  return (
    <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
      <div style={{fontSize:13}}>我的建议：<strong>值得投</strong>。但简历需要重点改两处。</div>
      <div style={{marginTop:10, display:'flex', gap:6, flexWrap:'wrap'}}>
        <button className="btn primary" style={{display:'flex', alignItems:'center', gap:4}}>
          想投，开始定制
          <svg width="11" height="11" viewBox="0 0 12 12" style={{marginLeft:2}}><path d="M3 9l6-6M4 3h5v5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg>
        </button>
        <button className="btn">先放雷达</button>
        <button className="btn">不投</button>
      </div>
      <div className="muted" style={{fontSize:10.5, marginTop:8, display:'flex', alignItems:'center', gap:4}}>
        <svg width="10" height="10" viewBox="0 0 12 12"><path d="M3 9l6-6M4 3h5v5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/></svg>
        点"开始定制"会展开成全屏工作区
      </div>
    </Q>
  );
}

// ============== STATE 1: DEFAULT ==============
function JobAnalysisA({ tweaks }) {
  return (
    <Frame variant="a">
      <SidePanel variant="a" tab="chat" qStyle={tweaks.qStyle} qColor={tweaks.aColor} jobContext={JOB_CTX}>
        <Sys>已接入岗位 · 02:14 PM</Sys>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}><div>看到了。让我读完——</div></Q>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}><CompanyCard tweaks={tweaks} /></Q>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div style={{fontSize:13}}>JD 关键点——</div>
          <JDCard tweaks={tweaks} />
        </Q>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div style={{fontSize:13}}>三层匹配度——</div>
          <MatchCard tweaks={tweaks} />
        </Q>
        <CTABubble tweaks={tweaks} />
      </SidePanel>
    </Frame>
  );
}

// ============== STATE 2: 公司卡被点开 → 全屏抽屉 ==============
function JobAnalysisA_Company({ tweaks }) {
  return (
    <Frame variant="a">
      <SidePanel variant="a" tab="chat" qStyle={tweaks.qStyle} qColor={tweaks.aColor} jobContext={JOB_CTX} hideInput>
        <Sys>已接入岗位 · 02:14 PM</Sys>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}><CompanyCard tweaks={tweaks} active /></Q>

        {/* expanded company drill-down — fills rest */}
        <div style={{
          margin:'0 -14px', padding:'14px 14px',
          background:'var(--bg-soft)',
          borderTop:'1px solid var(--line)',
          borderBottom:'1px solid var(--line)',
          flex:1, overflow:'hidden'
        }}>
          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:10}}>
            <span className="lab">公司档案 · Stripe</span>
            <span style={{flex:1}}></span>
            <button style={{
              padding:'2px 6px', fontSize:10, background:'transparent',
              border:'1px solid var(--line)', borderRadius:4, color:'var(--mute)', cursor:'pointer'
            }}>收起 ↑</button>
          </div>

          {/* sources list */}
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            <SourceRow icon="📰" label="TechCrunch · 近 30 天" badge="3 篇" snippet="估值 $65B 持平上轮 · 削减硬件投入，聚焦 platform 收入" />
            <SourceRow icon="🪟" label="Glassdoor 摘要 · 47 条" badge="4.1 ★" snippet="高频词：'流程长 (32%)' · '人专业 (41%)' · '薪资稳健 (28%)'" />
            <SourceRow icon="✉️" label="公司博客 + 招聘页" badge="5 篇" snippet="近期主推：global expansion (LATAM)、AI 工具集 · 减少强调 crypto" />
          </div>

          <div style={{marginTop:12, paddingTop:10, borderTop:'1px dashed var(--line)', fontSize:11.5, lineHeight:1.55, color:'var(--ink-2)'}}>
            <div className="lab muted" style={{marginBottom:5}}>Quinn 解读</div>
            <div>这个岗位上线在 <strong>削减硬件 + push platform 收入</strong> 后两周——他们要的人是能<strong>把开发者产品商业化</strong>的，不是再做工具。所以你简历里 Notion 那段 billing 经验，是 hidden gem。</div>
          </div>
        </div>

        <CTABubble tweaks={tweaks} />
      </SidePanel>
    </Frame>
  );
}

function SourceRow({ icon, label, badge, snippet }) {
  return (
    <div style={{
      padding:'8px 10px', background:'var(--bg)',
      border:'1px solid var(--line)', borderRadius:8,
      fontSize:11.5
    }}>
      <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:3}}>
        <span style={{fontSize:11}}>{icon}</span>
        <span style={{fontWeight:500, color:'var(--ink)'}}>{label}</span>
        <span style={{flex:1}}></span>
        <span className="chip soft" style={{fontSize:9.5, padding:'1px 5px'}}>{badge}</span>
      </div>
      <div className="muted" style={{lineHeight:1.5, paddingLeft:18}}>{snippet}</div>
    </div>
  );
}

// ============== STATE 3: JD 中"cross-functional"被点 → 弹出对应素材 ==============
function JobAnalysisA_JD({ tweaks }) {
  return (
    <Frame variant="a">
      <SidePanel variant="a" tab="chat" qStyle={tweaks.qStyle} qColor={tweaks.aColor} jobContext={JOB_CTX} hideInput>
        <Sys>已接入岗位 · 02:14 PM</Sys>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div style={{fontSize:13}}>JD 关键点——</div>
          <JDCard tweaks={tweaks} activeIdx={1} />
        </Q>

        {/* drill-down: matched materials */}
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div style={{fontSize:12.5, lineHeight:1.55}}>
            "Cross-functional leadership" — 翻译过来他们要的是<strong>能不靠权威撬动多个团队</strong>。
          </div>
          <div className="qcard" style={{marginTop:8}}>
            <div className="qcard-h">
              <span>你的对应素材</span>
              <span style={{flex:1}}></span>
              <span style={{textTransform:'none', letterSpacing:0, fontSize:10, color:'var(--mute)'}}>3 条命中</span>
            </div>
            <div style={{padding:'4px 0'}}>
              <MatRow id={18} txt="跨 3 个 product team 推动 onboarding 改版对齐" company="Mercury" rel={92} primary />
              <MatRow id={21} txt="oncall 诊断工具被 4 个团队复用，事故 -50%" company="Notion" rel={78} />
              <MatRow id={16} txt="独立带 2 个 intern 完成 ship-it" company="Mercury" rel={61} dim />
            </div>
            <div style={{padding:'8px 12px', borderTop:'1px solid var(--line-2)', fontSize:11, color:'var(--mute)', display:'flex', alignItems:'center', gap:6}}>
              <span style={{flex:1}}>建议简历里把第 1 条放最前</span>
              <button className="btn" style={{padding:'3px 8px', fontSize:10.5}}>+ 补一条新角度</button>
            </div>
          </div>
        </Q>

        <CTABubble tweaks={tweaks} />
      </SidePanel>
    </Frame>
  );
}

function MatRow({ id, txt, company, rel, primary, dim }) {
  return (
    <div style={{
      padding:'7px 12px',
      borderTop:'1px solid var(--line-2)',
      display:'flex', alignItems:'flex-start', gap:8,
      opacity: dim ? 0.65 : 1,
      background: primary ? 'var(--accent-soft)' : 'transparent',
    }}>
      <span className="muted tnum" style={{fontSize:10.5, marginTop:1, minWidth:22}}>#{id}</span>
      <div style={{flex:1, fontSize:11.5, lineHeight:1.5}}>
        <div style={{color:'var(--ink)'}}>{txt}</div>
        <div className="muted" style={{fontSize:10, marginTop:2}}>{company}</div>
      </div>
      <div style={{textAlign:'right', minWidth:34}}>
        <div className="tnum" style={{
          fontSize:11.5, fontWeight:500,
          color: rel >= 80 ? 'var(--good)' : rel >= 70 ? 'var(--accent)' : 'var(--mute)'
        }}>{rel}%</div>
      </div>
    </div>
  );
}

// ============== STATE 4: 缺口"Data-informed"被点 → Quinn 启动挖掘对话 ==============
function JobAnalysisA_Gap({ tweaks }) {
  return (
    <Frame variant="a">
      <SidePanel variant="a" tab="chat" qStyle={tweaks.qStyle} qColor={tweaks.aColor} jobContext={JOB_CTX} inputDim={false} inputPlaceholder="例：上次产品改版前，数据分析告诉我..."  >
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div style={{fontSize:13}}>三层匹配度——</div>
          <MatchCard tweaks={tweaks} gapHover="data" />
        </Q>

        <Sys>开始挖掘 · Data-informed decisions</Sys>

        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div style={{fontSize:13, lineHeight:1.55}}>
            这个缺口我帮你挖一下。回答这 3 个问题，我把答案<strong>提炼成素材库的 1 条</strong>：
          </div>
          <div className="qcard" style={{marginTop:8}}>
            <div className="qcard-h" style={{padding:'8px 12px'}}>
              <span style={{textTransform:'none', letterSpacing:0, fontWeight:500, color:'var(--ink)', fontSize:11.5}}>
                ◐ 挖掘对话 · 1 / 3
              </span>
              <span style={{flex:1}}></span>
              <span className="kbd" style={{fontSize:9}}>esc 取消</span>
            </div>
            <div style={{padding:'10px 12px', fontSize:12.5, lineHeight:1.6}}>
              <div style={{marginBottom:4, color:'var(--ink)'}}>
                你最近一次因为<strong>看了数据才改主意</strong>的决定，是哪个？
              </div>
              <div className="muted" style={{fontSize:11, lineHeight:1.5}}>
                不需要"伟大"——一次 spec 砍了一个 feature、一次给某指标加了埋点都可以。
              </div>
            </div>
            <div style={{padding:'8px 12px', borderTop:'1px solid var(--line-2)', display:'flex', alignItems:'center', gap:6, fontSize:10.5, color:'var(--mute)'}}>
              <span>下一个：</span>
              <span style={{padding:'2px 6px', borderRadius:4, background:'var(--bg-sunk)'}}>反直觉的发现</span>
              <span style={{padding:'2px 6px', borderRadius:4, background:'var(--bg-sunk)'}}>验证过程</span>
              <span style={{flex:1}}></span>
              <span style={{color:'var(--accent)'}}>跳过 →</span>
            </div>
          </div>
        </Q>
      </SidePanel>
    </Frame>
  );
}

Object.assign(window, { JobAnalysisA, JobAnalysisA_Company, JobAnalysisA_JD, JobAnalysisA_Gap });
