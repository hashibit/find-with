export function doWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  const timer = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Timeout: ${label} ${ms}ms`));
    }, ms);
  });
  return Promise.race([p, timer]);
}
