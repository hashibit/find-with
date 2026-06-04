import { vi, describe, it, expect } from 'vitest';
import { MetricsService } from '../../../src/admin/metrics/metrics.service.js';

function buildService() {
  const userRepo = {
    count: vi.fn().mockResolvedValue(0),
  };
  const subRepo = {
    createQueryBuilder: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getCount: vi.fn().mockResolvedValue(0),
    }),
  };
  const quotaLogRepo = {
    count: vi.fn().mockResolvedValue(0),
  };
  const telemetryRepo = {
    count: vi.fn().mockResolvedValue(0),
    createQueryBuilder: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getCount: vi.fn().mockResolvedValue(0),
    }),
  };
  const sagaRepo = {};

  const service = new MetricsService(
    userRepo as any,
    subRepo as any,
    quotaLogRepo as any,
    telemetryRepo as any,
    sagaRepo as any,
  );

  return { service, userRepo, subRepo, quotaLogRepo, telemetryRepo };
}

describe('MetricsService', () => {
  describe('getUsersOverview', () => {
    it('returns total, newToday, newLast7d', async () => {
      const { service, userRepo } = buildService();
      userRepo.count
        .mockResolvedValueOnce(100)  // total
        .mockResolvedValueOnce(5)    // newToday
        .mockResolvedValueOnce(20);  // newLast7d

      const result = await service.getUsersOverview();
      expect(result).toEqual({ total: 100, newToday: 5, newLast7d: 20 });
    });

    it('calls userRepo.count 3 times', async () => {
      const { service, userRepo } = buildService();
      await service.getUsersOverview();
      expect(userRepo.count).toHaveBeenCalledTimes(3);
    });
  });

  describe('getConversionLast30d', () => {
    it('queries PRO tier subscriptions updated in last 30d', async () => {
      const { service, subRepo } = buildService();
      const qb = subRepo.createQueryBuilder();
      (qb.getCount as ReturnType<typeof vi.fn>).mockResolvedValue(7);

      const result = await service.getConversionLast30d();
      expect(result.proConversions).toBe(7);
      expect(qb.where).toHaveBeenCalledWith('sub.tier = :tier', { tier: 'PRO' });
    });
  });

  describe('getOperationsToday', () => {
    it('counts quota log entries since start of today', async () => {
      const { service, quotaLogRepo } = buildService();
      quotaLogRepo.count.mockResolvedValue(42);

      const result = await service.getOperationsToday();
      expect(result.tailoringsToday).toBe(42);
    });
  });

  describe('getOfferMetrics', () => {
    it('returns offerAcceptedTotal and offerAcceptedLast30d', async () => {
      const { service, telemetryRepo } = buildService();
      telemetryRepo.count.mockResolvedValue(10);
      const qb = telemetryRepo.createQueryBuilder();
      (qb.getCount as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      const result = await service.getOfferMetrics();
      expect(result.offerAcceptedTotal).toBe(10);
      expect(result.offerAcceptedLast30d).toBe(3);
    });

    it('filters by eventType = offer_accepted', async () => {
      const { service, telemetryRepo } = buildService();
      await service.getOfferMetrics();
      expect(telemetryRepo.count).toHaveBeenCalledWith({ where: { eventType: 'offer_accepted' } });
    });
  });

  describe('getAgentIterationExhaustedToday', () => {
    it('queries agent.iteration_exhausted events since start of today', async () => {
      const { service, telemetryRepo } = buildService();
      const qb = telemetryRepo.createQueryBuilder();
      (qb.getCount as ReturnType<typeof vi.fn>).mockResolvedValue(2);

      const result = await service.getAgentIterationExhaustedToday();
      expect(result.agentIterationExhaustedToday).toBe(2);
      expect(qb.where).toHaveBeenCalledWith('t.eventType = :et', { et: 'agent.iteration_exhausted' });
    });
  });

  describe('getOverview', () => {
    it('returns combined shape with all sub-metrics', async () => {
      const { service } = buildService();
      const result = await service.getOverview();
      expect(result).toMatchObject({
        users: expect.objectContaining({ total: expect.any(Number) }),
        conversion: expect.objectContaining({ proConversions: expect.any(Number) }),
        operations: expect.objectContaining({ tailoringsToday: expect.any(Number) }),
        offers: expect.objectContaining({ offerAcceptedTotal: expect.any(Number) }),
        agent: expect.objectContaining({ agentIterationExhaustedToday: expect.any(Number) }),
      });
    });
  });
});
