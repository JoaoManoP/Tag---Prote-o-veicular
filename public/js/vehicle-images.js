(function vehicleImagesModule(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VehicleImageService = api;
})(typeof window !== 'undefined' ? window : globalThis, function createVehicleImageService() {
  'use strict';
  const BASE_PATH = '/images/vehicles';
  const REMOTE_IMAGE_HOSTS = new Set(['cdn.trustcar.info', 'upload.wikimedia.org']);
  const catalog = Object.freeze({});
  function isApprovedVehicleImageUrl(value) {
    if (/^\/(?!\/)/.test(String(value || ''))) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && REMOTE_IMAGE_HOSTS.has(url.hostname);
    } catch {
      return false;
    }
  }
  function normalizeVehicleKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  function resolveVehicleImage(vehicle = {}) {
    const brand = normalizeVehicleKey(vehicle.brand),
      model = normalizeVehicleKey(vehicle.model);
    const year = normalizeVehicleKey(vehicle.year);
    const type = normalizeVehicleKey(vehicle.type) === 'motorcycle' ? 'motorcycle' : 'car';
    const key = brand && model ? `${brand}/${model}` : '',
      exactKey = key && year ? `${key}-${year}` : '';
    const familyKey = Object.keys(catalog).find(
      item => item.startsWith(`${brand}/`) && (key === item || key.startsWith(`${item}-`))
    );
    const catalogPath = catalog[exactKey] || catalog[key] || catalog[familyKey],
      candidates = [];
    if (vehicle.customImageUrl && /^\/(?!\/)/.test(vehicle.customImageUrl))
      candidates.push({ url: vehicle.customImageUrl, source: 'owner-upload', matchedBy: 'custom' });
    if (vehicle.image?.url && isApprovedVehicleImageUrl(vehicle.image.url))
      candidates.push({
        url: vehicle.image.url,
        source: vehicle.image.source || 'vehicle-image-provider',
        matchedBy: vehicle.image.source === 'auto.dev' ? 'vin' : 'brand-model'
      });
    if (catalogPath)
      candidates.push({
        url: `${BASE_PATH}/${catalogPath}`,
        source: 'local-catalog',
        matchedBy: catalog[exactKey] ? 'brand-model-year' : 'brand-model'
      });
    return candidates.length
      ? { ...candidates[0], candidates }
      : { url: null, source: 'unavailable', matchedBy: null, candidates };
  }
  function applyVehicleImage(image, vehicle, onExhausted) {
    const resolved = resolveVehicleImage(vehicle);
    let index = 0;
    const tryNext = () => {
      const candidate = resolved.candidates[index++];
      if (!candidate) {
        image.hidden = true;
        image.removeAttribute('src');
        onExhausted?.();
        return;
      }
      image.dataset.source = candidate.source;
      image.src = candidate.url;
    };
    image.onerror = tryNext;
    image.hidden = false;
    image.alt =
      vehicle?.brand || vehicle?.model
        ? `${vehicle.brand || ''} ${vehicle.model || ''}`.trim()
        : 'Imagem genérica do veículo';
    tryNext();
    return resolved;
  }
  return {
    catalog,
    normalizeVehicleKey,
    isApprovedVehicleImageUrl,
    resolveVehicleImage,
    applyVehicleImage
  };
});
