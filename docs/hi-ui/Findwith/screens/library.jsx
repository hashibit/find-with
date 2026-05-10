/* global React, SidePanel, Q, U, Sys, I, Frame, QuinnIcon */

// ============= MATERIAL LIBRARY (table — minimal) =============
const MATERIALS = [
  { id:23, txt:'入职 60 天内主导团队 dev workflow 重构，将 PR-to-prod 的中位时间从 4.2 天压到 2.6 天，为 32 名工程师减负', tag:'主动性', date:'04/12', conf:true, expanded:true, raw:'我在新公司前两个月就梳理了团队的开发流程', src:'2026-04-12 对话', tags:['主动性','流程优化','早期 ownership'], proj:'Linear', uses:2 },
  { id:22, txt:'跨 3 个 product team 推动 onboarding 改版对齐', tag:'Cross-fn', date:'04/12', conf:false },
  { id:21, txt:'识别重复 oncall 模式，独立 ship 诊断工具，-50% incident', tag:'主动性', date:'04/08', conf:true },
  { id:20, txt:'撰写并主导 RFC，推动支付服务从 MySQL 迁移至 Postgres', tag:'技术深度', date:'03/30', conf:true },
  { id:19, txt:'第一个月独立完成 Billing webhook 重写', tag:'技术深度', date:'03/22', conf:true },
  { id:18, txt:'主动接手离职同事的 oncall rotation，无缝衔接 6 周', tag:'Ownership', date:'03/15', conf:true },
  { id:17, txt:'设计内部 metrics dashboard，被 4 个团队复用', tag:'工具思维', date:'03/08', conf:true },
  { id:16, txt:'独立带 2 个 intern，完成各自的 ship-it 项目', tag:'Mentor', date:'02/28', conf:true },
  { id:15, txt:'用一份数据分析推翻团队 "用户想要 X" 的直觉', tag:'Data', date:'02/14', conf:false },
  { id:14, txt:'staging 部署时间从 18 分钟优化到 4 分钟', tag:'流程', date:'02/03', conf:true },
];

const TAG_COLORS = {
  '主动性':       '#2563EB',
  'Cross-fn':    '#7C3AED',
  '技术深度':      '#16A34A',
  'Ownership':   '#0E7490',
  '工具思维':      '#B45309',
  'Mentor':      '#A21CAF',
  'Data':        '#0E7490',
  '流程':         '#2563EB',
};

function ProfileNav({ variant }) {
  const isB = variant === 'b';
  return (
    <div style={{margin:'-16px -14px 0', borderBottom:'1px solid var(--line)', background:'var(--bg)'}}>
      <div style={{display:'flex', gap:0, padding:'4px 14px 0'}}>
        {['基本','工作','项目','技能','素材库'].map((t,i) => {
          const active = i===4;
          return (
            <div key={t} className={isB && active ? 'serif' : ''} style={{
              padding:'10px 10px',
              fontSize:12, fontWeight: active ? (isB ? 500 : 600) : 400,
              color: active ? 'var(--ink)' : 'var(--mute)',
              borderBottom: active ? `2px solid ${isB ? 'var(--accent)' : 'var(--ink)'}` : '2px solid transparent',
              marginBottom:-1, cursor:'pointer'
            }}>{t}{active && <span className={`muted tnum${isB?' italic':''}`} style={{marginLeft:5, fontWeight:400}}>23</span>}</div>
          );
        })}
      </div>
    </div>
  );
}

function MatLibA({ tweaks }) {
  return (
    <Frame variant="a">
      <SidePanel variant="a" tab="profile" qStyle={tweaks.qStyle} qColor={tweaks.aColor} hideInput>
        <ProfileNav variant="a" />

        {/* lean toolbar */}
        <div style={{margin:'0 -14px', padding:'10px 14px', borderBottom:'1px solid var(--line)', background:'var(--bg)', display:'flex', alignItems:'center', gap:8}}>
          <div style={{
            flex:1,
            display:'flex', alignItems:'center', gap:6,
            padding:'5px 8px', border:'1px solid var(--line)', borderRadius:6,
            fontSize:11.5, color:'var(--mute)', background:'var(--bg)'
          }}>
            {I.search}<span>搜索 · 标签 · 时间</span>
          </div>
          <button className="btn" style={{padding:'5px 9px', fontSize:11}}>{I.plus}</button>
        </div>

        {/* TABLE — 2 columns only */}
        <div style={{margin:'0 -14px', flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg)'}}>
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 36px',
            gap:10, padding:'9px 16px',
            fontSize:9.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em',
            color:'var(--mute)', borderBottom:'1px solid var(--line)',
            flexShrink:0
          }}>
            <span>素材</span>
            <span style={{textAlign:'right'}}>日期</span>
          </div>

          <div style={{flex:1, overflow:'hidden'}}>
            {MATERIALS.map((m) => m.expanded ? (
              <div key={m.id} style={{
                padding:'12px 16px 14px',
                borderBottom:'1px solid var(--line-2)',
                background:'var(--bg-sunk)',
                borderLeft:'2px solid var(--ink)',
                marginLeft:-2,
              }}>
                <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                  <span style={{display:'inline-block', width:6, height:6, borderRadius:99, background:'var(--good)', flexShrink:0, transform:'translateY(-1px)'}}></span>
                  <span style={{color:'var(--ink)', flex:1, fontSize:12, lineHeight:1.5}}>{m.txt}</span>
                  <span className="muted tnum" style={{fontSize:10.5}}>{m.date}</span>
                </div>
                <div style={{paddingLeft:12, marginTop:6, fontSize:10.5, color:'var(--mute)', fontStyle:'italic', lineHeight:1.5}}>
                  原话：“{m.raw}”
                </div>
                <div style={{paddingLeft:12, marginTop:8, display:'flex', gap:4, flexWrap:'wrap', alignItems:'center'}}>
                  {m.tags.map(t => <span key={t} style={{fontSize:10, color: TAG_COLORS[t] || 'var(--mute)', fontWeight:500}}>{t}</span>).reduce((a,b,i)=>i?[...a,<span key={'s'+i} className="muted" style={{fontSize:10}}>·</span>,b]:[b],[])}
                  <span style={{flex:1}}></span>
                  <span className="muted" style={{fontSize:10}}>{m.src} · 用过 {m.uses} 次</span>
                </div>
              </div>
            ) : (
              <div key={m.id} style={{
                display:'grid', gridTemplateColumns:'1fr 36px',
                gap:10, padding:'10px 16px',
                fontSize:12, lineHeight:1.4,
                borderBottom:'1px solid var(--line-2)',
                alignItems:'center',
              }}>
                <div style={{display:'flex', alignItems:'baseline', gap:6, minWidth:0}}>
                  <span style={{display:'inline-block', width:6, height:6, borderRadius:99, flexShrink:0, background: m.conf ? 'var(--good)' : 'var(--warn)', transform:'translateY(-1px)'}}></span>
                  <span style={{color:'var(--ink)', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{m.txt}</span>
                  <span style={{fontSize:10, color: TAG_COLORS[m.tag] || 'var(--mute)', flexShrink:0, fontWeight:500}}>{m.tag}</span>
                </div>
                <span className="muted tnum" style={{fontSize:10.5, textAlign:'right'}}>{m.date}</span>
              </div>
            ))}
          </div>

          <div style={{
            padding:'7px 16px', borderTop:'1px solid var(--line)',
            fontSize:10.5, color:'var(--mute)',
            display:'flex', alignItems:'center', gap:6, background:'var(--bg-soft)',
            flexShrink:0
          }}>
            <span className="tnum">23 条</span>
            <span>·</span>
            <span style={{color:'var(--warn)'}}>3 待确认</span>
            <span style={{flex:1}}></span>
            <span className="kbd">⌘K</span>
          </div>
        </div>
      </SidePanel>
    </Frame>
  );
}

function MatLibB({ tweaks }) {
  return (
    <Frame variant="b">
      <SidePanel variant="b" tab="profile" qStyle={tweaks.qStyle} qColor={tweaks.bColor} hideInput>
        <ProfileNav variant="b" />

        <div style={{margin:'0 -14px', padding:'10px 14px', borderBottom:'1px solid var(--line)', background:'var(--bg)', display:'flex', alignItems:'center', gap:8}}>
          <div style={{
            flex:1,
            display:'flex', alignItems:'center', gap:6,
            padding:'5px 8px', border:'1px solid var(--line)', borderRadius:4,
            fontSize:11.5, color:'var(--mute)', background:'var(--bg-soft)'
          }}>
            {I.search}<span className="italic serif">搜索 · 标签 · 时间</span>
          </div>
          <button className="btn" style={{padding:'5px 9px', fontSize:11, borderRadius:4}}>{I.plus}</button>
        </div>

        <div style={{margin:'0 -14px', flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg)'}}>
          <div style={{
            display:'grid', gridTemplateColumns:'1fr 36px',
            gap:10, padding:'10px 16px',
            fontSize:10, letterSpacing:'0.12em',
            color:'var(--accent)',
            borderBottom:'1px solid var(--accent)',
            flexShrink:0,
            fontFamily:'Source Serif 4, Georgia, serif',
            fontStyle:'italic', textTransform:'uppercase'
          }}>
            <span>素材</span>
            <span style={{textAlign:'right'}}>日期</span>
          </div>

          <div style={{flex:1, overflow:'hidden'}}>
            {MATERIALS.map((m) => m.expanded ? (
              <div key={m.id} style={{
                padding:'12px 16px 14px',
                borderBottom:'1px solid var(--line-2)',
                background:'var(--bg-soft)',
                borderLeft:'2px solid var(--accent)',
                marginLeft:-2,
              }}>
                <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                  <span style={{display:'inline-block', width:6, height:6, borderRadius:99, background:'var(--good)', flexShrink:0, transform:'translateY(-1px)'}}></span>
                  <span className="serif" style={{color:'var(--ink)', flex:1, fontSize:12.5, lineHeight:1.55}}>{m.txt}</span>
                  <span className="muted tnum" style={{fontSize:10.5}}>{m.date}</span>
                </div>
                <div className="serif italic" style={{marginTop:6, marginLeft:18, paddingLeft:8, fontSize:11, color:'var(--mute)', lineHeight:1.55, borderLeft:'1px solid var(--line)'}}>
                  “{m.raw}”
                </div>
                <div style={{paddingLeft:12, marginTop:8, display:'flex', gap:4, flexWrap:'wrap', alignItems:'center'}}>
                  {m.tags.map(t => <span key={t} className="italic" style={{fontSize:10, color: TAG_COLORS[t] || 'var(--mute)', fontFamily:'Source Serif 4, serif'}}>{t}</span>).reduce((a,b,i)=>i?[...a,<span key={'s'+i} className="muted" style={{fontSize:10}}>·</span>,b]:[b],[])}
                  <span style={{flex:1}}></span>
                  <span className="muted italic" style={{fontSize:10, fontFamily:'Source Serif 4, serif'}}>{m.src} · 用过 {m.uses} 次</span>
                </div>
              </div>
            ) : (
              <div key={m.id} style={{
                display:'grid', gridTemplateColumns:'1fr 36px',
                gap:10, padding:'11px 16px',
                fontSize:12, lineHeight:1.4,
                borderBottom:'1px solid var(--line-2)',
                alignItems:'center',
              }}>
                <div style={{display:'flex', alignItems:'baseline', gap:6, minWidth:0}}>
                  <span style={{display:'inline-block', width:6, height:6, borderRadius:99, flexShrink:0, background: m.conf ? 'var(--good)' : 'var(--warn)', transform:'translateY(-1px)'}}></span>
                  <span className="serif" style={{color:'var(--ink)', flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:12.5}}>{m.txt}</span>
                  <span className="italic" style={{fontSize:10, color: TAG_COLORS[m.tag] || 'var(--mute)', flexShrink:0, fontFamily:'Source Serif 4, serif'}}>{m.tag}</span>
                </div>
                <span className="muted tnum" style={{fontSize:10.5, textAlign:'right'}}>{m.date}</span>
              </div>
            ))}
          </div>

          <div style={{
            padding:'7px 16px', borderTop:'1px solid var(--accent)',
            fontSize:10.5, color:'var(--mute)',
            display:'flex', alignItems:'center', gap:6, background:'var(--bg-soft)',
            flexShrink:0,
            fontFamily:'Source Serif 4, serif', fontStyle:'italic'
          }}>
            <span className="tnum">23 条</span>
            <span>·</span>
            <span style={{color:'var(--warn)'}}>3 待确认</span>
            <span style={{flex:1}}></span>
            <span className="kbd">⌘K</span>
          </div>
        </div>
      </SidePanel>
    </Frame>
  );
}

Object.assign(window, { MatLibA, MatLibB });
