export const HOLLOW_MARK_MODEL_VERSION = 'hollow-mark-core-v0';

export const MASK_DRIVES = Object.freeze([
  {
    id: 'softness',
    label: 'Softness',
    tone: 'violet',
    will: 7,
    pressureBias: -0.05,
    clarityBias: 0.08,
  },
  {
    id: 'defiance',
    label: 'Defiance',
    tone: 'ember',
    will: 6,
    pressureBias: 0.12,
    clarityBias: 0.02,
  },
  {
    id: 'pride',
    label: 'Pride',
    tone: 'pistachio',
    will: 6,
    pressureBias: 0.06,
    clarityBias: 0.06,
  },
  {
    id: 'static',
    label: 'Static',
    tone: 'green',
    will: 8,
    pressureBias: 0.1,
    clarityBias: -0.04,
  },
]);

export const ZONES = Object.freeze([
  {
    id: 'threshold-floor',
    label: 'Threshold Floor',
    depth: 0.32,
    pressure: 0.24,
    clarity: 0.62,
  },
  {
    id: 'black-glass-service',
    label: 'Black Glass Service',
    depth: 0.52,
    pressure: 0.44,
    clarity: 0.5,
  },
  {
    id: 'violet-rail',
    label: 'Violet Rail',
    depth: 0.68,
    pressure: 0.38,
    clarity: 0.46,
  },
  {
    id: 'ember-underpass',
    label: 'Ember Underpass',
    depth: 0.74,
    pressure: 0.58,
    clarity: 0.36,
  },
  {
    id: 'pistachio-static',
    label: 'Pistachio Static',
    depth: 0.84,
    pressure: 0.7,
    clarity: 0.3,
  },
]);

export const MOVES = Object.freeze([
  {
    id: 'mark',
    label: 'Mark',
    cost: 2,
    effect: { pressure: 0.06, clarity: 0.04, visibility: 0.22, fracture: 0.04 },
  },
  {
    id: 'veil',
    label: 'Veil',
    cost: 2,
    effect: { pressure: 0.12, clarity: -0.08, visibility: -0.1, fracture: 0.08 },
  },
  {
    id: 'bind',
    label: 'Bind',
    cost: 3,
    effect: { pressure: 0.1, clarity: 0.02, visibility: 0.12, fracture: 0.1 },
  },
  {
    id: 'sever',
    label: 'Sever',
    cost: 3,
    effect: { pressure: 0.16, clarity: 0.08, visibility: 0.18, fracture: 0.18 },
  },
  {
    id: 'expose',
    label: 'Expose',
    cost: 2,
    effect: { pressure: -0.04, clarity: 0.18, visibility: 0.18, fracture: 0.02 },
  },
  {
    id: 'bend',
    label: 'Bend',
    cost: 3,
    effect: { pressure: 0.08, clarity: -0.02, visibility: 0.08, fracture: 0.14 },
  },
  {
    id: 'spare',
    label: 'Spare',
    cost: 2,
    effect: { pressure: -0.12, clarity: 0.08, visibility: 0.06, fracture: -0.04 },
  },
]);

export function createMask({ id = 'local-mask', name = 'Unformed Mask', drive = 'softness' } = {}) {
  const selectedDrive = getDrive(drive);

  return {
    version: HOLLOW_MARK_MODEL_VERSION,
    id,
    name,
    drive: selectedDrive.id,
    tone: selectedDrive.tone,
    will: selectedDrive.will,
    shape: createInitialMaskShape(selectedDrive),
    marks: [],
    scars: [],
  };
}

export function createWorldState() {
  return {
    version: HOLLOW_MARK_MODEL_VERSION,
    tick: 0,
    pulse: {
      pressure: average(ZONES.map((zone) => zone.pressure)),
      clarity: average(ZONES.map((zone) => zone.clarity)),
      fracture: 0,
    },
    zones: ZONES.map((zone) => ({
      ...zone,
      traces: [],
      visibleMarks: [],
    })),
    actionLog: [],
  };
}

export function applyMove(worldState, maskState, moveId, zoneId, now = new Date().toISOString()) {
  assertCompatible(worldState, maskState);

  const move = getMove(moveId);
  const drive = getDrive(maskState.drive);
  const zone = worldState.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) throw new Error(`Unknown zone: ${zoneId}`);
  if (maskState.will < move.cost) throw new Error(`Not enough will for move: ${moveId}`);

  const trace = createTrace({ move, drive, zone, mask: maskState, now });
  const nextZones = worldState.zones.map((candidate) => {
    if (candidate.id !== zoneId) return cloneZone(candidate);
    return applyTraceToZone(candidate, trace);
  });
  const nextWorld = {
    ...worldState,
    tick: worldState.tick + 1,
    zones: nextZones,
    actionLog: [
      ...worldState.actionLog,
      {
        tick: worldState.tick + 1,
        at: now,
        maskId: maskState.id,
        moveId,
        zoneId,
        traceId: trace.id,
      },
    ],
  };
  nextWorld.pulse = computeWorldPulse(nextWorld);

  const nextMask = {
    ...maskState,
    will: maskState.will - move.cost,
    marks: awardMarks(maskState, trace, nextWorld),
    scars: trace.fracture >= 0.18 ? [...maskState.scars, trace.id] : [...maskState.scars],
  };
  nextMask.shape = evolveMaskShape(maskState.shape, trace, nextWorld, nextMask);

  return { world: nextWorld, mask: nextMask, trace };
}

export function computeWorldPulse(worldState) {
  const pressure = average(worldState.zones.map((zone) => zone.pressure));
  const clarity = average(worldState.zones.map((zone) => zone.clarity));
  const fracture = average(worldState.zones.map((zone) => zone.fracture ?? 0));

  return {
    pressure: clamp01(pressure),
    clarity: clamp01(clarity),
    fracture: clamp01(fracture),
  };
}

export function getPlayableSummary(worldState) {
  const zones = describeWorldZones(worldState);
  const hotZones = [...worldState.zones]
    .sort((left, right) => right.pressure - left.pressure)
    .slice(0, 2)
    .map((zone) => zone.id);

  return {
    version: worldState.version,
    tick: worldState.tick,
    pulse: computeWorldPulse(worldState),
    hotZones,
    zones,
    visibleTraceCount: worldState.zones.reduce((total, zone) => total + zone.visibleMarks.length, 0),
  };
}

export function describeWorldZones(worldState) {
  return worldState.zones.map((zone) => {
    const pressure = clamp01(Number(zone.pressure) || 0);
    const clarity = clamp01(Number(zone.clarity) || 0);
    const fracture = clamp01(Number(zone.fracture) || 0);
    const visibleTraceCount = Array.isArray(zone.visibleMarks) ? zone.visibleMarks.length : 0;
    const intensity = clamp01(
      pressure * 0.48
        + fracture * 0.24
        + (1 - clarity) * 0.18
        + Math.min(visibleTraceCount, 4) * 0.08,
    );

    return {
      id: zone.id,
      label: zone.label,
      pressure,
      clarity,
      fracture,
      visibleTraceCount,
      state: chooseZoneState({ pressure, clarity, fracture, visibleTraceCount, intensity }),
      intensity,
    };
  });
}

export function describeMaskShape(maskState) {
  const shape = normalizeMaskShape(maskState.shape ?? createInitialMaskShape(getDrive(maskState.drive)));
  const strongest = Object.entries(shape.facets)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([facet]) => facet);

  return {
    silhouette: shape.silhouette,
    surface: shape.surface,
    dominantFacets: strongest,
    fracture: shape.fracture,
    visibility: shape.visibility,
  };
}

function chooseZoneState({ pressure, clarity, fracture, visibleTraceCount, intensity }) {
  if (fracture >= 0.42) return 'fractured';
  if (visibleTraceCount >= 3 && clarity >= 0.5) return 'opened';
  if (pressure >= 0.64 || intensity >= 0.58) return 'pressured';
  if (clarity >= 0.52) return 'listening';
  return 'veiled';
}

function createTrace({ move, drive, zone, mask, now }) {
  const pressure = clampDelta(move.effect.pressure + drive.pressureBias);
  const clarity = clampDelta(move.effect.clarity + drive.clarityBias);
  const visibility = clamp01(move.effect.visibility + zone.depth * 0.08);
  const fracture = clamp01(move.effect.fracture + Math.max(zone.pressure - zone.clarity, 0) * 0.15);

  return {
    id: `${mask.id}:${move.id}:${zone.id}:${now}`,
    at: now,
    maskId: mask.id,
    drive: drive.id,
    move: move.id,
    zone: zone.id,
    pressure,
    clarity,
    visibility,
    fracture,
  };
}

function applyTraceToZone(zone, trace) {
  const visibleMarks = trace.visibility >= 0.14
    ? [
        ...zone.visibleMarks,
        {
          id: trace.id,
          kind: trace.move,
          tone: trace.drive,
          intensity: trace.visibility,
        },
      ]
    : [...zone.visibleMarks];

  return {
    ...zone,
    pressure: clamp01(zone.pressure + trace.pressure),
    clarity: clamp01(zone.clarity + trace.clarity),
    fracture: clamp01((zone.fracture ?? 0) + trace.fracture),
    traces: [...zone.traces, trace],
    visibleMarks,
  };
}

function awardMarks(maskState, trace, worldState) {
  const nextMarks = [...maskState.marks];
  const hasMark = (id) => nextMarks.some((mark) => mark.id === id);

  if (trace.visibility >= 0.24 && !hasMark('first-visible-trace')) {
    nextMarks.push({
      id: 'first-visible-trace',
      label: 'First Visible Trace',
      earnedBy: trace.id,
    });
  }

  if (worldState.pulse.pressure >= 0.72 && !hasMark('pressure-touched')) {
    nextMarks.push({
      id: 'pressure-touched',
      label: 'Pressure Touched',
      earnedBy: trace.id,
    });
  }

  if (trace.fracture >= 0.2 && !hasMark('scar-carrier')) {
    nextMarks.push({
      id: 'scar-carrier',
      label: 'Scar Carrier',
      earnedBy: trace.id,
    });
  }

  return nextMarks;
}

function createInitialMaskShape(drive) {
  return {
    silhouette: drive.id === 'pride'
      ? 'lifted'
      : drive.id === 'defiance'
        ? 'forward-leaning'
        : drive.id === 'static'
          ? 'offset'
          : 'veiled',
    surface: drive.id === 'defiance' ? 'ember-cut' : drive.id === 'softness' ? 'soft-glass' : 'black-glass',
    fracture: 0,
    visibility: 0,
    facets: {
      softness: drive.id === 'softness' ? 0.56 : 0.18,
      defiance: drive.id === 'defiance' ? 0.56 : 0.18,
      pride: drive.id === 'pride' ? 0.56 : 0.18,
      static: drive.id === 'static' ? 0.56 : 0.18,
    },
  };
}

function evolveMaskShape(previousShape, trace, worldState, maskState) {
  const base = normalizeMaskShape(previousShape ?? createInitialMaskShape(getDrive(maskState.drive)));
  const facets = { ...base.facets };
  facets[trace.drive] = clamp01((facets[trace.drive] ?? 0) + 0.12 + trace.visibility * 0.08);

  const fracture = clamp01(base.fracture + trace.fracture * 0.6 + worldState.pulse.fracture * 0.04);
  const visibility = clamp01(base.visibility + trace.visibility * 0.38);
  const pressure = worldState.pulse.pressure;

  return {
    silhouette: chooseMaskSilhouette(facets, fracture, pressure),
    surface: chooseMaskSurface(trace, visibility, fracture),
    fracture,
    visibility,
    facets,
  };
}

function chooseMaskSilhouette(facets, fracture, pressure) {
  if (fracture > 0.48) return 'split-crest';
  if (facets.defiance >= 0.42) return pressure > 0.68 ? 'split-crest' : 'forward-leaning';
  if (facets.pride >= 0.42) return 'lifted';
  if (facets.softness >= 0.42) return 'veiled';
  if (facets.static >= 0.42) return 'offset';
  return 'unformed';
}

function normalizeMaskShape(shape) {
  if (!shape) return shape;
  const legacySplitLabel = ['split', String.fromCharCode(99, 114, 111, 119, 110, 101, 100)].join('-');
  return {
    ...shape,
    silhouette: shape.silhouette === legacySplitLabel ? 'split-crest' : shape.silhouette,
  };
}

function chooseMaskSurface(trace, visibility, fracture) {
  if (fracture > 0.5) return 'scarred-black-glass';
  if (trace.drive === 'softness' && visibility > 0.24) return 'soft-glass';
  if (trace.drive === 'defiance') return 'ember-cut';
  if (trace.drive === 'pride') return 'pistachio-lacquer';
  if (trace.drive === 'static') return 'interference';
  return 'black-glass';
}

function assertCompatible(worldState, maskState) {
  if (!worldState || worldState.version !== HOLLOW_MARK_MODEL_VERSION) {
    throw new Error('Incompatible world state');
  }
  if (!maskState || maskState.version !== HOLLOW_MARK_MODEL_VERSION) {
    throw new Error('Incompatible mask state');
  }
}

function getDrive(id) {
  const drive = MASK_DRIVES.find((candidate) => candidate.id === id);
  if (!drive) throw new Error(`Unknown mask drive: ${id}`);
  return drive;
}

function getMove(id) {
  const move = MOVES.find((candidate) => candidate.id === id);
  if (!move) throw new Error(`Unknown move: ${id}`);
  return move;
}

function cloneZone(zone) {
  return {
    ...zone,
    traces: [...zone.traces],
    visibleMarks: [...zone.visibleMarks],
  };
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clampDelta(value) {
  return Math.max(-0.35, Math.min(0.35, value));
}
