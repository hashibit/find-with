# FindWith Admin Console 技术方案

> **范围**：面向 FindWith 运营团队的内部管理控制台，涵盖队列可观测性、用户管理、系统健康、业务指标四大模块。
> **更新日期**：2026-06-03
> **前提**：后端为 NestJS + BullMQ + TypeORM + PostgreSQL + Redis，无现有 admin 基础设施。

---

## 一、为什么现在要做

当前系统"黑盒"清单：

| 场景 | 现状 | 风险 |
|---|---|---|
| BullMQ job 失败 | 无告警，无界面，靠手查 Redis key | 简历解析卡住用户无人知晓 |
| 用户订阅状态异常 | 只能连 DB 手跑 SQL | 支持请求无法快速响应 |
| LLM 工具调用失败 | Pino 日志存在，无聚合视图 | 定位问题 MTTR 高 |
| 业务北极星（接 offer 率）| 数据在 DB，没有仪表盘 | 产品决策无数据依据 |
| GDPR 删除请求 | AccountPurgeSaga 状态只在 DB | 合规验证无工具 |

---

## 二、需求范围

### 2.1 必须有（v1）

1. **队列监控**：MEMORY / RESUME_PARSE / JOB_ANALYZE / TAILORING 四条队列的实时状态，支持重试失败 job
2. **用户管理**：搜索用户、查看档案/订阅/配额使用、手动触发 GDPR 删除
3. **系统健康**：Redis / Postgres / LLM provider / S3 心跳，queue 积压告警
4. **业务指标**：日注册、Free→Pro 转化、每日 job 分析量、接 offer 事件数

### 2.2 不做（v1 之外）

- 内容审核（v0.1 产品无 UGC 风险）
- 批量操作用户数据
- 自定义 LLM prompt 热更新（有专用 runbook）
- 多管理员权限分级

---

## 三、技术选型

### 3.1 队列监控：Bull Board

**选择**：[@bull-board/nestjs](https://github.com/felixmosh/bull-board) 官方 NestJS adapter

**理由**：
- BullMQ 原生支持，零 queue adapter 代码
- 提供 UI：active / waiting / delayed / failed / completed job 分页查看
- 支持 retry / promote / remove job
- Mount 到 `/admin/queues`，路由层加 admin guard 即可

**拒绝**：自研队列 UI（工作量高，维护成本高）

### 3.2 管理控制台 UI：AdminJS

**选择**：[AdminJS](https://adminjs.co/) + `@adminjs/nestjs` + `@adminjs/typeorm`

**理由**：
- TypeORM entity → admin CRUD 面板，零 boilerplate
- 支持自定义 action（触发 GDPR purge、手动重发 webhook 等）
- 内置认证 adapter（接我们自己的 admin guard）
- Mount 到 `/admin`

**拒绝**：
- Retool / Metabase（外部 SaaS，数据出境，成本高）
- 全自研 React 后台（v1 不值得）

### 3.3 指标存储：PostgreSQL（已有）

v1 不引入 Prometheus/Grafana，直接在 admin API 层聚合 DB 查询返回指标。

**原因**：
- 现有 `TelemetryEvent`、`QuotaConsumeLog`、`QuotaUsageCounter` 实体已有足够业务数据
- 引入新存储栈（InfluxDB / Prometheus）是 v1 过度设计
- 数据量在 v0.1 阶段（<1万用户）不会构成 OLAP 压力

**v2 演进点**：当日查询 p99 > 500ms 时迁移到 TimescaleDB 或 Grafana Cloud。

### 3.4 认证：独立 Admin Secret + IP Allowlist

**方案**：
```
X-Admin-Secret: <env:ADMIN_SECRET>  # 请求头
```
+ Cloudflare WAF IP allowlist（只允许 VPN IP 访问 `/admin/*`）

**拒绝**：接 Clerk（admin 用户不应走同一身份系统）

---

## 四、架构设计

### 4.1 部署位置

Admin console **同进程挂载**到现有 NestJS app，通过路由前缀 `/admin` 和 guard 隔离：

```
api.findwith.com/v1/*          → 用户 API（Clerk JWT auth）
api.findwith.com/admin/*       → Admin UI（Admin Secret + IP allowlist）
api.findwith.com/admin/queues  → Bull Board（同 guard）
```

**不单独部署**的理由：v1 运维复杂度优先，共享同一 TypeORM 连接和 Redis 连接。

### 4.2 模块结构

```
backend-ts/src/
└── admin/                         # 新增模块
    ├── admin.module.ts            # AdminJS + BullBoard 注册
    ├── admin.guard.ts             # X-Admin-Secret 校验
    ├── metrics/
    │   ├── metrics.service.ts     # 聚合查询服务
    │   └── metrics.controller.ts  # GET /admin/api/metrics/*
    ├── health/
    │   ├── health.service.ts      # Redis / Postgres / LLM / S3 probe
    │   └── health.controller.ts   # GET /admin/api/health
    └── resources/                 # AdminJS resource 配置
        ├── user.resource.ts       # IamUser entity
        ├── subscription.resource.ts
        ├── quota.resource.ts
        ├── purge-saga.resource.ts
        └── webhook-event.resource.ts
```

### 4.3 AdminJS 资源配置原则

每个 resource：

| 资源 | 展示字段 | 允许操作 | 禁止操作 |
|---|---|---|---|
| `IamUser` | id, clerkId, email, createdAt, status | list, show | edit, delete（防误操作） |
| `BillingSubscription` | userId, plan, status, stripeSubId, currentPeriodEnd | list, show, custom:force-dormant | delete |
| `QuotaUsageCounter` | userId, featureKey, count, windowStart | list, show | all edit |
| `AccountPurgeSaga` | userId, status, step, errorMessage | list, show, custom:retry-purge | delete |
| `IamWebhookEvent` | eventId, source, type, status, error | list, show, custom:replay | delete |

**自定义 Action 实现**（AdminJS action hook 骨架）：

```typescript
// 所有 custom action 执行后必须写入 AuditLog（见 §6.4）
{
  action: {
    name: 'trigger-gdpr-purge',
    actionType: 'record',
    handler: async (request, response, context) => {
      const userId = context.record.id();
      await accountPurgeSagaService.initiate(userId);
      await auditLogRepo.save({ action: 'trigger-gdpr-purge', targetId: userId });
      return { notice: { message: 'GDPR purge initiated', type: 'success' } };
    }
  }
}
```

> **注**：Bull Board 用 Express middleware 校验 secret，AdminJS resource action 用 NestJS guard。两套机制需分别实现 secret 校验逻辑（timingSafeEqual），详见 §6.1。

---

## 五、功能详细设计

### 5.1 队列监控

**Bull Board 配置**：

```typescript
// admin.module.ts
BullBoardModule.forRoot({
  route: '/admin/queues',
  adapter: ExpressAdapter,
  middleware: adminGuardMiddleware,  // X-Admin-Secret 校验
}),
BullBoardModule.forFeature({
  queues: [
    new BullMQAdapter(memoryQueue),
    new BullMQAdapter(resumeParseQueue),
    new BullMQAdapter(jobAnalyzeQueue),
    new BullMQAdapter(tailoringQueue),
  ],
}),
```

**页面能力**：
- 每条队列：active / waiting / delayed / failed / completed count
- failed job 详情：payload + error stack + 重试次数
- 操作：Retry / Remove / Promote（delayed → waiting）

**OutboxEvent 积压监控**（AdminJS only-read resource）：

```typescript
// outbox-event.resource.ts
{
  resource: OutboxEvent,
  options: {
    actions: { new: { isAccessible: false }, edit: { isAccessible: false }, delete: { isAccessible: false } },
    filterProperties: ['dispatchedAt', 'consumerGroup', 'eventType'],
  }
}
```

默认 filter `dispatchedAt IS NULL` 展示未发送事件（字段名已验证：`OutboxEvent.dispatchedAt: Date | null`）。

### 5.2 系统健康

`GET /admin/api/health` 返回：

```json
{
  "postgres": { "status": "ok", "latencyMs": 4 },
  "redis": { "status": "ok", "memoryUsedMb": 128 },
  "s3": { "status": "ok" },
  "llm": {
    "openai": { "status": "ok", "activeProvider": false, "errorCount60s": 0 },
    "anthropic": { "status": "ok", "activeProvider": true, "errorCount60s": 0 }
  },
  "queues": {
    "RESUME_PARSE": { "waiting": 0, "active": 1, "failed": 3 },
    "JOB_ANALYZE": { "waiting": 12, "active": 2, "failed": 0 },
    "MEMORY": { "waiting": 45, "active": 5, "failed": 1 },
    "TAILORING": { "waiting": 0, "active": 0, "failed": 0 }
  }
}
```

`llm.*.activeProvider` 来自 `AgentService.getProviderState()`（Phase 5 新增 ~15 行），暴露 60s 内错误计数和当前 active provider，让运维判断是否在 fallback 状态。

**告警规则**（v1 通过 Cloudflare Monitor HTTP check）：
- `/admin/api/health` 返回非 200 → PagerDuty
- `queues.*.failed > 10` → 标记 `status: "degraded"`（非 200）

### 5.3 业务指标

`GET /admin/api/metrics/overview` 聚合返回：

```json
{
  "users": {
    "total": 1240,
    "newToday": 18,
    "newLast7d": 112,
    "activeLast7d": 430
  },
  "conversion": {
    "freeToProLast30d": 52,
    "freeToProRate": "8.3%"
  },
  "operations": {
    "resumeParsesToday": 34,
    "jobAnalysesToday": 187,
    "tailoringsToday": 89,
    "agentTurnsToday": 2341
  },
  "northStar": {
    "offersAcceptedTotal": 23,
    "offersAcceptedLast30d": 8
  }
}
```

**数据来源**：
- `IamUser.createdAt` → 注册指标
- `BillingSubscription.plan + updatedAt` → 转化指标
- `QuotaConsumeLog.featureKey + createdAt` → 操作量指标
- `TelemetryEvent` (eventType = 'offer_accepted') → 北极星

**SQL 示例（metrics.service.ts）**：

```typescript
async getOffersAcceptedLast30d(): Promise<number> {
  return this.telemetryRepo.count({
    where: {
      eventType: 'offer_accepted',   // TelemetryEvent 实体字段名为 eventType，不是 eventName
      createdAt: MoreThan(subDays(new Date(), 30)),
    },
  });
}
```

> **前置依赖**：`offer_accepted` 事件目前无 emit 点（grep src/ 零结果）。Phase 4 先在 metrics 响应中以 `0` 占位，不阻塞其他指标。需在"用户标记接受 offer"路径补 emit，作为独立任务追踪。

### 5.3b Agent 异常指标

`agent.service.ts` iteration >= MAX_ITERATION（10）时目前静默退出（loop break，不抛异常，job 标记 completed）。Phase 5 补 emit：

```typescript
// agent.service.ts — iteration 超限时
if (iteration >= MAX_ITERATIONS) {
  await this.telemetryService.emit({
    eventType: 'agent.iteration_exhausted',
    payload: { conversationId, userId, iterationCount: iteration },
  });
  break;
}
```

`/admin/api/metrics/overview` 追加 `agentIterationExhaustedToday` 字段。这是 Quinn"停下来不说话"的唯一可观测信号。

### 5.4 用户管理

**搜索入口**：AdminJS list view + filter by `clerkId` / `email`

**用户详情页展示**：

```
IamUser
├── 基本信息：clerkId, email, createdAt
├── 订阅：BillingSubscription (plan, status, stripeSubId)
├── 配额：QuotaUsageCounter (每个 featureKey 的当前用量)
├── GDPR 状态：AccountPurgeSaga (如存在，展示 step + status)
└── Webhook 事件历史：IamWebhookEvent (最近 20 条)
```

**手动操作（custom actions）**：

| 操作 | 触发逻辑 | 用途 |
|---|---|---|
| Force Dormant | `BillingService.setDormant(userId)`【需新增，推 v0.2】 | 用户接 offer 后未自报，手动休眠 |
| Trigger GDPR Purge | `AccountPurgeSagaService.initiate(userId)`（已有） | 响应人工删除请求 |
| Retry Purge Saga | admin action 直接重置 DEAD_LETTER→INITIATED（方案 B，见下）【ADR #1】 | 卡在 DEAD_LETTER 的 saga |
| Replay Webhook | `InfraService.replayWebhook(eventId)`【需新增，~30 行】 | Clerk/Stripe webhook 漏处理 |

**Retry Purge Saga 实现（方案 B）**：

```typescript
// purge-saga.resource.ts custom action handler
const saga = await sagaRepo.findOneOrFail({ where: { id: sagaId } });
if (saga.step !== PurgeSagaStep.DEAD_LETTER) {
  return { notice: { message: 'Only DEAD_LETTER sagas can be reset', type: 'error' } };
}
await sagaRepo.update(sagaId, {
  step: PurgeSagaStep.INITIATED,
  expiresAt: new Date(Date.now() - 1000),  // 过去时间，让定时任务下次捞走
  errorMessage: null,
  deadLetterRunbookUrl: null,              // 清空，避免 UI 显示误导
});
```

> **ADR #1（技术债）**：方案 B 从 INITIATED 重跑全部 step（Stripe + Clerk），在 v0.1 两步均为 stub 无外部副作用。升级触发条件：Stripe 或 Clerk 任一 stub 替换为真实 API 实现之前，必须切换到方案 A（引入 `lastSuccessfulStep` 列 + `runSteps` 改 public）。

---

## 六、安全设计

### 6.1 认证

```typescript
// admin.guard.ts
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const secret = req.headers['x-admin-secret'] ?? '';
    const expected = this.configService.get<string>('ADMIN_SECRET') ?? '';

    // 常量时间比较，防止 timing attack
    const a = Buffer.from(secret);
    const b = Buffer.from(expected);
    const valid = a.length === b.length && timingSafeEqual(a, b);

    if (!valid) {
      // 写入认证失败审计（不阻塞请求处理）
      this.telemetryRepo.save({
        eventType: 'admin.auth.failure',
        payload: { ip: req.ip, userAgent: req.headers['user-agent'] },
      }).catch(() => {});
      throw new UnauthorizedException();
    }
    return true;
  }
}
```

```typescript
// admin-api.controller.ts — rate limit 专门针对 admin 路径
@UseGuards(AdminGuard)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('admin/api')
export class AdminApiController {}
```

`ADMIN_SECRET` 长度 ≥ 32 字符，存 Railway/Fly.io secret，不进代码库。

**Secret Rotation**：Zod config schema 预留 `ADMIN_SECRET_NEXT?: string` 字段，双 secret 并存逻辑在有 rotation 需求时实现。

### 6.2 网络层

Cloudflare WAF 规则：
```
(http.request.uri.path starts_with "/admin") 
  AND (not ip.src in {<VPN_CIDR>})
→ Block
```

**Phase 1 验收必测**：直接访问 `*.up.railway.app/admin`（不经 Cloudflare）应返回 403，验证 Railway 默认域名未暴露 admin 路径。如 Railway 侧无法屏蔽，需在 NestJS 层加 `X-Forwarded-Host` 检查。

### 6.3 只读原则

AdminJS 所有 entity resource 默认 `actions: { delete: { isAccessible: false }, edit: { isAccessible: false } }`，仅通过明确定义的 custom action 触发写操作，且 action handler 必须有事务 + 日志。

### 6.4 审计日志

每个 custom action 执行后写入 `AuditLog` 表（新增）：

```typescript
// audit-log.entity.ts
@Entity()
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() action: string;          // 'retry-purge' | 'force-dormant' | ...
  @Column() targetId: string;        // userId or sagaId
  @Column({ nullable: true }) note: string;
  @CreateDateColumn() createdAt: Date;
}
```

**索引**：`(action, createdAt)` 支持按操作类型+时间范围查询；`(targetId)` 支持按用户查历史操作。

---

## 七、实现计划

### Phase 1：基础脚手架（1 天）

1. 安装依赖：`@bull-board/nestjs @bull-board/express adminjs @adminjs/nestjs @adminjs/typeorm`
2. 创建 `AdminModule`，注册 Bull Board + AdminJS，挂载 `AdminGuard`
3. `AdminGuard` 实现 `timingSafeEqual` + auth failure TelemetryEvent emit
4. Admin controller 加 `@Throttle({ default: { limit: 5, ttl: 60_000 } })`
5. Bull Board 的 Express middleware 同步实现 secret 校验（与 guard 逻辑一致）
6. 配置 Cloudflare WAF rule（IP allowlist）
7. **验收测试**：`*.up.railway.app/admin` 返回 403（Railway 默认域名不暴露 admin）
8. **验收测试**：AdminJS bundler cold start 时间 < 25s（Railway health check timeout 30s）

### Phase 2：队列监控（0.75 天）

1. 注册四条 BullMQ queue 到 Bull Board
2. 验证 failed job 的 retry / remove 操作
3. 为 `HealthController` 写 queue depth probe
4. 注册 `OutboxEvent` only-read AdminJS resource，默认 filter `dispatchedAt IS NULL`

### Phase 3：用户管理（1.25 天）

1. 注册 `IamUser` / `BillingSubscription` / `QuotaUsageCounter` / `AccountPurgeSaga` / `IamWebhookEvent` 到 AdminJS
2. 实现 custom actions：
   - Trigger GDPR Purge（调 `initiate()`，已有）
   - Retry Purge Saga（方案 B：DEAD_LETTER → INITIATED 重置，见 §5.4）
   - Replay Webhook（新增 `InfraService.replayWebhook()`，~30 行）
   - Force Dormant 标【v0.2】，本期不实现
3. 写 `AuditLog` entity + migration（indexes：`(action, createdAt)` + `(targetId)`）
4. 在每个 action handler 中写入 audit log

### Phase 4：指标仪表盘（0.5 天）

1. `MetricsService` 聚合查询（含 `agentIterationExhaustedToday`）
2. `MetricsController` 暴露 `/admin/api/metrics/overview`（`offer_accepted` 指标先返回 0）
3. 写 `QuotaConsumeLog.createdAt` index migration，实测 p99
4. AdminJS Dashboard component 调用 API 渲染数字卡片

### Phase 5：系统健康（0.75 天）

1. `HealthService` probe Redis / Postgres / S3 / LLM
2. `AgentService` 新增 `getProviderState()` 暴露 active provider + 60s error count
3. `/admin/api/health` 返回 JSON（含 LLM provider 状态）
4. `agent.service.ts` iteration 超限时 emit `agent.iteration_exhausted`
5. Cloudflare Monitor 配置（HTTP check，失败触发 email 告警）

**总计：4.25 天实现 + 0.75 天测试 ≈ 5 天**

---

## 八、不做的事（边界明示）

- **不做多租户 admin**：单一 secret，单人团队阶段够用
- **不做细粒度权限**：所有 admin 操作共享一个凭证
- **不做实时 websocket 刷新**：刷新页面即可，v1 轮询代价可接受
- **不做 LLM prompt 热更新 UI**：有专用 runbook（`docs/runbook/quinn-prompt-validation.md`）
- **不迁移指标到 Prometheus**：DB 直查在当前规模够用，进 v2 再看
- **Force Dormant（v0.2）**：需先决定 Stripe `pause_collection` vs `cancel-at-period-end` 策略，`BillingService.setDormant()` 实现后追加
- **ConvMessage 不进 AdminJS**：会话内容是 field-level 加密数据，admin 控制台不提供解密视图。任何调取用户会话内容的需求走人工 DB 查询 + 工单审批流程，不在 admin UI 暴露

---

## 九、依赖与风险

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| AdminJS UI 与 TypeORM entity 的字段类型不兼容 | 中 | 低（调试成本） | 提前验证 encrypted 字段的展示处理 |
| Bull Board 与 BullMQ 版本不匹配 | 低 | 中 | 锁定版本，见 peer deps matrix |
| `ADMIN_SECRET` 泄露 | 低 | 高 | Secret rotation SOP + WAF 双保险 |
| 聚合查询拖慢 Postgres | 低（当前规模） | 中 | 给 `QuotaConsumeLog.createdAt` 加 index，query 加 LIMIT |

---

## 十、验收标准

- [ ] `/admin/queues` 展示四条队列实时状态，可重试 failed job
- [ ] `/admin` OutboxEvent resource 展示 `dispatchedAt IS NULL` 的积压事件
- [ ] `/admin` 可搜索用户，查看订阅 + 配额
- [ ] Retry Purge Saga：DEAD_LETTER saga 执行 action 后 step 变为 INITIATED，errorMessage / deadLetterRunbookUrl 清空
- [ ] Replay Webhook：`IamWebhookEvent` 执行 replay 后触发重新处理
- [ ] `/admin/api/health` 返回所有组件状态，含 LLM activeProvider + errorCount60s；queue failed > 10 时返回 degraded
- [ ] `/admin/api/metrics/overview` 返回完整指标 JSON，含 `agentIterationExhaustedToday`
- [ ] 每个 custom action 执行后 `AuditLog` 有记录
- [ ] auth failure 触发 `TelemetryEvent { eventType: 'admin.auth.failure' }`
- [ ] 非 VPN IP 访问 `/admin/*` 被 Cloudflare Block
- [ ] 直接访问 `*.up.railway.app/admin` 返回 403
- [ ] 错误的 `X-Admin-Secret` 返回 401（5 次内 60s throttle 生效）
- [ ] AdminJS bundler cold start < 25s（Railway health check 不超时）
