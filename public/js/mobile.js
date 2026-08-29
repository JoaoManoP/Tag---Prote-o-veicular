/* global io, OfflinePositionQueue */
'use strict';
const $ = id => document.getElementById(id);
const invite = new URLSearchParams(location.hash.slice(1) || location.search);
const invitedSessionId = invite.get('session'),
  invitedToken = invite.get('token');
if (invitedSessionId && invitedToken) {
  sessionStorage.setItem('rastreon-mobile-session', invitedSessionId);
  sessionStorage.setItem('rastreon-mobile-token', invitedToken);
  history.replaceState(null, '', '/mobile.html');
}
let sessionId = invitedSessionId || sessionStorage.getItem('rastreon-mobile-session'),
  mobileToken = invitedToken || sessionStorage.getItem('rastreon-mobile-token');
const socket = io({ reconnection: true, reconnectionDelay: 800, reconnectionDelayMax: 5000 });
let queue = sessionId ? new OfflinePositionQueue(sessionId) : null;
const deviceId =
  sessionStorage.getItem('rastreon-mobile-device') ||
  `web-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
sessionStorage.setItem('rastreon-mobile-device', deviceId);
let watchId = null,
  sharing = false,
  count = 0,
  distance = 0,
  lastPosition = null,
  sessionValid = false,
  sequence = Date.now() * 1000,
  lostAt = null,
  sendingQueue = false,
  consentGranted = false,
  consentPending = null;
let mobileMap = null,
  mobileMapApi = null,
  mobileMarker = null,
  accuracyCircle = null,
  mapCentered = false;

async function initializeMobileMap() {
  const container = $('mobileMap');
  if (!container || !window.RastroMap) return;
  const result = await window.RastroMap.ready;
  if (!result?.L) {
    container.innerHTML = `<div class="mobile-map-error">${result?.error || 'Mapa indisponível neste ambiente.'}</div>`;
    return;
  }
  mobileMapApi = result.L;
  mobileMap = mobileMapApi.map('mobileMap');
  $('mobileMapStatus').textContent = 'Mapa pronto';
}

function updateMobileMap(position) {
  if (!mobileMap || !mobileMapApi) return;
  const point = [position.latitude, position.longitude];
  if (!mobileMarker) {
    mobileMarker = mobileMapApi
      .marker(point, {
        icon: mobileMapApi.divIcon({ className: 'mobile-location-marker', html: '<span></span>' })
      })
      .addTo(mobileMap);
    accuracyCircle = mobileMapApi
      .circle(point, {
        radius: position.accuracy,
        color: '#3c91e6',
        fillColor: '#3c91e6',
        fillOpacity: 0.16,
        weight: 2
      })
      .addTo(mobileMap);
  } else {
    mobileMarker.setLatLng(point);
    accuracyCircle.setLatLng(point).setRadius(position.accuracy);
  }
  if (!mapCentered) {
    mobileMap.setView(point, 17);
    mapCentered = true;
  } else {
    mobileMap.panTo(point);
  }
  $('mobileMapStatus').className = 'badge online';
  $('mobileMapStatus').textContent = `Precisão ${position.accuracy.toFixed(0)} m`;
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 2800);
}
function status(text, online = false) {
  $('mobileStatus').className = `badge ${online ? 'online' : 'offline'}`;
  $('mobileStatus').textContent = `● ${text}`;
  $('mConnection').textContent = text;
}
function haversine(a, b) {
  const radius = 6371000,
    radians = value => (value * Math.PI) / 180,
    d1 = radians(b.latitude - a.latitude),
    d2 = radians(b.longitude - a.longitude),
    value =
      Math.sin(d1 / 2) ** 2 +
      Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(d2 / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}
async function updateQueueCount() {
  const total = queue ? await queue.count() : 0;
  $('mQueue').textContent = `${total} ponto${total === 1 ? '' : 's'}`;
  return total;
}
async function enqueue(position) {
  if (!queue) return;
  await queue.add({ ...position, capturedOffline: true });
  await updateQueueCount();
}
function stop(message = 'Compartilhamento parado.') {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  if (consentGranted && socket.connected) socket.emit('consent:revoke', { deviceId }, () => {});
  consentGranted = false;
  consentPending = null;
  watchId = null;
  sharing = false;
  $('startBtn').classList.remove('hidden');
  $('startBtn').disabled = !sessionValid;
  $('stopBtn').classList.add('hidden');
  status(sessionValid ? 'Pronto para compartilhar' : 'Sessão indisponível', sessionValid);
  toast(message);
}
function render(position) {
  if (lastPosition) {
    const step = haversine(lastPosition, position);
    if (step < 2000) distance += step;
  }
  lastPosition = position;
  $('mLatitude').textContent = position.latitude.toFixed(6);
  $('mLongitude').textContent = position.longitude.toFixed(6);
  $('mAccuracy').textContent = `${position.accuracy.toFixed(1)} m`;
  $('mSpeed').textContent =
    position.speed == null
      ? 'Não disponível'
      : `${(Math.max(0, position.speed) * 3.6).toFixed(1)} km/h`;
  $('mUpdated').textContent = new Date(position.timestamp).toLocaleString('pt-BR');
  $('mDistance').textContent =
    distance < 1000 ? `${distance.toFixed(0)} m` : `${(distance / 1000).toFixed(2)} km`;
  updateMobileMap(position);
}
function grantConsent() {
  if (consentGranted) return Promise.resolve(true);
  if (consentPending) return consentPending;
  consentPending = new Promise(resolve =>
    socket.emit('consent:grant', { deviceId, purpose: 'vehicle-tracking' }, result => {
      consentGranted = Boolean(result?.ok);
      consentPending = null;
      resolve(consentGranted);
    })
  );
  return consentPending;
}
async function onPosition(result) {
  const coords = result.coords,
    position = {
      deviceId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      speed: coords.speed,
      heading: coords.heading,
      altitude: coords.altitude,
      timestamp: result.timestamp,
      source: 'mobile-gps',
      sequence: ++sequence
    };
  render(position);
  if (!socket.connected || !sessionValid) {
    if (!lostAt) lostAt = Date.now();
    await enqueue(position);
    status('Sem internet · GPS salvo no aparelho');
    return;
  }
  if (!(await grantConsent())) {
    await enqueue(position);
    return toast('Não foi possível registrar o consentimento.');
  }
  socket.emit('position:update', position, async acknowledgement => {
    if (!acknowledgement?.ok) {
      if (acknowledgement?.error?.includes('encerrada')) return stop(acknowledgement.error);
      if (!lostAt) lostAt = Date.now();
      await enqueue(position);
      return;
    }
    if (acknowledgement.accepted) count++;
    $('mCount').textContent = count;
    status('Compartilhando localização', true);
  });
}
function onError(error) {
  const messages = {
    1: 'Permissão de localização negada.',
    2: 'Localização indisponível.',
    3: 'Tempo esgotado ao obter localização.'
  };
  toast(messages[error.code] || 'Erro ao acessar a localização.');
  if (error.code === 1) stop('A permissão foi negada. Nada foi compartilhado.');
}
function start() {
  if (!sessionValid || sharing) return;
  if (!window.isSecureContext && location.hostname !== 'localhost')
    return toast('O GPS do navegador exige uma conexão HTTPS.');
  if (!navigator.geolocation) return toast('Este navegador não oferece geolocalização.');
  sharing = true;
  $('startBtn').classList.add('hidden');
  $('stopBtn').classList.remove('hidden');
  status('Solicitando autorização…');
  watchId = navigator.geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000
  });
}
async function flushQueue() {
  if (!queue || sendingQueue || !sessionValid || !socket.connected) return;
  const batch = await queue.list(200);
  if (!batch.length) {
    await updateQueueCount();
    return;
  }
  sendingQueue = true;
  status(`Enviando lote de ${batch.length} ponto(s)…`);
  socket.emit('positions:batch', { points: batch, lostAt }, async result => {
    sendingQueue = false;
    if (!result?.ok) return status(result?.error || 'Falha ao sincronizar');
    await queue.removeSequences(result.confirmedSequences || []);
    count += result.received || 0;
    $('mCount').textContent = count;
    const remaining = await updateQueueCount();
    if (!remaining) {
      lostAt = null;
      toast('Fila offline confirmada pelo servidor.');
      status(sharing ? 'Compartilhando localização' : 'Pronto para compartilhar', true);
    } else flushQueue();
  });
}
function join() {
  if (!sessionId || !mobileToken) return status('Dispositivo não sincronizado');
  socket.emit(
    'session:join',
    { sessionId, role: 'mobile', token: mobileToken, deviceId },
    result => {
      sessionValid = Boolean(result?.ok);
      consentGranted = false;
      $('startBtn').disabled = !sessionValid;
      if (sessionValid) {
        const vehicle = result.session.vehicle;
        $('mobileVehicle').classList.remove('empty');
        $('mobileVehicle').textContent = vehicle
          ? `${vehicle.nickname} — ${vehicle.brand} ${vehicle.model} ${vehicle.version}`
          : 'Veículo não informado';
        status(sharing ? 'Compartilhando localização' : 'Dispositivo sincronizado', true);
        if (sharing) grantConsent().then(flushQueue);
      } else {
        status('Dispositivo inválido ou revogado');
        if (sharing) stop('Este dispositivo não está mais autorizado.');
      }
    }
  );
}

$('startBtn').onclick = start;
$('stopBtn').onclick = () => stop();
if (!sessionId || !mobileToken) location.replace('/tracker');
socket.on('connect', join);
socket.on('disconnect', () => {
  if (sharing && !lostAt) lostAt = Date.now();
  status(
    sharing
      ? 'Sem internet · armazenando GPS no IndexedDB'
      : 'Internet desconectada; tentando reconectar…'
  );
});
socket.on('session:closed', async () => {
  sessionValid = false;
  sessionStorage.removeItem('rastreon-mobile-session');
  sessionStorage.removeItem('rastreon-mobile-token');
  if (queue) await queue.clear();
  await updateQueueCount();
  stop('O painel encerrou esta sessão.');
  status('Sessão encerrada');
});
socket.on('device:revoked', () => {
  sessionValid = false;
  sessionStorage.removeItem('rastreon-mobile-session');
  sessionStorage.removeItem('rastreon-mobile-token');
  sessionStorage.removeItem('rastreon-mobile-device');
  stop('Este celular foi desvinculado pelo painel.');
  status('Dispositivo revogado');
});
updateQueueCount().catch(() => status('Armazenamento offline indisponível'));
initializeMobileMap().catch(() => {
  const container = $('mobileMap');
  if (container)
    container.innerHTML = '<div class="mobile-map-error">Não foi possível carregar o mapa.</div>';
});
