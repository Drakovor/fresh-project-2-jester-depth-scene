import {
  APP_MODEL_VERSION,
  DEFAULT_PRESENCE_STATE,
  PRESENCES,
  createPresenceState,
  loadPresenceState,
  savePresenceState,
} from './presence-model.js';

const shellState = {
  open: false,
  ...DEFAULT_PRESENCE_STATE,
};

function emitPresence() {
  window.__projectPresence = { ...shellState };
  window.dispatchEvent(new CustomEvent('projectpresencechange', {
    detail: window.__projectPresence,
  }));
}

function setDockState(dock, readout, phase, level, selected) {
  readout.textContent = selected ? `${selected.id} / ${phase}` : phase;
  dock.dataset.phase = phase;
  dock.dataset.tone = selected?.tone ?? 'violet';
  dock.style.setProperty('--threshold-level', String(level));
}

function renderShell() {
  const mount = document.getElementById('app-shell');
  if (!mount) return;
  Object.assign(shellState, loadPresenceState());

  mount.innerHTML = `
    <div class="presence-dock" data-open="false" data-phase="${shellState.phase}" data-tone="${shellState.tone}" data-model="${APP_MODEL_VERSION}" style="--threshold-level: ${shellState.threshold}">
      <button class="dock-mark" type="button" aria-label="Open presence">
        <span>JD</span>
      </button>
      <div class="dock-actions" role="group" aria-label="Presence states">
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
      const selected = PRESENCES.find((presence) => presence.id === button.dataset.presence);
      if (!selected) return;

      Object.assign(shellState, savePresenceState(createPresenceState(selected.id)));
      setDockState(dock, readout, shellState.phase, shellState.threshold, selected);

      for (const choice of choices) {
        choice.setAttribute('aria-pressed', String(choice === button));
      }

      emitPresence();
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
  emitPresence();
}

renderShell();
