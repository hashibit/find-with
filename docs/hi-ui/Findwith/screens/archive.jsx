/* global React, I, QuinnIcon */

// ============= ARCHIVE — FULLSCREEN WORKSPACE =============

const COMPANIES = [
  { id:'mercury', name:'Mercury',     period:'2024.05–今',    color:'#4F86F7', count:8,  current:true },
  { id:'notion',  name:'Notion',      period:'2022.01–24.04', color:'#1F1F1F', count:11 },
  { id:'byte',    name:'字节跳动',     period:'2020.07–22.01', color:'#FF1744', count:4 },
];

// srcType: 'chat' | 'resume' | 'note' | 'linkedin'
const ARCHIVE_MATERIALS = [
  { id:23, txt:'入职 60 天主导团队 dev workflow 重构，PR-to-prod 中位 4.2d → 2.6d，覆盖 32 名工程师', tag:'主动性',     company:'mercury', occurred:'2024.07', added:'04/12', conf:true,  uses:2,
    highlight:'前两个月就改流程，说明是 builder 型而不是 settler 型——别人在适应公司，你在让公司适应更好的工作方式。',
    raw:'我刚到 Mercury 不到两个月就重写了 PR 合流流程',
    srcType:'chat',  src:'2026-04-12 与 Quinn 对话',
    tags:['主动性','流程优化','早期 ownership'] },
  { id:22, txt:'跨 3 个 product team 推动 onboarding 改版对齐',                                tag:'Cross-fn',  company:'mercury', occurred:'2024.09', added:'04/12', conf:false, uses:0,
    highlight:'横向影响力——不是靠 title 推动，而是用 metrics 让对的信息出现在对的桌子上。',
    srcType:'chat' },
  { id:21, txt:'识别重复 oncall 模式，独立 ship 诊断工具，事故复发率 -50%',                     tag:'主动性',     company:'notion',  occurred:'2023 Q4', added:'04/08', conf:true,  uses:3,
    highlight:'从问题模式抽象出系统性解法——这是 senior+ 的标志动作。',
    srcType:'resume', src:'你 2024 年简历 v1 · 第 3 段第 2 条' },
  { id:20, txt:'主导 RFC，推动支付服务从 MySQL 迁移至 Postgres，p99 -40%',                      tag:'技术深度',   company:'notion',  occurred:'2023.08', added:'03/30', conf:true,  uses:1,
    highlight:'有写 RFC 推大型迁移的经验，能搞定跨团队 buy-in 而不只是写代码。', srcType:'resume', src:'你 2024 年简历 v1' },
  { id:19, txt:'入职第一个月独立完成 Billing webhook 重写',                                     tag:'技术深度',   company:'notion',  occurred:'2022.02', added:'03/22', conf:true,  uses:0,
    highlight:'快速 ramp-up——hire 一个月就能独立交付关键模块，可作为 onboarding speed 的论据。', srcType:'chat' },
  { id:18, txt:'主动接手离职同事的 oncall rotation，无缝衔接 6 周',                              tag:'Ownership', company:'notion',  occurred:'2023.05', added:'03/15', conf:true,  uses:1,
    highlight:'团队补位意识——不计 KPI 的事情你也会做。', srcType:'chat' },
  { id:17, txt:'设计内部 metrics dashboard，被 4 个团队复用',                                    tag:'工具思维',   company:'byte',    occurred:'2021 Q3', added:'03/08', conf:true,  uses:2,
    highlight:'造工具的本能——不只解决眼前问题，还想到怎么让别人也能用。', srcType:'resume', src:'你 2022 年简历' },
  { id:16, txt:'独立带 2 个 intern，分别完成各自的 ship-it 项目',                                tag:'Mentor',    company:'mercury', occurred:'2024.08', added:'02/28', conf:true,  uses:0,
    highlight:'有带人经验，且不是放养——两个 intern 都 ship 了东西。', srcType:'chat' },
  { id:15, txt:'用一份数据分析推翻团队"用户想要 X"的直觉，节省 6 周开发',                         tag:'Data',      company:'notion',  occurred:'2022.11', added:'02/14', conf:false, uses:0,
    highlight:'敢用数据反对资深同事的直觉——data-informed 不是口号。', srcType:'chat' },
  { id:14, txt:'staging 部署时间从 18 分钟优化到 4 分钟',                                        tag:'流程',       company:'byte',    occurred:'2021.04', added:'02/03', conf:true,  uses:4,
    highlight:'4.5x 提速 + 高复用率——是个能直接进简历的硬指标。', srcType:'resume', src:'你 2022 年简历' },
  { id:13, txt:'重写 webhook retry 机制，丢失率 0.8% → 0.02%',                                   tag:'技术深度',   company:'notion',  occurred:'2023.02', added:'01/22', conf:true,  uses:1,
    highlight:'40x 改善——可靠性工程的硬证据，infra 岗会很买账。', srcType:'resume', src:'你 2024 年简历 v1' },
  { id:12, txt:'推动团队引入 trunk-based dev，code review 周期 -60%',                            tag:'流程',       company:'notion',  occurred:'2023.06', added:'01/14', conf:true,  uses:0,
    highlight:'技术管理能力——不只是写代码，还在改变团队工作方式。', srcType:'chat' },
];

const TAG_COLORS_AR = {
  '主动性':'#2563EB', 'Cross-fn':'#7C3AED', '技术深度':'#16A34A',
  'Ownership':'#0E7490', '工具思维':'#B45309', 'Mentor':'#A21CAF',
  'Data':'#0E7490', '流程':'#2563EB',
};

// ---------- Workspace shell ----------
function ArchiveShell({ qStyle, qColor, children }) {
  return (
    <div className="sp a" style={{
      width:1280, height:800, borderRadius:0,
      display:'flex', flexDirection:'column',
      background:'var(--bg-soft)'
    }}>
      <div style={{
        height:40, display:'flex', alignItems:'center', gap:10,
        padding:'0 14px', borderBottom:'1px solid var(--line)', background:'var(--bg)',
        flexShrink:0
      }}>
        <button className="iconbtn" style={{
          width:24, height:24, display:'grid', placeItems:'center',
          border:'none', background:'transparent', color:'var(--mute)', cursor:'pointer', borderRadius:6
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 3l-4 4 4 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={{display:'flex', alignItems:'center', gap:6, fontSize:12}}>
          <QuinnIcon variant={qStyle} color={qColor} size={16} />
          <span className="muted">Quinn</span>
          <span className="muted">/</span>
          <span style={{color:'var(--ink)', fontWeight:600}}>档案</span>
          <span className="muted">/</span>
          <span style={{color:'var(--ink)'}}>素材库</span>
        </div>
        <span style={{flex:1}}></span>
        <span className="muted tnum" style={{fontSize:11}}>已自动同步 · 13 秒前</span>
        <span className="kbd">⌘K</span>
      </div>
      <div style={{flex:1, display:'flex', overflow:'hidden'}}>{children}</div>
    </div>
  );
}

// ---------- Left rail ----------
function LeftRail() {
  const sections = [
    { k:'base', label:'基础档案', sub:'基本信息 · 经历 · 项目 · 技能', n:null },
    { k:'lib',  label:'素材库',   sub:'23 条 · 3 待确认',           n:'23', active:true },
  ];
  return (
    <div style={{
      width:208, flexShrink:0,
      borderRight:'1px solid var(--line)',
      background:'var(--bg)',
      display:'flex', flexDirection:'column',
      padding:'16px 0'
    }}>
      <div style={{padding:'0 16px 10px', fontSize:9.5, fontWeight:600, color:'var(--mute)',
        textTransform:'uppercase', letterSpacing:'0.1em',
      }}>档案</div>

      {sections.map(s => (
        <div key={s.k} style={{
          padding:'9px 16px',
          display:'flex', flexDirection:'column', gap:2, cursor:'pointer',
          color: s.active ? 'var(--ink)' : 'var(--ink-2)',
          background: s.active ? 'var(--bg-sunk)' : 'transparent',
          borderLeft: s.active ? '2px solid var(--ink)' : '2px solid transparent',
          paddingLeft: 14,
        }}>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <span style={{flex:1, fontSize:13, fontWeight: s.active ? 600 : 500}}>{s.label}</span>
            {s.n && <span className="muted tnum" style={{fontSize:11}}>{s.n}</span>}
          </div>
          <div className="muted" style={{fontSize:10.5, lineHeight:1.4}}>{s.sub}</div>
        </div>
      ))}

      <span style={{flex:1}}></span>
      <div style={{padding:'10px 16px', borderTop:'1px solid var(--line)', fontSize:11, color:'var(--mute)',
        display:'flex', alignItems:'center', gap:6
      }}>
        <span style={{display:'inline-block', width:6, height:6, borderRadius:99, background:'var(--good)'}}></span>
        <span>已同步至简历模板 · 3 处</span>
      </div>
    </div>
  );
}

// ---------- Filter bar ----------
function FilterBar() {
  return (
    <div style={{
      padding:'12px 24px', borderBottom:'1px solid var(--line)',
      background:'var(--bg)', display:'flex', alignItems:'center', gap:10,
      flexShrink:0
    }}>
      <div style={{
        flex:1, maxWidth:340,
        display:'flex', alignItems:'center', gap:6,
        padding:'6px 10px', border:'1px solid var(--line)',
        borderRadius:6,
        fontSize:12, color:'var(--mute)', background:'var(--bg)'
      }}>
        {I.search}<span>搜索素材、原话、标签…</span>
        <span style={{flex:1}}></span>
        <span className="kbd">/</span>
      </div>

      <div style={{display:'flex', gap:6, alignItems:'center'}}>
        <span className="muted" style={{fontSize:11}}>公司</span>
        <button className="chip soft" style={{fontSize:11}}>全部</button>
        {COMPANIES.map(c => (
          <button key={c.id} className="chip" style={{fontSize:11, gap:5}}>
            <span style={{display:'inline-block', width:6, height:6, borderRadius:99, background:c.color}}></span>
            <span>{c.name}</span>
          </button>
        ))}
      </div>

      <span style={{flex:1}}></span>

      <button className="btn" style={{fontSize:11.5, padding:'5px 9px', gap:5}}>{I.filter}<span>筛选</span></button>
      <button className="btn primary" style={{fontSize:11.5, padding:'5px 10px', gap:5}}>
        {I.plus}<span>新建</span>
      </button>
    </div>
  );
}

// ---------- Table ----------
function ArchiveTable({ selectedId }) {
  const grid = '24px 20px 1fr 96px 132px 88px 56px 64px';

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg)'}}>
      <div style={{
        display:'grid', gridTemplateColumns:grid, gap:10,
        padding:'10px 24px',
        fontSize:9.5, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em',
        color:'var(--mute)', borderBottom:'1px solid var(--line)',
        flexShrink:0, background:'var(--bg)',
      }}>
        <span></span>
        <span></span>
        <span>素材</span>
        <span>标签</span>
        <span>公司</span>
        <span>发生</span>
        <span style={{textAlign:'right'}}>用</span>
        <span style={{textAlign:'right'}}>录入</span>
      </div>

      <div style={{flex:1, overflow:'hidden'}}>
        {ARCHIVE_MATERIALS.map((m) => {
          const isSel = m.id === selectedId;
          const co = COMPANIES.find(c => c.id === m.company);
          return (
            <div key={m.id} style={{
              display:'grid', gridTemplateColumns:grid, gap:10,
              padding:'10px 24px',
              fontSize:12.5, lineHeight:1.4,
              borderBottom:'1px solid var(--line-2)',
              alignItems:'center',
              background: isSel ? 'var(--bg-sunk)' : 'transparent',
              borderLeft: isSel ? '2px solid var(--ink)' : '2px solid transparent',
              paddingLeft: 22,
              cursor:'pointer',
            }}>
              <span style={{
                width:13, height:13, borderRadius:3,
                border:'1px solid var(--line)',
                display:'inline-block', background:'var(--bg)'
              }}></span>
              <span style={{
                display:'inline-block', width:7, height:7, borderRadius:99,
                background: m.conf ? 'var(--good)' : 'var(--warn)',
              }}></span>
              <span style={{
                color:'var(--ink)', minWidth:0,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                fontSize:12.5, fontWeight: isSel ? 500 : 400,
              }}>{m.txt}</span>
              <span style={{
                fontSize:10.5, color: TAG_COLORS_AR[m.tag] || 'var(--mute)',
                fontWeight:500,
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
              }}>{m.tag}</span>
              <span style={{display:'flex', alignItems:'center', gap:6, minWidth:0}}>
                <span style={{display:'inline-block', width:7, height:7, borderRadius:99, background:co?.color, flexShrink:0}}></span>
                <span style={{
                  fontSize:11.5, color:'var(--ink-2)',
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                }}>{co?.name}</span>
              </span>
              <span className="tnum" style={{fontSize:11, color:'var(--ink-2)'}}>{m.occurred}</span>
              <span className={`tnum${m.uses === 0 ? ' muted' : ''}`} style={{fontSize:11, textAlign:'right', color: m.uses === 0 ? 'var(--mute-2)' : 'var(--ink-2)'}}>{m.uses === 0 ? '—' : m.uses}</span>
              <span className="muted tnum" style={{fontSize:11, textAlign:'right'}}>{m.added}</span>
            </div>
          );
        })}
      </div>

      <div style={{
        padding:'8px 24px', borderTop:'1px solid var(--line)',
        fontSize:11, color:'var(--mute)',
        display:'flex', alignItems:'center', gap:8, background:'var(--bg-soft)',
        flexShrink:0,
      }}>
        <span className="tnum">23 条</span>
        <span>·</span>
        <span style={{color:'var(--good)'}}>20 已确认</span>
        <span>·</span>
        <span style={{color:'var(--warn)'}}>3 待确认</span>
        <span style={{flex:1}}></span>
        <span>排序 · 录入时间 ↓</span>
        <span>·</span>
        <span>{I.spark}</span>
        <span>Quinn 建议合并 2 条相似素材</span>
      </div>
    </div>
  );
}

// ---------- Detail drawer (floating overlay) ----------
function DetailDrawer() {
  const m = ARCHIVE_MATERIALS[0];
  const co = COMPANIES.find(c => c.id === m.company);

  const srcLabel = {
    chat:     { icon: I.chat || I.link, txt: '与 Quinn 对话' },
    resume:   { icon: I.doc,             txt: '上传的简历' },
    note:     { icon: I.doc,             txt: '手写笔记' },
    linkedin: { icon: I.link,            txt: 'LinkedIn 导入' },
  }[m.srcType || 'chat'];

  return (
    <div style={{
      position:'absolute', top:0, right:0, bottom:0, width:380,
      background:'var(--bg)',
      borderLeft:'1px solid var(--line)',
      boxShadow:'-12px 0 28px rgba(0,0,0,0.08), -2px 0 6px rgba(0,0,0,0.04)',
      display:'flex', flexDirection:'column',
      overflow:'hidden',
      zIndex:10,
    }}>
      <div style={{
        padding:'14px 20px', borderBottom:'1px solid var(--line)',
        display:'flex', alignItems:'center', gap:8, flexShrink:0
      }}>
        <span className="muted tnum" style={{fontSize:11}}>#{m.id}</span>
        <span className="muted">·</span>
        <span style={{fontSize:10.5, color:'var(--good)', fontWeight:500, display:'flex', alignItems:'center', gap:4}}>
          <span style={{width:6, height:6, borderRadius:99, background:'var(--good)'}}></span>
          已确认
        </span>
        <span style={{flex:1}}></span>
        <button className="iconbtn" style={{width:24, height:24, display:'grid', placeItems:'center', border:'none', background:'transparent', color:'var(--mute)', cursor:'pointer', borderRadius:6}}>{I.edit}</button>
        <button className="iconbtn" style={{width:24, height:24, display:'grid', placeItems:'center', border:'none', background:'transparent', color:'var(--mute)', cursor:'pointer', borderRadius:6}}>{I.more}</button>
        <button className="iconbtn" style={{width:24, height:24, display:'grid', placeItems:'center', border:'none', background:'transparent', color:'var(--mute)', cursor:'pointer', borderRadius:6, marginLeft:2}}>
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </button>
      </div>

      <div style={{flex:1, overflow:'hidden', padding:'18px 20px 0', display:'flex', flexDirection:'column', gap:16}}>
        {/* fact */}
        <div>
          <div className="lab">事实</div>
          <div style={{marginTop:6, fontSize:14, lineHeight:1.5, color:'var(--ink)'}}>{m.txt}</div>
        </div>

        {/* HIGHLIGHT */}
        <div style={{
          padding:'12px 14px',
          background:'var(--accent-soft)',
          borderRadius:8,
          border:'1px solid color-mix(in srgb, var(--accent) 18%, transparent)',
        }}>
          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
            <span style={{fontSize:9.5, fontWeight:600, color:'var(--accent)', letterSpacing:'0.08em', textTransform:'uppercase'}}>亮点</span>
            <span className="muted" style={{fontSize:10}}>· Quinn 提炼 · 可编辑</span>
            <span style={{flex:1}}></span>
            <button style={{background:'transparent', border:'none', color:'var(--mute)', cursor:'pointer', fontSize:10, padding:0}}>{I.edit}</button>
          </div>
          <div style={{fontSize:12.5, lineHeight:1.55, color:'var(--ink)'}}>{m.highlight}</div>
        </div>

        {/* meta grid */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 16px'}}>
          <div>
            <div className="lab" style={{fontSize:9.5}}>公司</div>
            <div style={{marginTop:4, display:'flex', alignItems:'center', gap:6, fontSize:12}}>
              <span style={{display:'inline-block', width:8, height:8, borderRadius:99, background:co.color}}></span>
              <span style={{fontWeight:500}}>{co.name}</span>
            </div>
            <div className="muted tnum" style={{fontSize:10.5, marginTop:2, paddingLeft:14}}>{co.period}</div>
          </div>
          <div>
            <div className="lab" style={{fontSize:9.5}}>发生时间</div>
            <div className="tnum" style={{marginTop:4, fontSize:12, color:'var(--ink)'}}>{m.occurred}</div>
            <div className="muted tnum" style={{fontSize:10.5, marginTop:2}}>入职 ~ 第 9 周</div>
          </div>
          <div>
            <div className="lab" style={{fontSize:9.5}}>录入</div>
            <div className="tnum" style={{marginTop:4, fontSize:12}}>2026.04.12</div>
          </div>
          <div>
            <div className="lab" style={{fontSize:9.5}}>使用</div>
            <div className="tnum" style={{marginTop:4, fontSize:12}}>{m.uses} 次</div>
          </div>
        </div>

        {/* tags */}
        <div>
          <div className="lab">标签</div>
          <div style={{marginTop:6, display:'flex', gap:5, flexWrap:'wrap'}}>
            {(m.tags || [m.tag]).map(t => (
              <span key={t} className="chip" style={{
                fontSize:10.5,
                color: TAG_COLORS_AR[t] || 'var(--mute)',
                borderColor: `color-mix(in srgb, ${TAG_COLORS_AR[t] || '#888'} 25%, transparent)`,
                background: `color-mix(in srgb, ${TAG_COLORS_AR[t] || '#888'} 6%, transparent)`,
              }}>{t}</span>
            ))}
            <span className="chip" style={{fontSize:10.5, color:'var(--mute)', borderStyle:'dashed'}}>+ 加</span>
          </div>
        </div>

        {/* source */}
        <div>
          <div className="lab">来源</div>
          <div style={{
            marginTop:6, padding:'8px 10px',
            border:'1px solid var(--line)', borderRadius:6,
            display:'flex', alignItems:'center', gap:8, fontSize:11.5,
          }}>
            <span style={{
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              width:22, height:22, borderRadius:5,
              background: m.srcType === 'resume' ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-sunk)',
              color: m.srcType === 'resume' ? 'var(--accent)' : 'var(--mute)',
              flexShrink:0,
            }}>{srcLabel.icon}</span>
            <div style={{flex:1, minWidth:0}}>
              <div style={{color:'var(--ink)', fontWeight:500}}>{srcLabel.txt}</div>
              <div className="muted" style={{fontSize:10.5, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{m.src || '—'}</div>
            </div>
            <span style={{color:'var(--accent)', fontSize:10.5, cursor:'pointer'}}>查看 →</span>
          </div>
          {m.raw && (
            <div className="italic" style={{
              marginTop:6, fontSize:11.5, lineHeight:1.55, color:'var(--mute)',
              paddingLeft:10, borderLeft:'2px solid var(--line)',
            }}>“{m.raw}”</div>
          )}
        </div>

        {/* used in */}
        <div>
          <div className="lab">用于</div>
          <div style={{marginTop:6, display:'flex', flexDirection:'column', gap:6}}>
            <div style={{display:'flex', alignItems:'center', gap:8, fontSize:11.5, padding:'5px 8px', border:'1px solid var(--line)', borderRadius:6}}>
              {I.doc}
              <span style={{flex:1}}>简历 · Stripe Senior SWE</span>
              <span className="muted tnum" style={{fontSize:10}}>04/14</span>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, fontSize:11.5, padding:'5px 8px', border:'1px solid var(--line)', borderRadius:6}}>
              {I.doc}
              <span style={{flex:1}}>Cover Letter · Linear</span>
              <span className="muted tnum" style={{fontSize:10}}>04/13</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        margin:'14px 16px 16px',
        padding:'10px 12px',
        background:'var(--bg-sunk)',
        border:'1px solid var(--line)',
        borderRadius:8,
        fontSize:11.5, lineHeight:1.5, color:'var(--ink-2)',
        display:'flex', gap:8,
      }}>
        <QuinnIcon variant="circle" color="var(--a-accent)" size={16} />
        <div>
          这条素材可以再补一句"团队反馈"——比如 manager 在 1:1 里怎么评价的？要我帮你回忆一下吗？
        </div>
      </div>
    </div>
  );
}

// ---------- Public component ----------
function ArchiveA({ tweaks }) {
  return (
    <ArchiveShell qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
      <LeftRail />
      <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg)', position:'relative'}}>
        <FilterBar />
        <ArchiveTable selectedId={23} />
        <DetailDrawer />
      </div>
    </ArchiveShell>
  );
}

Object.assign(window, { ArchiveA });
