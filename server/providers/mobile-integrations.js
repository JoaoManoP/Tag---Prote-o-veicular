'use strict';
class UnconfiguredProvider {
  constructor(name) { this.name = name; }
  get configured() { return false; }
  async list() { return { available: false, provider: this.name, items: [], reason: 'Provider não configurado.' }; }
}
class VehicleFineProvider extends UnconfiguredProvider { constructor() { super('vehicle-fines'); } }
class TollProvider extends UnconfiguredProvider { constructor() { super('tolls'); } }
class NotificationProvider extends UnconfiguredProvider { constructor() { super('notifications'); } async register() { return { available: false, provider: this.name, reason: 'Credenciais push não configuradas.' }; } }
module.exports = { VehicleFineProvider, TollProvider, NotificationProvider };
