# FindWith v0.1 — Manual Verification Handbook

> **用途**: 手动在真实 Chrome 浏览器中验证完整用户旅程  
> **场景**: 不是逐功能测试，而是一条从"安装扩展"到"收到回信"的完整链路  
> **预计时间**: 约 25–30 分钟

---

## 前置条件

### 1. 启动开发环境

```bash
make up          # 启动所有 Docker 服务
make migrate     # 跑 DB 迁移（首次 / schema 变更后）
```

在 tmux `backend` 窗口启动 NestJS：

```bash
cd backend-ts && pnpm run start:dev
# 等到看到：Nest application successfully started
```

构建扩展（如有代码变更）：

```bash
pnpm --filter @findwith/extension build
```

### 2. 在 Chrome 加载扩展

1. 打开 `chrome://extensions`
2. 开启右上角「开发者模式」
3. 点「加载已解压的扩展程序」→ 选 `extension/dist/` 目录
4. 记录扩展 ID（应为 `fljfnjaepjaejcnplikaaejcbjhpofon`）

### 3. 重置测试数据

每次验证前执行，确保干净状态：

```bash
docker exec findwith-dev-postgres-1 psql -U findwith -d findwith -c "
  DELETE FROM profile_materials WHERE \"userId\" = 'dev-user-1';
  DELETE FROM profile_skills WHERE \"userId\" = 'dev-user-1';
  DELETE FROM profile_work_experiences WHERE \"userId\" = 'dev-user-1';
  DELETE FROM profile_education WHERE \"userId\" = 'dev-user-1';
  DELETE FROM profile_base_resumes WHERE \"userId\" = 'dev-user-1';
  DELETE FROM profile_resume_sources WHERE \"userId\" = 'dev-user-1';
  DELETE FROM profile_profiles WHERE \"userId\" = 'dev-user-1';
  DELETE FROM tailoring_bullets WHERE \"resumeId\" IN (SELECT id FROM tailoring_resumes WHERE \"userId\"='dev-user-1');
  DELETE FROM tailoring_resumes WHERE \"userId\" = 'dev-user-1';
  DELETE FROM jobs_parsed_jds WHERE \"captureId\" IN (SELECT id FROM jobs_captures WHERE \"userId\"='dev-user-1');
  DELETE FROM jobs_match_results WHERE \"userId\" = 'dev-user-1';
  DELETE FROM jobs_radar_items WHERE \"userId\" = 'dev-user-1';
  DELETE FROM jobs_captures WHERE \"userId\" = 'dev-user-1';
  DELETE FROM apply_applications WHERE \"userId\" = 'dev-user-1';
  DELETE FROM apply_fill_plans WHERE \"userId\" = 'dev-user-1';
  DELETE FROM followup_emails WHERE \"userId\" = 'dev-user-1';
  DELETE FROM followup_drafts WHERE \"userId\" = 'dev-user-1';
  DELETE FROM reco_recommendations WHERE \"userId\" = 'dev-user-1';
  DELETE FROM conv_messages WHERE \"conversationId\" IN (SELECT id FROM conv_conversations WHERE \"userId\"='dev-user-1');
  DELETE FROM conv_conversations WHERE \"userId\" = 'dev-user-1';
"
```

---

## 验证检查表

```
[ ] Phase 1: Auth 登录
[ ] Phase 2: Onboarding 简历上传 + Quinn 初次对话
[ ] Phase 3: Job Analysis 岗位分析
[ ] Phase 4: Resume Tailoring 简历定制
[ ] Phase 5: Easy Apply 自动填表
[ ] Phase 6: Email Follow-up 邮件跟进
[ ] Phase 7: Radar 求职雷达
[ ] Phase 8: Recommendations 今日推荐
[ ] Phase 9: Account & Billing 账号设置
```

---

## Phase 1 — Auth 登录

### 目的
验证扩展能接收 token 并在 side panel 显示登录态，不需要页面刷新。

### 步骤

1. 点击 Chrome 工具栏中的 FindWith 图标，打开 Side Panel
2. **预期**: 顶栏显示红色「未登录 →」链接
3. 打开 Side Panel 的 DevTools（右键 Side Panel 页面 → 检查）
4. 在 Console 中注入 dev token：
   ```js
   const {token} = await (await fetch('http://localhost:14611/sign', {
     method: 'POST',
     headers: {'Content-Type':'application/json'},
     body: JSON.stringify({sub:'dev-user-1'})
   })).json();
   await chrome.storage.local.set({token});
   ```
5. **预期（无需刷新）**: 顶栏绿点亮起，显示用户名或邮箱（`dev-user-1@findwith.test`）

### 通过标志
- 顶栏从「未登录」变为「dev-user-1@findwith.test」，**不需要**刷新或重新打开 panel

---

## Phase 2 — Onboarding：简历上传 + Quinn 初次提问

### 目的
验证完整的 onboarding 链路：上传 → 异步解析 → 档案展示 → Quinn 发起首次深度挖掘对话。

### 步骤

1. Side Panel 应显示 Onboarding 界面（`data-testid="onboarding-view"`）
2. 点击「上传简历」按钮（`data-testid="upload-resume-btn"`）
3. 选择 `e2e/fixtures/files/resume-senior-pm.pdf`
4. **预期（立即）**: 出现「解析中…」提示（`data-testid="upload-success"`）
5. **预期（30 秒内）**: 出现档案摘要卡片（`data-testid="profile-summary"`），显示姓名、教育、工作经历
6. **预期（再 10 秒内）**: Quinn 发出第一条消息（`data-testid="agent-message"`），内容是关于简历里某段经历的追问，例如：
   > "你简历里写了 X 项目，能多说一点当时的挑战吗？"

7. 在输入框（`data-testid="message-input"`）中回答 Quinn 的问题，例如：
   > "这个项目我从零开始搭建了数据 pipeline，上线后把报表生成时间从 4 小时压到 10 分钟。"

8. 点击发送（`data-testid="send-btn"`）
9. **预期**: Quinn 回复，继续深挖，或点头认可并沉淀为素材（可能出现「已记录到素材库」提示）

### 验证 DB（可选）
```bash
docker exec findwith-dev-postgres-1 psql -U findwith -d findwith -c \
  "SELECT \"parseStatus\" FROM profile_resume_sources WHERE \"userId\" = 'dev-user-1';"
# Expected: DONE

docker exec findwith-dev-postgres-1 psql -U findwith -d findwith -c \
  "SELECT \"basicInfo\"->>'fullName' FROM profile_profiles WHERE \"userId\" = 'dev-user-1';"
# Expected: 简历中的姓名
```

### 通过标志
- 档案摘要展示姓名和至少一条工作经历
- Quinn 发出了和简历内容相关的追问（不是模板问候语）
- 用户回答后 Quinn 有实质性回应

---

## Phase 3 — Job Analysis：岗位分析

### 目的
验证 content script 注入 → JD 抓取 → 异步 LLM 分析 → side panel 展示匹配结果 → Quinn 主动问「要投吗？」的完整链路。

### 步骤

1. 在 Chrome 中打开 `http://localhost:14608/linkedin-job.html`（mock LinkedIn 岗位页）
2. **预期**: 页面岗位卡片右上角出现「Ask Quinn」按钮（由 content script 注入）
3. 点击「Ask Quinn」
4. **预期（立即）**: Side Panel 激活，显示「分析中…」（`data-testid="job-analysis-pending"`）
5. **预期（15 秒内）**: 分析完成（`data-testid="job-analysis-complete"`），显示：
   - 表面匹配 % / 深层匹配 %（`data-testid="match-scores"`）
   - 技能缺口列表（`data-testid="gap-list"`）
   - 公司速读（`data-testid="company-summary"`）
6. **预期（再 10 秒内）**: Quinn 发出消息（`data-testid="agent-message"`）询问是否要投，类似：
   > "看完这个岗位，你想投吗？"

7. 在输入框中回复：**「想投」**
8. **预期**: Quinn 回应，表示开始为你定制简历，Side Panel 切换或提示进入定制流程

### 通过标志
- 「Ask Quinn」按钮出现在 mock 岗位页（说明 content script 已加载）
- 匹配分数 > 0（说明档案已被读取）
- Quinn 主动发起了「要不要投」的对话，**不是**用户手动触发
- 用户回复「想投」后，Quinn 有明确的下一步引导

---

## Phase 4 — Resume Tailoring：简历定制

### 目的
验证从「决定投递」到「生成定制 bullets → gap mining 对话 → 确认 bullet → 导出 PDF」的完整定制链路。

> **前提**: Phase 3 已完成，Quinn 已接收到「想投」的意图

### 步骤

1. Side Panel 应已进入定制视图（`data-testid="tailoring-view"`）
   - 若未自动跳转，检查后台日志是否有 BullMQ 错误
2. **预期（20 秒内）**: `data-testid="tailoring-loading"` 消失，显示：
   - 定制前匹配分（`data-testid="match-score-before"`）
   - 至少 1 条 bullet 卡片（`data-testid="bullet-item"`）
3. **预期**: Quinn 开始 gap mining 对话，例如：
   > "这个岗位强调 stakeholder management，但你档案里这块的素材薄弱。能聊聊你做过的项目里，有没有跨团队推动事情的例子？"

4. 在输入框中回答，描述一个跨团队协作的经历
5. **预期**: Quinn 回复并把新经历沉淀到素材库，bullet 列表实时更新，匹配分上升
6. 点击一条 bullet 卡片，尝试内联编辑文本（如缩短或修改措辞）
7. 点击 `data-testid="export-btn"`
8. **预期**: 浏览器弹出下载 `resume.pdf`，文件大小 > 1 KB

### 验证 PDF
下载后用系统预览打开，确认：
- 有姓名和联系方式
- 至少有一条 Work Experience bullet（来自素材库）
- 非空白页

### 通过标志
- Bullets 由 LLM 根据素材库生成（不是样板文字）
- Gap mining 对话与当前岗位 JD 内容相关
- PDF 成功下载，内容非空

---

## Phase 5 — Easy Apply：自动填表

### 目的
验证 Quinn 生成填表方案 → 用户审核 → 自动注入表单字段 → 用户手动 Submit → 记录投递 → 雷达更新为 APPLIED 的完整链路。

### 步骤

1. 在 Chrome 新标签页打开 `http://localhost:14608/easy-apply.html`（mock Easy Apply 表单）
2. **预期**: Side Panel 自动切换到 Easy Apply 视图，显示填表方案（字段列表）
   - 若未自动触发，可在 Side Panel DevTools Console 手动触发：
     ```js
     chrome.runtime.sendMessage({type:'EASY_APPLY_FORM', tabId: chrome.devtools?.inspectedWindow?.tabId})
     ```
3. **预期**: 看到填表方案卡片，包含字段列表（姓名、邮箱、Why interested 等），以及要使用的简历版本
4. 逐项检查字段值是否合理（来源于档案 / 上一步的定制简历）
5. 点击「**Approve & Fill**」按钮
6. **预期**: 切换到 `easy-apply.html` 标签页，表单字段已被自动填入
7. 手动点击表单中的「**Submit Application**」按钮
8. **预期**: Side Panel 出现「**Record Submission**」按钮
9. 点击「Record Submission」
10. **预期**: 出现「已记录投递」确认提示

### 验证 DB（可选）
```bash
docker exec findwith-dev-postgres-1 psql -U findwith -d findwith -c \
  "SELECT status FROM jobs_radar_items WHERE \"userId\" = 'dev-user-1' ORDER BY \"createdAt\" DESC LIMIT 1;"
# Expected: APPLIED
```

### 通过标志
- 填表方案中的字段值来自真实档案（不是占位符）
- `easy-apply.html` 表单字段被实际填入（可在页面检查 input value）
- 点击「Record Submission」后雷达状态变为 APPLIED

---

## Phase 6 — Email Follow-up：邮件跟进

### 目的
验证 Quinn 读取招聘邮件 → 解读类型 → 生成回信草稿的完整邮件链路。

> **场景**: 投递后 3 天，用户打开 Gmail，发现一封面试邀请邮件

### 步骤

1. 在 Chrome 新标签页打开 `http://localhost:14608/gmail.html`（mock Gmail 邮件页，内含面试邀请）
2. **预期（10 秒内）**: Side Panel 出现提示，显示 Quinn 已读取邮件，内容类似：
   > "这是一封面试邀请。他们希望安排一次 30 分钟的电话面试，时间是下周二下午 2 点。需要我帮你草拟回信吗？"

3. 在输入框中回复：**「帮我草拟一下」**
4. **预期**: Quinn 在对话区展示回信草稿，包含：
   - 表达感谢
   - 确认时间
   - 专业签名
5. 草稿旁有「复制」按钮，点击后可直接粘贴到 Gmail

> **注意**: Quinn 不会替用户自动发送邮件，最终需要用户自己在 Gmail 粘贴并点 Send。这是产品边界。

### 通过标志
- Side Panel 主动显示邮件解读（用户未手动触发）
- 邮件类型识别正确（INTERVIEW_INVITE，而非 REJECTION）
- 草稿内容与邮件上下文相关，不是通用模板

---

## Phase 7 — Radar：求职雷达

### 目的
验证雷达 Tab 显示正确的岗位状态，以及状态转换机制生效。

### 步骤

1. 点击 Side Panel 底部的「**雷达**」Tab
2. **预期**: 进入雷达视图（`data-testid="radar-view"`），看到至少一条岗位卡片（`data-testid="radar-item"`）
3. 确认该卡片的状态徽章（`data-testid="radar-status-badge"`）显示「**已投递**」（对应 APPLIED）
4. 查看岗位名称和公司名，应与 Phase 3 分析过的岗位一致
5. 点击「刷新」按钮（`data-testid="refresh-btn"`）确认列表刷新正常

### 状态机完整性验证（可选深度测试）

用 DevTools Console 手动推进状态，验证非法跳转被拒绝：

```js
// 在 Side Panel DevTools Console 中执行
const token = (await chrome.storage.local.get('token')).token;
const radarId = document.querySelector('[data-testid="radar-item"]')?.dataset?.itemId;

// 合法跳转: APPLIED → INTERVIEWING
const r1 = await fetch(`http://localhost:14607/api/v1/jobs/${radarId}/radar`, {
  method: 'PATCH',
  headers: {'Content-Type':'application/json','Authorization':`Bearer ${token}`},
  body: JSON.stringify({status:'INTERVIEWING'})
});
console.log('INTERVIEWING:', r1.status); // 预期: 200

// 非法跳转: INTERVIEWING → OFFER_ACCEPTED（跳过 OFFER_RECEIVED）
const r2 = await fetch(`http://localhost:14607/api/v1/jobs/${radarId}/radar`, {
  method: 'PATCH',
  headers: {'Content-Type':'application/json','Authorization':`Bearer ${token}`},
  body: JSON.stringify({status:'OFFER_ACCEPTED'})
});
console.log('非法跳转应被拒绝:', r2.status); // 预期: 403
```

### 通过标志
- 雷达卡片状态与实际投递操作一致（APPLIED）
- 刷新按钮有效
- 非法状态跳转返回 403

---

## Phase 8 — Recommendations：今日推荐

### 目的
验证按需构建推荐 + 邮件发送链路（每日 08:00 UTC 自动运行，此处手动触发）。

### 步骤

1. 在 Side Panel DevTools Console 中触发推荐构建：
   ```js
   const token = (await chrome.storage.local.get('token')).token;
   const r = await fetch('http://localhost:14607/api/v1/recommendations/build', {
     method: 'POST',
     headers: {'Content-Type':'application/json','Authorization':`Bearer ${token}`},
     body: JSON.stringify({query:'product manager fintech remote'})
   });
   const data = await r.json();
   console.log('推荐条数:', data.items?.length);
   ```
2. **预期**: 返回包含至少 1 条岗位推荐的响应
3. 在浏览器打开 `http://localhost:14605`（Mailpit 收件箱）
4. **预期**: 看到一封新邮件，主题类似「Quinn found N jobs for you today」，收件人为 `dev@findwith.test`
5. 点开邮件，确认包含岗位卡片和跳转链接

### 通过标志
- API 返回推荐结果（哪怕是 stub 数据，条数 ≥ 1）
- Mailpit 收到邮件（说明 SMTP → Mailpit 链路通畅）
- 邮件内容包含可点击的岗位链接

---

## Phase 9 — Account & Billing：账号设置

### 目的
验证用户设置、权益查询、GDPR 数据导出等账号功能。

### 步骤

**陪伴密度切换：**

1. 打开 Side Panel，找到设置入口（点击顶栏「⋯」或「设置」按钮）
2. 将陪伴密度从「标准」切换为「安静」
3. **预期**: 切换后立即生效，Quinn 的主动提问频率降低（对话界面有对应提示）

**权益查询（DevTools Console）：**
```js
const token = (await chrome.storage.local.get('token')).token;
const e = await (await fetch('http://localhost:14607/api/v1/iam/me/entitlements', {
  headers: {'Authorization': `Bearer ${token}`}
})).json();
console.log('tier:', e.tier, '| tailoringQuota:', e.tailoringQuota);
// 预期: tier: PRO | tailoringQuota: 999
```

**GDPR 数据导出：**
```js
const token = (await chrome.storage.local.get('token')).token;
const r = await fetch('http://localhost:14607/api/v1/iam/account:export', {
  method: 'POST',
  headers: {'Authorization': `Bearer ${token}`}
});
const data = await r.json();
console.log('导出字段:', Object.keys(data).sort().join(', '));
// 预期: conversationSummary, exportedAt, materials, profile, quota, radar,
//        schemaVersion, settings, subscription, user
```

### 通过标志
- 密度切换后 API 返回新值（不是 404 或 500）
- 权益显示 tier=PRO
- GDPR 导出包含 profile、materials、radar 等核心字段

---

## 完整旅程回顾

完成全部 9 个 Phase 后，用户状态应如下：

```
Profile    ✓  简历已解析，素材库有至少 1 条经历（通过 Quinn 对话挖掘）
Radar      ✓  有 1 条岗位，状态 APPLIED（经过分析 → 定制 → 填表 → 提交完整路径）
Tailoring  ✓  有 1 份定制简历，PDF 已导出
Followup   ✓  有 1 封已读邮件，有回信草稿
Reco       ✓  Mailpit 有推荐邮件
```

这条链路覆盖了产品核心价值主张：**Quinn 从你浏览岗位开始，到回信面试邀请，全程陪伴**。

---

## 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| 「Ask Quinn」按钮不出现 | Content script 未注入 | 检查 `chrome://extensions` 中扩展有无错误；确认 `manifest.json` 的 `content_scripts` 匹配 `*://localhost:14608/*` |
| 分析卡在「待分析」超过 30 秒 | BullMQ job 失败 | `tmux capture-pane -pt findwith:backend` 看报错；检查 LLM 配置是否正确 |
| Side Panel 显示「未登录」但已注入 token | Token 注入后需要扩展后台接收 | 注入后执行 `location.reload()` 或重新打开 Side Panel |
| Easy Apply 表单没有被填入 | Content script tabId 不匹配 | 关闭并重新打开 `easy-apply.html` 标签，再点 Approve & Fill |
| Mailpit 收不到邮件 | SMTP 配置缺失 | 确认 `.env` 中有 `SMTP_HOST=localhost` 和 `SMTP_PORT=14604` |
| Bullets 全部 PENDING 无法导出 PDF | 材料状态为 PROPOSED | 需通过 Quinn 对话让材料状态变为 CONFIRMED，或手动 PATCH |
