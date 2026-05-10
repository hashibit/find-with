/* global React, SidePanel, Q, U, Sys, I, Frame, QuinnIcon */

// ============= ONBOARDING =============
function OnboardingA({ tweaks }) {
  return (
    <Frame variant="a">
      <SidePanel variant="a" tab="chat" density="standard" qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div>嗨，我是 Quinn。</div>
          <div style={{marginTop:8, color:'var(--ink-2)'}}>
            我会陪你走完这段找工作的路——从浏览岗位，到拿到 offer 那天为止。找到了，我就退场。
          </div>
        </Q>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div>开始之前，先把你的简历给我。我读完之后，再聊 5 分钟把它聊"立体"。</div>
          <div className="qcard" style={{marginTop:10}}>
            <div className="qcard-b" style={{padding:14, textAlign:'center'}}>
              <div style={{display:'grid', placeItems:'center', width:36, height:36, borderRadius:8, background:'var(--bg-sunk)', color:'var(--mute)', margin:'0 auto 8px'}}>{I.upload}</div>
              <div style={{fontSize:13, fontWeight:500}}>拖入简历，或<span style={{color:'var(--accent)'}}>选择文件</span></div>
              <div className="muted tiny" style={{marginTop:4}}>PDF · DOCX · 不超过 5MB</div>
            </div>
          </div>
        </Q>
        <U>resume_2026.pdf</U>
        <Sys>解析中…</Sys>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div>读完了。我是这样理解你的——你看看对不对：</div>
          <div className="qcard" style={{marginTop:8}}>
            <div className="qcard-b" style={{padding:'10px 12px'}}>
              <div className="lab" style={{marginBottom:4}}>教育</div>
              <div style={{fontSize:12.5}}>UCLA · CS B.S. · 2018–2022</div>
              <div className="lab" style={{marginTop:10, marginBottom:4}}>工作</div>
              <div style={{fontSize:12.5, lineHeight:1.7}}>
                <div className="h between"><span>Stripe · 后端工程师</span><span className="muted tnum">'22–'24</span></div>
                <div className="h between"><span>Linear · 产品工程师</span><span className="muted tnum">'24–今</span></div>
              </div>
              <div style={{marginTop:10, display:'flex', gap:6, flexWrap:'wrap'}}>
                <span className="chip">Go</span><span className="chip">TypeScript</span>
                <span className="chip">React</span><span className="chip">Postgres</span>
                <span className="chip">+ 8</span>
              </div>
            </div>
          </div>
          <div style={{marginTop:8, fontSize:12.5}}>有两点想跟你确认——</div>
        </Q>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div>"Linear" 是做项目管理工具那家，对吗？</div>
        </Q>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.aColor}>
          <div>"Product engineer" 这个 title 比较特殊。你日常工作偏前端、后端，还是混合？</div>
          <div style={{display:'flex', gap:6, marginTop:10, flexWrap:'wrap'}}>
            <button className="btn">前端</button>
            <button className="btn">后端</button>
            <button className="btn primary">混合</button>
            <button className="btn">让我自己写</button>
          </div>
        </Q>
      </SidePanel>
    </Frame>
  );
}

function OnboardingB({ tweaks }) {
  return (
    <Frame variant="b">
      <SidePanel variant="b" tab="chat" density="standard" qStyle={tweaks.qStyle} qColor={tweaks.bColor}>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.bColor}>
          <div className="serif" style={{fontSize:15, lineHeight:1.5}}>
            嗨，我是 <span className="italic">Quinn</span>。
          </div>
          <div style={{marginTop:8, color:'var(--ink-2)', fontSize:13}}>
            我会陪你走完这段找工作的路——从浏览岗位，到拿到 offer 那天为止。
          </div>
          <div style={{marginTop:6, color:'var(--mute)', fontSize:12, fontStyle:'italic'}}>
            找到了，我就退场。
          </div>
        </Q>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.bColor}>
          <div style={{fontSize:13}}>先把简历给我。读完之后，我们聊 5 分钟把它聊"立体"。</div>
          <div style={{
            marginTop:10,
            border:'1px dashed var(--line)',
            borderRadius:10, padding:'18px 14px',
            textAlign:'center', background:'var(--bg-soft)'
          }}>
            <div style={{display:'inline-flex', alignItems:'center', gap:8, fontSize:13}}>
              <span style={{color:'var(--accent)'}}>{I.upload}</span>
              <span>拖入简历，或<u style={{color:'var(--accent)', textUnderlineOffset:3}}>选择文件</u></span>
            </div>
            <div className="muted tiny" style={{marginTop:6}}>PDF · DOCX</div>
          </div>
        </Q>
        <U>resume_2026.pdf</U>
        <Sys>解析中…</Sys>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.bColor}>
          <div className="serif" style={{fontSize:13.5}}>读完了。我是这样理解你的——</div>
          <div style={{
            marginTop:8, padding:'12px 14px',
            background:'var(--bg-soft)',
            borderLeft:'2px solid var(--accent)'
          }}>
            <div className="lab" style={{marginBottom:6, color:'var(--accent)'}}>教育</div>
            <div className="serif" style={{fontSize:13}}>UCLA · CS B.S. · 2018–2022</div>
            <div className="lab" style={{marginTop:12, marginBottom:6, color:'var(--accent)'}}>工作</div>
            <div className="serif" style={{fontSize:13, lineHeight:1.8}}>
              <div className="h between"><span>Stripe · 后端工程师</span><span className="muted tnum tiny">'22–'24</span></div>
              <div className="h between"><span>Linear · 产品工程师</span><span className="muted tnum tiny">'24–今</span></div>
            </div>
            <div style={{marginTop:10, fontSize:11.5, color:'var(--mute)'}}>
              <span className="italic">技能：</span> Go · TypeScript · React · Postgres · gRPC · 还有 6 项
            </div>
          </div>
          <div style={{marginTop:10, fontSize:13}}>有两点想跟你确认——</div>
        </Q>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.bColor}>
          <div style={{fontSize:13}}>"Linear" 是做项目管理工具那家，对吗？</div>
        </Q>
        <Q qStyle={tweaks.qStyle} qColor={tweaks.bColor}>
          <div style={{fontSize:13}}>"Product engineer" 这个 title 比较特殊。你日常工作偏前端、后端，还是混合？</div>
          <div style={{display:'flex', gap:6, marginTop:10, flexWrap:'wrap'}}>
            <button className="btn">前端</button>
            <button className="btn">后端</button>
            <button className="btn primary">混合</button>
            <button className="btn">让我自己写</button>
          </div>
        </Q>
      </SidePanel>
    </Frame>
  );
}

Object.assign(window, { OnboardingA, OnboardingB });
