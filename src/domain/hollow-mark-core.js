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
      guard: 0,
      traces: [],
      visibleMarks: [],
    })),
    relations: [],
    actionLog: [],
  };
}

export function applyMove(worldState, maskState, moveId, zoneId, now = new Date().toISOString()) {
  const baseWorld = normalizeWorldState(worldState);
  assertCompatible(baseWorld, maskState);

  const move = getMove(moveId);
  const drive = getDrive(maskState.drive);
  const zone = baseWorld.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) throw new Error(`Unknown zone: ${zoneId}`);
  if (maskState.will < move.cost) throw new Error(`Not enough will for move: ${moveId}`);

  const trace = createTrace({ move, drive, zone, mask: maskState, now });
  const primaryZones = baseWorld.zones.map((candidate) => {
    if (candidate.id !== zoneId) return cloneZone(candidate);
    return applyTraceToZone(candidate, trace);
  });
  const semanticWorld = applyMoveSemantics({
    world: {
      ...baseWorld,
      tick: baseWorld.tick + 1,
      zones: primaryZones,
      relations: decayRelations(baseWorld.relations),
    },
    trace,
    mask: maskState,
    now,
  });
  trace.worldEffects = semanticWorld.effects;
  const nextWorld = {
    ...semanticWorld.world,
    actionLog: [
      ...baseWorld.actionLog,
      {
        tick: baseWorld.tick + 1,
        at: now,
        maskId: maskState.id,
        moveId,
        zoneId,
        traceId: trace.id,
        effects: semanticWorld.effects,
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
  const world = normalizeWorldState(worldState);
  const pressure = average(world.zones.map((zone) => zone.pressure));
  const clarity = average(world.zones.map((zone) => zone.clarity));
  const fracture = average(world.zones.map((zone) => zone.fracture ?? 0));

  return {
    pressure: clamp01(pressure),
    clarity: clamp01(clarity),
    fracture: clamp01(fracture),
  };
}

export function getPlayableSummary(worldState) {
  const world = normalizeWorldState(worldState);
  const zones = describeWorldZones(world);
  const hotZones = [...world.zones]
    .sort((left, right) => right.pressure - left.pressure)
    .slice(0, 2)
    .map((zone) => zone.id);

  return {
    version: world.version,
    tick: world.tick,
    pulse: computeWorldPulse(world),
    hotZones,
    zones,
    visibleTraceCount: world.zones.reduce((total, zone) => total + zone.visibleMarks.length, 0),
    relationCount: world.relations.filter((relation) => relation.strength > 0.08).length,
    guardedZoneCount: world.zones.filter((zone) => (Number(zone.guard) || 0) > 0.08).length,
  };
}

export function describeWorldZones(worldState) {
  const world = normalizeWorldState(worldState);
  return world.zones.map((zone) => {
    return describeZoneProjection(zone, {
      visibleTraceCount: Array.isArray(zone.visibleMarks) ? zone.visibleMarks.length : 0,
      relationCount: countZoneRelations(world, zone.id),
    });
  });
}

export function describeWorldRelations(worldState) {
  const world = normalizeWorldState(worldState);
  return world.relations
    .filter((relation) => relation.strength > 0.08)
    .map((relation) => {
      const from = world.zones.find((zone) => zone.id === relation.fromZoneId);
      const to = world.zones.find((zone) => zone.id === relation.toZoneId);
      return {
        id: relation.id,
        kind: relation.kind,
        fromZoneId: relation.fromZoneId,
        fromZoneLabel: from?.label ?? relation.fromZoneId,
        toZoneId: relation.toZoneId,
        toZoneLabel: to?.label ?? relation.toZoneId,
        strength: relation.strength,
        stability: relation.stability,
        createdBy: relation.createdBy,
        traceId: relation.traceId,
        createdAt: relation.createdAt,
      };
    });
}

export function describeMoveForecast(worldState, maskState, moveId, zoneId) {
  const world = normalizeWorldState(worldState);
  assertCompatible(world, maskState);

  const move = getMove(moveId);
  const drive = getDrive(maskState.drive);
  const zone = world.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) throw new Error(`Unknown zone: ${zoneId}`);

  const trace = createTrace({ move, drive, zone, mask: maskState, now: 'forecast' });
  const visibleTraceCount = Array.isArray(zone.visibleMarks) ? zone.visibleMarks.length : 0;
  const nextVisibleTraceCount = visibleTraceCount + (trace.visibility >= 0.14 ? 1 : 0);
  const guardedTrace = applyGuardToTrace(zone, trace);
  const semanticPreview = previewMoveSemantics(world, trace, maskState);
  const nextZone = describeZoneProjection(zone, {
    pressure: clamp01(zone.pressure + guardedTrace.pressure + semanticPreview.zonePressureDelta),
    clarity: clamp01(zone.clarity + guardedTrace.clarity + semanticPreview.zoneClarityDelta),
    fracture: clamp01((zone.fracture ?? 0) + guardedTrace.fracture + semanticPreview.zoneFractureDelta),
    guard: semanticPreview.nextGuard,
    visibleTraceCount: nextVisibleTraceCount,
    relationCount: countZoneRelations(world, zone.id) + semanticPreview.relationDelta,
  });
  const risk = clamp01(
    guardedTrace.fracture * 2.1
      + Math.max(nextZone.pressure - nextZone.clarity, 0) * 0.34
      + Math.max(move.cost - maskState.will, 0) * 0.12,
  );
  const signal = trace.visibility >= 0.2
    ? 'visible'
    : trace.visibility >= 0.1
      ? 'veiled'
      : 'buried';

  return {
    moveId: move.id,
    moveLabel: move.label,
    zoneId: zone.id,
    zoneLabel: zone.label,
    pressureDelta: guardedTrace.pressure + semanticPreview.zonePressureDelta,
    clarityDelta: guardedTrace.clarity + semanticPreview.zoneClarityDelta,
    visibilityDelta: trace.visibility,
    fractureDelta: guardedTrace.fracture + semanticPreview.zoneFractureDelta,
    risk,
    signal,
    cost: move.cost,
    canAfford: maskState.will >= move.cost,
    nextZone,
    worldEffect: semanticPreview.effect,
    relationDelta: semanticPreview.relationDelta,
  };
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

function describeZoneProjection(zone, overrides = {}) {
  const pressure = clamp01(Number(overrides.pressure ?? zone.pressure) || 0);
  const clarity = clamp01(Number(overrides.clarity ?? zone.clarity) || 0);
  const fracture = clamp01(Number(overrides.fracture ?? zone.fracture) || 0);
  const guard = clamp01(Number(overrides.guard ?? zone.guard) || 0);
  const relationCount = Number(overrides.relationCount ?? 0) || 0;
  const visibleTraceCount = Number(overrides.visibleTraceCount ?? (Array.isArray(zone.visibleMarks) ? zone.visibleMarks.length : 0)) || 0;
  const intensity = clamp01(
    pressure * 0.48
      + fracture * 0.24
      + (1 - clarity) * 0.18
      + Math.min(visibleTraceCount, 4) * 0.08
      + Math.min(relationCount, 3) * 0.035
      - guard * 0.06,
  );

  return {
    id: zone.id,
    label: zone.label,
    pressure,
    clarity,
    fracture,
    guard,
    relationCount,
    visibleTraceCount,
    state: chooseZoneState({ pressure, clarity, fracture, visibleTraceCount, intensity }),
    intensity,
  };
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
  const guardedTrace = applyGuardToTrace(zone, trace);
  const visibleMarks = trace.visibility >= 0.14
    ? [
        ...normalizeVisibleMarks(zone.visibleMarks),
        {
          id: trace.id,
          kind: trace.move,
          tone: trace.drive,
          intensity: trace.visibility,
        },
      ]
    : [...normalizeVisibleMarks(zone.visibleMarks)];
  const guard = clamp01(Number(zone.guard) || 0);
  const nextGuard = clamp01(guard - Math.max(guardedTrace.pressure, 0) * 0.22 - Math.max(guardedTrace.fracture, 0) * 0.16);

  return {
    ...zone,
    pressure: clamp01(zone.pressure + guardedTrace.pressure),
    clarity: clamp01(zone.clarity + guardedTrace.clarity),
    fracture: clamp01((zone.fracture ?? 0) + guardedTrace.fracture),
    guard: nextGuard,
    traces: [...normalizeTraces(zone.traces), trace],
    visibleMarks,
  };
}

function applyMoveSemantics({ world, trace, mask, now }) {
  const effects = [];
  let nextWorld = applyEchoRelations(world, trace, effects);

  if (trace.move === 'bind') {
    const targetZoneId = chooseRelationTargetZone(nextWorld, trace.zone);
    if (targetZoneId) {
      nextWorld = upsertRelation(nextWorld, {
        kind: 'echo',
        fromZoneId: trace.zone,
        toZoneId: targetZoneId,
        strength: clamp01(0.28 + trace.visibility * 0.42),
        stability: clamp01(0.62 + trace.clarity * 0.38),
        createdBy: mask.id,
        traceId: trace.id,
        createdAt: now,
      }, effects);
    }
  }

  if (trace.move === 'sever') {
    nextWorld = severStrongestRelation(nextWorld, trace, effects);
  }

  if (trace.move === 'bend') {
    nextWorld = bendZonePressure(nextWorld, trace, mask, now, effects);
  }

  if (trace.move === 'spare') {
    nextWorld = guardZone(nextWorld, trace.zone, trace, effects);
  }

  return { world: nextWorld, effects };
}

function previewMoveSemantics(worldState, trace, mask) {
  const world = normalizeWorldState(worldState);
  const attachedRelations = world.relations.filter((relation) => relationTouchesZone(relation, trace.zone));
  if (trace.move === 'bind') {
    return {
      effect: 'echo link will form',
      relationDelta: chooseRelationTargetZone(world, trace.zone) ? 1 : 0,
      zonePressureDelta: 0,
      zoneClarityDelta: 0,
      zoneFractureDelta: 0,
      nextGuard: Number(world.zones.find((zone) => zone.id === trace.zone)?.guard) || 0,
    };
  }
  if (trace.move === 'sever') {
    return {
      effect: attachedRelations.length > 0 ? 'strongest echo will break' : 'clean pressure cut',
      relationDelta: attachedRelations.length > 0 ? -1 : 0,
      zonePressureDelta: -0.04,
      zoneClarityDelta: 0.03,
      zoneFractureDelta: -0.03,
      nextGuard: Number(world.zones.find((zone) => zone.id === trace.zone)?.guard) || 0,
    };
  }
  if (trace.move === 'bend') {
    return {
      effect: chooseBendTargetZone(world, trace.zone) ? 'pressure will redirect' : 'pressure will fold inward',
      relationDelta: 0,
      zonePressureDelta: -0.05,
      zoneClarityDelta: -0.01,
      zoneFractureDelta: 0.01,
      nextGuard: Number(world.zones.find((zone) => zone.id === trace.zone)?.guard) || 0,
    };
  }
  if (trace.move === 'spare') {
    const zone = world.zones.find((candidate) => candidate.id === trace.zone);
    return {
      effect: 'zone guard will rise',
      relationDelta: 0,
      zonePressureDelta: -0.03,
      zoneClarityDelta: 0.02,
      zoneFractureDelta: -0.04,
      nextGuard: clamp01((Number(zone?.guard) || 0) + 0.32),
    };
  }
  return {
    effect: attachedRelations.length > 0 ? 'echo may carry' : 'direct trace',
    relationDelta: 0,
    zonePressureDelta: 0,
    zoneClarityDelta: 0,
    zoneFractureDelta: 0,
    nextGuard: Number(world.zones.find((zone) => zone.id === trace.zone)?.guard) || 0,
  };
}

function applyEchoRelations(world, trace, effects) {
  const relations = normalizeRelations(world.relations);
  const activeRelations = relations.filter((relation) => relationTouchesZone(relation, trace.zone));
  if (activeRelations.length === 0) return world;

  let nextZones = world.zones.map(cloneZone);
  for (const relation of activeRelations) {
    const targetZoneId = relation.fromZoneId === trace.zone ? relation.toZoneId : relation.fromZoneId;
    const strength = clamp01(relation.strength);
    nextZones = nextZones.map((zone) => {
      if (zone.id !== targetZoneId) return zone;
      return {
        ...zone,
        pressure: clamp01(zone.pressure + Math.max(trace.pressure, 0) * strength * 0.3),
        clarity: clamp01(zone.clarity + trace.clarity * strength * 0.14),
        fracture: clamp01((zone.fracture ?? 0) + trace.fracture * strength * 0.22),
      };
    });
    effects.push({
      type: 'echo_carry',
      relationId: relation.id,
      fromZoneId: trace.zone,
      toZoneId: targetZoneId,
      strength,
    });
  }

  return { ...world, zones: nextZones };
}

function upsertRelation(world, relationDraft, effects) {
  const existing = world.relations.find((relation) => {
    return relation.kind === relationDraft.kind
      && (
        (relation.fromZoneId === relationDraft.fromZoneId && relation.toZoneId === relationDraft.toZoneId)
        || (relation.fromZoneId === relationDraft.toZoneId && relation.toZoneId === relationDraft.fromZoneId)
      );
  });
  const relation = existing
    ? {
        ...existing,
        strength: clamp01(Math.max(existing.strength, relationDraft.strength) + 0.08),
        stability: clamp01(Math.max(existing.stability, relationDraft.stability)),
        traceId: relationDraft.traceId,
        createdAt: relationDraft.createdAt,
      }
    : {
        id: `relation:${relationDraft.kind}:${relationDraft.fromZoneId}:${relationDraft.toZoneId}:${relationDraft.createdAt}`,
        ...relationDraft,
      };

  effects.push({
    type: existing ? 'relation_deepened' : 'relation_bound',
    kind: relation.kind,
    relationId: relation.id,
    fromZoneId: relation.fromZoneId,
    toZoneId: relation.toZoneId,
    strength: relation.strength,
  });

  return {
    ...world,
    relations: [
      ...world.relations.filter((candidate) => candidate.id !== relation.id),
      relation,
    ].slice(-36),
  };
}

function severStrongestRelation(world, trace, effects) {
  const attachedRelations = world.relations
    .filter((relation) => relationTouchesZone(relation, trace.zone))
    .sort((left, right) => right.strength - left.strength);
  const severed = attachedRelations[0];
  const nextZones = world.zones.map((zone) => {
    if (zone.id !== trace.zone) return cloneZone(zone);
    return {
      ...cloneZone(zone),
      pressure: clamp01(zone.pressure - 0.04),
      clarity: clamp01(zone.clarity + 0.03),
      fracture: clamp01((zone.fracture ?? 0) - 0.03),
    };
  });

  if (!severed) {
    effects.push({ type: 'clean_cut', zoneId: trace.zone });
    return { ...world, zones: nextZones };
  }

  effects.push({
    type: 'relation_severed',
    relationId: severed.id,
    fromZoneId: severed.fromZoneId,
    toZoneId: severed.toZoneId,
    strength: severed.strength,
  });
  return {
    ...world,
    zones: nextZones,
    relations: world.relations.filter((relation) => relation.id !== severed.id),
  };
}

function bendZonePressure(world, trace, mask, now, effects) {
  const targetZoneId = chooseBendTargetZone(world, trace.zone);
  let nextZones = world.zones.map((zone) => {
    if (zone.id === trace.zone) {
      return {
        ...cloneZone(zone),
        pressure: clamp01(zone.pressure - 0.05),
        clarity: clamp01(zone.clarity - 0.01),
        fracture: clamp01((zone.fracture ?? 0) + 0.01),
      };
    }
    if (zone.id === targetZoneId) {
      return {
        ...cloneZone(zone),
        pressure: clamp01(zone.pressure + 0.07),
        clarity: clamp01(zone.clarity - 0.02),
        fracture: clamp01((zone.fracture ?? 0) + 0.035),
      };
    }
    return cloneZone(zone);
  });

  if (targetZoneId) {
    effects.push({
      type: 'pressure_bent',
      fromZoneId: trace.zone,
      toZoneId: targetZoneId,
      strength: 0.42,
    });
    return upsertRelation({
      ...world,
      zones: nextZones,
    }, {
      kind: 'bend',
      fromZoneId: trace.zone,
      toZoneId: targetZoneId,
      strength: 0.34,
      stability: mask.drive === 'static' ? 0.54 : 0.42,
      createdBy: mask.id,
      traceId: trace.id,
      createdAt: now,
    }, effects);
  }

  effects.push({ type: 'pressure_folded', zoneId: trace.zone });
  return { ...world, zones: nextZones };
}

function guardZone(world, zoneId, trace, effects) {
  const nextZones = world.zones.map((zone) => {
    if (zone.id !== zoneId) return cloneZone(zone);
    return {
      ...cloneZone(zone),
      guard: clamp01((Number(zone.guard) || 0) + 0.32),
      pressure: clamp01(zone.pressure - 0.03),
      clarity: clamp01(zone.clarity + 0.02),
      fracture: clamp01((zone.fracture ?? 0) - 0.04),
    };
  });
  effects.push({
    type: 'zone_guarded',
    zoneId,
    strength: 0.32,
    traceId: trace.id,
  });
  return { ...world, zones: nextZones };
}

function applyGuardToTrace(zone, trace) {
  const guard = clamp01(Number(zone.guard) || 0);
  if (guard <= 0) return trace;
  return {
    ...trace,
    pressure: trace.pressure > 0 ? trace.pressure * (1 - guard * 0.48) : trace.pressure,
    fracture: trace.fracture > 0 ? trace.fracture * (1 - guard * 0.54) : trace.fracture,
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

function normalizeWorldState(worldState) {
  if (!worldState || worldState.version !== HOLLOW_MARK_MODEL_VERSION) return worldState;
  const fallback = createWorldState();
  const incomingZones = Array.isArray(worldState.zones) ? worldState.zones : [];

  return {
    ...fallback,
    ...worldState,
    pulse: worldState.pulse ?? fallback.pulse,
    zones: fallback.zones.map((baseZone) => {
      const zone = incomingZones.find((candidate) => candidate?.id === baseZone.id);
      return normalizeZone(zone ?? baseZone, baseZone);
    }),
    relations: normalizeRelations(worldState.relations),
    actionLog: Array.isArray(worldState.actionLog) ? worldState.actionLog : [],
  };
}

function normalizeZone(zone, baseZone = zone) {
  return {
    ...baseZone,
    ...zone,
    pressure: clamp01(Number(zone?.pressure ?? baseZone?.pressure) || 0),
    clarity: clamp01(Number(zone?.clarity ?? baseZone?.clarity) || 0),
    fracture: clamp01(Number(zone?.fracture ?? baseZone?.fracture) || 0),
    guard: clamp01(Number(zone?.guard) || 0),
    traces: normalizeTraces(zone?.traces),
    visibleMarks: normalizeVisibleMarks(zone?.visibleMarks),
  };
}

function normalizeRelations(relations) {
  if (!Array.isArray(relations)) return [];
  const zoneIds = new Set(ZONES.map((zone) => zone.id));
  return relations
    .filter((relation) => {
      return relation
        && ['echo', 'bend'].includes(relation.kind)
        && zoneIds.has(relation.fromZoneId)
        && zoneIds.has(relation.toZoneId)
        && relation.fromZoneId !== relation.toZoneId;
    })
    .map((relation) => ({
      id: relation.id ?? `relation:${relation.kind}:${relation.fromZoneId}:${relation.toZoneId}`,
      kind: relation.kind,
      fromZoneId: relation.fromZoneId,
      toZoneId: relation.toZoneId,
      strength: clamp01(Number(relation.strength) || 0),
      stability: clamp01(Number(relation.stability) || 0.42),
      createdBy: relation.createdBy ?? 'unknown',
      traceId: relation.traceId ?? '',
      createdAt: relation.createdAt ?? '',
    }))
    .filter((relation) => relation.strength > 0.04);
}

function normalizeTraces(traces) {
  return Array.isArray(traces) ? [...traces] : [];
}

function normalizeVisibleMarks(visibleMarks) {
  return Array.isArray(visibleMarks) ? [...visibleMarks] : [];
}

function decayRelations(relations) {
  return normalizeRelations(relations)
    .map((relation) => ({
      ...relation,
      strength: clamp01(relation.strength * 0.994),
      stability: clamp01(relation.stability * 0.997),
    }))
    .filter((relation) => relation.strength > 0.055 && relation.stability > 0.08);
}

function countZoneRelations(worldState, zoneId) {
  const world = normalizeWorldState(worldState);
  return normalizeRelations(world?.relations)
    .filter((relation) => relationTouchesZone(relation, zoneId) && relation.strength > 0.08)
    .length;
}

function relationTouchesZone(relation, zoneId) {
  return relation.fromZoneId === zoneId || relation.toZoneId === zoneId;
}

function chooseRelationTargetZone(worldState, zoneId) {
  const world = normalizeWorldState(worldState);
  return [...world.zones]
    .filter((zone) => zone.id !== zoneId)
    .sort((left, right) => {
      const leftScore = left.pressure * 0.52 + (left.fracture ?? 0) * 0.28 + (1 - left.clarity) * 0.2;
      const rightScore = right.pressure * 0.52 + (right.fracture ?? 0) * 0.28 + (1 - right.clarity) * 0.2;
      return rightScore - leftScore;
    })[0]?.id ?? '';
}

function chooseBendTargetZone(worldState, zoneId) {
  const world = normalizeWorldState(worldState);
  return [...world.zones]
    .filter((zone) => zone.id !== zoneId)
    .sort((left, right) => {
      const leftScore = (1 - left.clarity) * 0.5 + left.pressure * 0.3 + (left.fracture ?? 0) * 0.2;
      const rightScore = (1 - right.clarity) * 0.5 + right.pressure * 0.3 + (right.fracture ?? 0) * 0.2;
      return rightScore - leftScore;
    })[0]?.id ?? '';
}

function cloneZone(zone) {
  const normalized = normalizeZone(zone);
  return {
    ...normalized,
    traces: normalizeTraces(normalized.traces),
    visibleMarks: normalizeVisibleMarks(normalized.visibleMarks),
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
