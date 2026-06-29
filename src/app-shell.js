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

function renderShell() {
  hydrate();
  const mount = document.getElementById('app-shell');
  if (!mount) return;

  mount.innerHTML = `
    ${renderPresenceDock()}
    ${renderHollowMarkPanel()}
  `;

  wirePresenceDock(mount);
  wireHollowMarkPanel(mount);
  emitPresence();
  emitHollowMark();
  hydrateRemoteHollowMark();
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
        saveHollowMarkState();
        renderShell();
      })
      .catch(() => {
        remoteAvailable = false;
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
      applyRemoteHollowState(remoteState);
      saveHollowMarkState();
      renderShell();
    })
    .catch(() => {
      remoteAvailable = false;
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
      saveHollowMarkState();
      renderShell();
    })
    .catch(() => {
      remoteAvailable = false;
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
