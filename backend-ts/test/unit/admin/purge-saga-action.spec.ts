import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PurgeSagasAdminController } from '../../../src/admin/ops/purge-sagas.controller.js';
import { PurgeSagaStep } from '../../../src/database/entities/iam/account-purge-saga.entity.js';

function buildRepos(saga?: object) {
  const sagaRepo = {
    findOneBy: vi.fn().mockResolvedValue(
      saga ?? { id: 'saga_01', userId: 'user_01', step: PurgeSagaStep.DEAD_LETTER },
    ),
    save: vi.fn().mockImplementation(async (entity) => entity),
    findAndCount: vi.fn().mockResolvedValue([[], 0]),
  };
  const auditRepo = {
    create: vi.fn().mockImplementation((data) => data),
    save: vi.fn().mockResolvedValue(undefined),
  };
  return { sagaRepo, auditRepo };
}

describe('PurgeSagasAdminController — retry', () => {
  it('resets DEAD_LETTER saga to INITIATED', async () => {
    const { sagaRepo, auditRepo } = buildRepos();
    const ctrl = new PurgeSagasAdminController(sagaRepo as any, auditRepo as any);

    const result = await ctrl.retry('saga_01');

    expect(sagaRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ step: PurgeSagaStep.INITIATED }),
    );
    expect(result.step).toBe(PurgeSagaStep.INITIATED);
  });

  it('sets expiresAt in the past', async () => {
    const { sagaRepo, auditRepo } = buildRepos();
    const ctrl = new PurgeSagasAdminController(sagaRepo as any, auditRepo as any);

    const before = Date.now();
    await ctrl.retry('saga_01');

    const saved = (sagaRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(saved.expiresAt.getTime()).toBeLessThan(before);
  });

  it('clears errorMessage and deadLetterRunbookUrl', async () => {
    const { sagaRepo, auditRepo } = buildRepos({
      id: 'saga_01',
      userId: 'user_01',
      step: PurgeSagaStep.DEAD_LETTER,
    });
    const ctrl = new PurgeSagasAdminController(sagaRepo as any, auditRepo as any);

    await ctrl.retry('saga_01');

    expect(sagaRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: null, deadLetterRunbookUrl: null }),
    );
  });

  it('writes an AuditLog entry with action = purge_saga.retry', async () => {
    const { sagaRepo, auditRepo } = buildRepos();
    const ctrl = new PurgeSagasAdminController(sagaRepo as any, auditRepo as any);

    await ctrl.retry('saga_01');

    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'purge_saga.retry', targetId: 'saga_01' }),
    );
  });

  it('throws BadRequestException for non-DEAD_LETTER saga', async () => {
    const { sagaRepo, auditRepo } = buildRepos({
      id: 'saga_01',
      userId: 'user_01',
      step: PurgeSagaStep.STRIPE_DELETED,
    });
    const ctrl = new PurgeSagasAdminController(sagaRepo as any, auditRepo as any);

    await expect(ctrl.retry('saga_01')).rejects.toThrow(BadRequestException);
    expect(sagaRepo.save).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when saga does not exist', async () => {
    const { sagaRepo, auditRepo } = buildRepos();
    sagaRepo.findOneBy.mockResolvedValue(null);
    const ctrl = new PurgeSagasAdminController(sagaRepo as any, auditRepo as any);

    await expect(ctrl.retry('nonexistent')).rejects.toThrow(NotFoundException);
  });
});
