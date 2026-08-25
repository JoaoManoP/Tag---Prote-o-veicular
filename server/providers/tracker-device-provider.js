'use strict';

class TrackerDeviceProvider {
  authorize() { return false; }
}

class MobileGpsProvider extends TrackerDeviceProvider {
  authorize({ role, authenticatedUserId, ownerId, consentId, socketDeviceId, payload }) {
    if (role === 'mobile') return Boolean(consentId) && socketDeviceId === payload?.deviceId && payload?.source === 'mobile-gps';
    return false;
  }
}

class DemoTrackerDeviceProvider extends MobileGpsProvider {
  authorize(context) {
    const { role, authenticatedUserId, ownerId, payload } = context;
    if (role === 'dashboard') return authenticatedUserId === ownerId && payload?.source === 'simulation' && payload.deviceId === 'SIMULATOR-LOCAL';
    return super.authorize(context);
  }
}

module.exports = { TrackerDeviceProvider, MobileGpsProvider, DemoTrackerDeviceProvider };
