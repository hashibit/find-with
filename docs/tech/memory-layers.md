---
现状分析

系统已有的基础设施：

┌──────────────────────────────────┬──────────────────────────────────────────────┐
│               组件                   │                     现状                     │
├──────────────────────────────────┼──────────────────────────────────────────────┤
│ ConvConversation.rollingSummary  │ 字段存在，无写入逻辑                           │
├──────────────────────────────────┼──────────────────────────────────────────────┤
│ ConvConversation.importantQuotes │ 字段存在，完全未使用                         │
├──────────────────────────────────┼──────────────────────────────────────────────┤
│ ProfileMaterial.embedding        │ 字段存在，无生成逻辑                         │
├──────────────────────────────────┼──────────────────────────────────────────────┤
│ LlmService.embed()               │ 方法存在，无调用方                           │
├──────────────────────────────────┼──────────────────────────────────────────────┤
│ ContextBuilderService            │ 永远注入前 20 条按时间排序的素材，无语义检索 │
├──────────────────────────────────┼──────────────────────────────────────────────┤
│ 历史消息加载                     │ 固定取最近 30 条，无压缩机制                 │
└──────────────────────────────────┴──────────────────────────────────────────────┘

核心问题：Quinn 在同一 conversation 内有记忆，但跨 conversation 的记忆、跨 session 的用户偏好、语义相关素材召回均未实现。
---

记忆分层模型

┌────────────────────────────────────────────────────────────────┐
│ Layer 4: 目标记忆（Goal Memory） │
│ UserGoalMemory 实体 — 永久、可更新 │
│ "用户想要什么、不要什么" │
├────────────────────────────────────────────────────────────────┤
│ Layer 3: 语义记忆（Semantic Memory） │
│ ProfileMaterial.embedding — 向量检索 │
│ "用户的闪光点库按相关性召回" │
├────────────────────────────────────────────────────────────────┤
│ Layer 2: 片段记忆（Episodic Memory） │
│ ConvConversation.rollingSummary — 每 conversation 滚动摘要 │
│ "这段对话说了什么关键事" │
├────────────────────────────────────────────────────────────────┤
│ Layer 1: 工作记忆（Working Memory） │
│ conv_messages 最近 N 条 — 当前 session 上下文窗口 │
└────────────────────────────────────────────────────────────────┘

---

Layer 1：工作记忆优化

当前问题：固定取 30 条，token 消耗不可控，且不区分重要性。

方案：引入消息分级加载策略。

// context-builder.service.ts
async buildMessageHistory(conversationId: string): Promise<Message[]> {
const messages = await this.msgRepo.find({
where: { conversationId, archived: false },
order: { createdAt: 'DESC' },
take: 20,
});

// 倒序取回 → 正序排列
return messages.reverse();
}

新增 archived: boolean 字段到 ConvMessage，被压缩进 rollingSummary 的消息标记 archived = true，不再加载到 context 中。

---

Layer 2：片段记忆 — Rolling Summary

触发条件：每次 agent turn 完成后，若 archived = false 的消息数超过 20 条，触发压缩。

压缩逻辑：

// memory-formation.service.ts
async compressConversation(conversationId: string): Promise<void> {
const activeMessages = await this.msgRepo.find({
where: { conversationId, archived: false },
order: { createdAt: 'ASC' },
});

if (activeMessages.length <= 20) return;

// 保留最近 10 条不压缩（保持对话连贯性）
const toCompress = activeMessages.slice(0, activeMessages.length - 10);
const existingSummary = await this.getConversationSummary(conversationId);

const newSummary = await this.llmService.completeContext(
buildSummarizationContext(toCompress, existingSummary)
);

await this.convRepo.update(conversationId, { rollingSummary: newSummary });
await this.msgRepo.update(
toCompress.map(m => m.id),
{ archived: true }
);
}

摘要生成 prompt 要点：

Given this conversation segment and the existing summary, produce an updated summary.
Focus on:

- Jobs discussed and user's interest level (apply/skip/undecided)
- Experiences and skills the user mentioned
- Preferences stated explicitly ("I don't want startups", "remote only")
- Decisions made
- Shining points identified
- Open threads (things Quinn asked but user didn't answer yet)

Existing summary: {existingSummary}
New messages: {messages}

Output: plain text, under 400 words, no bullet headers.

Context 注入方式：

// context-builder.service.ts - buildSystemPrompt()
if (conversation.rollingSummary) {
systemPrompt += `\n\n## Earlier in this conversation\n${conversation.rollingSummary}`;
}

---

Layer 3：语义记忆 — 素材向量检索

当前问题：前 20 条素材按时间排序注入，当素材库达到 50+ 条时，相关性低的素材占位、高价值素材不在窗口。

方案：对有 JD 锚点的 scene（JOB_ANALYSIS、TAILOR_EDIT、GAP_MINING）使用语义检索。

Embedding 生成时机

1. MineShiningPointTool 执行后立即嵌入：

// mine-shining-point.tool.ts - 在存入 DB 后
const embedding = await this.llmService.embed(shiningText);
await this.materialRepo.update(material.id, { embedding });

2. 存量素材补全（BullMQ 任务）：

// MEMORY_QUEUE job: BACKFILL_EMBEDDINGS
async backfillEmbeddings(userId: string): Promise<void> {
const materials = await this.materialRepo.find({
where: { userId, status: MaterialStatus.CONFIRMED, embedding: IsNull() },
});

for (const m of materials) {
const embedding = await this.llmService.embed(m.shiningText);
await this.materialRepo.update(m.id, { embedding });
await sleep(100); // rate limit
}
}

语义检索实现

PostgreSQL pgvector 扩展已通过 embedding vector(1536) 字段声明：

-- 新增索引
CREATE INDEX profile_materials_embedding_idx
ON profile_materials USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

// material.repository.ts
async semanticSearch(
userId: string,
queryEmbedding: number[],
topK = 8
): Promise<ProfileMaterial[]> {
return this.createQueryBuilder('m')
.where('m.userId = :userId', { userId })
.andWhere('m.status = :status', { status: MaterialStatus.CONFIRMED })
.andWhere('m.embedding IS NOT NULL')
.orderBy('m.embedding <=> :embedding', 'ASC') // cosine distance
.setParameter('embedding', `[${queryEmbedding.join(',')}]`)
.limit(topK)
.getMany();
}

ContextBuilderService 更新

async buildMaterialContext(userId: string, anchorJdId?: string): Promise<string> {
let materials: ProfileMaterial[];

if (anchorJdId) {
const jd = await this.jdRepo.findOne({ where: { id: anchorJdId } });
if (jd?.jdEmbedding) {
// 语义检索：最相关的 8 条
materials = await this.materialRepo.semanticSearch(
userId, jd.jdEmbedding, 8
);
}
}

// fallback：按时间取前 20 条（现有逻辑）
if (!materials?.length) {
materials = await this.materialRepo.find({
where: { userId, status: MaterialStatus.CONFIRMED },
order: { createdAt: 'DESC' },
take: 20,
});
}

return materials.map(m => `- ${m.shiningText} [${m.tags.join(', ')}]`).join('\n');
}

---

Layer 4：目标记忆 — UserGoalMemory

新实体，记录从对话中提炼出的用户长期求职偏好：

// user-goal-memory.entity.ts
@Entity('user_goal_memory')
export class UserGoalMemory {
@PrimaryColumn('varchar', { length: 26 })
userId: string; // ULID, 1:1 with user

@Column({ type: 'jsonb', default: [] })
targetRoles: string[]; // ['Product Manager', 'Senior PM']

@Column({ type: 'jsonb', default: [] })
targetIndustries: string[]; // ['fintech', 'devtools']

@Column({ type: 'jsonb', default: [] })
locationPrefs: string[]; // ['remote', 'San Francisco', 'NYC']

@Column({ type: 'jsonb', default: [] })
dealBreakers: string[]; // ['no equity', 'pure management', 'agency']

@Column({ type: 'jsonb', default: [] })
preferredStages: string[]; // ['series-b', 'series-c', 'growth']

@Column({ nullable: true })
salaryFloorUsd: number;

@Column({ type: 'text', nullable: true })
shortTermGoal: string; // 自由文本，Quinn 提炼

@Column({ type: 'jsonb', default: [] })
rawStatements: string[]; // 用户原话（用于可溯源性）

@Column()
updatedAt: Date;
}

偏好提炼触发时机

会话结束后（通过 BullMQ），或当 MineShiningPointTool 触发（说明用户在进行档案挖掘）：

// memory-formation.service.ts
async extractGoalPreferences(conversationId: string, userId: string): Promise<void> {
const messages = await this.msgRepo.find({
where: { conversationId },
order: { createdAt: 'ASC' },
});

const existing = await this.goalRepo.findOne({ where: { userId } })
?? new UserGoalMemory();

const prompt = buildPreferenceExtractionPrompt(messages, existing);
const result = await this.llmService.completeContext(prompt);
const parsed = JSON.parse(result); // structured JSON output

await this.goalRepo.upsert({
userId,
...mergeGoalMemory(existing, parsed),
updatedAt: new Date(),
}, ['userId']);
}

提炼 prompt 结构（返回 JSON）：

Given the conversation transcript and the user's existing preferences,
extract or update job search preferences.

Return JSON:
{
"targetRoles": ["..."],
"targetIndustries": ["..."],
"locationPrefs": ["..."],
"dealBreakers": ["..."],
"preferredStages": ["..."],
"salaryFloorUsd": null | number,
"shortTermGoal": "...",
"rawStatements": ["direct quotes from user"]
}

Rules:

- Only include fields where there's evidence in this conversation
- Do NOT infer or hallucinate preferences not explicitly stated
- dealBreakers: things user said they don't want (companies, cultures, tasks)
- rawStatements: copy exact user phrases that reveal preferences

Existing preferences: {existing}
Conversation: {transcript}

Context 注入

// context-builder.service.ts
async buildGoalMemoryContext(userId: string): Promise<string> {
const goals = await this.goalRepo.findOne({ where: { userId } });
if (!goals) return '';

const parts: string[] = [];
if (goals.targetRoles.length)
parts.push(`Target roles: ${goals.targetRoles.join(', ')}`);
if (goals.locationPrefs.length)
parts.push(`Location: ${goals.locationPrefs.join(', ')}`);
if (goals.dealBreakers.length)
parts.push(`Deal breakers: ${goals.dealBreakers.join(', ')}`);
if (goals.salaryFloorUsd)
parts.push(`Minimum salary: $${goals.salaryFloorUsd.toLocaleString()}`);
if (goals.shortTermGoal)
parts.push(`Goal: ${goals.shortTermGoal}`);

if (!parts.length) return '';
return `## What I know about your preferences\n${parts.join('\n')}`;
}

---

跨 Conversation 上下文

新 conversation 开始时（ContextBuilderService.build() 入口），注入前几次同类型会话的摘要：

async buildCrossSessionContext(
userId: string,
kind: ConversationKind,
excludeId: string
): Promise<string> {
const recent = await this.convRepo.find({
where: {
userId,
kind,
id: Not(excludeId),
rollingSummary: Not(IsNull())
},
order: { updatedAt: 'DESC' },
take: 2,
});

if (!recent.length) return '';

const summaries = recent.map((c, i) =>
`[Session ${i + 1} ago]: ${c.rollingSummary}`
).join('\n\n');

return `## Context from previous sessions\n${summaries}`;
}

---

新 BullMQ 队列：MEMORY_QUEUE

export const MEMORY_QUEUE = 'memory';

export type MemoryJob =
| { type: 'COMPRESS_CONVERSATION'; conversationId: string }
| { type: 'EXTRACT_PREFERENCES'; conversationId: string; userId: string }
| { type: 'EMBED_MATERIAL'; materialId: string }
| { type: 'BACKFILL_EMBEDDINGS'; userId: string };

触发点：

┌───────────────────────────┬─────────────────────────────────────────┐
│ 事件 │ 触发任务 │
├───────────────────────────┼─────────────────────────────────────────┤
│ Agent turn 完成 │ COMPRESS_CONVERSATION（检查是否超阈值） │
├───────────────────────────┼─────────────────────────────────────────┤
│ MineShiningPointTool 执行 │ EMBED_MATERIAL │
├───────────────────────────┼─────────────────────────────────────────┤
│ 用户首次登录 │ BACKFILL_EMBEDDINGS │
├───────────────────────────┼─────────────────────────────────────────┤
│ Conversation 被关闭 │ EXTRACT_PREFERENCES │
└───────────────────────────┴─────────────────────────────────────────┘

---

最终 Context 构建顺序

// context-builder.service.ts - buildContext()

async buildContext(opts: BuildContextOpts): Promise<Context> {
const sections = await Promise.all([
this.buildBaseSystemPrompt(), // Quinn 人格
this.buildGoalMemoryContext(userId), // Layer 4: 目标偏好
this.buildCrossSessionContext(...), // Layer 2: 跨 session 摘要
this.buildUserProfileContext(userId), // 档案结构化信息
this.buildMaterialContext(userId, anchorJdId), // Layer 3: 语义素材
]);

const systemPrompt = sections.filter(Boolean).join('\n\n');

// Layer 1 + Layer 2（当前 session）
const messages = await this.buildMessageHistory(conversationId);
if (conversation.rollingSummary) {
systemPrompt += `\n\n## Earlier in this conversation\n${conversation.rollingSummary}`;
}

return buildPiAiContext(systemPrompt, messages, tools);
}

---

数据库变更汇总

-- 1. ConvMessage 新增归档标记
ALTER TABLE conv_messages ADD COLUMN archived boolean NOT NULL DEFAULT false;
CREATE INDEX ON conv_messages (conversation_id, archived, created_at);

-- 2. 新建目标记忆表
CREATE TABLE user_goal_memory (
user_id varchar(26) PRIMARY KEY,
target_roles jsonb NOT NULL DEFAULT '[]',
target_industries jsonb NOT NULL DEFAULT '[]',
location_prefs jsonb NOT NULL DEFAULT '[]',
deal_breakers jsonb NOT NULL DEFAULT '[]',
preferred_stages jsonb NOT NULL DEFAULT '[]',
salary_floor_usd integer,
short_term_goal text,
raw_statements jsonb NOT NULL DEFAULT '[]',
updated_at timestamptz NOT NULL
);

-- 3. 向量索引（已有 embedding 列，需建索引）
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX profile_materials_embedding_idx
ON profile_materials USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

---

实现优先级

┌────────┬───────────────────────────────────────┬───────────────────────────────┐
│ 优先级 │ 任务 │ 影响 │
├────────┼───────────────────────────────────────┼───────────────────────────────┤
│ P0 │ Rolling summary 压缩逻辑 + 归档字段 │ 解决长对话 context 膨胀问题 │
├────────┼───────────────────────────────────────┼───────────────────────────────┤
│ P0 │ MineShiningPointTool 执行后立即 embed │ 为语义检索提供数据基础 │
├────────┼───────────────────────────────────────┼───────────────────────────────┤
│ P1 │ 语义素材检索（替换前 20 条时序逻辑） │ 素材库增长后 context 精准度 │
├────────┼───────────────────────────────────────┼───────────────────────────────┤
│ P1 │ UserGoalMemory 实体 + 提炼逻辑 │ Quinn 跨 session 记住用户偏好 │
├────────┼───────────────────────────────────────┼───────────────────────────────┤
│ P1 │ 跨 session 摘要注入 │ 新 conversation 有历史上下文 │
├────────┼───────────────────────────────────────┼───────────────────────────────┤
│ P2 │ 存量素材 embedding 补全 │ 历史数据可用于语义检索 │
└────────┴───────────────────────────────────────┴───────────────────────────────┘
