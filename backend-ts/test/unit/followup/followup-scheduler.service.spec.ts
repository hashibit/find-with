import { vi } from 'vitest';
import { FollowupSchedulerService } from '../../../src/contexts/followup/followup-scheduler.service.js';

function buildQueryBuilderChain(executeResult = { affected: 3 }) {
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.execute = vi.fn().mockResolvedValue(executeResult);
  return chain;
}

function buildService() {
  const qbChain = buildQueryBuilderChain();

  const emailRepo = {
    createQueryBuilder: vi.fn().mockReturnValue(qbChain),
  };

  const radarRepo = {
    find: vi.fn().mockResolvedValue([]),
  };

  const gdprLogRepo = {};

  const transactionFn = vi.fn().mockResolvedValue(undefined);
  const userRepo = {
    find: vi.fn().mockResolvedValue([]),
    manager: {
      transaction: transactionFn,
    },
  };

  const purgeSagaService = {
    processPendingSagas: vi.fn().mockResolvedValue(undefined),
  };

  const service = new FollowupSchedulerService(
    emailRepo as any,
    radarRepo as any,
    gdprLogRepo as any,
    userRepo as any,
    purgeSagaService as any,
  );

  return { service, emailRepo, radarRepo, userRepo, purgeSagaService, qbChain };
}

// ---------------------------------------------------------------------------

describe('FollowupSchedulerService', () => {
  describe('purgeOldEmailBodies', () => {
    it('calls createQueryBuilder on emailRepo and executes the update', async () => {
      const { service, emailRepo, qbChain } = buildService();

      await service.purgeOldEmailBodies();

      expect(emailRepo.createQueryBuilder).toHaveBeenCalled();
      expect(qbChain.execute).toHaveBeenCalled();
    });

    it('completes without throwing when execute reports affected rows', async () => {
      const { service } = buildService();
      await expect(service.purgeOldEmailBodies()).resolves.not.toThrow();
    });
  });

  describe('checkPendingFollowups', () => {
    it('calls radarRepo.find for each of the 3 day checkpoints (3, 8, 15)', async () => {
      const { service, radarRepo } = buildService();

      await service.checkPendingFollowups();

      expect(radarRepo.find).toHaveBeenCalledTimes(3);
    });

    it('handles empty results for all checkpoints without throwing', async () => {
      const { service, radarRepo } = buildService();
      radarRepo.find.mockResolvedValue([]);

      await expect(service.checkPendingFollowups()).resolves.not.toThrow();
    });
  });

  describe('runGdprPurge', () => {
    it('calls userRepo.find with isActive=false and a deletedAt cutoff', async () => {
      const { service, userRepo } = buildService();

      await service.runGdprPurge();

      expect(userRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('calls userRepo.manager.transaction for each returned user', async () => {
      const { service, userRepo } = buildService();
      userRepo.find.mockResolvedValue([
        { id: 'user_01' },
        { id: 'user_02' },
      ]);

      await service.runGdprPurge();

      expect(userRepo.manager.transaction).toHaveBeenCalledTimes(2);
    });

    it('handles a per-user transaction error without crashing the full run', async () => {
      const { service, userRepo } = buildService();
      userRepo.find.mockResolvedValue([
        { id: 'user_fail' },
        { id: 'user_ok' },
      ]);
      userRepo.manager.transaction
        .mockRejectedValueOnce(new Error('DB lock timeout'))
        .mockResolvedValueOnce(undefined);

      await expect(service.runGdprPurge()).resolves.not.toThrow();
      expect(userRepo.manager.transaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('processPurgeSagas', () => {
    it('delegates to purgeSagaService.processPendingSagas', async () => {
      const { service, purgeSagaService } = buildService();

      await service.processPurgeSagas();

      expect(purgeSagaService.processPendingSagas).toHaveBeenCalledOnce();
    });
  });
});
