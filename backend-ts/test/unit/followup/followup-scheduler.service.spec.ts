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

  const parsedJdRepo = {
    findOne: vi.fn().mockResolvedValue(null),
  };

  const convRepo = {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) => data),
    save: vi.fn().mockImplementation((data) => Promise.resolve(data)),
  };

  const messageRepo = {
    create: vi.fn().mockImplementation((data) => data),
    save: vi.fn().mockResolvedValue(undefined),
  };

  const gdprLogRepo = {};

  const transactionFn = vi.fn().mockResolvedValue(undefined);
  const userRepo = {
    find: vi.fn().mockResolvedValue([]),
    manager: {
      transaction: transactionFn,
    },
  };

  const fieldCrypto = {
    encrypt: vi.fn().mockResolvedValue(Buffer.from('encrypted')),
    decrypt: vi.fn().mockResolvedValue('decrypted'),
  };

  const purgeSagaService = {
    processPendingSagas: vi.fn().mockResolvedValue(undefined),
  };

  const service = new FollowupSchedulerService(
    emailRepo as any,
    radarRepo as any,
    parsedJdRepo as any,
    convRepo as any,
    messageRepo as any,
    gdprLogRepo as any,
    userRepo as any,
    fieldCrypto as any,
    purgeSagaService as any,
  );

  return { service, emailRepo, radarRepo, parsedJdRepo, convRepo, messageRepo, fieldCrypto, userRepo, purgeSagaService, qbChain };
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

    it('creates a FOLLOWUP conversation and message for a due item', async () => {
      const now = new Date();
      const { service, radarRepo, convRepo, messageRepo, fieldCrypto } = buildService();

      const dueItem = {
        id: 'radar_01',
        userId: 'user_01',
        status: 'APPLIED',
        parsedJdId: null,
        lastStatusAt: new Date(now.getTime() - 3 * 86_400_000 - 1800_000), // 3d + 30min ago
      };
      radarRepo.find.mockResolvedValueOnce([dueItem]).mockResolvedValue([]);

      await service.checkPendingFollowups();

      expect(convRepo.save).toHaveBeenCalledOnce();
      expect(messageRepo.save).toHaveBeenCalledOnce();
      expect(fieldCrypto.encrypt).toHaveBeenCalledOnce();

      const savedConv = convRepo.save.mock.calls[0][0];
      expect(savedConv.kind).toBe('FOLLOWUP');
      expect(savedConv.anchorId).toBe('radar_01');
      expect(savedConv.userId).toBe('user_01');
    });

    it('skips nudge when a FOLLOWUP conversation already exists for the radar item', async () => {
      const now = new Date();
      const { service, radarRepo, convRepo, messageRepo } = buildService();

      const dueItem = {
        id: 'radar_02',
        userId: 'user_01',
        status: 'APPLIED',
        parsedJdId: null,
        lastStatusAt: new Date(now.getTime() - 3 * 86_400_000 - 1800_000),
      };
      radarRepo.find.mockResolvedValueOnce([dueItem]).mockResolvedValue([]);
      convRepo.findOne.mockResolvedValue({ id: 'existing_conv' }); // already nudged

      await service.checkPendingFollowups();

      expect(convRepo.save).not.toHaveBeenCalled();
      expect(messageRepo.save).not.toHaveBeenCalled();
    });

    it('includes job title and company in the nudge text when parsedJd is available', async () => {
      const now = new Date();
      const { service, radarRepo, parsedJdRepo, messageRepo, fieldCrypto } = buildService();

      const dueItem = {
        id: 'radar_03',
        userId: 'user_01',
        status: 'APPLIED',
        parsedJdId: 'jd_01',
        lastStatusAt: new Date(now.getTime() - 3 * 86_400_000 - 1800_000),
      };
      radarRepo.find.mockResolvedValueOnce([dueItem]).mockResolvedValue([]);
      parsedJdRepo.findOne.mockResolvedValue({ title: 'Senior PM', company: 'Acme' });

      await service.checkPendingFollowups();

      const encryptedWith = fieldCrypto.encrypt.mock.calls[0][0] as string;
      expect(encryptedWith).toContain('Senior PM at Acme');

      const savedMsg = messageRepo.save.mock.calls[0][0];
      expect(savedMsg.role).toBe('ASSISTANT');
      expect((savedMsg.payload as any).content[0].text).toContain('Senior PM at Acme');
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
