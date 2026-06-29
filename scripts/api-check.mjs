import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const port = 8799;
const baseUrl = `http://127.0.0.1:${port}`;
const storePath = path.join(projectRoot, 'tmp', 'api-check-store.json');

await rm(storePath, { force: true });

const server = spawn(process.execPath, ['server/hollow-mark-server.js'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    HOLLOW_MARK_PORT: String(port),
    HOLLOW_MARK_STORE: storePath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', (chunk) => {
  output += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  output += chunk.toString();
});

try {
  await waitForHealth();
  const health = await readJson('/api/health');
  assert(health.ok === true, 'health endpoint did not return ok');

  const session = await readJson('/api/mask');
  const sessionId = session.sessionId;
  assert(sessionId, 'session id was not created');
  assert(session.mask.drive === 'softness', 'default mask drive should be softness');

  const changedMask = await writeJson('/api/mask/drive', { drive: 'defiance' }, 'PATCH', sessionId);
  assert(changedMask.mask.drive === 'defiance', 'drive was not updated');

  const moved = await writeJson(
    '/api/world/move',
    { zoneId: 'pistachio-static', moveId: 'sever' },
    'POST',
    sessionId,
  );
  assert(moved.world.tick === 1, 'world tick did not advance');
  assert(moved.lastTrace?.zone === 'pistachio-static', 'last trace zone mismatch');
  assert(moved.summary.visibleTraceCount > 0, 'move did not create a visible trace');

  const chronicle = await readJson('/api/chronicle/public');
  assert(chronicle.events.length === 1, 'chronicle did not record public event');

  const creator = await readJson('/api/creator/overview');
  assert(creator.ledger.tick === 1, 'creator overview did not expose current tick');
  assert(creator.sessions.total === 1, 'creator overview did not count active session');
  assert(creator.pressureLeaders.length > 0, 'creator overview did not expose pressure leaders');

  const admin = await readJson('/api/admin/world');
  assert(admin.sessions.length === 1, 'admin world did not expose the test session');
  assert(admin.snapshots.length === 1, 'world snapshot was not recorded');

  console.log('Hollow Mark API check passed');
} finally {
  server.kill('SIGTERM');
  await new Promise((resolve) => server.once('close', resolve));
}

async function waitForHealth() {
  const started = Date.now();
  while (Date.now() - started < 6000) {
    try {
      await readJson('/api/health');
      return;
    } catch {
      await delay(120);
    }
  }
  throw new Error(`API did not become healthy:\n${output}`);
}

async function readJson(pathname, sessionId = '') {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: sessionId ? { 'x-hollow-session': sessionId } : {},
  });
  return parseResponse(response);
}

async function writeJson(pathname, body, method, sessionId) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-hollow-session': sessionId,
    },
    body: JSON.stringify(body),
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(json)}`);
  }
  return json;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
