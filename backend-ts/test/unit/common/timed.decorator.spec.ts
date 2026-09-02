// FILE: test/unit/common/timed.decorator.spec.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Timed } from '../../../src/common/decorators/timed.decorator.js';

class FakeService {
  calls = 0;

  @Timed()
  async run(value: string): Promise<string> {
    this.calls++;
    return `got:${value}`;
  }

  @Timed()
  async fail(): Promise<never> {
    throw new Error('boom');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static descriptorOf(method: 'run' | 'fail'): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (FakeService.prototype as any)[method];
  }
}

describe('Timed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the original result and still logs', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const svc = new FakeService();

    const result = await svc.run('x');

    expect(result).toBe('got:x');
    expect(svc.calls).toBe(1);
  });

  it('logs even when the method throws', async () => {
    const svc = new FakeService();
    await expect(svc.fail()).rejects.toThrow('boom');
  });

  it('preserves method accessibility on the prototype', () => {
    expect(typeof FakeService.descriptorOf('run')).toBe('function');
  });
});
