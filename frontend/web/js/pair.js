'use strict';
const $ = id => document.getElementById(id);
let stream = null,
  controls = null,
  scanTimer = null,
  busy = false,
  pairing = null,
  pairingSecret = null;
const pendingKey = 'rastreon-pending-pair-token';
function show(id) {
  ['pairStart', 'scanner', 'confirmation', 'pairResult'].forEach(key =>
    $(key).classList.toggle('hidden', key !== id)
  );
}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 3000);
}
function stopCamera() {
  clearTimeout(scanTimer);
  scanTimer = null;
  controls?.stop?.();
  controls = null;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  $('camera').srcObject = null;
}
function tokenFrom(value) {
  try {
    const url = new URL(value, location.origin);
    return url.hash ? new URLSearchParams(url.hash.slice(1)).get('token') : null;
  } catch {
    return null;
  }
}
async function resolvePair({ token = '', code = '' } = {}) {
  if (busy) return;
  busy = true;
  stopCamera();
  try {
    const normalizedCode = code.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
      query = token
        ? `token=${encodeURIComponent(token)}`
        : `code=${encodeURIComponent(normalizedCode)}`,
      response = await fetch(`/api/tracker/pairings/resolve?${query}`),
      data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível validar o QR Code.');
    pairing = data.pairing;
    pairingSecret = token ? { token } : { code: normalizedCode };
    sessionStorage.removeItem(pendingKey);
    $('pairVehicle').innerHTML =
      `<b>${pairing.vehicle.nickname}</b><span>${pairing.vehicle.brand} ${pairing.vehicle.model}</span><small>Convite temporário de uso único</small>`;
    show('confirmation');
  } catch (error) {
    $('resultTitle').textContent = 'Não foi possível conectar';
    $('resultMessage').textContent = error.message;
    show('pairResult');
  } finally {
    busy = false;
  }
}
async function nativeScanner() {
  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false
  });
  $('camera').srcObject = stream;
  await $('camera').play();
  const tick = async () => {
    if (!stream || busy) return;
    try {
      const results = await detector.detect($('camera'));
      if (results[0]?.rawValue)
        return resolvePair({ token: tokenFrom(results[0].rawValue) || results[0].rawValue });
    } catch {}
    scanTimer = setTimeout(tick, 180);
  };
  tick();
}
async function libraryScanner() {
  const reader = new ZXingBrowser.BrowserQRCodeReader();
  controls = await reader.decodeFromConstraints(
    { video: { facingMode: { ideal: 'environment' } } },
    $('camera'),
    result => {
      if (result && !busy) resolvePair({ token: tokenFrom(result.getText()) || result.getText() });
    }
  );
  stream = $('camera').srcObject;
}
async function startScanner() {
  if (!window.isSecureContext && location.hostname !== 'localhost')
    return toast('A câmera exige HTTPS. Use protec.nexobg.com.br.');
  if (!navigator.mediaDevices?.getUserMedia)
    return toast('Este navegador não oferece acesso à câmera. Use o código manual.');
  show('scanner');
  try {
    if (
      'BarcodeDetector' in window &&
      (await BarcodeDetector.getSupportedFormats()
        .then(x => x.includes('qr_code'))
        .catch(() => false))
    )
      await nativeScanner();
    else await libraryScanner();
  } catch (error) {
    stopCamera();
    show('pairStart');
    const messages = {
      NotAllowedError: 'Permissão da câmera negada.',
      NotFoundError: 'Nenhuma câmera encontrada.',
      NotReadableError: 'A câmera está sendo usada por outro aplicativo.',
      OverconstrainedError: 'A câmera traseira não está disponível.',
      SecurityError: 'A câmera exige HTTPS.'
    };
    toast(messages[error.name] || 'Não foi possível abrir a câmera. Use o código manual.');
  }
}
async function confirmPair() {
  if (!pairing || !pairingSecret || busy) return;
  busy = true;
  try {
    const response = await fetch(`/api/tracker/pairings/${pairing.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...pairingSecret,
          name: `${navigator.platform || 'Celular'} · navegador web`
        })
      }),
      data = await response.json();
    if (!response.ok) throw new Error(data.error);
    sessionStorage.setItem('rastreon-mobile-session', data.sessionId);
    sessionStorage.setItem('rastreon-mobile-token', data.credential);
    sessionStorage.setItem('rastreon-mobile-device', data.device.id);
    location.replace('/mobile');
  } catch (error) {
    toast(error.message || 'Não foi possível conectar.');
    busy = false;
  }
}
$('scanBtn').onclick = startScanner;
$('closeScanner').onclick = () => {
  stopCamera();
  show('pairStart');
};
$('manualForm').onsubmit = e => {
  e.preventDefault();
  resolvePair({ code: $('manualCode').value });
};
$('confirmPair').onclick = confirmPair;
$('cancelPair').onclick = () => {
  pairing = null;
  pairingSecret = null;
  show('pairStart');
};
$('retryPair').onclick = () => show('pairStart');
addEventListener('pagehide', stopCamera);
addEventListener('beforeunload', stopCamera);
const invite = new URLSearchParams(location.hash.slice(1)),
  initial = invite.get('token') || sessionStorage.getItem(pendingKey);
if (initial) {
  sessionStorage.setItem(pendingKey, initial);
  history.replaceState(null, '', '/tracker');
  resolvePair({ token: initial });
}
