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

const TEST_USER_PREFIX = 'int_test_saga_';

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
  await auditLogRepo
    .createQueryBuilder()
    .delete()
    .where('"targetId" LIKE :prefix', { prefix: `${TEST_USER_PREFIX}%` })
    .execute();
  await sagaRepo
    .createQueryBuilder()
    .delete()
    .where('"userId" LIKE :prefix', { prefix: `${TEST_USER_PREFIX}%` })
    .execute();
});

async function seedDeadLetterSaga(userId: string): Promise<AccountPurgeSaga> {
  const saga = sagaRepo.create({
    id: ulid(),
    userId,
    step: 'DEAD_LETTER',
    expiresAt: new Date(Date.now() + 3600_000),
    cancelled: false,
    stepResults: null,
    deadLetterRunbookUrl: 'https://runbooks.internal/purge-saga',
    errorMessage: 'Stripe API timeout',
  });
  return sagaRepo.save(saga);
}

function makeContext(sagaId: string): ActionContext {
  return {
    record: { id: () => sagaId },
  } as unknown as ActionContext;
}

describe('retry-purge action — integration', () => {
  it('resets DEAD_LETTER saga to INITIATED in DB', async () => {
    const userId = `${TEST_USER_PREFIX}${ulid()}`;
    const saga = await seedDeadLetterSaga(userId);

    const resource = buildPurgeSagaResource(sagaRepo, auditLogRepo);
    const handler = resource.options!.actions!['retry-purge']!.handler!;
    await handler({} as any, {} as any, makeContext(saga.id));

    const updated = await sagaRepo.findOneOrFail({ where: { id: saga.id } });
    expect(updated.step).toBe('INITIATED');
  });

  it('sets expiresAt to a date in the past', async () => {
    const userId = `${TEST_USER_PREFIX}${ulid()}`;
    const saga = await seedDeadLetterSaga(userId);

    const resource = buildPurgeSagaResource(sagaRepo, auditLogRepo);
    const handler = resource.options!.actions!['retry-purge']!.handler!;
    const before = new Date();
    await handler({} as any, {} as any, makeContext(saga.id));

    const updated = await sagaRepo.findOneOrFail({ where: { id: saga.id } });
    expect(updated.expiresAt!.getTime()).toBeLessThan(before.getTime());
  });

  it('clears errorMessage and deadLetterRunbookUrl in DB', async () => {
    const userId = `${TEST_USER_PREFIX}${ulid()}`;
    const saga = await seedDeadLetterSaga(userId);

    const resource = buildPurgeSagaResource(sagaRepo, auditLogRepo);
    const handler = resource.options!.actions!['retry-purge']!.handler!;
    await handler({} as any, {} as any, makeContext(saga.id));

    const updated = await sagaRepo.findOneOrFail({ where: { id: saga.id } });
    expect(updated.errorMessage).toBeNull();
    expect(updated.deadLetterRunbookUrl).toBeNull();
  });

  it('writes an AuditLog entry with action = retry-purge', async () => {
    const userId = `${TEST_USER_PREFIX}${ulid()}`;
    const saga = await seedDeadLetterSaga(userId);

    const resource = buildPurgeSagaResource(sagaRepo, auditLogRepo);
    const handler = resource.options!.actions!['retry-purge']!.handler!;
    await handler({} as any, {} as any, makeContext(saga.id));

    const log = await auditLogRepo.findOne({ where: { action: 'retry-purge', targetId: userId } });
    expect(log).not.toBeNull();
    expect(log!.note).toContain(saga.id);
  });

  it('does not reset non-DEAD_LETTER saga', async () => {
    const userId = `${TEST_USER_PREFIX}${ulid()}`;
    const saga = sagaRepo.create({
      id: ulid(),
      userId,
      step: 'STRIPE_DELETED',
      expiresAt: new Date(Date.now() + 3600_000),
      cancelled: false,
      stepResults: null,
      deadLetterRunbookUrl: null,
      errorMessage: null,
    });
    await sagaRepo.save(saga);

    const resource = buildPurgeSagaResource(sagaRepo, auditLogRepo);
    const handler = resource.options!.actions!['retry-purge']!.handler!;
    const result = await handler({} as any, {} as any, makeContext(saga.id));

    expect((result as any).notice.type).toBe('error');
    const unchanged = await sagaRepo.findOneOrFail({ where: { id: saga.id } });
    expect(unchanged.step).toBe('STRIPE_DELETED');
  });
});
