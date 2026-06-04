/**
 * Integration test: retry-purge action on AccountPurgeSaga.
 *
 * Verifies the DEAD_LETTER → INITIATED reset path writes to the real DB
 * and that the AuditLog entry is persisted alongside it.
 */
import { DataSource, Repository } from 'typeorm';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { ALL_ENTITIES } from '../../src/database/database.module.js';
import { AccountPurgeSaga } from '../../src/database/entities/iam/account-purge-saga.entity.js';
import { AuditLog } from '../../src/database/entities/admin/audit-log.entity.js';
import { buildPurgeSagaResource } from '../../src/admin/resources/purge-saga.resource.js';
import type { ActionContext } from 'adminjs';
import { ulid } from 'ulid';

let ds: DataSource;
let sagaRepo: Repository<AccountPurgeSaga>;
let auditLogRepo: Repository<AuditLog>;

// Track created saga IDs for cleanup.
// userId is varchar(26) (a plain ULID), so prefix-based LIKE cleanup won't work.
const createdSagaIds: string[] = [];

beforeAll(async () => {
  ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: ALL_ENTITIES,
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  sagaRepo = ds.getRepository(AccountPurgeSaga);
  auditLogRepo = ds.getRepository(AuditLog);
});

afterAll(async () => {
  await ds.destroy();
});

afterEach(async () => {
  if (createdSagaIds.length > 0) {
    // AuditLog.targetId = saga.userId; clean up by saga IDs resolved to their userIds
    const sagas = await sagaRepo.find({ where: createdSagaIds.map((id) => ({ id })) });
    const userIds = sagas.map((s) => s.userId);
    if (userIds.length > 0) {
      await auditLogRepo
        .createQueryBuilder()
        .delete()
        .where('"targetId" IN (:...userIds)', { userIds })
        .execute();
    }
    await sagaRepo.delete(createdSagaIds);
    createdSagaIds.length = 0;
  }
});

async function seedDeadLetterSaga(userId?: string): Promise<AccountPurgeSaga> {
  // userId must fit varchar(26) — use a plain ULID (exactly 26 chars)
  const resolvedUserId = userId ?? ulid();
  const saga = sagaRepo.create({
    id: ulid(),
    userId: resolvedUserId,
    step: 'DEAD_LETTER',
    expiresAt: new Date(Date.now() + 3600_000),
    cancelled: false,
    stepResults: null,
    deadLetterRunbookUrl: 'https://runbooks.internal/purge-saga',
    errorMessage: 'Stripe API timeout',
  });
  const saved = await sagaRepo.save(saga);
  createdSagaIds.push(saved.id);
  return saved;
}

function makeContext(sagaId: string): ActionContext {
  return {
    record: { id: () => sagaId },
  } as unknown as ActionContext;
}

describe('retry-purge action — integration', () => {
  it('resets DEAD_LETTER saga to INITIATED in DB', async () => {
    const saga = await seedDeadLetterSaga();

    const resource = buildPurgeSagaResource(sagaRepo, auditLogRepo);
    const handler = resource.options!.actions!['retry-purge']!.handler!;
    await handler({} as any, {} as any, makeContext(saga.id));

    const updated = await sagaRepo.findOneOrFail({ where: { id: saga.id } });
    expect(updated.step).toBe('INITIATED');
  });

  it('sets expiresAt to a date in the past', async () => {
    const saga = await seedDeadLetterSaga();

    const resource = buildPurgeSagaResource(sagaRepo, auditLogRepo);
    const handler = resource.options!.actions!['retry-purge']!.handler!;
    const before = new Date();
    await handler({} as any, {} as any, makeContext(saga.id));

    const updated = await sagaRepo.findOneOrFail({ where: { id: saga.id } });
    expect(updated.expiresAt!.getTime()).toBeLessThan(before.getTime());
  });

  it('clears errorMessage and deadLetterRunbookUrl in DB', async () => {
    const saga = await seedDeadLetterSaga();

    const resource = buildPurgeSagaResource(sagaRepo, auditLogRepo);
    const handler = resource.options!.actions!['retry-purge']!.handler!;
    await handler({} as any, {} as any, makeContext(saga.id));

    const updated = await sagaRepo.findOneOrFail({ where: { id: saga.id } });
    expect(updated.errorMessage).toBeNull();
    expect(updated.deadLetterRunbookUrl).toBeNull();
  });

  it('writes an AuditLog entry with action = retry-purge', async () => {
    const saga = await seedDeadLetterSaga();

    const resource = buildPurgeSagaResource(sagaRepo, auditLogRepo);
    const handler = resource.options!.actions!['retry-purge']!.handler!;
    await handler({} as any, {} as any, makeContext(saga.id));

    const log = await auditLogRepo.findOne({ where: { action: 'retry-purge', targetId: saga.userId } });
    expect(log).not.toBeNull();
    expect(log!.note).toContain(saga.id);
  });

  it('does not reset non-DEAD_LETTER saga', async () => {
    const sagaId = ulid();
    const saga = sagaRepo.create({
      id: sagaId,
      userId: ulid(),  // plain ULID fits varchar(26)
      step: 'STRIPE_DELETED',
      expiresAt: new Date(Date.now() + 3600_000),
      cancelled: false,
      stepResults: null,
      deadLetterRunbookUrl: null,
      errorMessage: null,
    });
    await sagaRepo.save(saga);
    createdSagaIds.push(sagaId);

    const resource = buildPurgeSagaResource(sagaRepo, auditLogRepo);
    const handler = resource.options!.actions!['retry-purge']!.handler!;
    const result = await handler({} as any, {} as any, makeContext(saga.id));

    expect((result as any).notice.type).toBe('error');
    const unchanged = await sagaRepo.findOneOrFail({ where: { id: saga.id } });
    expect(unchanged.step).toBe('STRIPE_DELETED');
  });
});
