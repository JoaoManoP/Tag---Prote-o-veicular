'use strict';

const heroVideo = document.querySelector('.hero-motion__video');

async function activateHeroMotion() {
  if (!heroVideo) return;
  heroVideo.loop = true;
  heroVideo.muted = true;
  heroVideo.playsInline = true;
  const resume = () => heroVideo.play().catch(() => {});
  heroVideo.addEventListener('ended', () => {
    heroVideo.currentTime = 0;
    resume();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resume();
  });
  resume();
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
