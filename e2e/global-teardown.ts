/**
 * Playwright global teardown — runs once after all tests complete.
 * Kills the backend process started in global-setup.
 * Docker Compose services are left running (stopped manually or by CI).
 */
export default async function globalTeardown() {
  const pid = (global as Record<string, unknown>).__E2E_BACKEND_PID__ as number | undefined;

  if (pid) {
    console.log(`[teardown] Stopping backend (pid=${pid})...`);
    try {
      process.kill(pid, 'SIGTERM');
      // Give it a moment to flush logs
      await new Promise((r) => setTimeout(r, 1000));
    } catch {
      // Already dead
    }
  }

  console.log('[teardown] Done');
}
