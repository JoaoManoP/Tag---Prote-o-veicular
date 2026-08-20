'use strict';

window.RastroMapLibre = ['maplibre', 'mapbox'].includes(window.RASTROTACK_MAP_CONFIG?.provider)
  ? import('/vendor/maplibre/maplibre-gl.mjs').then(module => {
      window.maplibregl = module;
      return module;
    })
  : Promise.resolve(null);
