'use strict';

class UnavailableIntegrationError extends Error {
  constructor(feature, reason) {
    super(reason || `${feature} indisponível sem provider configurado.`);
    this.name = 'UnavailableIntegrationError';
    this.feature = feature;
    this.code = 'PROVIDER_UNAVAILABLE';
  }
}

class TrafficFinesProvider {
  constructor({ configured = false, name = null } = {}) {
    this.configured = configured;
    this.name = name;
  }
  async query() {
    throw new UnavailableIntegrationError(
      'traffic-fines',
      'Consulta Senatran/SERPRO indisponível sem contrato, certificado e credenciais oficiais.'
    );
  }
}

class FuelPriceProvider {
  constructor({ configured = false, name = null } = {}) {
    this.configured = configured;
    this.name = name;
  }
  async importWeeklySurvey() {
    throw new UnavailableIntegrationError(
      'fuel-anp',
      'Sincronização ANP indisponível sem fonte de ingestão configurada e validada.'
    );
  }
}

class FreeFlowProvider {
  async queryDebts() {
    throw new UnavailableIntegrationError(
      'free-flow',
      'Pendências free flow indisponíveis sem integração oficial da concessionária.'
    );
  }
}

class PaymentProvider {
  constructor({ configured = false, name = null } = {}) {
    this.configured = configured;
    this.name = name;
  }
  async createCheckout() {
    throw new UnavailableIntegrationError(
      'payments',
      'Pagamentos indisponíveis enquanto o Mercado Pago e o webhook assinado não estiverem configurados.'
    );
  }
}

function integrationStatus(environment = process.env) {
  return {
    emailDelivery: environment.AUTH_DELIVERY_PROVIDER === 'email',
    smsDelivery: environment.AUTH_DELIVERY_PROVIDER === 'sms',
    cnhRequired: environment.FEATURE_CNH_REQUIRED === 'true',
    cnhProvider: environment.FEATURE_CNH_PROVIDER === 'true' ? 'configured' : 'manual-review',
    fuelAnpSync: environment.FEATURE_FUEL_ANP_SYNC === 'true',
    trafficFines: environment.FEATURE_SENATRAN === 'true',
    convoy: environment.FEATURE_CONVOY === 'true',
    payments: environment.FEATURE_PAYMENTS === 'true',
    googleLogin: environment.FEATURE_GOOGLE_LOGIN === 'true',
    appleLogin: environment.FEATURE_APPLE_LOGIN === 'true'
  };
}

module.exports = {
  UnavailableIntegrationError,
  TrafficFinesProvider,
  FuelPriceProvider,
  FreeFlowProvider,
  PaymentProvider,
  integrationStatus
};
