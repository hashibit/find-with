// FILE: test/unit/jobs/selectors.controller.spec.ts
import { vi } from 'vitest';

vi.mock('express', () => ({}));

import { SelectorsController } from '../../../src/contexts/jobs/selectors.controller.js';

function buildController() {
  const controller = new SelectorsController();
  return { controller };
}

describe('SelectorsController', () => {
  describe('getSelectors', () => {
    it('sets Cache-Control header with max-age=3600', () => {
      const { controller } = buildController();
      const res = { setHeader: vi.fn(), json: vi.fn() };

      controller.getSelectors(res as any);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        expect.stringContaining('max-age=3600'),
      );
    });

    it('calls res.json with an object containing a sites key', () => {
      const { controller } = buildController();
      const res = { setHeader: vi.fn(), json: vi.fn() };

      controller.getSelectors(res as any);

      expect(res.json).toHaveBeenCalledTimes(1);
      const payload = res.json.mock.calls[0][0] as any;
      expect(payload).toHaveProperty('sites');
      expect(typeof payload.sites).toBe('object');
    });

    it('includes an entry for linkedin.com in the sites object', () => {
      const { controller } = buildController();
      const res = { setHeader: vi.fn(), json: vi.fn() };

      controller.getSelectors(res as any);

      const payload = res.json.mock.calls[0][0] as any;
      expect(payload.sites).toHaveProperty('linkedin.com');
    });

    it('includes an entry for indeed.com in the sites object', () => {
      const { controller } = buildController();
      const res = { setHeader: vi.fn(), json: vi.fn() };

      controller.getSelectors(res as any);

      const payload = res.json.mock.calls[0][0] as any;
      expect(payload.sites).toHaveProperty('indeed.com');
    });

    it('each site has at least a jobTitle selector', () => {
      const { controller } = buildController();
      const res = { setHeader: vi.fn(), json: vi.fn() };

      controller.getSelectors(res as any);

      const payload = res.json.mock.calls[0][0] as any;
      const sites = payload.sites as Record<string, unknown>;
      for (const [, selectors] of Object.entries(sites)) {
        expect(selectors).toHaveProperty('jobTitle');
        expect(typeof (selectors as any).jobTitle).toBe('string');
      }
    });

    it('includes the Cache-Control public directive', () => {
      const { controller } = buildController();
      const res = { setHeader: vi.fn(), json: vi.fn() };

      controller.getSelectors(res as any);

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        expect.stringContaining('public'),
      );
    });
  });
});
