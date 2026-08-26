'use strict';

const EVENT_TYPES = Object.freeze([
  'LOW_FUEL',
  'BATTERY_WARNING',
  'ELECTRICAL_FAULT',
  'ABS_WARNING',
  'CHECK_ENGINE',
  'ENGINE_TEMPERATURE',
  'OIL_PRESSURE',
  'BRAKE_WARNING',
  'TIRE_PRESSURE'
]);
const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'CRITICAL']);
const SOURCES = Object.freeze(['SIMULATION', 'OBD', 'CAN', 'VEHICLE_API', 'DECLARED']);

function createDiagnosticEvent(value = {}) {
  if (!EVENT_TYPES.includes(value.type)) throw new TypeError('Tipo de diagnóstico inválido.');
  if (!SEVERITIES.includes(value.severity))
    throw new TypeError('Severidade de diagnóstico inválida.');
  if (!SOURCES.includes(value.source)) throw new TypeError('Origem de diagnóstico inválida.');
  const detectedAt = Number(value.detectedAt || Date.now());
  if (!Number.isFinite(detectedAt)) throw new TypeError('Data de diagnóstico inválida.');
  return Object.freeze({
    id: String(value.id || `${value.source}-${value.type}-${detectedAt}`),
    vehicleId: value.vehicleId == null ? null : String(value.vehicleId),
    type: value.type,
    severity: value.severity,
    source: value.source,
    detectedAt,
    clearedAt: value.clearedAt == null ? null : Number(value.clearedAt),
    estimatedValue: value.estimatedValue == null ? null : Number(value.estimatedValue),
    dtc: value.dtc ? normalizeDtc(value.dtc) : null,
    metadata: value.metadata && typeof value.metadata === 'object' ? { ...value.metadata } : {}
  });
}

function normalizeDtc(value) {
  return Object.freeze({
    code: String(value.code || '').slice(0, 20),
    description: String(value.description || '').slice(0, 240),
    severity: SEVERITIES.includes(value.severity) ? value.severity : 'INFO',
    source: SOURCES.includes(value.source) ? value.source : 'DECLARED',
    detectedAt: Number(value.detectedAt || Date.now()),
    clearedAt: value.clearedAt == null ? null : Number(value.clearedAt)
  });
}

class VehicleDiagnosticProvider {
  constructor(name, source) {
    if (new.target === VehicleDiagnosticProvider)
      throw new TypeError('VehicleDiagnosticProvider é abstrato.');
    if (!SOURCES.includes(source)) throw new TypeError('Origem de provider inválida.');
    this.name = name;
    this.source = source;
  }
  listEvents() {
    throw new Error('Provider deve implementar listEvents().');
  }
}

class SimulationDiagnosticProvider extends VehicleDiagnosticProvider {
  constructor() {
    super('simulation', 'SIMULATION');
    this.events = new Map();
  }
  listEvents(vehicleId = null) {
    return [...this.events.values()].filter(
      event => vehicleId == null || event.vehicleId === String(vehicleId)
    );
  }
  setEvents(vehicleId, values = []) {
    for (const [id, event] of this.events)
      if (event.vehicleId === String(vehicleId)) this.events.delete(id);
    for (const value of values) {
      const event = createDiagnosticEvent({ ...value, vehicleId, source: 'SIMULATION', dtc: null });
      this.events.set(event.id, event);
    }
    return this.listEvents(vehicleId);
  }
  clear(vehicleId) {
    return this.setEvents(vehicleId, []);
  }
}

module.exports = {
  EVENT_TYPES,
  SEVERITIES,
  SOURCES,
  createDiagnosticEvent,
  VehicleDiagnosticProvider,
  SimulationDiagnosticProvider
};
