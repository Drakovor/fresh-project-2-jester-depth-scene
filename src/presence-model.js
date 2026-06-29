export const APP_MODEL_VERSION = 'presence-threshold-v1';
export const PRESENCE_STORAGE_KEY = 'jester-depth.presence.v1';

export const PRESENCES = [
  {
    id: 'softness',
    label: 'Softness',
    tone: 'violet',
    resonance: 0.42,
    threshold: 0.34,
  },
  {
    id: 'defiance',
    label: 'Defiance',
    tone: 'ember',
    resonance: 0.7,
    threshold: 0.68,
  },
  {
    id: 'pride',
    label: 'Pride',
    tone: 'pistachio',
    resonance: 0.64,
    threshold: 0.58,
  },
  {
    id: 'static',
    label: 'Static',
    tone: 'pistachio',
    resonance: 0.56,
    threshold: 0.52,
  },
];

export const DEFAULT_PRESENCE_STATE = Object.freeze({
  version: APP_MODEL_VERSION,
  presence: 'unformed',
  resonance: 0,
  threshold: 0,
  phase: 'dormant',
  tone: 'violet',
});

export function phaseFromThreshold(value) {
  if (value >= 0.62) return 'unbound';
  if (value >= 0.46) return 'awake';
  if (value >= 0.24) return 'veiled';
  return 'dormant';
}

export function createPresenceState(presenceId) {
  const selected = PRESENCES.find((presence) => presence.id === presenceId);
  if (!selected) return { ...DEFAULT_PRESENCE_STATE };

  return {
    version: APP_MODEL_VERSION,
    presence: selected.id,
    resonance: selected.resonance,
    threshold: selected.threshold,
    phase: phaseFromThreshold(selected.threshold),
    tone: selected.tone,
  };
}

export function normalizePresenceState(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PRESENCE_STATE };
  if (value.version !== APP_MODEL_VERSION) return { ...DEFAULT_PRESENCE_STATE };

  const known = PRESENCES.find((presence) => presence.id === value.presence);
  if (!known) return { ...DEFAULT_PRESENCE_STATE };

  return createPresenceState(known.id);
}

export function loadPresenceState(storage = window.localStorage) {
  try {
    return normalizePresenceState(JSON.parse(storage.getItem(PRESENCE_STORAGE_KEY)));
  } catch {
    return { ...DEFAULT_PRESENCE_STATE };
  }
}

export function savePresenceState(state, storage = window.localStorage) {
  const normalized = normalizePresenceState(state);
  storage.setItem(PRESENCE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
