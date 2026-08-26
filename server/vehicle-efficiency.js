'use strict';

const LOCAL_CATALOG = Object.freeze([
  {
    id: 'manual',
    manufacturer: 'Outro',
    model: 'Preenchimento manual',
    version: '—',
    year: null,
    engine: '—',
    transmission: '—',
    fuel: 'Flex',
    urbanKmPerLiter: 10,
    highwayKmPerLiter: 12,
    tankCapacityLiters: 50,
    energyCategory: null,
    source: 'manual',
    sourceYear: null,
    updatedAt: null
  },
  {
    id: 'onix-10-mt',
    manufacturer: 'Chevrolet',
    model: 'Onix',
    version: '1.0 MT',
    year: null,
    engine: '1.0',
    transmission: 'Manual',
    fuel: 'Flex (gasolina)',
    urbanKmPerLiter: 13.3,
    highwayKmPerLiter: 16.5,
    tankCapacityLiters: 44,
    energyCategory: null,
    source:
      'PBE Veicular / Inmetro — referência demonstrativa; confirme ano e versão no catálogo vigente',
    sourceYear: null,
    updatedAt: null
  },
  {
    id: 'hb20-10-mt',
    manufacturer: 'Hyundai',
    model: 'HB20',
    version: 'Comfort 1.0 MT',
    year: null,
    engine: '1.0',
    transmission: 'Manual',
    fuel: 'Flex (gasolina)',
    urbanKmPerLiter: 13.3,
    highwayKmPerLiter: 15.4,
    tankCapacityLiters: 50,
    energyCategory: null,
    source:
      'PBE Veicular / Inmetro — referência demonstrativa; confirme ano e versão no catálogo vigente',
    sourceYear: null,
    updatedAt: null
  },
  {
    id: 'corolla-20-cvt',
    manufacturer: 'Toyota',
    model: 'Corolla',
    version: '2.0 CVT',
    year: null,
    engine: '2.0',
    transmission: 'CVT',
    fuel: 'Flex (gasolina)',
    urbanKmPerLiter: 11.9,
    highwayKmPerLiter: 14.5,
    tankCapacityLiters: 50,
    energyCategory: null,
    source:
      'PBE Veicular / Inmetro — referência demonstrativa; confirme ano e versão no catálogo vigente',
    sourceYear: null,
    updatedAt: null
  }
]);

function normalizeReference(item) {
  return {
    id: item.id,
    brand: item.manufacturer,
    manufacturer: item.manufacturer,
    model: item.model,
    version: item.version,
    year: item.year,
    engine: item.engine,
    transmission: item.transmission,
    fuel: item.fuel,
    city: item.urbanKmPerLiter,
    road: item.highwayKmPerLiter,
    urbanKmPerLiter: item.urbanKmPerLiter,
    highwayKmPerLiter: item.highwayKmPerLiter,
    tank: item.tankCapacityLiters,
    energyCategory: item.energyCategory,
    source: item.source,
    sourceYear: item.sourceYear,
    updatedAt: item.updatedAt
  };
}

class VehicleEfficiencyProvider {
  constructor(catalog = LOCAL_CATALOG) {
    this.catalog = catalog.map(item => Object.freeze({ ...item }));
  }
  list() {
    return this.catalog.map(normalizeReference);
  }
  findById(id) {
    const item = this.catalog.find(entry => entry.id === id);
    return item ? normalizeReference(item) : null;
  }
}

function estimateConsumption({
  distanceMeters,
  urbanShare = 0.55,
  urbanKmPerLiter,
  highwayKmPerLiter,
  idleMilliseconds = 0,
  fuelPrice = 0,
  tankCapacityLiters = 0
}) {
  const totalKm = Math.max(0, Number(distanceMeters) || 0) / 1000;
  const share = Math.min(1, Math.max(0, Number(urbanShare) || 0));
  const urbanEfficiency = Number(urbanKmPerLiter);
  const highwayEfficiency = Number(highwayKmPerLiter);
  if (!(urbanEfficiency > 0) || !(highwayEfficiency > 0)) return null;
  const urbanDistanceKm = totalKm * share;
  const highwayDistanceKm = totalKm - urbanDistanceKm;
  const urbanLiters = urbanDistanceKm / urbanEfficiency;
  const highwayLiters = highwayDistanceKm / highwayEfficiency;
  const idleLiters = (Math.max(0, Number(idleMilliseconds) || 0) / 3600000) * 0.8;
  const baseLiters = urbanLiters + highwayLiters + idleLiters;
  const minimumLiters = baseLiters * 0.92;
  const maximumLiters = baseLiters * 1.18;
  const price = Math.max(0, Number(fuelPrice) || 0);
  const tank = Math.max(0, Number(tankCapacityLiters) || 0);
  return {
    totalKm,
    urbanDistanceKm,
    highwayDistanceKm,
    urbanLiters,
    highwayLiters,
    idleLiters,
    minimumLiters,
    maximumLiters,
    minimumCost: minimumLiters * price,
    maximumCost: maximumLiters * price,
    minimumTankPercent: tank ? (minimumLiters / tank) * 100 : null,
    maximumTankPercent: tank ? (maximumLiters / tank) * 100 : null,
    assumptions: { urbanShare: share, uncertaintyRange: [-8, 18], idleLitersPerHour: 0.8 }
  };
}

module.exports = { VehicleEfficiencyProvider, LOCAL_CATALOG, estimateConsumption };
