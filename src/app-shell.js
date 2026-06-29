import {
  APP_MODEL_VERSION,
  DEFAULT_PRESENCE_STATE,
  PRESENCES,
  createPresenceState,
  loadPresenceState,
  savePresenceState,
} from './presence-model.js';
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
} from './domain/hollow-mark-core.js';
import {
  commitRemoteMove,
  fetchCreatorOverview,
  fetchPublicWorld,
  loadRemoteHollowState,
  setRemoteMaskDrive,
} from './hollow-mark-api.js';

const HOLLOW_MARK_STORAGE_KEY = 'hollow-mark.prototype.v1';

const shellState = {
  open: false,
  ...DEFAULT_PRESENCE_STATE,
};

const hollowState = {
  open: false,
  mask: createMask({ drive: 'softness' }),
  world: createWorldState(),
  selectedZone: 'threshold-floor',
  selectedMove: 'mark',
  lastTrace: null,
  error: '',
};

const appState = {
  activeView: 'world',
  publicWorld: null,
  creatorOverview: null,
  remoteStatus: 'local',
  remoteError: '',
};

let hydrated = false;
let remoteHydrated = false;
let remoteAvailable = false;
let remoteRequestActive = false;

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  const demoMode = getDemoMode();
  Object.assign(shellState, loadPresenceState());
  if (demoMode === 'move-forecast') {
    Object.assign(shellState, {
      open: true,
      ...createPresenceState('defiance'),
    });
  }
  Object.assign(hollowState, loadHollowMarkState(demoMode));
}

function loadHollowMarkState(demoMode = getDemoMode()) {
  if (demoMode === 'move-forecast') {
    return {
      open: true,
      mask: createMask({ drive: 'defiance' }),
      world: createWorldState(),
      selectedZone: 'pistachio-static',
      selectedMove: 'sever',
      lastTrace: null,
      error: '',
    };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(HOLLOW_MARK_STORAGE_KEY));
    if (!parsed || parsed.version !== HOLLOW_MARK_MODEL_VERSION) return {};
    if (!parsed.mask || !parsed.world) return {};
    if (parsed.mask.version !== HOLLOW_MARK_MODEL_VERSION) return {};
    if (parsed.world.version !== HOLLOW_MARK_MODEL_VERSION) return {};

    return {
      open: parsed.open !== false,
      mask: parsed.mask,
      world: parsed.world,
      selectedZone: ZONES.some((zone) => zone.id === parsed.selectedZone)
        ? parsed.selectedZone
        : 'threshold-floor',
      selectedMove: MOVES.some((move) => move.id === parsed.selectedMove)
        ? parsed.selectedMove
        : 'mark',
      lastTrace: parsed.lastTrace ?? null,
      error: '',
    };
  } catch {
    return {};
  }
}

function getDemoMode() {
  try {
    return new URLSearchParams(window.location.search).get('demo') ?? '';
  } catch {
    return '';
  }
}

function saveHollowMarkState() {
  window.localStorage.setItem(HOLLOW_MARK_STORAGE_KEY, JSON.stringify({
    version: HOLLOW_MARK_MODEL_VERSION,
    open: hollowState.open,
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
  const summary = getPlayableSummary(hollowState.world);
  const maskShape = describeMaskShape(hollowState.mask);
  const zoneLoom = describeWorldZones(hollowState.world);
  const selectedZoneState = zoneLoom.find((zone) => zone.id === hollowState.selectedZone) ?? zoneLoom[0];
  const moveForecast = getMoveForecast();
  window.__hollowMark = {
    version: HOLLOW_MARK_MODEL_VERSION,
    open: hollowState.open,
    mask: { ...hollowState.mask },
    maskShape,
    zoneLoom,
    selectedZoneState,
    moveForecast,
    selectedZone: hollowState.selectedZone,
    selectedMove: hollowState.selectedMove,
    summary,
    lastTrace: hollowState.lastTrace ? { ...hollowState.lastTrace } : null,
  };
  window.dispatchEvent(new CustomEvent('hollowmarkchange', {
    detail: window.__hollowMark,
  }));
}

function setPresenceFromDrive(driveId) {
  const selected = PRESENCES.find((presence) => presence.id === driveId);
  if (!selected) return;
  Object.assign(shellState, savePresenceState(createPresenceState(selected.id)));
}

function setDockState(dock, readout, phase, level, selected) {
  readout.textContent = selected ? `${selected.id} / ${phase}` : phase;
  dock.dataset.phase = phase;
  dock.dataset.tone = selected?.tone ?? 'violet';
  dock.style.setProperty('--threshold-level', String(level));
}

function renderPresenceDock() {
  return `
    <div class="presence-dock" data-open="${shellState.open}" data-phase="${shellState.phase}" data-tone="${shellState.tone}" data-model="${APP_MODEL_VERSION}" style="--threshold-level: ${shellState.threshold}">
      <button class="dock-mark" type="button" aria-label="Open presence">
        <span>HM</span>
      </button>
      <div class="dock-actions" role="group" aria-label="Mask drives">
        ${PRESENCES.map((presence) => `
          <button
            class="presence-choice"
            type="button"
            data-presence="${presence.id}"
            data-tone="${presence.tone}"
            aria-pressed="false"
          >
            ${presence.label}
          </button>
        `).join('')}
      </div>
      <div class="presence-readout" aria-live="polite">
        <span class="readout-key">${shellState.presence === 'unformed' ? shellState.phase : `${shellState.presence} / ${shellState.phase}`}</span>
        <span class="readout-line"></span>
      </div>
      <div class="threshold-strip" aria-hidden="true">
        <span class="threshold-fill"></span>
        <span class="threshold-cut threshold-cut-a"></span>
        <span class="threshold-cut threshold-cut-b"></span>
        <span class="threshold-cut threshold-cut-c"></span>
      </div>
    </div>
  `;
}

function renderHollowMarkPanel() {
  const selectedZone = getSelectedZone();
  const selectedMove = getSelectedMove();
  const summary = getPlayableSummary(hollowState.world);
  const zoneLoom = describeWorldZones(hollowState.world);
  const maskShape = describeMaskShape(hollowState.mask);
  const moveForecast = getMoveForecast();
  const traceList = collectVisibleTraces().slice(0, 5);

  return `
    <section class="hollow-panel" data-open="${hollowState.open}" data-tone="${hollowState.mask.tone}" data-model="${HOLLOW_MARK_MODEL_VERSION}" aria-label="Hollow Mark prototype">
      <button class="hollow-toggle" type="button" aria-label="${hollowState.open ? 'Close Hollow Mark' : 'Open Hollow Mark'}">
        <span>Hollow Mark</span>
        <b>${hollowState.world.tick}</b>
      </button>
      <div class="hollow-body">
        <div class="hollow-head">
          <div>
            <span class="hollow-kicker">Mask</span>
            <strong>${hollowState.mask.drive}</strong>
          </div>
          <div class="hollow-will">
            <span>Will</span>
            <strong>${hollowState.mask.will}</strong>
          </div>
        </div>

        <div class="drive-row" role="group" aria-label="Mask drives">
          ${MASK_DRIVES.map((drive) => `
            <button
              class="drive-choice"
              type="button"
              data-drive="${drive.id}"
              aria-pressed="${drive.id === hollowState.mask.drive}"
            >
              ${drive.label}
            </button>
          `).join('')}
        </div>

        <div class="pulse-grid" aria-label="World pulse">
          ${renderPulseMeter('Pressure', summary.pulse.pressure)}
          ${renderPulseMeter('Clarity', summary.pulse.clarity)}
          ${renderPulseMeter('Fracture', summary.pulse.fracture)}
        </div>

        <div class="mask-shape">
          <span class="hollow-kicker">Shape</span>
          <div>
            <b>${maskShape.silhouette}</b>
            <span>${maskShape.surface}</span>
          </div>
          <small>${maskShape.dominantFacets.join(' / ')}</small>
        </div>

        <div class="hollow-split">
          <div class="hollow-block">
            <span class="hollow-kicker">Zones</span>
            <div class="zone-list" role="listbox" aria-label="Zones">
              ${hollowState.world.zones.map((zone) => {
                const zoneState = zoneLoom.find((item) => item.id === zone.id);
                return `
                <button
                  class="zone-choice"
                  type="button"
                  data-zone="${zone.id}"
                  data-state="${zoneState?.state ?? 'veiled'}"
                  aria-selected="${zone.id === hollowState.selectedZone}"
                >
                  <span>${zone.label}</span>
                  <b>${formatPercent(zone.pressure)}</b>
                </button>
              `;
              }).join('')}
            </div>
          </div>

          <div class="hollow-block">
            <span class="hollow-kicker">Moves</span>
            <div class="move-grid" role="group" aria-label="Moves">
              ${MOVES.map((move) => `
                <button
                  class="move-choice"
                  type="button"
                  data-move="${move.id}"
                  aria-pressed="${move.id === hollowState.selectedMove}"
                >
                  <span>${move.label}</span>
                  <b>${move.cost}</b>
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="move-preview" data-risk="${moveForecast.risk.toFixed(3)}" data-signal="${moveForecast.signal}" data-next-state="${moveForecast.nextZone.state}" aria-live="polite">
          <span>${selectedZone.label}</span>
          <b>${selectedMove.label}</b>
          <small>${formatForecast(moveForecast)}</small>
          <i aria-hidden="true" style="--forecast-risk: ${moveForecast.risk}"></i>
        </div>

        <button class="commit-move" type="button" ${hollowState.mask.will < selectedMove.cost ? 'disabled' : ''}>
          Commit ${selectedMove.label}
        </button>

        ${hollowState.error ? `<div class="hollow-error" role="alert">${hollowState.error}</div>` : ''}

        <div class="trace-feed" aria-label="Visible traces">
          <div class="trace-head">
            <span class="hollow-kicker">Traces</span>
            <b>${summary.visibleTraceCount}</b>
          </div>
          ${traceList.length === 0 ? '<p class="trace-empty">No trace yet.</p>' : traceList.map((trace) => `
            <div class="trace-row">
              <span>${trace.move}</span>
              <b>${trace.zone}</b>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderPulseMeter(label, value) {
  return `
    <div class="pulse-meter" style="--pulse-level: ${value}">
      <span>${label}</span>
      <b>${formatPercent(value)}</b>
      <i aria-hidden="true"></i>
    </div>
  `;
}

function renderWorldSurface() {
  const summary = appState.publicWorld?.summary ?? getPlayableSummary(hollowState.world);
  const zones = appState.publicWorld?.zones ?? describeWorldZones(hollowState.world);
  const chronicle = getChronicleEvents();
  const creator = appState.creatorOverview;

  return `
    <section class="world-surface" data-view="${appState.activeView}" data-status="${appState.remoteStatus}" aria-label="Hollow Mark application surface">
      <div class="world-rail" role="tablist" aria-label="Hollow Mark views">
        ${renderSurfaceTab('world', 'World')}
        ${renderSurfaceTab('chronicle', 'Chronicle')}
        ${renderSurfaceTab('creator', 'Creator')}
        <button class="surface-refresh" type="button" aria-label="Refresh Hollow Mark state">Refresh</button>
      </div>

      <div class="surface-body">
        ${appState.activeView === 'world' ? renderWorldView(summary, zones) : ''}
        ${appState.activeView === 'chronicle' ? renderChronicleView(chronicle) : ''}
        ${appState.activeView === 'creator' ? renderCreatorView(creator, summary, zones) : ''}
      </div>
    </section>
  `;
}

function renderSurfaceTab(view, label) {
  return `
    <button class="surface-tab" type="button" role="tab" data-view="${view}" aria-selected="${appState.activeView === view}">
      ${label}
    </button>
  `;
}

function renderWorldView(summary, zones) {
  const hotZones = zones
    .filter((zone) => summary.hotZones.includes(zone.id))
    .slice(0, 2);

  return `
    <div class="surface-pane world-pane">
      <div class="surface-head">
        <span class="surface-kicker">Pulse</span>
        <strong>${summary.tick}</strong>
      </div>
      <div class="surface-metrics">
        ${renderSurfaceMetric('Pressure', summary.pulse.pressure)}
        ${renderSurfaceMetric('Clarity', summary.pulse.clarity)}
        ${renderSurfaceMetric('Fracture', summary.pulse.fracture)}
      </div>
      <div class="surface-ledger">
        <span>Traces</span>
        <b>${summary.visibleTraceCount ?? 0}</b>
        <i>${escapeText(appState.remoteStatus)}</i>
      </div>
      <div class="surface-zone-stack">
        ${hotZones.map((zone) => renderZoneRow(zone)).join('')}
      </div>
    </div>
  `;
}

function renderChronicleView(events) {
  return `
    <div class="surface-pane chronicle-pane">
      <div class="surface-head">
        <span class="surface-kicker">Chronicle</span>
        <strong>${events.length}</strong>
      </div>
      <div class="chronicle-list">
        ${events.length === 0 ? '<p class="surface-empty">No public trace yet.</p>' : events.slice(0, 6).map((event) => `
          <article class="chronicle-event">
            <span>${escapeText(event.moveId ?? event.move ?? 'trace')}</span>
            <b>${escapeText(event.title ?? 'Trace recorded')}</b>
            <small>${escapeText(formatEventLine(event))}</small>
          </article>
        `).join('')}
      </div>
    </div>
  `;
}

function renderCreatorView(creator, summary, zones) {
  const ledger = creator?.ledger ?? {
    tick: summary.tick,
    visibleTraceCount: summary.visibleTraceCount,
    chronicleCount: getChronicleEvents().length,
    snapshotCount: 0,
  };
  const pressureLeaders = creator?.pressureLeaders ?? zones.slice(0, 3);
  const sessions = creator?.sessions ?? { total: 0, driveCounts: {}, activeMasks: [] };

  return `
    <div class="surface-pane creator-pane">
      <div class="surface-head">
        <span class="surface-kicker">Creator</span>
        <strong>${ledger.tick}</strong>
      </div>
      <div class="creator-grid">
        <div><span>Sessions</span><b>${sessions.total}</b></div>
        <div><span>Chronicle</span><b>${ledger.chronicleCount}</b></div>
        <div><span>Snapshots</span><b>${ledger.snapshotCount}</b></div>
      </div>
      <div class="surface-zone-stack">
        ${pressureLeaders.map((zone) => renderZoneRow(zone)).join('')}
      </div>
      <div class="drive-ledger">
        ${MASK_DRIVES.map((drive) => `
          <span>${drive.label}<b>${sessions.driveCounts?.[drive.id] ?? 0}</b></span>
        `).join('')}
      </div>
    </div>
  `;
}

function renderSurfaceMetric(label, value) {
  return `
    <div class="surface-metric" style="--metric-level: ${value}">
      <span>${label}</span>
      <b>${formatPercent(value)}</b>
      <i aria-hidden="true"></i>
    </div>
  `;
}

function renderZoneRow(zone) {
  return `
    <div class="surface-zone" data-state="${zone.state}">
      <span>${escapeText(zone.label)}</span>
      <b>${escapeText(zone.state)}</b>
      <i style="--zone-intensity: ${zone.intensity ?? zone.pressure ?? 0}" aria-hidden="true"></i>
    </div>
  `;
}

function renderShell() {
  hydrate();
  const mount = document.getElementById('app-shell');
  if (!mount) return;

  mount.innerHTML = `
    ${renderWorldSurface()}
    ${renderPresenceDock()}
    ${renderHollowMarkPanel()}
  `;

  wireWorldSurface(mount);
  wirePresenceDock(mount);
  wireHollowMarkPanel(mount);
  emitPresence();
  emitHollowMark();
  hydrateRemoteHollowMark();
}

function wireWorldSurface(mount) {
  for (const button of mount.querySelectorAll('.surface-tab')) {
    button.addEventListener('click', () => {
      appState.activeView = button.dataset.view;
      renderShell();
      refreshRemoteSurfaces();
    });
  }

  mount.querySelector('.surface-refresh')?.addEventListener('click', () => {
    refreshRemoteSurfaces({ forceCreator: true });
  });
}

function wirePresenceDock(mount) {
  const dock = mount.querySelector('.presence-dock');
  const mark = mount.querySelector('.dock-mark');
  const choices = Array.from(mount.querySelectorAll('.presence-choice'));
  const readout = mount.querySelector('.readout-key');

  mark.addEventListener('click', () => {
    shellState.open = !shellState.open;
    dock.dataset.open = String(shellState.open);
    mark.setAttribute('aria-label', shellState.open ? 'Close presence' : 'Open presence');
  });

  for (const button of choices) {
    button.addEventListener('click', () => {
      setMaskDrive(button.dataset.presence);
    });
  }

  for (const choice of choices) {
    choice.setAttribute('aria-pressed', String(choice.dataset.presence === shellState.presence));
  }

  setDockState(
    dock,
    readout,
    shellState.phase,
    shellState.threshold,
    PRESENCES.find((presence) => presence.id === shellState.presence) ?? null,
  );
}

function wireHollowMarkPanel(mount) {
  const panel = mount.querySelector('.hollow-panel');
  const toggle = mount.querySelector('.hollow-toggle');

  toggle.addEventListener('click', () => {
    hollowState.open = !hollowState.open;
    panel.dataset.open = String(hollowState.open);
    saveHollowMarkState();
  });

  for (const button of mount.querySelectorAll('.drive-choice')) {
    button.addEventListener('click', () => setMaskDrive(button.dataset.drive));
  }

  for (const button of mount.querySelectorAll('.zone-choice')) {
    button.addEventListener('click', () => {
      hollowState.selectedZone = button.dataset.zone;
      hollowState.error = '';
      saveHollowMarkState();
      renderShell();
    });
  }

  for (const button of mount.querySelectorAll('.move-choice')) {
    button.addEventListener('click', () => {
      hollowState.selectedMove = button.dataset.move;
      hollowState.error = '';
      saveHollowMarkState();
      renderShell();
    });
  }

  mount.querySelector('.commit-move')?.addEventListener('click', () => {
    commitSelectedMove();
  });
}

function setMaskDrive(driveId) {
  const selectedDrive = MASK_DRIVES.find((drive) => drive.id === driveId);
  if (!selectedDrive) return;
  const nextMask = createMask({
    id: hollowState.mask.id,
    name: hollowState.mask.name,
    drive: selectedDrive.id,
  });
  const currentShape = hollowState.mask.shape;
  const preserveShape = Boolean(
    currentShape
      && ((Number(currentShape.visibility) || 0) > 0
        || (Number(currentShape.fracture) || 0) > 0
        || hollowState.mask.marks.length > 0
        || hollowState.mask.scars.length > 0),
  );

  hollowState.mask = {
    ...nextMask,
    shape: preserveShape ? currentShape : nextMask.shape,
    marks: [...hollowState.mask.marks],
    scars: [...hollowState.mask.scars],
  };
  hollowState.error = '';
  setPresenceFromDrive(selectedDrive.id);
  saveHollowMarkState();
  renderShell();
  syncRemoteMaskDrive(selectedDrive.id);
}

function commitSelectedMove() {
  if (remoteAvailable) {
    commitRemoteMove({
      zoneId: hollowState.selectedZone,
      moveId: hollowState.selectedMove,
    })
      .then((remoteState) => {
        applyRemoteHollowState(remoteState);
        applyRemoteSurfaceState(remoteState);
        saveHollowMarkState();
        renderShell();
        refreshRemoteSurfaces();
      })
      .catch(() => {
        remoteAvailable = false;
        appState.remoteStatus = 'local';
        commitLocalMove();
      });
    return;
  }

  commitLocalMove();
}

function commitLocalMove() {
  try {
    const result = applyMove(
      hollowState.world,
      hollowState.mask,
      hollowState.selectedMove,
      hollowState.selectedZone,
    );
    hollowState.world = result.world;
    hollowState.mask = result.mask;
    hollowState.lastTrace = result.trace;
    hollowState.error = '';
  } catch (error) {
    hollowState.error = error.message.includes('Not enough will')
      ? 'Will exhausted.'
      : 'Move refused.';
  }

  saveHollowMarkState();
  renderShell();
}

function hydrateRemoteHollowMark() {
  if (remoteHydrated || remoteRequestActive || getDemoMode()) return;
  remoteHydrated = true;
  remoteRequestActive = true;

  loadRemoteHollowState()
    .then((remoteState) => {
      remoteAvailable = true;
      appState.remoteStatus = 'synced';
      appState.remoteError = '';
      applyRemoteHollowState(remoteState);
      applyRemoteSurfaceState(remoteState);
      saveHollowMarkState();
      renderShell();
      refreshRemoteSurfaces();
    })
    .catch(() => {
      remoteAvailable = false;
      appState.remoteStatus = 'local';
    })
    .finally(() => {
      remoteRequestActive = false;
    });
}

function syncRemoteMaskDrive(driveId) {
  if (!remoteAvailable) return;
  setRemoteMaskDrive(driveId)
    .then((remoteState) => {
      applyRemoteHollowState(remoteState);
      applyRemoteSurfaceState(remoteState);
      saveHollowMarkState();
      renderShell();
      refreshRemoteSurfaces();
    })
    .catch(() => {
      remoteAvailable = false;
      appState.remoteStatus = 'local';
    });
}

function applyRemoteHollowState(remoteState) {
  hollowState.mask = remoteState.mask;
  hollowState.world = remoteState.world;
  hollowState.selectedZone = remoteState.selectedZone;
  hollowState.selectedMove = remoteState.selectedMove;
  hollowState.lastTrace = remoteState.lastTrace;
  hollowState.error = '';
}

function applyRemoteSurfaceState(remoteState) {
  if (!remoteState.summary && !remoteState.chronicle) return;
  appState.publicWorld = {
    summary: remoteState.summary ?? getPlayableSummary(remoteState.world),
    zones: remoteState.zoneLoom ?? describeWorldZones(remoteState.world),
    chronicle: remoteState.chronicle ?? [],
    serverTime: remoteState.serverTime ?? '',
  };
}

function refreshRemoteSurfaces({ forceCreator = false } = {}) {
  if (getDemoMode()) return;

  Promise.allSettled([
    fetchPublicWorld(),
    forceCreator || appState.activeView === 'creator' ? fetchCreatorOverview() : Promise.resolve(null),
  ]).then(([publicResult, creatorResult]) => {
    let shouldRender = false;

    if (publicResult.status === 'fulfilled') {
      appState.publicWorld = publicResult.value;
      appState.remoteStatus = 'synced';
      appState.remoteError = '';
      remoteAvailable = true;
      shouldRender = true;
    } else {
      appState.remoteStatus = 'local';
      remoteAvailable = false;
    }

    if (creatorResult?.status === 'fulfilled' && creatorResult.value) {
      appState.creatorOverview = creatorResult.value;
      shouldRender = true;
    }

    if (shouldRender) renderShell();
  });
}

function getSelectedZone() {
  return hollowState.world.zones.find((zone) => zone.id === hollowState.selectedZone)
    ?? hollowState.world.zones[0];
}

function getSelectedMove() {
  return MOVES.find((move) => move.id === hollowState.selectedMove) ?? MOVES[0];
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

function collectVisibleTraces() {
  return hollowState.world.zones
    .flatMap((zone) => zone.visibleMarks.map((mark) => ({
      ...mark,
      move: mark.kind,
      zone: zone.label,
    })))
    .reverse();
}

function getChronicleEvents() {
  const remoteEvents = appState.publicWorld?.chronicle ?? [];
  if (remoteEvents.length > 0) return remoteEvents;

  return hollowState.world.actionLog.slice(-8).reverse().map((entry) => ({
    id: entry.traceId,
    title: 'Trace recorded',
    body: `${entry.moveId} / ${entry.zoneId}`,
    moveId: entry.moveId,
    zoneId: entry.zoneId,
    createdAt: entry.at,
  }));
}

function formatEventLine(event) {
  const zone = ZONES.find((candidate) => candidate.id === event.zoneId);
  const zoneLabel = zone?.label ?? event.zoneId ?? '';
  const body = event.body ? `${event.body}` : zoneLabel;
  return body.length > 78 ? `${body.slice(0, 75)}...` : body;
}

function escapeText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatForecast(forecast) {
  const pressure = signedPercent(forecast.pressureDelta);
  const clarity = signedPercent(forecast.clarityDelta);
  const fracture = signedPercent(forecast.fractureDelta);
  return `risk ${formatPercent(forecast.risk)} / ${forecast.signal} / ${forecast.nextZone.state} / pressure ${pressure} / clarity ${clarity} / fracture ${fracture}`;
}

function signedPercent(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${Math.round(value * 100)}%`;
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

renderShell();
