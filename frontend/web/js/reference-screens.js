'use strict';

const referenceDialog = document.getElementById('referenceDialog');

document.addEventListener('click', event => {
  const tabJump = event.target.closest('[data-platform-tab-jump]');
  if (tabJump) {
    const key = tabJump.dataset.platformTabJump;
    const target = document.querySelector(`[data-platform-tab="${key}"]`);
    if (target && !target.classList.contains('hidden')) target.click();
    return;
  }
});

document
  .getElementById('closeReferenceDialog')
  ?.addEventListener('click', () => referenceDialog.close());
document
  .getElementById('confirmReferenceDialog')
  ?.addEventListener('click', () => referenceDialog.close());
referenceDialog?.addEventListener('click', event => {
  if (event.target === referenceDialog) referenceDialog.close();
});
