/**
 * Playwright global setup — runs once before all tests.
 *
 * Steps:
 *   1. Verify Docker Compose services are up (fail fast if not)
 *   2. Create MinIO bucket for test artifacts
 *   3. Run TypeORM migrations against e2e DB
 *   4. Seed fixture data
 *   5. Start the NestJS backend on port 14807
 */
import { execSync, spawn } from 'child_process';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

// process.cwd() is the repo root when Playwright is invoked from there
const ROOT = process.cwd();
const BACKEND_DIR = path.join(ROOT, 'backend-ts');
const ENV_FILE = '.env.e2e';

export default async function globalSetup() {
  // ── 1. Services health check ───────────────────────────────────────────────
  console.log('[setup] Checking e2e services...');
  try {
    execSync('curl -sf http://localhost:14808/health', { stdio: 'pipe' });   // mock-dom
    execSync('curl -sf http://localhost:14809/health', { stdio: 'pipe' });   // mock-llm
    execSync('curl -sf http://localhost:14810/health', { stdio: 'pipe' });   // mock-stripe
    execSync('curl -sf http://localhost:14811/health', { stdio: 'pipe' });   // mock-clerk
    execSync('curl -sf http://localhost:14802/minio/health/live', { stdio: 'pipe' });
    console.log('[setup] Services OK');
  } catch {
    console.error('[setup] Services not ready. Run: docker compose -f docker-compose.e2e.yml up -d');
    process.exit(1);
  }

  // ── 2. MinIO bucket ────────────────────────────────────────────────────────
  console.log('[setup] Creating MinIO bucket...');
  try {
    // Try mc client first (fast path)
    execSync(
      'mc alias set e2e http://localhost:14802 e2ekey e2esecret 2>/dev/null && mc mb --ignore-existing e2e/findwith-test 2>/dev/null',
      { stdio: 'pipe', shell: true },
    );
    console.log('[setup] MinIO bucket ready (mc)');
  } catch {
    // Fallback: use AWS SDK from backend's node_modules (CJS require)
    try {
      // createRequire relative to BACKEND_DIR resolves @aws-sdk/client-s3 from there
      const req = createRequire(path.join(BACKEND_DIR, '__e2e_setup__.js'));
      const { S3Client, CreateBucketCommand, HeadBucketCommand } = req('@aws-sdk/client-s3');
      const s3 = new S3Client({
        region: 'us-east-1',
        credentials: { accessKeyId: 'e2ekey', secretAccessKey: 'e2esecret' },
        endpoint: 'http://localhost:14802',
        forcePathStyle: true,
      });
      try {
        await s3.send(new HeadBucketCommand({ Bucket: 'findwith-test' }));
        console.log('[setup] MinIO bucket already exists');
      } catch {
        await s3.send(new CreateBucketCommand({ Bucket: 'findwith-test' }));
        console.log('[setup] MinIO bucket created (SDK)');
      }
    } catch (sdkErr) {
      console.warn('[setup] MinIO bucket setup failed — upload tests may fail:', sdkErr);
    }
  }

  // ── 3. Migrations ─────────────────────────────────────────────────────────
  console.log('[setup] Running migrations...');
  const envVars = parseEnvFile(path.join(BACKEND_DIR, ENV_FILE));
  execSync(
    'pnpm run typeorm migration:run -d src/database/data-source.ts',
    { cwd: BACKEND_DIR, stdio: 'inherit', env: { ...process.env, ...envVars } },
  );

  // ── 4. Seed fixture data ───────────────────────────────────────────────────
  console.log('[setup] Seeding fixture data...');
  execSync(
    'pnpm exec tsx ../e2e/fixtures/seed.ts',
    { cwd: BACKEND_DIR, stdio: 'inherit', env: { ...process.env, ...envVars } },
  );

  // ── 5. Start backend ───────────────────────────────────────────────────────
  // Kill any process already on port 14807 (leaked from a previous run).
  console.log('[setup] Starting backend...');
  try {
    execSync('lsof -ti :14807 | xargs kill -9', { stdio: 'pipe', shell: true });
    await new Promise((r) => setTimeout(r, 500));
  } catch {
    // Nothing was listening — that's fine
  }

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

  await waitForBackend('http://localhost:14807/ready', 30_000);
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
