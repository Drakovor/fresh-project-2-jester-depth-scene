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

  const bound = await writeJson(
    '/api/world/move',
    { zoneId: 'pistachio-static', moveId: 'bind' },
    'POST',
    sessionId,
  );
  assert(bound.world.tick === 1, 'world tick did not advance after bind');
  assert(bound.lastTrace?.zone === 'pistachio-static', 'last trace zone mismatch after bind');
  assert(bound.summary.visibleTraceCount > 0, 'bind did not create a visible trace');
  assert(bound.summary.relationCount === 1, 'bind did not create relation count');
  assert(bound.relations.length === 1, 'session payload did not expose bound relation');
  assert(bound.consequenceSummary?.publicCount >= 2, 'session payload did not include relation consequences');
  assert(bound.consequenceSummary?.eventTypeCounts?.relation_bound >= 1, 'relation bind consequence was not counted');
  assert(Array.isArray(bound.ledger) && bound.ledger.length === 1, 'session payload did not include action ledger');
  assert(bound.ledger[0].after?.zoneState, 'session ledger did not expose after state');

  const relationsAfterBind = await readJson('/api/world/relations');
  assert(relationsAfterBind.count === 1, 'relations endpoint did not expose bound relation');
  assert(relationsAfterBind.relations[0].fromZoneLabel, 'relation projection did not include zone labels');

  await writeJson('/api/mask/drive', { drive: 'static' }, 'PATCH', sessionId);

  const spared = await writeJson(
    '/api/world/move',
    { zoneId: 'threshold-floor', moveId: 'spare' },
    'POST',
    sessionId,
  );
  assert(spared.world.tick === 2, 'world tick did not advance after spare');
  assert(spared.summary.guardedZoneCount >= 1, 'spare did not create guarded zone count');
  assert(spared.zoneLoom.some((zone) => zone.guard > 0.08), 'zone loom did not expose guard');
  assert(spared.consequenceSummary?.eventTypeCounts?.zone_guarded >= 1, 'zone guard consequence was not counted');

  const severed = await writeJson(
    '/api/world/move',
    { zoneId: 'pistachio-static', moveId: 'sever' },
    'POST',
    sessionId,
  );
  assert(severed.world.tick === 3, 'world tick did not advance after sever');
  assert(severed.summary.relationCount === 0, 'sever did not remove relation count');
  assert(severed.relations.length === 0, 'session payload still exposes relation after sever');
  assert(severed.consequenceSummary?.eventTypeCounts?.relation_severed >= 1, 'relation sever consequence was not counted');

  const chronicle = await readJson('/api/chronicle/public');
  assert(chronicle.events.length >= 4, 'chronicle did not record public events');
  assert(chronicle.events.some((event) => event.eventType === 'visible_trace'), 'chronicle did not include visible trace event');
  assert(chronicle.events.some((event) => event.eventType === 'relation_bound'), 'chronicle did not include relation bound event');
  assert(chronicle.events.some((event) => event.eventType === 'zone_guarded'), 'chronicle did not include zone guarded event');
  assert(chronicle.events.some((event) => event.eventType === 'relation_severed'), 'chronicle did not include relation severed event');

  const publicLedger = await readJson('/api/ledger/public');
  assert(publicLedger.actions.length === 3, 'public ledger did not expose public actions');
  assert(publicLedger.actions.some((action) => action.consequenceTypes.includes('relation_bound')), 'public ledger did not include relation bind action');

  const sessionLedger = await readJson('/api/world/me/ledger', sessionId);
  assert(sessionLedger.actions.length === 3, 'session ledger did not expose own actions');
  assert(sessionLedger.actions[0].chronicleEventIds.length >= 1, 'session ledger did not link chronicle events');

  const marks = await readJson('/api/world/me/marks', sessionId);
  assert(marks.progression?.stage?.label, 'marks endpoint did not expose mask progression stage');
  assert(marks.progression?.anchorZone?.label, 'marks endpoint did not expose mask progression anchor');
  assert(marks.progression?.catalysts?.length === 4, 'marks endpoint did not expose mask catalysts');
  assert(marks.progression?.recentChain?.length === 3, 'marks endpoint did not expose recent trace chain');

  const creator = await readJson('/api/creator/overview');
  assert(creator.ledger.tick === 3, 'creator overview did not expose current tick');
  assert(creator.ledger.actionCount === 3, 'creator overview did not count action ledger');
  assert(creator.ledger.publicActionCount === 3, 'creator overview did not count public action ledger');
  assert(creator.ledger.guardedZoneCount >= 1, 'creator overview did not count guarded zones');
  assert(creator.recentActions.length === 3, 'creator overview did not expose recent actions');
  assert(creator.sessions.total === 1, 'creator overview did not count active session');
  assert(creator.pressureLeaders.length > 0, 'creator overview did not expose pressure leaders');
  assert(creator.consequenceSummary.publicCount >= 1, 'creator overview did not expose consequence summary');

  const admin = await readJson('/api/admin/world');
  assert(admin.sessions.length === 1, 'admin world did not expose the test session');
  assert(admin.ledger.length === 3, 'admin world did not expose the action ledger');
  assert(admin.snapshots.length === 3, 'world snapshots were not recorded');

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
