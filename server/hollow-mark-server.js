import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOLLOW_MARK_MODEL_VERSION,
  MASK_DRIVES,
  MOVES,
  ZONES,
  applyMove,
  createMask,
  createWorldState,
  describeMaskShape,
  describeMoveForecast,
  describeWorldZones,
  getPlayableSummary,
} from '../src/domain/hollow-mark-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const storePath = process.env.HOLLOW_MARK_STORE
  ? path.resolve(process.env.HOLLOW_MARK_STORE)
  : path.join(__dirname, 'data', 'hollow-mark-store.json');
const port = Number(process.env.HOLLOW_MARK_PORT ?? process.env.PORT ?? 8787);
const host = process.env.HOLLOW_MARK_HOST ?? '127.0.0.1';

let storePromise;
let writeQueue = Promise.resolve();

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      sendEmpty(res, 204);
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`);
    if (url.pathname.startsWith('/api/')) {
      await routeApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    const status = Number(error.statusCode ?? error.status ?? 500);
    sendJson(res, status, {
      error: status >= 500 ? 'Internal server error' : error.message,
      requestId: randomUUID(),
    });
    if (status >= 500) console.error(error);
  }
});

server.listen(port, host, () => {
  console.log(`Hollow Mark API listening on http://${host}:${port}`);
});

async function routeApi(req, res, url) {
  if (url.pathname === '/api/health' && req.method === 'GET') {
    const store = await readStore();
    sendJson(res, 200, {
      ok: true,
      service: 'hollow-mark-api',
      modelVersion: HOLLOW_MARK_MODEL_VERSION,
      worldTick: store.world.tick,
      chronicleCount: store.chronicle.length,
      serverTime: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === '/api/catalog' && req.method === 'GET') {
    sendJson(res, 200, {
      drives: MASK_DRIVES,
      zones: ZONES,
      moves: MOVES,
      modelVersion: HOLLOW_MARK_MODEL_VERSION,
    });
    return;
  }

  if (url.pathname === '/api/world/public' && req.method === 'GET') {
    const store = await readStore();
    sendJson(res, 200, createPublicWorldPayload(store));
    return;
  }

  if (url.pathname === '/api/world/pulse' && req.method === 'GET') {
    const store = await readStore();
    sendJson(res, 200, {
      pulse: getPlayableSummary(store.world).pulse,
      tick: store.world.tick,
      hotZones: getPlayableSummary(store.world).hotZones,
      serverTime: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === '/api/zones' && req.method === 'GET') {
    const store = await readStore();
    sendJson(res, 200, {
      zones: describeWorldZones(store.world),
      source: 'hollow-mark-world',
      tick: store.world.tick,
    });
    return;
  }

  if (url.pathname === '/api/mask' && req.method === 'GET') {
    const store = await readStore();
    const session = ensureSession(req, res, store);
    await persistStore(store);
    sendJson(res, 200, createSessionPayload(store, session), sessionHeader(session.id));
    return;
  }

  if (url.pathname === '/api/mask' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const store = await readStore();
    const session = ensureSession(req, res, store);
    const drive = assertKnownDrive(body.drive ?? session.mask.drive);
    const nextMask = createMask({
      id: session.mask.id,
      name: session.mask.name,
      drive,
    });
    session.mask = {
      ...nextMask,
      marks: [...session.mask.marks],
      scars: [...session.mask.scars],
      shape: shouldPreserveShape(session.mask) ? session.mask.shape : nextMask.shape,
    };
    session.updatedAt = new Date().toISOString();
    await persistStore(store);
    sendJson(res, 200, createSessionPayload(store, session), sessionHeader(session.id));
    return;
  }

  if (url.pathname === '/api/mask/drive' && req.method === 'PATCH') {
    const body = await readJsonBody(req);
    const store = await readStore();
    const session = ensureSession(req, res, store);
    const drive = assertKnownDrive(body.drive);
    const nextMask = createMask({
      id: session.mask.id,
      name: session.mask.name,
      drive,
    });
    session.mask = {
      ...nextMask,
      marks: [...session.mask.marks],
      scars: [...session.mask.scars],
      shape: shouldPreserveShape(session.mask) ? session.mask.shape : nextMask.shape,
    };
    session.updatedAt = new Date().toISOString();
    await persistStore(store);
    sendJson(res, 200, createSessionPayload(store, session), sessionHeader(session.id));
    return;
  }

  if (url.pathname === '/api/world/move' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const store = await readStore();
    const session = ensureSession(req, res, store);
    const zoneId = assertKnownZone(body.zoneId ?? session.selectedZone);
    const moveId = assertKnownMove(body.moveId ?? session.selectedMove);
    const now = new Date().toISOString();
    const result = applyMove(store.world, session.mask, moveId, zoneId, now);
    store.world = result.world;
    session.mask = result.mask;
    session.selectedZone = zoneId;
    session.selectedMove = moveId;
    session.lastTrace = result.trace;
    session.updatedAt = now;
    appendChronicle(store, session, result.trace, now);
    appendSnapshot(store, now);
    await persistStore(store);
    sendJson(res, 200, createSessionPayload(store, session), sessionHeader(session.id));
    return;
  }

  if (url.pathname === '/api/world/me/traces' && req.method === 'GET') {
    const store = await readStore();
    const session = ensureSession(req, res, store);
    const traces = store.world.zones
      .flatMap((zone) => zone.traces.map((trace) => ({ ...trace, zoneLabel: zone.label })))
      .filter((trace) => trace.maskId === session.mask.id)
      .reverse();
    await persistStore(store);
    sendJson(res, 200, { traces, count: traces.length }, sessionHeader(session.id));
    return;
  }

  if (url.pathname === '/api/chronicle/public' && req.method === 'GET') {
    const store = await readStore();
    sendJson(res, 200, {
      events: store.chronicle.filter((event) => event.publicVisibility).slice(-50).reverse(),
      count: store.chronicle.length,
      tick: store.world.tick,
    });
    return;
  }

  if (url.pathname === '/api/creator/overview' && req.method === 'GET') {
    const store = await readStore();
    sendJson(res, 200, createCreatorOverviewPayload(store));
    return;
  }

  if (url.pathname === '/api/admin/world' && req.method === 'GET') {
    const store = await readStore();
    sendJson(res, 200, {
      world: store.world,
      sessions: Object.values(store.sessions).map((session) => ({
        id: session.id,
        maskId: session.mask.id,
        drive: session.mask.drive,
        will: session.mask.will,
        marks: session.mask.marks.length,
        scars: session.mask.scars.length,
        updatedAt: session.updatedAt,
      })),
      chronicle: store.chronicle.slice(-80).reverse(),
      snapshots: store.snapshots.slice(-30).reverse(),
      note: 'Local creator view. Add auth before public deployment.',
    });
    return;
  }

  sendJson(res, 404, { error: 'Unknown Hollow Mark API route' });
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const cleanPath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const requested = cleanPath === '/' ? '/index.html' : cleanPath;
  const filePath = path.join(distRoot, requested);
  const finalPath = await resolveStaticPath(filePath);
  if (!finalPath) {
    sendJson(res, 404, {
      error: 'Static build not found. Run npm run build before npm start.',
    });
    return;
  }

  const ext = path.extname(finalPath);
  res.writeHead(200, {
    ...corsHeaders(),
    'Content-Type': mimeTypes.get(ext) ?? 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(finalPath).pipe(res);
}

async function resolveStaticPath(filePath) {
  if (!filePath.startsWith(distRoot)) return null;
  if (existsSync(filePath) && (await stat(filePath)).isFile()) return filePath;
  const fallback = path.join(distRoot, 'index.html');
  if (existsSync(fallback) && (await stat(fallback)).isFile()) return fallback;
  return null;
}

async function readStore() {
  if (!storePromise) storePromise = loadStore();
  return storePromise;
}

async function loadStore() {
  try {
    const raw = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Rebuilding Hollow Mark store after read failure: ${error.message}`);
    }
    return createEmptyStore();
  }
}

function createEmptyStore() {
  const now = new Date().toISOString();
  return {
    version: 'hollow-mark-store-v0',
    createdAt: now,
    updatedAt: now,
    world: createWorldState(),
    sessions: {},
    chronicle: [],
    snapshots: [],
  };
}

function normalizeStore(candidate) {
  const empty = createEmptyStore();
  if (!candidate || candidate.version !== empty.version) return empty;
  if (!candidate.world || candidate.world.version !== HOLLOW_MARK_MODEL_VERSION) return empty;

  return {
    ...empty,
    ...candidate,
    sessions: normalizeSessions(candidate.sessions),
    chronicle: Array.isArray(candidate.chronicle) ? candidate.chronicle : [],
    snapshots: Array.isArray(candidate.snapshots) ? candidate.snapshots : [],
  };
}

function normalizeSessions(sessions) {
  if (!sessions || typeof sessions !== 'object') return {};
  return Object.fromEntries(
    Object.entries(sessions)
      .filter(([, session]) => session?.mask?.version === HOLLOW_MARK_MODEL_VERSION)
      .map(([id, session]) => [id, {
        id,
        createdAt: session.createdAt ?? new Date().toISOString(),
        updatedAt: session.updatedAt ?? new Date().toISOString(),
        selectedZone: ZONES.some((zone) => zone.id === session.selectedZone)
          ? session.selectedZone
          : 'threshold-floor',
        selectedMove: MOVES.some((move) => move.id === session.selectedMove)
          ? session.selectedMove
          : 'mark',
        lastTrace: session.lastTrace ?? null,
        mask: session.mask,
      }]),
  );
}

async function persistStore(store) {
  store.updatedAt = new Date().toISOString();
  writeQueue = writeQueue.then(async () => {
    await mkdir(path.dirname(storePath), { recursive: true });
    const tmpPath = `${storePath}.${process.pid}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(store, null, 2)}\n`);
    await rename(tmpPath, storePath);
  });
  await writeQueue;
}

function ensureSession(req, res, store) {
  const requested = String(req.headers['x-hollow-session'] ?? '').trim();
  const sessionId = requested && /^[a-zA-Z0-9:_-]{8,96}$/.test(requested)
    ? requested
    : `hm_${randomUUID()}`;
  if (!store.sessions[sessionId]) {
    const now = new Date().toISOString();
    store.sessions[sessionId] = {
      id: sessionId,
      createdAt: now,
      updatedAt: now,
      selectedZone: 'threshold-floor',
      selectedMove: 'mark',
      lastTrace: null,
      mask: createMask({
        id: `mask_${sessionId}`,
        name: 'Unformed Mask',
        drive: 'softness',
      }),
    };
  }
  res.setHeader('x-hollow-session', sessionId);
  return store.sessions[sessionId];
}

function createSessionPayload(store, session) {
  const moveForecast = describeMoveForecast(
    store.world,
    session.mask,
    session.selectedMove,
    session.selectedZone,
  );

  return {
    modelVersion: HOLLOW_MARK_MODEL_VERSION,
    sessionId: session.id,
    mask: session.mask,
    maskShape: describeMaskShape(session.mask),
    world: store.world,
    summary: getPlayableSummary(store.world),
    zoneLoom: describeWorldZones(store.world),
    selectedZone: session.selectedZone,
    selectedMove: session.selectedMove,
    selectedZoneState: describeWorldZones(store.world).find((zone) => zone.id === session.selectedZone),
    moveForecast,
    lastTrace: session.lastTrace,
    chronicle: store.chronicle.filter((event) => event.publicVisibility).slice(-20).reverse(),
    serverTime: new Date().toISOString(),
  };
}

function createPublicWorldPayload(store) {
  return {
    modelVersion: HOLLOW_MARK_MODEL_VERSION,
    world: store.world,
    summary: getPlayableSummary(store.world),
    zones: describeWorldZones(store.world),
    chronicle: store.chronicle.filter((event) => event.publicVisibility).slice(-20).reverse(),
    snapshots: store.snapshots.slice(-10).reverse(),
    serverTime: new Date().toISOString(),
  };
}

function createCreatorOverviewPayload(store) {
  const sessions = Object.values(store.sessions);
  const driveCounts = sessions.reduce((counts, session) => {
    counts[session.mask.drive] = (counts[session.mask.drive] ?? 0) + 1;
    return counts;
  }, {});
  const zoneState = describeWorldZones(store.world);
  const pressureLeaders = [...zoneState]
    .sort((left, right) => right.intensity - left.intensity)
    .slice(0, 3);
  const visibleTraceCount = store.world.zones.reduce((total, zone) => total + zone.visibleMarks.length, 0);

  return {
    modelVersion: HOLLOW_MARK_MODEL_VERSION,
    summary: getPlayableSummary(store.world),
    pressureLeaders,
    zoneState,
    chronicle: store.chronicle.filter((event) => event.publicVisibility).slice(-12).reverse(),
    sessions: {
      total: sessions.length,
      driveCounts,
      activeMasks: sessions
        .filter((session) => session.updatedAt)
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
        .slice(0, 8)
        .map((session) => ({
          id: session.id,
          maskId: session.mask.id,
          drive: session.mask.drive,
          will: session.mask.will,
          marks: session.mask.marks.length,
          scars: session.mask.scars.length,
          updatedAt: session.updatedAt,
        })),
    },
    ledger: {
      tick: store.world.tick,
      visibleTraceCount,
      chronicleCount: store.chronicle.length,
      snapshotCount: store.snapshots.length,
    },
    serverTime: new Date().toISOString(),
  };
}

function appendChronicle(store, session, trace, now) {
  const zone = store.world.zones.find((candidate) => candidate.id === trace.zone);
  const event = {
    id: `chronicle_${randomUUID()}`,
    eventType: trace.visibility >= 0.24 ? 'visible_trace' : 'private_pressure',
    zoneId: trace.zone,
    maskId: session.mask.id,
    traceId: trace.id,
    moveId: trace.move,
    title: trace.visibility >= 0.24 ? 'A trace became visible' : 'Pressure moved under glass',
    body: `${session.mask.drive} used ${trace.move} in ${zone?.label ?? trace.zone}.`,
    publicVisibility: trace.visibility >= 0.14,
    createdAt: now,
    pulse: getPlayableSummary(store.world).pulse,
  };
  store.chronicle.push(event);
  if (store.chronicle.length > 180) store.chronicle = store.chronicle.slice(-180);
}

function appendSnapshot(store, now) {
  store.snapshots.push({
    id: `snapshot_${randomUUID()}`,
    tick: store.world.tick,
    pulse: getPlayableSummary(store.world).pulse,
    zoneState: describeWorldZones(store.world),
    createdAt: now,
  });
  if (store.snapshots.length > 90) store.snapshots = store.snapshots.slice(-90);
}

function shouldPreserveShape(mask) {
  const shape = mask.shape ?? {};
  return Boolean(
    (Number(shape.visibility) || 0) > 0
      || (Number(shape.fracture) || 0) > 0
      || (Array.isArray(mask.marks) && mask.marks.length > 0)
      || (Array.isArray(mask.scars) && mask.scars.length > 0),
  );
}

function assertKnownDrive(drive) {
  if (!MASK_DRIVES.some((candidate) => candidate.id === drive)) {
    const error = new Error('Unknown mask drive');
    error.statusCode = 400;
    throw error;
  }
  return drive;
}

function assertKnownZone(zoneId) {
  if (!ZONES.some((zone) => zone.id === zoneId)) {
    const error = new Error('Unknown zone');
    error.statusCode = 400;
    throw error;
  }
  return zoneId;
}

function assertKnownMove(moveId) {
  if (!MOVES.some((move) => move.id === moveId)) {
    const error = new Error('Unknown move');
    error.statusCode = 400;
    throw error;
  }
  return moveId;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    ...corsHeaders(),
    ...headers,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendEmpty(res, status) {
  res.writeHead(status, corsHeaders());
  res.end();
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,x-hollow-session,x-hollow-admin',
    'Access-Control-Expose-Headers': 'x-hollow-session',
  };
}

function sessionHeader(sessionId) {
  return {
    'x-hollow-session': sessionId,
  };
}
