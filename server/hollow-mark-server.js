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
  describeWorldRelations,
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
      ledgerCount: store.ledger.length,
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

  if (url.pathname === '/api/world/relations' && req.method === 'GET') {
    const store = await readStore();
    const relations = describeWorldRelations(store.world);
    sendJson(res, 200, {
      relations,
      count: relations.length,
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
    const beforeMove = createBeforeMoveContext(store, session, zoneId);
    const result = applyMove(store.world, session.mask, moveId, zoneId, now);
    store.world = result.world;
    session.mask = result.mask;
    session.selectedZone = zoneId;
    session.selectedMove = moveId;
    session.lastTrace = result.trace;
    session.updatedAt = now;
    const chronicleEvents = appendChronicle(store, session, result.trace, now, beforeMove);
    appendLedger(store, session, result.trace, now, beforeMove, chronicleEvents);
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

  if (url.pathname === '/api/world/me/ledger' && req.method === 'GET') {
    const store = await readStore();
    const session = ensureSession(req, res, store);
    await persistStore(store);
    const actions = createSessionLedger(store, session.id);
    sendJson(res, 200, {
      actions,
      count: actions.length,
      tick: store.world.tick,
    }, sessionHeader(session.id));
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

  if (url.pathname === '/api/ledger/public' && req.method === 'GET') {
    const store = await readStore();
    const actions = createPublicLedger(store);
    sendJson(res, 200, {
      actions,
      count: actions.length,
      totalCount: store.ledger.length,
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
      ledger: createCreatorLedger(store).slice(0, 80),
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
    ledger: [],
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
    ledger: Array.isArray(candidate.ledger) ? candidate.ledger : [],
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
    relations: describeWorldRelations(store.world),
    chronicle: store.chronicle.filter((event) => event.publicVisibility).slice(-20).reverse(),
    ledger: createSessionLedger(store, session.id).slice(0, 20),
    consequenceSummary: createConsequenceSummary(store),
    serverTime: new Date().toISOString(),
  };
}

function createPublicWorldPayload(store) {
  return {
    modelVersion: HOLLOW_MARK_MODEL_VERSION,
    world: store.world,
    summary: getPlayableSummary(store.world),
    zones: describeWorldZones(store.world),
    relations: describeWorldRelations(store.world),
    chronicle: store.chronicle.filter((event) => event.publicVisibility).slice(-20).reverse(),
    ledger: createPublicLedger(store).slice(0, 20),
    consequenceSummary: createConsequenceSummary(store),
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
  const relations = describeWorldRelations(store.world);

  return {
    modelVersion: HOLLOW_MARK_MODEL_VERSION,
    summary: getPlayableSummary(store.world),
    pressureLeaders,
    zoneState,
    relations,
    chronicle: store.chronicle.filter((event) => event.publicVisibility).slice(-12).reverse(),
    consequenceSummary: createConsequenceSummary(store),
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
      actionCount: store.ledger.length,
      publicActionCount: store.ledger.filter((action) => action.publicVisibility).length,
      relationCount: relations.length,
      guardedZoneCount: zoneState.filter((zone) => zone.guard > 0.08).length,
      snapshotCount: store.snapshots.length,
    },
    recentActions: createCreatorLedger(store).slice(0, 8),
    serverTime: new Date().toISOString(),
  };
}

function createBeforeMoveContext(store, session, zoneId) {
  return {
    summary: getPlayableSummary(store.world),
    zone: describeWorldZones(store.world).find((candidate) => candidate.id === zoneId),
    relations: describeWorldRelations(store.world),
    maskShape: describeMaskShape(session.mask),
  };
}

function appendChronicle(store, session, trace, now, beforeMove) {
  const zone = store.world.zones.find((candidate) => candidate.id === trace.zone);
  const afterSummary = getPlayableSummary(store.world);
  const afterZone = describeWorldZones(store.world).find((candidate) => candidate.id === trace.zone);
  const afterMaskShape = describeMaskShape(session.mask);
  const events = [
    createChronicleEvent({
      eventType: trace.visibility >= 0.24 ? 'visible_trace' : 'private_pressure',
      zoneId: trace.zone,
      maskId: session.mask.id,
      traceId: trace.id,
      moveId: trace.move,
      title: trace.visibility >= 0.24 ? 'Visible trace' : 'Pressure under glass',
      body: `${session.mask.drive} used ${trace.move} in ${zone?.label ?? trace.zone}.`,
      publicVisibility: trace.visibility >= 0.14,
      severity: trace.visibility >= 0.24 ? 'signal' : 'quiet',
      now,
      pulse: afterSummary.pulse,
      zoneState: afterZone?.state,
    }),
  ];

  if (beforeMove?.maskShape && didMaskShapeShift(beforeMove.maskShape, afterMaskShape)) {
    events.push(createChronicleEvent({
      eventType: 'mask_shift',
      zoneId: trace.zone,
      maskId: session.mask.id,
      traceId: trace.id,
      moveId: trace.move,
      title: 'Mask surface changed',
      body: `${beforeMove.maskShape.silhouette}/${beforeMove.maskShape.surface} became ${afterMaskShape.silhouette}/${afterMaskShape.surface}.`,
      publicVisibility: trace.visibility >= 0.14 || afterMaskShape.visibility >= 0.1,
      severity: afterMaskShape.fracture >= 0.3 ? 'sharp' : 'signal',
      now,
      pulse: afterSummary.pulse,
      zoneState: afterZone?.state,
    }));
  }

  if ((beforeMove?.zone?.pressure ?? 0) < 0.88 && (afterZone?.pressure ?? 0) >= 0.88) {
    events.push(createChronicleEvent({
      eventType: 'pressure_peak',
      zoneId: trace.zone,
      maskId: session.mask.id,
      traceId: trace.id,
      moveId: trace.move,
      title: 'Zone pressure peaked',
      body: `${afterZone?.label ?? trace.zone} crossed a high-pressure line.`,
      publicVisibility: true,
      severity: 'sharp',
      now,
      pulse: afterSummary.pulse,
      zoneState: afterZone?.state,
    }));
  }

  if ((beforeMove?.zone?.fracture ?? 0) < 0.42 && (afterZone?.fracture ?? 0) >= 0.42) {
    events.push(createChronicleEvent({
      eventType: 'zone_fracture',
      zoneId: trace.zone,
      maskId: session.mask.id,
      traceId: trace.id,
      moveId: trace.move,
      title: 'Fracture line formed',
      body: `${afterZone?.label ?? trace.zone} is no longer only pressured; it is breaking open.`,
      publicVisibility: true,
      severity: 'critical',
      now,
      pulse: afterSummary.pulse,
      zoneState: afterZone?.state,
    }));
  }

  if (beforeMove?.zone?.state !== 'opened' && afterZone?.state === 'opened') {
    events.push(createChronicleEvent({
      eventType: 'zone_opened',
      zoneId: trace.zone,
      maskId: session.mask.id,
      traceId: trace.id,
      moveId: trace.move,
      title: 'Zone opened',
      body: `${afterZone.label} became readable to everyone entering the Threshold.`,
      publicVisibility: true,
      severity: 'critical',
      now,
      pulse: afterSummary.pulse,
      zoneState: afterZone?.state,
    }));
  }

  if ((beforeMove?.summary?.pulse?.pressure ?? 0) < 0.58 && afterSummary.pulse.pressure >= 0.58) {
    events.push(createChronicleEvent({
      eventType: 'world_pulse_rise',
      zoneId: trace.zone,
      maskId: session.mask.id,
      traceId: trace.id,
      moveId: trace.move,
      title: 'World pulse rose',
      body: 'The shared pressure line crossed into a more dangerous range.',
      publicVisibility: true,
      severity: 'signal',
      now,
      pulse: afterSummary.pulse,
      zoneState: afterZone?.state,
    }));
  }

  events.push(...createWorldEffectEvents({
    effects: trace.worldEffects ?? [],
    trace,
    session,
    now,
    afterSummary,
    afterZone,
  }));

  store.chronicle.push(...events);
  if (store.chronicle.length > 180) store.chronicle = store.chronicle.slice(-180);
  return events;
}

function createWorldEffectEvents({ effects, trace, session, now, afterSummary, afterZone }) {
  return effects
    .filter((effect) => ['relation_bound', 'relation_deepened', 'relation_severed', 'pressure_bent', 'zone_guarded'].includes(effect.type))
    .map((effect) => {
      const eventConfig = createWorldEffectEventConfig(effect);
      return createChronicleEvent({
        eventType: effect.type,
        zoneId: trace.zone,
        maskId: session.mask.id,
        traceId: trace.id,
        moveId: trace.move,
        title: eventConfig.title,
        body: eventConfig.body,
        publicVisibility: true,
        severity: eventConfig.severity,
        now,
        pulse: afterSummary.pulse,
        zoneState: afterZone?.state,
      });
    });
}

function createWorldEffectEventConfig(effect) {
  if (effect.type === 'relation_bound') {
    if (effect.kind === 'bend') {
      return {
        title: 'Bend channel formed',
        body: `${labelZone(effect.fromZoneId)} can now redirect pressure toward ${labelZone(effect.toZoneId)}.`,
        severity: 'sharp',
      };
    }
    return {
      title: 'Echo link formed',
      body: `${labelZone(effect.fromZoneId)} now carries pressure toward ${labelZone(effect.toZoneId)}.`,
      severity: 'signal',
    };
  }
  if (effect.type === 'relation_deepened') {
    if (effect.kind === 'bend') {
      return {
        title: 'Bend channel deepened',
        body: `${labelZone(effect.fromZoneId)} bends more tension toward ${labelZone(effect.toZoneId)}.`,
        severity: 'sharp',
      };
    }
    return {
      title: 'Echo link deepened',
      body: `${labelZone(effect.fromZoneId)} and ${labelZone(effect.toZoneId)} answer each other more strongly.`,
      severity: 'signal',
    };
  }
  if (effect.type === 'relation_severed') {
    return {
      title: 'Echo link cut',
      body: `${labelZone(effect.fromZoneId)} stopped carrying pressure toward ${labelZone(effect.toZoneId)}.`,
      severity: 'sharp',
    };
  }
  if (effect.type === 'pressure_bent') {
    return {
      title: 'Pressure redirected',
      body: `${labelZone(effect.fromZoneId)} bent part of its tension toward ${labelZone(effect.toZoneId)}.`,
      severity: 'sharp',
    };
  }
  return {
    title: 'Zone guard raised',
    body: `${labelZone(effect.zoneId)} gained protection against the next pressure line.`,
    severity: 'signal',
  };
}

function labelZone(zoneId) {
  return ZONES.find((zone) => zone.id === zoneId)?.label ?? zoneId ?? 'Unknown zone';
}

function createChronicleEvent({
  eventType,
  zoneId,
  maskId,
  traceId,
  moveId,
  title,
  body,
  publicVisibility,
  severity,
  now,
  pulse,
  zoneState,
}) {
  return {
    id: `chronicle_${randomUUID()}`,
    eventType,
    zoneId,
    maskId,
    traceId,
    moveId,
    title,
    body,
    publicVisibility,
    severity,
    createdAt: now,
    pulse,
    zoneState,
  };
}

function appendLedger(store, session, trace, now, beforeMove, chronicleEvents) {
  const afterSummary = getPlayableSummary(store.world);
  const afterZone = describeWorldZones(store.world).find((candidate) => candidate.id === trace.zone);
  const afterMaskShape = describeMaskShape(session.mask);
  const move = MOVES.find((candidate) => candidate.id === trace.move);
  const zone = ZONES.find((candidate) => candidate.id === trace.zone);
  const publicVisibility = chronicleEvents.some((event) => event.publicVisibility);

  const entry = {
    id: `ledger_${randomUUID()}`,
    tick: store.world.tick,
    createdAt: now,
    sessionId: session.id,
    maskId: session.mask.id,
    maskRef: createMaskRef(session.mask),
    drive: session.mask.drive,
    zoneId: trace.zone,
    zoneLabel: zone?.label ?? trace.zone,
    moveId: trace.move,
    moveLabel: move?.label ?? trace.move,
    publicVisibility,
    consequenceTypes: chronicleEvents.map((event) => event.eventType),
    consequenceSeverities: chronicleEvents.map((event) => event.severity),
    chronicleEventIds: chronicleEvents.map((event) => event.id),
    trace: projectTraceForLedger(trace),
    before: {
      pulse: roundPulse(beforeMove?.summary?.pulse),
      zone: reduceZoneState(beforeMove?.zone),
      maskShape: beforeMove?.maskShape ?? null,
    },
    after: {
      pulse: roundPulse(afterSummary.pulse),
      zone: reduceZoneState(afterZone),
      maskShape: afterMaskShape,
    },
    delta: createLedgerDelta(beforeMove, afterSummary, afterZone),
    summaryLine: `${session.mask.drive} / ${move?.label ?? trace.move} / ${zone?.label ?? trace.zone}`,
  };

  store.ledger.push(entry);
  if (store.ledger.length > 320) store.ledger = store.ledger.slice(-320);
  return entry;
}

function createPublicLedger(store) {
  return store.ledger
    .filter((action) => action.publicVisibility)
    .slice(-60)
    .reverse()
    .map(projectPublicLedgerAction);
}

function createSessionLedger(store, sessionId) {
  return store.ledger
    .filter((action) => action.sessionId === sessionId)
    .slice(-60)
    .reverse()
    .map(projectSessionLedgerAction);
}

function createCreatorLedger(store) {
  return store.ledger
    .slice(-60)
    .reverse()
    .map(projectCreatorLedgerAction);
}

function projectPublicLedgerAction(action) {
  return {
    id: action.id,
    tick: action.tick,
    createdAt: action.createdAt,
    maskRef: action.maskRef,
    drive: action.drive,
    zoneId: action.zoneId,
    zoneLabel: action.zoneLabel,
    moveId: action.moveId,
    moveLabel: action.moveLabel,
    publicVisibility: action.publicVisibility,
    severity: chooseLedgerSeverity(action),
    consequenceTypes: action.consequenceTypes,
    before: {
      pulse: action.before?.pulse ?? null,
      zoneState: action.before?.zone?.state ?? null,
      zoneIntensity: action.before?.zone?.intensity ?? null,
    },
    after: {
      pulse: action.after?.pulse ?? null,
      zoneState: action.after?.zone?.state ?? null,
      zoneIntensity: action.after?.zone?.intensity ?? null,
      maskShape: action.after?.maskShape ?? null,
    },
    delta: action.delta,
    trace: {
      visibility: action.trace?.visibility ?? 0,
      fracture: action.trace?.fracture ?? 0,
    },
    summaryLine: action.summaryLine,
  };
}

function projectSessionLedgerAction(action) {
  return {
    ...projectPublicLedgerAction(action),
    chronicleEventIds: action.chronicleEventIds,
    trace: action.trace,
  };
}

function projectCreatorLedgerAction(action) {
  return {
    ...projectSessionLedgerAction(action),
    sessionId: action.sessionId,
    maskId: action.maskId,
  };
}

function projectTraceForLedger(trace) {
  return {
    id: trace.id,
    at: trace.at,
    move: trace.move,
    zone: trace.zone,
    drive: trace.drive,
    pressure: round3(trace.pressure),
    clarity: round3(trace.clarity),
    visibility: round3(trace.visibility),
    fracture: round3(trace.fracture),
  };
}

function createLedgerDelta(beforeMove, afterSummary, afterZone) {
  const beforePulse = beforeMove?.summary?.pulse ?? {};
  const beforeZone = beforeMove?.zone ?? {};

  return {
    pulsePressure: round3((afterSummary.pulse.pressure ?? 0) - (beforePulse.pressure ?? 0)),
    pulseClarity: round3((afterSummary.pulse.clarity ?? 0) - (beforePulse.clarity ?? 0)),
    pulseFracture: round3((afterSummary.pulse.fracture ?? 0) - (beforePulse.fracture ?? 0)),
    zonePressure: round3((afterZone?.pressure ?? 0) - (beforeZone.pressure ?? 0)),
    zoneClarity: round3((afterZone?.clarity ?? 0) - (beforeZone.clarity ?? 0)),
    zoneFracture: round3((afterZone?.fracture ?? 0) - (beforeZone.fracture ?? 0)),
  };
}

function reduceZoneState(zone) {
  if (!zone) return null;
  return {
    id: zone.id,
    label: zone.label,
    state: zone.state,
    pressure: round3(zone.pressure),
    clarity: round3(zone.clarity),
    fracture: round3(zone.fracture),
    intensity: round3(zone.intensity),
    visibleTraceCount: zone.visibleTraceCount,
  };
}

function roundPulse(pulse = {}) {
  return {
    pressure: round3(pulse.pressure ?? 0),
    clarity: round3(pulse.clarity ?? 0),
    fracture: round3(pulse.fracture ?? 0),
  };
}

function createMaskRef(mask) {
  const compact = String(mask.id ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-6) || 'local';
  return `${mask.drive}-${compact}`;
}

function chooseLedgerSeverity(action) {
  const severities = action.consequenceSeverities ?? [];
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('sharp')) return 'sharp';
  if (severities.includes('signal')) return 'signal';
  return 'quiet';
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function createConsequenceSummary(store) {
  const publicEvents = store.chronicle.filter((event) => event.publicVisibility);
  const latest = publicEvents.at(-1) ?? null;
  const eventTypeCounts = publicEvents.reduce((counts, event) => {
    counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
    return counts;
  }, {});
  const criticalCount = publicEvents.filter((event) => event.severity === 'critical').length;
  const sharpCount = publicEvents.filter((event) => event.severity === 'sharp').length;
  const unresolvedZones = describeWorldZones(store.world)
    .filter((zone) => zone.state === 'fractured' || zone.pressure >= 0.88)
    .map((zone) => ({
      id: zone.id,
      label: zone.label,
      state: zone.state,
      intensity: zone.intensity,
    }));

  return {
    latest,
    eventTypeCounts,
    publicCount: publicEvents.length,
    criticalCount,
    sharpCount,
    unresolvedZones,
  };
}

function didMaskShapeShift(beforeShape, afterShape) {
  return beforeShape.silhouette !== afterShape.silhouette
    || beforeShape.surface !== afterShape.surface
    || beforeShape.dominantFacets.join('/') !== afterShape.dominantFacets.join('/');
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
