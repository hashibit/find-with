import { vi, describe, it, expect } from 'vitest';
import { buildPurgeSagaResource } from '../../../src/admin/resources/purge-saga.resource.js';
import type { ActionContext } from 'adminjs';

function buildRepos(saga?: object) {
  const sagaRepo = {
    findOneOrFail: vi.fn().mockResolvedValue(
      saga ?? { id: 'saga_01', userId: 'user_01', step: 'DEAD_LETTER' },
    ),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const auditLogRepo = {
    create: vi.fn().mockImplementation((data) => data),
    save: vi.fn().mockResolvedValue(undefined),
  };
  return { sagaRepo, auditLogRepo };
}

function makeContext(recordId = 'saga_01'): ActionContext {
  return {
    record: { id: () => recordId },
  } as unknown as ActionContext;
}

describe('buildPurgeSagaResource — retry-purge handler', () => {
  it('resets DEAD_LETTER saga to INITIATED', async () => {
    const { sagaRepo, auditLogRepo } = buildRepos();
    const resource = buildPurgeSagaResource(sagaRepo as any, auditLogRepo as any);
    const handler = resource.options!.actions!['retry-purge']!.handler!;

    const result = await handler({} as any, {} as any, makeContext());

    expect(sagaRepo.update).toHaveBeenCalledWith(
      'saga_01',
      expect.objectContaining({ step: 'INITIATED' }),
    );
    expect(result).toMatchObject({ notice: { message: 'Saga reset to INITIATED', type: 'success' } });
  });

  it('sets expiresAt in the past (< now)', async () => {
    const { sagaRepo, auditLogRepo } = buildRepos();
    const resource = buildPurgeSagaResource(sagaRepo as any, auditLogRepo as any);
    const handler = resource.options!.actions!['retry-purge']!.handler!;

    const before = Date.now();
    await handler({} as any, {} as any, makeContext());

    const updateArg = (sagaRepo.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(updateArg.expiresAt.getTime()).toBeLessThan(before);
  });

  it('clears errorMessage and deadLetterRunbookUrl', async () => {
    const { sagaRepo, auditLogRepo } = buildRepos({
      id: 'saga_01',
      userId: 'user_01',
      step: 'DEAD_LETTER',
    });
    const resource = buildPurgeSagaResource(sagaRepo as any, auditLogRepo as any);
    const handler = resource.options!.actions!['retry-purge']!.handler!;

    await handler({} as any, {} as any, makeContext());

    expect(sagaRepo.update).toHaveBeenCalledWith(
      'saga_01',
      expect.objectContaining({ errorMessage: null, deadLetterRunbookUrl: null }),
    );
  });

  it('writes an AuditLog entry with action = retry-purge', async () => {
    const { sagaRepo, auditLogRepo } = buildRepos();
    const resource = buildPurgeSagaResource(sagaRepo as any, auditLogRepo as any);
    const handler = resource.options!.actions!['retry-purge']!.handler!;

    await handler({} as any, {} as any, makeContext());

    expect(auditLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'retry-purge', targetId: 'user_01' }),
    );
  });

  it('rejects non-DEAD_LETTER saga with error notice', async () => {
    const { sagaRepo, auditLogRepo } = buildRepos({ id: 'saga_01', userId: 'user_01', step: 'STRIPE' });
    const resource = buildPurgeSagaResource(sagaRepo as any, auditLogRepo as any);
    const handler = resource.options!.actions!['retry-purge']!.handler!;

    const result = await handler({} as any, {} as any, makeContext());

    expect(sagaRepo.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ notice: { type: 'error' } });
  });

  it('returns error notice when context.record is null', async () => {
    const { sagaRepo, auditLogRepo } = buildRepos();
    const resource = buildPurgeSagaResource(sagaRepo as any, auditLogRepo as any);
    const handler = resource.options!.actions!['retry-purge']!.handler!;

    const context = { record: null } as unknown as ActionContext;
    const result = await handler({} as any, {} as any, context);

    expect(result).toMatchObject({ notice: { message: 'No record found', type: 'error' } });
  });
});
