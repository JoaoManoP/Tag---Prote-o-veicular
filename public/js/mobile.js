/* global io */
'use strict';

const $ = (id) => document.getElementById(id);
const sessionId = new URLSearchParams(location.search).get('session');
const storageKey = `rastrotack-offline-${sessionId || 'invalid'}`;
const sequenceKey = `rastrotack-sequence-${sessionId || 'invalid'}`;
const deviceKey = 'rastrotack-device-id';
const socket = io({ reconnection: true, reconnectionDelay: 800, reconnectionDelayMax: 5000 });
const deviceId = (() => {
  const existing = localStorage.getItem(deviceKey);
  if (existing) return existing;
  const created = `MOBILE-${crypto.randomUUID()}`;
  localStorage.setItem(deviceKey, created);
  return created;
})();

let watchId = null;
let sharing = false;
let count = 0;
let distance = 0;
let lastPosition = null;
let sessionValid = false;
let consentGranted = false;
let sequence = Number(localStorage.getItem(sequenceKey)) || 0;
let lostAt = null;
let sendingQueue = false;

function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); setTimeout(() => $('toast').classList.remove('show'), 2800); }
function status(text, online = false) { $('mobileStatus').className = `badge ${online ? 'online' : 'offline'}`; $('mobileStatus').textContent = `● ${text}`; $('mConnection').textContent = text; }
function haversine(first, second) { const radius = 6371000; const radians = (value) => value * Math.PI / 180; const latitudeDelta = radians(second.latitude - first.latitude); const longitudeDelta = radians(second.longitude - first.longitude); const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(longitudeDelta / 2) ** 2; return 2 * radius * Math.asin(Math.sqrt(value)); }
function getQueue() { try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function saveQueue(queue) { const limited = queue.slice(-5000); localStorage.setItem(storageKey, JSON.stringify(limited)); $('mQueue').textContent = `${limited.length} ponto${limited.length === 1 ? '' : 's'}`; }
function enqueue(point) { const queue = getQueue(); if (!queue.some((item) => item.sequence === point.sequence && item.deviceId === point.deviceId)) queue.push({ ...point, capturedOffline: true }); saveQueue(queue); }
function nextSequence() { sequence += 1; localStorage.setItem(sequenceKey, String(sequence)); return sequence; }
function revokeConsent() { if (!consentGranted || !socket.connected) return; socket.emit('consent:revoke', {}, () => { consentGranted = false; }); }
function stop(message = 'Compartilhamento parado.') { if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; sharing = false; revokeConsent(); $('startBtn').classList.remove('hidden'); $('startBtn').disabled = !sessionValid; $('stopBtn').classList.add('hidden'); status(sessionValid ? 'Pronto para compartilhar' : 'Sessão indisponível', sessionValid); toast(message); }
function render(point) { if (lastPosition) { const step = haversine(lastPosition, point); if (step < 2000) distance += step; } lastPosition = point; $('mLatitude').textContent = point.latitude.toFixed(6); $('mLongitude').textContent = point.longitude.toFixed(6); $('mAccuracy').textContent = `${point.accuracy.toFixed(1)} m`; $('mSpeed').textContent = point.speed == null ? 'Não disponível' : `${(Math.max(0, point.speed) * 3.6).toFixed(1)} km/h`; $('mUpdated').textContent = new Date(point.timestamp).toLocaleString('pt-BR'); $('mDistance').textContent = distance < 1000 ? `${distance.toFixed(0)} m` : `${(distance / 1000).toFixed(2)} km`; }
function onPosition(position) { const coordinates = position.coords; const point = { deviceId, latitude: coordinates.latitude, longitude: coordinates.longitude, accuracy: coordinates.accuracy, speed: coordinates.speed, heading: coordinates.heading, altitude: coordinates.altitude, altitudeAccuracy: coordinates.altitudeAccuracy, timestamp: position.timestamp, source: 'mobile-gps', sequence: nextSequence() }; render(point); if (!socket.connected || !sessionValid || !consentGranted) { if (!lostAt) lostAt = Date.now(); enqueue(point); status('Sem internet · GPS salvo no aparelho'); return; } socket.emit('position:update', point, (result) => { if (!result?.ok) { if (result?.error?.includes('encerrada') || result?.error?.includes('expirada')) return stop(result.error); status(result?.error || 'Posição rejeitada pelo servidor'); return; } count += 1; $('mCount').textContent = count; status(result.suspicious ? 'Posição enviada com alerta de precisão' : 'Compartilhando localização', true); }); }
function onError(error) { const messages = { 1: 'Permissão de localização negada.', 2: 'Localização indisponível.', 3: 'Tempo esgotado ao obter localização.' }; toast(messages[error.code] || 'Erro ao acessar a localização.'); if (error.code === 1) stop('A permissão foi negada. Nada foi compartilhado.'); }
function beginWatch() { if (!navigator.geolocation) return toast('Este navegador não oferece geolocalização.'); sharing = true; $('startBtn').classList.add('hidden'); $('stopBtn').classList.remove('hidden'); status('Solicitando autorização…'); watchId = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }); }
function grantConsent(callback) { socket.emit('consent:grant', { deviceId }, (result) => { if (!result?.ok) { consentGranted = false; status(result?.error || 'Não foi possível registrar o consentimento'); if (sharing) stop('O compartilhamento não pôde ser autorizado.'); return; } consentGranted = true; if (result.expiresAt) $('mobileExpiry').textContent = `Esta sessão expira em ${new Date(result.expiresAt).toLocaleString('pt-BR')}.`; callback?.(); }); }
function start() { if (!sessionValid || sharing) return; grantConsent(beginWatch); }
function flushQueue() { const queue = getQueue(); if (!queue.length || sendingQueue || !sessionValid || !socket.connected || !consentGranted) return; sendingQueue = true; status(`Enviando ${queue.length} ponto(s) offline…`); socket.emit('positions:batch', { points: queue, lostAt }, (result) => { sendingQueue = false; if (result?.ok) { count += result.received; $('mCount').textContent = count; saveQueue([]); lostAt = null; const rejected = result.rejected?.length || 0; toast(`${result.received} posição(ões) sincronizadas; ${rejected} rejeitada(s) com segurança.`); status(sharing ? 'Compartilhando localização' : 'Pronto para compartilhar', true); } else status(result?.error || 'Falha ao sincronizar'); }); }
function join() { if (!sessionId) return status('Link de sessão inválido'); socket.emit('session:join', { sessionId, role: 'mobile' }, (result) => { sessionValid = Boolean(result?.ok); $('startBtn').disabled = !sessionValid; if (sessionValid) { const vehicle = result.session.vehicle; $('mobileVehicle').classList.remove('empty'); $('mobileVehicle').textContent = vehicle ? `${vehicle.nickname} · ${vehicle.plate || 'sem placa'} — ${vehicle.brand} ${vehicle.model} ${vehicle.version}` : 'Veículo não informado'; $('mobileExpiry').textContent = `Esta sessão expira em ${new Date(result.session.expiresAt).toLocaleString('pt-BR')}.`; status(sharing ? 'Reconectando compartilhamento' : 'Pronto para compartilhar', true); if (sharing) grantConsent(flushQueue); } else { status('Sessão inválida, expirada ou encerrada'); if (sharing) stop('A sessão não está mais disponível.'); } }); }

$('startBtn').onclick = start;
$('stopBtn').onclick = () => stop();
socket.on('connect', join);
socket.on('disconnect', () => { consentGranted = false; if (sharing && !lostAt) lostAt = Date.now(); status(sharing ? 'Sem internet · armazenando GPS localmente' : 'Internet desconectada; tentando reconectar…'); });
socket.on('session:closed', () => { sessionValid = false; saveQueue([]); stop('O painel encerrou ou expirou esta sessão.'); status('Sessão encerrada'); });
saveQueue(getQueue());
