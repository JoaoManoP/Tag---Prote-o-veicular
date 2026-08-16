'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDiagnosticEvent, SimulationDiagnosticProvider } = require('../server/vehicle-diagnostics');

test('eventos exigem tipo, severidade e origem válidos', () => {
  const event = createDiagnosticEvent({ type: 'ABS_WARNING', severity: 'WARNING', source: 'SIMULATION', detectedAt: 100 });
  assert.equal(event.source, 'SIMULATION');
  assert.equal(event.dtc, null);
  assert.throws(() => createDiagnosticEvent({ type: 'INVENTED', severity: 'WARNING', source: 'SIMULATION' }));
});

test('provider de simulação nunca aceita DTC como leitura real', () => {
  const provider = new SimulationDiagnosticProvider();
  const events = provider.setEvents('vehicle-1', [{ type: 'CHECK_ENGINE', severity: 'CRITICAL', dtc: { code: 'P0001', source: 'OBD' } }]);
  assert.equal(events.length, 1);
  assert.equal(events[0].source, 'SIMULATION');
  assert.equal(events[0].dtc, null);
  assert.deepEqual(provider.clear('vehicle-1'), []);
});
