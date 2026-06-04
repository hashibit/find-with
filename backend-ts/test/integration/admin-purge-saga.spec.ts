/**
 * Integration test: retry action on PurgeSagasAdminController.
 *
 * Verifies the DEAD_LETTER → INITIATED reset path writes to the real DB
 * and that the AuditLog entry is persisted alongside it.
 */
import { DataSource, Repository } from 'typeorm';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ALL_ENTITIES } from '../../src/database/database.module.js';
import { AccountPurgeSaga, PurgeSagaStep } from '../../src/database/entities/iam/account-purge-saga.entity.js';
import { AuditLog } from '../../src/database/entities/admin/audit-log.entity.js';
import { PurgeSagasAdminController } from '../../src/admin/ops/purge-sagas.controller.js';
import { ulid } from 'ulid';

let ds: DataSource;
let sagaRepo: Repository<AccountPurgeSaga>;
let auditLogRepo: Repository<AuditLog>;

// Track created saga IDs for cleanup.
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
    const sagas = await sagaRepo.find({ where: createdSagaIds.map((id) => ({ id })) });
    const sagaIdList = sagas.map((s) => s.id);
    if (sagaIdList.length > 0) {
      await auditLogRepo
        .createQueryBuilder()
        .delete()
        .where('"targetId" IN (:...sagaIdList)', { sagaIdList })
        .execute();
    }
    await sagaRepo.delete(createdSagaIds);
    createdSagaIds.length = 0;
  }
});

async function seedDeadLetterSaga(userId?: string): Promise<AccountPurgeSaga> {
  const resolvedUserId = userId ?? ulid();
  const saga = sagaRepo.create({
    id: ulid(),
    userId: resolvedUserId,
    step: PurgeSagaStep.DEAD_LETTER,
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

function buildController(): PurgeSagasAdminController {
  return new PurgeSagasAdminController(sagaRepo, auditLogRepo);
}

describe('PurgeSagasAdminController.retry — integration', () => {
  it('resets DEAD_LETTER saga to INITIATED in DB', async () => {
    const saga = await seedDeadLetterSaga();
    const ctrl = buildController();

    await ctrl.retry(saga.id);

    const updated = await sagaRepo.findOneOrFail({ where: { id: saga.id } });
    expect(updated.step).toBe(PurgeSagaStep.INITIATED);
  });

  it('sets expiresAt to a date in the past', async () => {
    const saga = await seedDeadLetterSaga();
    const ctrl = buildController();

    const before = new Date();
    await ctrl.retry(saga.id);

    const updated = await sagaRepo.findOneOrFail({ where: { id: saga.id } });
    expect(updated.expiresAt!.getTime()).toBeLessThan(before.getTime());
  });

  it('clears errorMessage and deadLetterRunbookUrl in DB', async () => {
    const saga = await seedDeadLetterSaga();
    const ctrl = buildController();

    await ctrl.retry(saga.id);

    const updated = await sagaRepo.findOneOrFail({ where: { id: saga.id } });
    expect(updated.errorMessage).toBeNull();
    expect(updated.deadLetterRunbookUrl).toBeNull();
  });

  it('writes an AuditLog entry with action = purge_saga.retry', async () => {
    const saga = await seedDeadLetterSaga();
    const ctrl = buildController();

    await ctrl.retry(saga.id);

    const log = await auditLogRepo.findOne({ where: { action: 'purge_saga.retry', targetId: saga.id } });
    expect(log).not.toBeNull();
    expect(log!.note).toContain('DEAD_LETTER');
  });

  it('throws BadRequestException for non-DEAD_LETTER saga', async () => {
    const saga = sagaRepo.create({
      id: ulid(),
      userId: ulid(),
      step: PurgeSagaStep.STRIPE_DELETED,
      expiresAt: new Date(Date.now() + 3600_000),
      cancelled: false,
      stepResults: null,
      deadLetterRunbookUrl: null,
      errorMessage: null,
    });
    await sagaRepo.save(saga);
    createdSagaIds.push(saga.id);

    const ctrl = buildController();

    await expect(ctrl.retry(saga.id)).rejects.toThrow(BadRequestException);
    const unchanged = await sagaRepo.findOneOrFail({ where: { id: saga.id } });
    expect(unchanged.step).toBe(PurgeSagaStep.STRIPE_DELETED);
  });

  it('throws NotFoundException for unknown saga id', async () => {
    const ctrl = buildController();
    await expect(ctrl.retry(ulid())).rejects.toThrow(NotFoundException);
  });
});
