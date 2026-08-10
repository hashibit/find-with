# FindWith 全新用户完整业务流程

> 从一个没安装过扩展的全新用户视角，完整走一遍产品流程。

---

## 阶段 1：发现 → 注册 → 安装

```
用户访问 findwith.com (web/:14606)
  │
  ├─ 首页：Hero + 三个功能卡片 + "Install Extension"/"Get Started Free"
  │
  ├─ 点击 "Get Started Free" → /install
  │    └─ 4 步指引：Chrome Web Store 安装 → 登录 → 打开岗位页
  │
  ├─ 点击 "Log in" → /login
  │    └─ Dev 模式：LocalSignIn 表单（预填 dev@findwith.local / dev123）
  │        → POST /__clerk/v1/sign_ins（middleware 代理 → mock-clerk:14611）
  │        → mock-clerk 签发 httpOnly cookie：__session=<id>; HttpOnly; SameSite=Lax
  │        → cookie 存在 web 域（localhost:14606），跟生产 Clerk 行为一致
  │        → 跳转 /dashboard
  │
  └─ /dashboard：Stats 卡片 + "Install the FindWith extension" 提示
```

**Auth 模式切换**：`AuthProvider`（`web/src/lib/auth.tsx`）启动时调用 `GET /api/v1/config/auth`，后端返回 `{authMode: 'mock' | 'clerk'}`。Dev 环境返回 `mock`，页面包装 `LocalAuthProvider`（`web/src/lib/dev-auth.tsx`）；生产返回 `clerk`，包装 `ClerkProvider`。`LocalAuth` 内嵌 `isMock: true` 字段，UI 组件通过 `useContext(LocalAuthContext)` 区分模式，无需独立 `AuthModeContext`。统一 `useAuth()` / `useUser()` 接口使页面代码不分支。

**Token 存储**：httpOnly cookie。Dev 模式下 mock-clerk 签发 `__session` cookie，生产下 Clerk 签发 `__client`/`__session` cookie。`dev-auth.tsx` 不再碰 localStorage，cookie 由浏览器自动管理，刷新页面后通过 `GET /__clerk/v1/client`（读 cookie）自动恢复登录态。`LocalAuthContext` 统一暴露 `isMock`、`isLoaded`、`isSignedIn`、`user`、`getToken`、`signOut` 等字段。

### 登录页面逻辑

`web/src/app/login/[[...sign-in]]/page.tsx`：
- 如果已登录 → 自动跳转 `redirect_url`（默认 `/dashboard`）
- `redirect_url` 参数对扩展流程关键（见阶段 2）

---

## 阶段 2：安装扩展 → 授权桥接

```
用户在 chrome://extensions 加载 extension/dist/
  │
  ├─ 点击工具栏图标 → Side Panel 打开
  │    └─ App.tsx mount: 读 chrome.storage.local['sessionToken']
  │       └─ 无 sessionToken → 顶栏显示红色 "未登录 →"
  │
  ├─ 点击 "未登录 →"
  │    └─ 打开 web/auth/extension-callback 页面
  │       ├─ 已登录 → getToken() → POST /__clerk/v1/sign（cookie 自动带上）
  │       │    → mock-clerk 读 __session cookie → 签发 24h JWT 到 JS 内存
  │       ├─ 拿 JWT → POST /api/v1/iam/auth/verify {clerkToken}
  │       ├─ 后端验证 Clerk JWT → upsert user → 签发 CSPRNG session token
  │       ├─ 存 Redis：session:<token> → userId（TTL 24h）
  │       └─ 返回 {sessionToken, expires_at, user_id}
  │
  ├─ Web 页面通过 chrome.runtime.sendMessage(EXT_ID, {AUTH_SESSION_TOKEN, sessionToken, ...})
  │    └─ background/index.ts onMessageExternal 校验 sender origin
  │       └─ 写入 chrome.storage.local {sessionToken, expires_at, user_id}
  │       └─ 清除 badge → 广播 AUTH_SUCCESS
  │
  └─ Sidepanel onChanged 监听到新 token
     └─ GET /api/v1/iam/me → 顶栏从 "未登录" 变为用户名
     └─ 页面显示 "You're connected! You can close this tab."
```

**关键设计**：Web 端拥有身份（Clerk JWT，prod 下 httpOnly cookie，dev 下 mock-clerk 的同域 httpOnly cookie），扩展只持有后端签发的 opaque session token（存在 `chrome.storage.local`）。两个客户端各自持有各自的 token，互不感知。

**Token 全景**：

| Token | 存储位置 | 谁签发 | 用途 |
|---|---|---|---|
| Clerk JWT | Web 端 httpOnly cookie（持久化）+ JS 内存（API 调用时） | Clerk / mock-clerk | 证明"我是谁"给 FindWith Backend |
| Session Token | Extension `chrome.storage.local['sessionToken']` + Backend Redis | FindWith Backend | 证明"我是谁"给 FindWith Backend |

**Web ↔ Extension 桥接**（`extension-callback` 页面）：
```
Web:  Clerk JWT ──→ POST /auth/verify ──→ 后端签发 session token
                                         ← {sessionToken, expires_at, user_id}
Web:  chrome.runtime.sendMessage(EXT_ID, {type: AUTH_SESSION_TOKEN, sessionToken, ...})
                                         ↓
Ext:  chrome.storage.local['sessionToken'] = sessionToken
```

---

## 阶段 3：首次 Onboarding（Side Panel）

```
Side Panel 显示 Onboarding 路由（/）
  │
  ├─ GET /api/v1/profile → 404（无档案）
  │    └─ Quinn 问候 + 简历上传卡片
  │
  ├─ 用户上传 PDF/DOCX
  │    └─ POST /api/v1/profile/resume（multipart, FormData file）
  │       └─ 后端存储到 MinIO：resumes/{userId}/{ulid}-{name}
  │       └─ BullMQ 异步解析 → 轮询 GET /profile（每 1.5s，最多 60s）
  │
  ├─ 解析完成 → 展示结构化档案（basicInfo/skills/education/experience）
  │    └─ 自动触发 onboarding 对话："Please ask me a few questions..."
  │       └─ SSE 流式（POST /conversations → GET /prompt?message=...）
  │
  └─ Quinn 逐条挖掘闪光点（mine_shining_point tool）
     └─ 每条沉淀到 /api/v1/profile/materials
     └─ 状态：PROPOSED → 用户确认 → CONFIRMED
     └─ 携带标签：[主动性] [流程优化] [跨团队协作] 等
```

### Onboarding 出口

用户可随时说 "先这样吧" 退出。后续每次使用产品时，Quinn 都可能顺便挖掘 1-2 个新角度。

---

## 阶段 4：日常使用 — 浏览岗位

### 4.1 LinkedIn 自动抓取

```
用户浏览 linkedin.com/jobs/view/xxx
  │
  ├─ Content Script (cs-linkedin-job.js) 注入
  │    └─ MutationObserver 监听 URL 变化（SPA 导航）
  │    └─ 3 秒 dwell timer → 抓取 title/company/description
  │    └─ 同日同 URL 不重复（per-session capturedUrls set）
  │
  └─ chrome.runtime.sendMessage({type: JOB_CAPTURE, payload})
```

**注意**：当前实现是**静默自动抓取**，没有 PRD 里描述的 "Ask Quinn" 按钮。按钮在 PRD 和 UI 文案中存在，但代码中尚未实现。

### 4.2 数据流：Content Script → Background → Backend → Side Panel

```
Content Script                          Background SW                        Backend
     │                                       │                                  │
     ├─ JOB_CAPTURE ─────────────────────────┤                                  │
     │                                       ├─ getToken()                     │
     │                                       ├─ POST /api/v1/jobs/capture ────→│
     │                                       │   Idempotency-Key: SHA256(url|date)
     │                                       │   ← {capture, radarItem} ───────┤
     │                                       │                                  │
     │                                       ├─ QUINN_AMBIENT_MESSAGE ──→ nav ports
     │                                       │   (关键词匹配 + "要深度分析吗?")
     │                                       │                                  │
Side Panel ← runtimeNavBus ─────────────────┤                                  │
     │                                       │                                  │
     ├─ injectLocalQuinnMessage(text, captureId)                               │
     ├─ 显示 "深度分析这个岗位 →" 按钮                                          │
     │                                                                         │
     ├─ 用户点击                                                               │
     ├─ POST /api/v1/jobs/{captureId}/analyze ─────────────────────────────────→│
     │                                       │        ← BullMQ enqueue ────────┤
     ├─ 跳转 /job-analysis?id={captureId}                                     │
     └─ 轮询 GET /api/v1/jobs/{id}（每 2s）                                   │
        └─ 等待 parsedJd + matchResult 就绪                                   │
```

### 4.3 岗位分析展示

`routes/JobAnalysis.tsx` 完成后展示：

| 模块 | 内容 |
|---|---|
| 表面匹配 | 简历关键词命中率（类似 ATS 算法） |
| 深层匹配 | 素材库闪光点匹配（简历没写但聊过的经历） |
| Top 5 缺口 | JD 要求中档案和素材库都没体现的能力 |
| 公司简报 | 业务/规模/动态 + Glassdoor 评分 |
| 风险信号 | 裁员新闻/低评分/"快节奏"等隐藏信息 |
| 技能匹配 | 必需技能列表（绿色=已匹配，灰色=缺口） |

分析完成后自动触发 SSE 对话：

> "Job analysis complete for {title} at {company}. Surface match: X%, deep match: Y%. Want to apply?"

若 surface match < 30%，Quinn 会先劝阻，理由具体写明。

---

## 阶段 5：决定投递 → 简历定制

```
用户回复 "想投"
  │
  ├─ 后端 Agent 触发 tailoring 流程
  │    └─ POST /api/v1/tailoring {baseResumeId, parsedJdId}
  │       └─ BullMQ 异步生成 tailored bullets
  │
  ├─ 跳转 /tailoring?id={tailoringId}
  │    └─ 轮询 GET /api/v1/tailoring/{id}（每 2s）
  │
  ├─ Tailoring 视图展示：
  │    │
  │    ├─ 匹配度变化：X% → Y%
  │    ├─ Section 列表（Work Experience / Projects / Skills）
  │    │    └─ 每条 bullet 带溯源标记：
  │    │       ├─ CONFIRMED（绿色）= 来自已确认素材
  │    │       ├─ PENDING（黄色）= LLM 推断，需确认
  │    │       └─ USER_EDITED（蓝色）= 用户自己编辑
  │    │
  │    ├─ 交互：PATCH /bullets/{id} 编辑、POST /bullets/{id}/source 溯源
  │    └─ 缺口挖掘对话：Quinn 指出薄弱环节 → 引导用户补充
  │
  └─ 导出：POST /api/v1/tailoring/{id}/exports?fmt=pdf → Blob 下载
```

**核心约束**：每条 bullet 必须有溯源。找不到清晰来源的标记为 PENDING，用户必须确认或补充后才能保留。Quinn 永远不会凭空"创作"经历。

---

## 阶段 6：投递执行 → 跟进 → 结束

### 6.1 自动填表

```
POST /api/v1/apply/plan {radarItemId}
  │
  ├─ 返回填写计划（字段名 → 建议值 + preset-from-profile 标记）
  │    ├─ 简历：刚才生成的定制版
  │    ├─ 联系方式：从 profile
  │    ├─ 开放式问题：LLM 基于 JD 草拟
  │    └─ 经验年限：从档案推断
  │
  ├─ 用户确认 → PATCH /apply/plan/{id}/approve
  │
  ├─ Content Script 自动填 LinkedIn Easy Apply 表单
  │    └─ 匹配 label → 填充值（React 兼容的 native setter）
  │
  └─ 用户亲自点 Submit（Quinn 不替用户提交）
     └─ Content Script 检测 "Application sent" → EASY_APPLY_SUBMITTED
        └─ POST /api/v1/apply/submit → Radar 状态 → SUBMITTED
```

### 6.2 跟进系统

```
投递后 3 天
  │
  ├─ Quinn 提醒（Radar 视图 Follow-up 卡片）
  │    └─ "3 天前你投了 {company} 的 {jobTitle}，有回复吗？"
  │
  ├─ "还没" → 5 天后再提醒 → 1 周后默认建议 move on
  │
  ├─ "回了" → 用户切到 Gmail → Content Script 抓取邮件
  │    └─ EMAIL_CAPTURE → 背景 → POST /api/v1/followup/emails
  │    └─ LLM 分类：INTERVIEW_INVITE / REJECTION / HR_FOLLOWUP / OTHER
  │    └─ 草拟回信（/api/v1/followup/drafts）→ 用户复制自行发送
  │
  └─ Radar 状态更新：INTERVIEW / OFFER / REJECTED
```

### 6.3 求职结束

```
用户标记 "接 offer" → Radar 状态 → OFFER
  │
  └─ FarewellTool 触发（在对话中）
     ├─ 生成复盘文档：投递数/面试数/offer 数/新挖掘闪光点
     ├─ 素材归档到档案（下次求职可用）
     ├─ 订阅自动暂停（不取消，数据保留）
     └─ Quinn 告别："这次合作就到这里了。下次你需要的时候再回来。"
```

---

## 代码路径速查

| 步骤 | 关键文件 |
|---|---|
| Landing → Install | `web/src/app/page.tsx`, `web/src/app/install/page.tsx` |
| 登录/注册 | `web/src/app/login/`, `web/src/app/signup/`, `web/src/lib/auth.tsx`, `web/src/lib/dev-auth.tsx` |
| Dashboard | `web/src/app/dashboard/page.tsx` |
| Auth (统一层) | `web/src/lib/auth.tsx`（`AuthProvider`/`useAuth`/`SignedIn`/`SignedOut`/`UserButton`）, `web/src/lib/dev-auth.tsx`（`LocalAuthProvider`/`LocalAuthContext`/`LocalSignedIn` 等） |
| Auth 桥接 | `web/src/app/auth/extension-callback/page.tsx`, `web/src/lib/extension.ts` |
| Extension 入口 | `extension/src/sidepanel/App.tsx`, `extension/src/background/index.ts`, `extension/src/background/auth.ts` |
| Onboarding | `extension/src/sidepanel/routes/Onboarding.tsx` |
| LinkedIn 抓取 | `extension/src/content-scripts/linkedin/job-detail.ts` |
| Background 消息路由 | `extension/src/background/bus.ts` |
| SSE 对话 | `extension/src/lib/sse.ts`, `extension/src/sidepanel/stores/conversation.ts` |
| 岗位分析 | `extension/src/sidepanel/routes/JobAnalysis.tsx` |
| 简历定制 | `extension/src/sidepanel/routes/Tailoring.tsx` |
| EasyApply | `extension/src/sidepanel/routes/EasyApply.tsx`, `extension/src/content-scripts/linkedin/easy-apply.ts` |
| 邮件读取 | `extension/src/content-scripts/gmail/email-reader.ts` |
| 求职雷达 | `extension/src/sidepanel/routes/Radar.tsx` |
| Backend API | `backend-ts/src/contexts/iam/iam.controller.ts`, `jobs/jobs.controller.ts`, `profile/profile.controller.ts`, `tailoring/`, `apply/`, `followup/`, `agent/` |

---

## 已知 Gap

1. **"Ask Quinn" 按钮不存在**：PRD 描述用户在 LinkedIn 岗位页点击按钮触发分析，但当前实现是 3 秒 dwell 静默自动抓取。UI 文案多处仍引用按钮，代码尚未实现。
2. **侧面板 "未登录 →" 链接 hardcode `localhost:14606`**，非生产就绪。
3. **定时 Follow-up 提醒未实现**：cron job 基础设施存在但未连线，当前只支持手动状态更新。
4. **Offer 告别 UI 流程未实现**：FarewellTool 存在但 UI 侧断开。
5. **CircuitBreaker / Guardrail 未接入 Agent loop**：模块存在但 AgentService 不调用它们。
6. **Session token 无法主动 revoke**：扩展 session token 只有 24h TTL 兜底，无 logout 端点即时删除 Redis key。web 端 logout 只清除 Clerk cookie，扩展 token 仍有效。需 `POST /auth/logout` + 扩展监听 401 清 storage。
