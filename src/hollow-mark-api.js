const HOLLOW_API_SESSION_KEY = 'hollow-mark.session.v1';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export async function loadRemoteHollowState() {
  return normalizeRemotePayload(await requestHollowApi('/api/mask'));
}

export async function setRemoteMaskDrive(drive) {
  return normalizeRemotePayload(await requestHollowApi('/api/mask/drive', {
    method: 'PATCH',
    body: { drive },
  }));
}

export async function commitRemoteMove({ zoneId, moveId }) {
  return normalizeRemotePayload(await requestHollowApi('/api/world/move', {
    method: 'POST',
    body: { zoneId, moveId },
  }));
}

export async function fetchPublicWorld() {
  return requestHollowApi('/api/world/public');
}

export async function fetchCreatorOverview() {
  return requestHollowApi('/api/creator/overview');
}

export function getHollowApiBaseUrl() {
  const configured = import.meta.env.VITE_HOLLOW_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  if (LOCAL_HOSTS.has(window.location.hostname)) {
    return 'http://127.0.0.1:8787';
  }

  return '';
}

async function requestHollowApi(path, options = {}) {
  const baseUrl = getHollowApiBaseUrl();
  if (!baseUrl) throw new Error('Hollow Mark API is not configured');

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2200);
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      'x-hollow-session': getSessionId(),
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: controller.signal,
  }).finally(() => {
    window.clearTimeout(timeout);
  });

  const sessionHeader = response.headers.get('x-hollow-session');
  if (sessionHeader) saveSessionId(sessionHeader);

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? 'Hollow Mark API request failed');
  }
  if (payload.sessionId) saveSessionId(payload.sessionId);
  return payload;
}

function normalizeRemotePayload(payload) {
  if (!payload?.mask || !payload?.world) {
    throw new Error('Hollow Mark API payload is incomplete');
  }

  return {
    mask: payload.mask,
    world: payload.world,
    summary: payload.summary ?? null,
    zoneLoom: payload.zoneLoom ?? null,
    selectedZoneState: payload.selectedZoneState ?? null,
    moveForecast: payload.moveForecast ?? null,
    relations: payload.relations ?? [],
    chronicle: payload.chronicle ?? [],
    ledger: payload.ledger ?? [],
    consequenceSummary: payload.consequenceSummary ?? null,
    serverTime: payload.serverTime ?? '',
    selectedZone: payload.selectedZone ?? 'threshold-floor',
    selectedMove: payload.selectedMove ?? 'mark',
    lastTrace: payload.lastTrace ?? null,
  };
}

function getSessionId() {
  try {
    const existing = window.localStorage.getItem(HOLLOW_API_SESSION_KEY);
    if (existing) return existing;
    const created = createSessionId();
    saveSessionId(created);
    return created;
  } catch {
    return createSessionId();
  }
}

function saveSessionId(sessionId) {
  try {
    window.localStorage.setItem(HOLLOW_API_SESSION_KEY, sessionId);
  } catch {
    // Session persistence is a convenience; the app still works without it.
  }
}

function createSessionId() {
  if (window.crypto?.randomUUID) return `hm_${window.crypto.randomUUID()}`;
  return `hm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}
