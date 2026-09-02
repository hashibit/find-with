import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

/**
 * Options for the {@link Timed} decorator.
 */
export interface TimedOptions {
  /** Overrides the method name in log lines — for when one method serves several flows. */
  label?: string;
  /** Compact per-call context appended after the name, computed from the method args. Must not throw. */
  describe?: (args: unknown[]) => string;
}

/**
 * Logs the wall-clock duration of a one-shot async method — on success and on failure.
 *
 * Only for awaited I/O-bound methods. Do not apply to streaming methods: their
 * promise resolves when the stream is returned, not when it is consumed.
 */
export function Timed(options: TimedOptions | string = {}): MethodDecorator {
  const { label, describe } =
    typeof options === 'string' ? ({ label: options } as TimedOptions) : options;

  return (target, propertyKey, descriptor) => {
    const name = label ?? String(propertyKey);
    const original = descriptor.value as (...args: unknown[]) => unknown;
    const logger = new Logger(target.constructor.name);

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const startedAt = Date.now();
      const uuid = randomUUID().slice(0, 8);
      const desc = describe ? ` ${describe(args)}` : '';
      const context = `${name}-${uuid}${desc}`;
      try {
        logger.log(`${context} start...`);
        const result = await original.apply(this, args);
        logger.log(`${context} took ${Date.now() - startedAt}ms`);
        return result;
      } catch (err) {
        logger.error(
          `${context} failed after ${Date.now() - startedAt}ms: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        throw err;
      }
    } as unknown as typeof descriptor.value;

    return descriptor;
  };
}
