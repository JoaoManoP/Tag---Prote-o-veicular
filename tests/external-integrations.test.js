'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../server/database');
const {
  TrafficFinesProvider,
  FuelPriceProvider,
  FreeFlowProvider,
  PaymentProvider,
  integrationStatus
} = require('../server/external-integrations');

test('fundação pública cria domínios sem dados fictícios', () => {
  const database = createDatabase(':memory:');
  try {
    for (const table of [
      'auth_identities',
      'plans',
      'subscriptions',
      'payments',
      'payment_events',
      'traffic_fine_snapshots',
      'toll_plazas',
      'toll_tariffs',
      'user_connections',
      'convoy_sessions',
      'convoy_members',
      'convoy_invites'
    ]) {
      const found = database
        .prepare("SELECT 1 AS found FROM sqlite_schema WHERE type='table' AND name=?")
        .get(table);
      assert.equal(found.found, 1, table);
      assert.equal(database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total, 0);
    }
  } finally {
    database.close();
  }
});

test('providers externos falham de forma explícita sem credencial ou contrato', async () => {
  for (const operation of [
    () => new TrafficFinesProvider().query(),
    () => new FuelPriceProvider().importWeeklySurvey(),
    () => new FreeFlowProvider().queryDebts(),
    () => new PaymentProvider().createCheckout()
  ])
    await assert.rejects(operation, error => error.code === 'PROVIDER_UNAVAILABLE');
});

test('feature flags externas permanecem desligadas por padrão', () => {
  const status = integrationStatus({});
  assert.equal(status.payments, false);
  assert.equal(status.trafficFines, false);
  assert.equal(status.convoy, false);
  assert.equal(status.googleLogin, false);
  assert.equal(status.cnhProvider, 'manual-review');
});
