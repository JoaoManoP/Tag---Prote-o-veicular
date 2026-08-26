'use strict';

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
