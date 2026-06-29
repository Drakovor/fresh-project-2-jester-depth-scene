const PRESENCES = [
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
    id: 'static',
    label: 'Static',
    tone: 'pistachio',
    resonance: 0.56,
    threshold: 0.52,
  },
];

const shellState = {
  open: false,
  presence: 'unformed',
  resonance: 0,
  threshold: 0,
  phase: 'dormant',
  tone: 'violet',
};

function emitPresence() {
  window.__projectPresence = { ...shellState };
  window.dispatchEvent(new CustomEvent('projectpresencechange', {
    detail: window.__projectPresence,
  }));
}

function phaseFromThreshold(value) {
  if (value >= 0.62) return 'unbound';
  if (value >= 0.46) return 'awake';
  if (value >= 0.24) return 'veiled';
  return 'dormant';
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

  mount.innerHTML = `
    <div class="presence-dock" data-open="false" data-phase="dormant" data-tone="violet" style="--threshold-level: 0">
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
        <span class="readout-key">dormant</span>
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

      shellState.presence = selected.id;
      shellState.resonance = selected.resonance;
      shellState.threshold = selected.threshold;
      shellState.phase = phaseFromThreshold(selected.threshold);
      shellState.tone = selected.tone;
      setDockState(dock, readout, shellState.phase, shellState.threshold, selected);

      for (const choice of choices) {
        choice.setAttribute('aria-pressed', String(choice === button));
      }

      emitPresence();
    });
  }

  setDockState(dock, readout, shellState.phase, shellState.threshold, null);
  emitPresence();
}

renderShell();
