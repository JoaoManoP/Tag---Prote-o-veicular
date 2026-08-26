'use strict';

function loadMapboxGl() {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/mapbox/mapbox-gl.js';
    script.onload = () => {
      if (!window.mapboxgl) return reject(new Error('Mapbox GL JS não foi inicializado.'));
      window.mapboxgl.accessToken = window.RASTROTACK_MAP_CONFIG?.mapboxAccessToken || '';
      window.maplibregl = window.mapboxgl;
      resolve(window.mapboxgl);
    };
    script.onerror = () => reject(new Error('Mapbox GL JS não pôde ser carregado.'));
    document.head.appendChild(script);
  });
}

const provider = window.RASTROTACK_MAP_CONFIG?.provider;
window.RastroMapLibre = provider === 'mapbox'
  ? loadMapboxGl()
  : provider === 'maplibre'
    ? import('/vendor/maplibre/maplibre-gl.mjs').then(module => {
        window.maplibregl = module;
        return module;
      })
    : Promise.resolve(null);
