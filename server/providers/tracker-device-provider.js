'use strict';

class TrackerDeviceProvider {
  authorize() { return false; }
}

class DemoTrackerDeviceProvider extends TrackerDeviceProvider {
  authorize({ role, authenticatedUserId, ownerId, consentId, socketDeviceId, payload }) {
    if (role === 'dashboard') return authenticatedUserId === ownerId && payload?.source === 'simulation' && payload.deviceId === 'SIMULATOR-LOCAL';
    if (role === 'mobile') return Boolean(consentId) && socketDeviceId === payload?.deviceId && payload?.source === 'mobile-gps';
    return false;
  }
}

module.exports = { TrackerDeviceProvider, DemoTrackerDeviceProvider };
