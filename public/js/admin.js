'use strict';

const byId = id => document.getElementById(id);
let csrfToken = null;
function showError(message) {
  byId('restrictedError').textContent = message;
  byId('restrictedError').classList.remove('hidden');
}
function toast(message) {
  const host = byId('toast');
  host.textContent = message;
  host.classList.add('show');
  setTimeout(() => host.classList.remove('show'), 2800);
}
async function csrf() {
  if (csrfToken) return csrfToken;
  const response = await fetch('/api/auth/csrf'),
    data = await response.json();
  if (!response.ok) throw new Error(data.error);
  csrfToken = data.token;
  return csrfToken;
}
async function api(path, { method = 'GET', body, protectedWrite = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (protectedWrite) {
    headers['X-CSRF-Token'] = await csrf();
    const code = prompt('Código 2FA ou código de recuperação:');
    if (!code) throw new Error('A ação administrativa exige verificação em duas etapas.');
    headers['X-Two-Factor-Code'] = code;
  }
  const response = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    }),
    data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Operação indisponível.');
  return data;
}
function item(title, copy) {
  const article = document.createElement('article');
  article.className = 'platform-item';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const text = document.createElement('p');
  text.textContent = copy;
  article.append(strong, text);
  return article;
}
function button(label, action, secondary = false) {
  const value = document.createElement('button');
  value.type = 'button';
  value.textContent = label;
  if (secondary) value.className = 'secondary';
  value.onclick = action;
  return value;
}
function actionRow(host, values) {
  const footer = document.createElement('div');
  footer.className = 'platform-item__actions';
  footer.append(...values);
  host.append(footer);
}
async function loadOverview() {
  const data = await api('/api/admin/overview');
  byId('adminUsers').textContent = data.counts.users;
  byId('adminSessions').textContent = data.counts.activeSessions;
  byId('adminConsents').textContent = data.counts.consentRecords;
  byId('adminUpdated').textContent = new Date(data.generatedAt).toLocaleTimeString('pt-BR');
}
async function decide(path, status) {
  try {
    await api(path, {
      method: 'PATCH',
      body: { status, reason: `Decisão administrativa: ${status}` },
      protectedWrite: true
    });
    toast('Fila atualizada.');
    await loadModeration();
  } catch (error) {
    toast(error.message);
  }
}
async function loadModeration() {
  const data = await api('/api/platform/admin/moderation'),
    host = byId('adminModeration');
  host.replaceChildren();
  for (const price of data.pendingPrices) {
    const row = item(
      `Preço · ${price.stationName}`,
      `${price.fuelType} · R$ ${Number(price.price).toFixed(2).replace('.', ',')} · ${new Date(price.observedAt).toLocaleString('pt-BR')}`
    );
    actionRow(row, [
      button('Confirmar', () => decide(`/api/platform/admin/prices/${price.id}`, 'CONFIRMED')),
      button('Rejeitar', () => decide(`/api/platform/admin/prices/${price.id}`, 'REJECTED'), true)
    ]);
    host.append(row);
  }
  for (const photo of data.pendingPhotos) {
    const row = item(
      `Foto · ${photo.entityType}`,
      `${Math.ceil(photo.byteSize / 1024)} KB · ${photo.mimeType}`
    );
    actionRow(row, [
      button('Publicar', () => decide(`/api/platform/admin/photos/${photo.id}`, 'PUBLISHED')),
      button('Ocultar', () => decide(`/api/platform/admin/photos/${photo.id}`, 'HIDDEN'), true)
    ]);
    host.append(row);
  }
  for (const report of data.contentReports) {
    const row = item(
      `Denúncia · ${report.entityType}`,
      `${report.reason} · ${report.details || 'Sem detalhes'}`
    );
    actionRow(row, [
      button('Resolver', () =>
        decide(`/api/platform/admin/content-reports/${report.id}`, 'RESOLVED')
      ),
      button(
        'Descartar',
        () => decide(`/api/platform/admin/content-reports/${report.id}`, 'DISMISSED'),
        true
      )
    ]);
    host.append(row);
  }
  for (const road of data.openRoadReports)
    host.append(
      item(
        `Via · ${road.category} / ${road.severity}`,
        `${road.description} · expira ${new Date(road.expiresAt).toLocaleString('pt-BR')}`
      )
    );
  if (!host.children.length)
    host.append(item('Fila vazia', 'Nenhum preço, foto ou denúncia aguarda revisão.'));
}
async function loadAudit() {
  const data = await api('/api/platform/admin/audit'),
    host = byId('adminAudit');
  host.replaceChildren();
  for (const event of data.events)
    host.append(
      item(
        event.action,
        `${event.targetType}${event.targetId ? ` · ${event.targetId}` : ''} · ${new Date(event.createdAt).toLocaleString('pt-BR')}${event.reason ? ` · ${event.reason}` : ''}`
      )
    );
  if (!data.events.length)
    host.append(item('Sem eventos', 'Ações administrativas e sensíveis aparecerão aqui.'));
}
async function createStation(event) {
  event.preventDefault();
  try {
    await api('/api/platform/stations', {
      method: 'POST',
      protectedWrite: true,
      body: {
        name: byId('adminStationName').value,
        brand: byId('adminStationBrand').value,
        address: byId('adminStationAddress').value,
        latitude: Number(byId('adminStationLat').value),
        longitude: Number(byId('adminStationLng').value),
        source: byId('adminStationSource').value
      }
    });
    event.target.reset();
    byId('adminStationSource').value = 'Cadastro administrativo';
    toast('Posto cadastrado como pendente.');
    loadAudit();
  } catch (error) {
    toast(error.message);
  }
}
byId('reloadModeration').onclick = () => loadModeration().catch(error => toast(error.message));
byId('adminStationForm').addEventListener('submit', createStation);
Promise.all([loadOverview(), loadModeration(), loadAudit()]).catch(error =>
  showError(error.message)
);
