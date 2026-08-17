'use strict';

window.RastroMapLibre=import('/vendor/maplibre/maplibre-gl.mjs').then(module=>{
  window.maplibregl=module;
  return module;
});
