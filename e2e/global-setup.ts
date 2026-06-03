/**
 * Playwright global setup — runs once before all tests.
 *
 * Steps:
 *   1. Verify Docker Compose services are up (fail fast if not)
 *   2. Create MinIO bucket for test artifacts
 *   3. Run TypeORM migrations against e2e DB
 *   4. Seed fixture data
 *   5. Start the NestJS backend on port 14667
 */
import { execSync, spawn } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND_DIR = path.join(ROOT, 'backend-ts');
const ENV_FILE = '.env.e2e';

export default async function globalSetup() {
  // ── 1. Services health check ───────────────────────────────────────────────
  console.log('[setup] Checking e2e services...');
  try {
    execSync('curl -sf http://localhost:11435/health', { stdio: 'pipe' });
    execSync('curl -sf http://localhost:9000/minio/health/live', { stdio: 'pipe' });
    console.log('[setup] Services OK');
  } catch {
    console.error('[setup] Services not ready. Run: docker compose -f docker-compose.e2e.yml up -d');
    process.exit(1);
  }

  // ── 2. MinIO bucket (non-fatal if mc not installed) ────────────────────────
  try {
    execSync(
      'mc alias set e2e http://localhost:9000 e2ekey e2esecret 2>/dev/null; mc mb --ignore-existing e2e/findwith-test 2>/dev/null || true',
      { stdio: 'pipe', shell: true },
    );
  } catch {
    console.warn('[setup] MinIO bucket creation skipped (mc not installed — bucket may need manual creation)');
  }

  // ── 3. Migrations ─────────────────────────────────────────────────────────
  console.log('[setup] Running migrations...');
  execSync(
    `dotenv -e ${ENV_FILE} -- pnpm run typeorm migration:run -d src/database/data-source.ts`,
    { cwd: BACKEND_DIR, stdio: 'inherit' },
  );

  // ── 4. Seed fixture data ───────────────────────────────────────────────────
  console.log('[setup] Seeding fixture data...');
  execSync(
    `dotenv -e ${ENV_FILE} -- tsx ../e2e/fixtures/seed.ts`,
    {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: 'postgresql://e2e:e2e@localhost:5434/findwith_e2e' },
    },
  );

  // ── 5. Start backend ───────────────────────────────────────────────────────
  console.log('[setup] Starting backend...');
  const envVars = parseEnvFile(path.join(BACKEND_DIR, ENV_FILE));
  const backend = spawn('node', ['dist/main.js'], {
    cwd: BACKEND_DIR,
    env: { ...process.env, ...envVars },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  backend.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) process.stdout.write(`[backend] ${line}\n`);
  });
  backend.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim();
    if (line) process.stderr.write(`[backend] ${line}\n`);
  });

  (global as Record<string, unknown>).__E2E_BACKEND_PID__ = backend.pid;

  await waitForBackend('http://localhost:14667/ready', 30_000);
  console.log('[setup] Backend ready');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForBackend(url: string, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Backend did not become ready at ${url} within ${timeout}ms`);
}

function parseEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return env;
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    env[key] = val;
  }
  return env;
}
