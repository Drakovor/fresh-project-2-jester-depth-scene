const PRESENCES = [
  {
    id: 'softness',
    label: 'Softness',
    tone: 'violet',
    resonance: 0.42,
  },
  {
    id: 'defiance',
    label: 'Defiance',
    tone: 'ember',
    resonance: 0.7,
  },
  {
    id: 'static',
    label: 'Static',
    tone: 'pistachio',
    resonance: 0.56,
  },
];

const shellState = {
  open: false,
  presence: 'unformed',
  resonance: 0,
};

function emitPresence() {
  window.__projectPresence = { ...shellState };
  window.dispatchEvent(new CustomEvent('projectpresencechange', {
    detail: window.__projectPresence,
  }));
}

function renderShell() {
  const mount = document.getElementById('app-shell');
  if (!mount) return;

  mount.innerHTML = `
    <div class="presence-dock" data-open="false">
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
        <span class="readout-key">unformed</span>
        <span class="readout-line"></span>
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
      readout.textContent = selected.id;
      dock.dataset.tone = selected.tone;

      for (const choice of choices) {
        choice.setAttribute('aria-pressed', String(choice === button));
      }

      emitPresence();
    });
  }

  emitPresence();
}

renderShell();
