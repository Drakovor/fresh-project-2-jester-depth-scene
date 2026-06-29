import {
  DEFAULT_PRESENCE_STATE,
  loadPresenceState,
} from './presence-model.js';
import {
  HOLLOW_MARK_MODEL_VERSION,
  createMask,
  createWorldState,
  describeMaskShape,
  describeMoveForecast,
  describeWorldZones,
  getPlayableSummary,
} from './domain/hollow-mark-core.js';
import { loadRemoteHollowState } from './hollow-mark-api.js';

const HOLLOW_MARK_STORAGE_KEY = 'hollow-mark.prototype.v1';

const shellState = {
  ...DEFAULT_PRESENCE_STATE,
};

const hollowState = {
  open: false,
  mask: createMask({ drive: 'softness' }),
  world: createWorldState(),
  selectedZone: 'threshold-floor',
  selectedMove: 'mark',
  lastTrace: null,
};

let hydrated = false;
let remoteHydrated = false;

function hydrate() {
  if (hydrated) return;
  hydrated = true;

  Object.assign(shellState, loadPresenceState());
  Object.assign(hollowState, loadHollowMarkState());

  const mount = document.getElementById('app-shell');
  if (mount) mount.replaceChildren();

  emitPresence();
  emitHollowMark();
  hydrateRemoteHollowMark();
}

function loadHollowMarkState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HOLLOW_MARK_STORAGE_KEY));
    if (!parsed || parsed.version !== HOLLOW_MARK_MODEL_VERSION) return {};
    if (!parsed.mask || !parsed.world) return {};
    if (parsed.mask.version !== HOLLOW_MARK_MODEL_VERSION) return {};
    if (parsed.world.version !== HOLLOW_MARK_MODEL_VERSION) return {};

    return {
      open: false,
      mask: parsed.mask,
      world: parsed.world,
      selectedZone: parsed.selectedZone ?? 'threshold-floor',
      selectedMove: parsed.selectedMove ?? 'mark',
      lastTrace: parsed.lastTrace ?? null,
    };
  } catch {
    return {};
  }
}

function saveHollowMarkState() {
  window.localStorage.setItem(HOLLOW_MARK_STORAGE_KEY, JSON.stringify({
    version: HOLLOW_MARK_MODEL_VERSION,
    open: false,
    mask: hollowState.mask,
    world: hollowState.world,
    selectedZone: hollowState.selectedZone,
    selectedMove: hollowState.selectedMove,
    lastTrace: hollowState.lastTrace,
  }));
}

function emitPresence() {
  window.__projectPresence = { ...shellState };
  window.dispatchEvent(new CustomEvent('projectpresencechange', {
    detail: window.__projectPresence,
  }));
}

function emitHollowMark() {
  const zoneLoom = describeWorldZones(hollowState.world);
  const selectedZoneState = zoneLoom.find((zone) => zone.id === hollowState.selectedZone) ?? zoneLoom[0];
  const moveForecast = getMoveForecast();

  window.__hollowMark = {
    version: HOLLOW_MARK_MODEL_VERSION,
    open: false,
    mask: { ...hollowState.mask },
    maskShape: describeMaskShape(hollowState.mask),
    zoneLoom,
    selectedZoneState,
    moveForecast,
    selectedZone: hollowState.selectedZone,
    selectedMove: hollowState.selectedMove,
    summary: getPlayableSummary(hollowState.world),
    lastTrace: hollowState.lastTrace ? { ...hollowState.lastTrace } : null,
  };

  window.dispatchEvent(new CustomEvent('hollowmarkchange', {
    detail: window.__hollowMark,
  }));
}

function getMoveForecast() {
  try {
    return describeMoveForecast(
      hollowState.world,
      hollowState.mask,
      hollowState.selectedMove,
      hollowState.selectedZone,
    );
  } catch {
    return describeMoveForecast(
      createWorldState(),
      createMask({ drive: hollowState.mask.drive }),
      'mark',
      'threshold-floor',
    );
  }
}

function hydrateRemoteHollowMark() {
  if (remoteHydrated) return;
  remoteHydrated = true;

  loadRemoteHollowState()
    .then((remoteState) => {
      hollowState.mask = remoteState.mask;
      hollowState.world = remoteState.world;
      hollowState.selectedZone = remoteState.selectedZone;
      hollowState.selectedMove = remoteState.selectedMove;
      hollowState.lastTrace = remoteState.lastTrace;
      saveHollowMarkState();
      emitHollowMark();
    })
    .catch(() => {
      // Local scene bridge remains valid when the API is not running.
    });
}

hydrate();
