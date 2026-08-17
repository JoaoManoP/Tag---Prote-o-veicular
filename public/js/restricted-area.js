'use strict';

const area = document.body.dataset.area;
const errorBox = document.getElementById('restrictedError');
function showError(message) { errorBox.textContent = message; errorBox.classList.remove('hidden'); }

async function loadAdmin() {
  const response = await fetch('/api/admin/overview');
  if (!response.ok) throw new Error(response.status === 403 ? 'Seu perfil não possui acesso administrativo.' : 'Não foi possível carregar os indicadores.');
  const data = await response.json();
  document.getElementById('adminUsers').textContent = data.counts.users;
  document.getElementById('adminSessions').textContent = data.counts.activeSessions;
  document.getElementById('adminConsents').textContent = data.counts.consentRecords;
  document.getElementById('adminUpdated').textContent = new Date(data.generatedAt).toLocaleTimeString('pt-BR');
}

async function loadLab() {
  const response = await fetch('/api/lab/info');
  if (!response.ok) throw new Error(response.status === 403 ? 'Seu perfil não possui acesso ao Laboratório.' : 'Não foi possível carregar o Laboratório.');
  const data = await response.json();
  document.getElementById('labCode').textContent = data.code;
  document.getElementById('labVersion').textContent = data.version;
  document.getElementById('labEnvironment').textContent = data.environment;
  document.getElementById('labPhysicalTag').textContent = data.physicalTagEnabled ? 'Ativada' : 'Desativada';
  const sendPoint = async (invalid = false) => {
    const point = { deviceId: 'LAB-VIRTUAL-TAG', timestamp: Date.now(), latitude: invalid ? 120 : -19.923456, longitude: -43.934567, accuracy: Number(document.getElementById('labAccuracy').value), altitude: 852.3, altitudeAccuracy: 12, speed: 11.5, heading: 180, source: 'simulation', sequence: Number(document.getElementById('labSequence').value) };
    const result = await fetch('/api/lab/telemetry/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(point) });
    const body = await result.json();
    document.getElementById('labResult').textContent = JSON.stringify(body, null, 2);
  };
  document.getElementById('validateLabPoint').onclick = () => sendPoint(false);
  document.getElementById('generateInvalidPoint').onclick = () => sendPoint(true);
}

(area === 'admin' ? loadAdmin() : loadLab()).catch((error) => showError(error.message));
