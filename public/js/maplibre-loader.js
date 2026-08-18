'use strict';

window.RastroMapLibre = window.RASTROTACK_MAP_CONFIG?.provider === 'maplibre'
  ? import('/vendor/maplibre/maplibre-gl.mjs').then(module => {
      window.maplibregl = module;
      return module;
    })
  : Promise.resolve(null);
