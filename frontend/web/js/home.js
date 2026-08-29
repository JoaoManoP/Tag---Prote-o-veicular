'use strict';

const heroVideo = document.querySelector('.hero-motion__video');

async function activateHeroMotion() {
  if (!heroVideo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const candidates = [...heroVideo.querySelectorAll('source[data-src]')];
  const available = [];
  for (const source of candidates) {
    try {
      const response = await fetch(source.dataset.src, { method: 'HEAD', cache: 'no-cache' });
      if (response.ok) available.push(source);
    } catch {
      // A imagem de poster permanece visível caso a mídia não esteja disponível.
    }
  }
  if (!available.length) return;

  for (const source of available) source.src = source.dataset.src;
  heroVideo.load();
  heroVideo.play().catch(() => {
    // Autoplay pode ser bloqueado; o poster continua sendo o fallback visual.
  });
}

activateHeroMotion();

const helpToggle = document.getElementById('homeHelpToggle');
const helpPanel = document.getElementById('homeHelpPanel');
const helpClose = document.getElementById('homeHelpClose');

function setHelpOpen(open) {
  helpPanel.hidden = !open;
  helpToggle.setAttribute('aria-expanded', String(open));
  if (open) helpPanel.querySelector('summary')?.focus();
}

helpToggle.addEventListener('click', () => setHelpOpen(helpPanel.hidden));
helpClose.addEventListener('click', () => {
  setHelpOpen(false);
  helpToggle.focus();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !helpPanel.hidden) {
    setHelpOpen(false);
    helpToggle.focus();
  }
});
