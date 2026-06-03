/**
 * Playwright global teardown — runs once after all tests complete.
 * Kills the backend process started in global-setup.
 * Docker Compose services are left running (stopped manually or by CI).
 */
import { readFileSync, unlinkSync } from 'fs';
import path from 'path';

const PID_FILE = path.join(process.cwd(), '.e2e-backend.pid');

export default async function globalTeardown() {
  let pid: number | undefined;
  try {
    pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    unlinkSync(PID_FILE);
  } catch {
    // PID file missing — setup may not have run
  }

  if (pid && !isNaN(pid)) {
    console.log(`[teardown] Stopping backend (pid=${pid})...`);
    try {
      process.kill(pid, 'SIGTERM');
      await new Promise((r) => setTimeout(r, 1000));
    } catch {
      // Already dead
    }
  }

  console.log('[teardown] Done');
}
