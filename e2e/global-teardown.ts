/**
 * Playwright global teardown — runs once after all tests complete.
 * Kills whatever process is holding port 14807 (the backend).
 * Docker Compose services are left running (stopped manually or by CI).
 */
import { execSync } from 'child_process';

export default async function globalTeardown() {
  console.log('[teardown] Stopping backend...');
  try {
    execSync('lsof -ti :14807 | xargs kill -9', { stdio: 'pipe', shell: true });
  } catch {
    // Nothing on the port — already dead
  }
  console.log('[teardown] Done');
}
