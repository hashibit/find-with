import { vi, describe, it, expect, beforeEach } from 'vitest';
import { HealthService } from '../../../src/admin/health/health.service.js';

// Minimal queue mock
function makeQueue(counts: { active: number; waiting: number; failed: number } = { active: 0, waiting: 0, failed: 0 }) {
  return { getJobCounts: vi.fn().mockResolvedValue(counts) };
}

function buildService(overrides: {
  redisPing?: () => Promise<void>;
  dbQuery?: () => Promise<void>;
  s3Send?: () => Promise<void>;
  providerState?: object;
} = {}) {
  const redisPing = overrides.redisPing ?? vi.fn().mockResolvedValue('PONG');
  const redisService = { client: { ping: redisPing } };

  const dbQuery = overrides.dbQuery ?? vi.fn().mockResolvedValue([{ '?column?': 1 }]);
  const dataSource = { query: dbQuery };

  const s3Send = overrides.s3Send ?? vi.fn().mockResolvedValue({});

  const providerState = overrides.providerState ?? {
    activeProvider: 'anthropic',
    fallbackProvider: 'openai',
    errorCount: 0,
    inFailover: false,
  };
  const agentService = { getProviderState: vi.fn().mockReturnValue(providerState) };

  const configService = {
    get: vi.fn().mockReturnValue({
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      endpoint: undefined,
    }),
  };

  const queues = [makeQueue(), makeQueue(), makeQueue(), makeQueue()];

  const service = new HealthService(
    redisService as any,
    dataSource as any,
    agentService as any,
    configService as any,
    queues[0] as any,
    queues[1] as any,
    queues[2] as any,
    queues[3] as any,
  );

  // Patch private S3Client so tests don't hit the network
  (service as any).s3 = { send: s3Send };

  return { service, redisService, dataSource, agentService, queues, s3Send };
}

describe('HealthService', () => {
  describe('getHealth — all ok', () => {
    it('returns status ok when all services healthy', async () => {
      const { service } = buildService();
      const report = await service.getHealth();
      expect(report.status).toBe('ok');
    });

    it('includes timestamp as ISO string', async () => {
      const { service } = buildService();
      const report = await service.getHealth();
      expect(() => new Date(report.timestamp)).not.toThrow();
      expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includes services.redis, postgres, s3, llm, queues', async () => {
      const { service } = buildService();
      const report = await service.getHealth();
      expect(report.services).toHaveProperty('redis');
      expect(report.services).toHaveProperty('postgres');
      expect(report.services).toHaveProperty('s3');
      expect(report.services).toHaveProperty('llm');
      expect(report.services).toHaveProperty('queues');
    });

    it('reflects llm provider state', async () => {
      const { service } = buildService({
        providerState: { activeProvider: 'openai', fallbackProvider: 'anthropic', errorCount: 0, inFailover: false },
      });
      const report = await service.getHealth();
      expect(report.services.llm.activeProvider).toBe('openai');
      expect(report.services.llm.status).toBe('ok');
    });
  });

  describe('getHealth — degraded when llm in failover', () => {
    it('sets overall status to degraded', async () => {
      const { service } = buildService({
        providerState: { activeProvider: 'openai', fallbackProvider: 'anthropic', errorCount: 5, inFailover: true },
      });
      const report = await service.getHealth();
      expect(report.status).toBe('degraded');
      expect(report.services.llm.status).toBe('degraded');
    });
  });

  describe('getHealth — redis down', () => {
    it('sets overall status to down', async () => {
      const { service } = buildService({
        redisPing: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      });
      const report = await service.getHealth();
      expect(report.status).toBe('down');
      expect(report.services.redis.status).toBe('down');
      expect(report.services.redis.error).toContain('ECONNREFUSED');
    });
  });

  describe('getHealth — postgres down', () => {
    it('sets overall status to down', async () => {
      const { service } = buildService({
        dbQuery: vi.fn().mockRejectedValue(new Error('DB gone')),
      });
      const report = await service.getHealth();
      expect(report.status).toBe('down');
      expect(report.services.postgres.status).toBe('down');
    });
  });

  describe('getHealth — queue stats', () => {
    it('returns job counts from all four queues', async () => {
      const { service, queues } = buildService();
      queues[0].getJobCounts.mockResolvedValue({ active: 2, waiting: 5, failed: 1 });
      const report = await service.getHealth();
      const queueValues = Object.values(report.services.queues);
      const firstQueue = queueValues[0];
      // At least one queue has the mocked values
      expect(queueValues.some((q) => q.active === 2 && q.waiting === 5 && q.failed === 1)).toBe(true);
    });

    it('reports -1 counts when a queue call fails', async () => {
      const { service, queues } = buildService();
      queues[1].getJobCounts.mockRejectedValue(new Error('Redis error'));
      const report = await service.getHealth();
      // Some queue should have -1 values
      expect(Object.values(report.services.queues).some((q) => q.active === -1)).toBe(true);
    });
  });
});
