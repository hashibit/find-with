import { vi } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AccountPurgeSagaService } from '../../../src/contexts/iam/services/account-purge-saga.service.js';
import { PurgeSagaStep } from '../../../src/database/entities/iam/account-purge-saga.entity.js';

function buildService() {
  const sagaRepo = {
    create: vi.fn().mockImplementation((data) => data),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    findOne: vi.fn(),
    find: vi.fn(),
  };

  const iamService = {
    softDelete: vi.fn().mockResolvedValue(undefined),
    restoreUser: vi.fn().mockResolvedValue(undefined),
  };

  const service = new AccountPurgeSagaService(sagaRepo as any, iamService as any);

  return { service, sagaRepo, iamService };
}

// ---------------------------------------------------------------------------

describe('AccountPurgeSagaService', () => {
  describe('initiate', () => {
    it('creates a saga with step INITIATED', async () => {
      const { service, sagaRepo } = buildService();
      await service.initiate('user_abc');
      expect(sagaRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user_abc', step: PurgeSagaStep.INITIATED }),
      );
      expect(sagaRepo.save).toHaveBeenCalled();
    });

    it('calls iamService.softDelete with userId', async () => {
      const { service, iamService } = buildService();
      await service.initiate('user_abc');
      expect(iamService.softDelete).toHaveBeenCalledWith('user_abc');
    });

    it('returns expiresAt approximately 24 hours from now', async () => {
      const { service } = buildService();
      const before = Date.now();
      const { expiresAt } = await service.initiate('user_abc');
      const after = Date.now();

      const expectedMs = 24 * 3600 * 1000;
      const toleranceMs = 5_000;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + expectedMs - toleranceMs);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + expectedMs + toleranceMs);
    });
  });

  describe('cancelDeletion', () => {
    it('throws NotFoundException when no saga exists', async () => {
      const { service, sagaRepo } = buildService();
      sagaRepo.findOne.mockResolvedValue(null);
      await expect(service.cancelDeletion('user_abc')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when grace period is expired', async () => {
      const { service, sagaRepo } = buildService();
      sagaRepo.findOne.mockResolvedValue({
        userId: 'user_abc',
        cancelled: false,
        expiresAt: new Date(Date.now() - 1_000), // 1 second in the past
      });

      await expect(service.cancelDeletion('user_abc')).rejects.toThrow(BadRequestException);
    });

    it('cancels saga and calls iamService.restoreUser when within grace period', async () => {
      const { service, sagaRepo, iamService } = buildService();
      const saga = {
        userId: 'user_abc',
        cancelled: false,
        expiresAt: new Date(Date.now() + 60_000), // 1 minute in the future
      };
      sagaRepo.findOne.mockResolvedValue(saga);

      await service.cancelDeletion('user_abc');

      expect(saga.cancelled).toBe(true);
      expect(sagaRepo.save).toHaveBeenCalledWith(saga);
      expect(iamService.restoreUser).toHaveBeenCalledWith('user_abc');
    });
  });

  describe('processPendingSagas', () => {
    it('skips sagas whose expiresAt is in the future', async () => {
      const { service, sagaRepo } = buildService();
      sagaRepo.find.mockResolvedValue([
        {
          id: 'saga_01',
          userId: 'user_abc',
          step: PurgeSagaStep.INITIATED,
          cancelled: false,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]);

      await service.processPendingSagas();

      expect(sagaRepo.update).not.toHaveBeenCalled();
    });

    it('advances INITIATED through all steps to COMPLETED', async () => {
      const { service, sagaRepo, iamService } = buildService();
      const saga = {
        id: 'saga_01',
        userId: 'user_abc',
        step: PurgeSagaStep.INITIATED,
        cancelled: false,
        expiresAt: new Date(Date.now() - 1_000), // past expiry
      };
      sagaRepo.find.mockResolvedValue([saga]);

      // sagaRepo.update must advance saga.step as the real impl does in runSteps
      sagaRepo.update.mockImplementation((_id: string, patch: Record<string, unknown>) => {
        if (patch.step) saga.step = patch.step as string;
        return Promise.resolve(undefined);
      });

      await service.processPendingSagas();

      // INITIATED → STRIPE_DELETED → CLERK_DELETED → DATA_DELETED → COMPLETED
      expect(sagaRepo.update).toHaveBeenCalledTimes(4);
      expect(sagaRepo.update).toHaveBeenCalledWith('saga_01', { step: PurgeSagaStep.STRIPE_DELETED });
      expect(sagaRepo.update).toHaveBeenCalledWith('saga_01', { step: PurgeSagaStep.CLERK_DELETED });
      expect(sagaRepo.update).toHaveBeenCalledWith('saga_01', { step: PurgeSagaStep.DATA_DELETED });
      expect(sagaRepo.update).toHaveBeenCalledWith('saga_01', { step: PurgeSagaStep.COMPLETED });
      expect(iamService.softDelete).toHaveBeenCalledWith('user_abc');
    });

    it('sets step to DEAD_LETTER and records errorMessage when runSteps throws', async () => {
      const { service, sagaRepo } = buildService();
      const saga = {
        id: 'saga_err',
        userId: 'user_err',
        step: PurgeSagaStep.INITIATED,
        cancelled: false,
        expiresAt: new Date(Date.now() - 1_000),
      };
      sagaRepo.find.mockResolvedValue([saga]);

      // First update (INITIATED → STRIPE_DELETED) throws to simulate a mid-run failure
      sagaRepo.update.mockRejectedValueOnce(new Error('Stripe API timeout'));

      await service.processPendingSagas();

      expect(sagaRepo.update).toHaveBeenLastCalledWith(
        'saga_err',
        expect.objectContaining({
          step: PurgeSagaStep.DEAD_LETTER,
          errorMessage: expect.stringContaining('Stripe API timeout'),
        }),
      );
    });
  });
});
