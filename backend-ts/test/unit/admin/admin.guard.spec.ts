import { vi, describe, it, expect, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { AdminGuard } from '../../../src/admin/admin.guard.js';

const SECRET = 'test-admin-secret-32-chars-minimum';

function buildGuard(secret = SECRET) {
  const telemetryRepo = {
    create: vi.fn().mockImplementation((data) => data),
    save: vi.fn().mockResolvedValue(undefined),
  };

  const configService = {
    get: vi.fn().mockReturnValue({ secret }),
  };

  const guard = new AdminGuard(configService as any, telemetryRepo as any);
  return { guard, telemetryRepo, configService };
}

function makeContext(headerValue?: string): ExecutionContext {
  const headers: Record<string, string> = {};
  if (headerValue !== undefined) {
    headers['x-admin-secret'] = headerValue;
  }
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, ip: '127.0.0.1' }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  describe('valid secret', () => {
    it('returns true when x-admin-secret matches config', async () => {
      const { guard } = buildGuard();
      const result = await guard.canActivate(makeContext(SECRET));
      expect(result).toBe(true);
    });

    it('does not save TelemetryEvent on success', async () => {
      const { guard, telemetryRepo } = buildGuard();
      await guard.canActivate(makeContext(SECRET));
      expect(telemetryRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('missing header', () => {
    it('throws UnauthorizedException when header is absent', async () => {
      const { guard } = buildGuard();
      await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('emits admin.auth.failure telemetry', async () => {
      const { guard, telemetryRepo } = buildGuard();
      await guard.canActivate(makeContext()).catch(() => {});
      expect(telemetryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'admin.auth.failure', userId: null }),
      );
    });
  });

  describe('wrong secret', () => {
    it('throws UnauthorizedException when header value is wrong', async () => {
      const { guard } = buildGuard();
      await expect(guard.canActivate(makeContext('wrong-secret'))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('emits admin.auth.failure telemetry', async () => {
      const { guard, telemetryRepo } = buildGuard();
      await guard.canActivate(makeContext('wrong-secret')).catch(() => {});
      expect(telemetryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'admin.auth.failure' }),
      );
    });
  });

  describe('empty string header', () => {
    it('throws UnauthorizedException for empty string', async () => {
      const { guard } = buildGuard();
      await expect(guard.canActivate(makeContext(''))).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('length mismatch — timing-safe behaviour', () => {
    it('rejects a prefix of the real secret', async () => {
      const { guard } = buildGuard();
      const prefix = SECRET.slice(0, 10);
      await expect(guard.canActivate(makeContext(prefix))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a secret with a trailing char appended', async () => {
      const { guard } = buildGuard();
      const longer = SECRET + 'x';
      await expect(guard.canActivate(makeContext(longer))).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('timingSafeEqual correctness', () => {
    it('two secrets that differ only in last byte are rejected', async () => {
      const { guard } = buildGuard();
      const almostRight = SECRET.slice(0, -1) + 'Z';
      await expect(guard.canActivate(makeContext(almostRight))).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
