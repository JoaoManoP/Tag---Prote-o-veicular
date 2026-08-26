'use strict';
(() => {
  try {
    const preference = localStorage.getItem('rastrotack-theme');
    document.documentElement.dataset.theme =
      preference === 'light' || preference === 'dark'
        ? preference
        : matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
  } catch {
    document.documentElement.dataset.theme = 'dark';
  }
})();
