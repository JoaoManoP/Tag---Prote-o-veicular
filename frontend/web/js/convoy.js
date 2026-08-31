(function convoyModule() {
  'use strict';
  const root = document.getElementById('convoyRoot');
  const tab = document.getElementById('convoyTab');
  if (!root || !tab) return;
  let state = null,
    csrf = null,
    watchId = null,
    scannerControls = null,
    scannerStream = null,
    scannerTimer = null,
    scannerTarget = 'connection';
  const markers = new Map();
  const escape = value =>
    String(value ?? '').replace(
      /[&<>'"]/g,
      character =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]
    );
  async function token() {
    if (csrf) return csrf;
    const response = await fetch('/api/auth/csrf');
    csrf = (await response.json()).token;
    return csrf;
  }
  async function api(path, { method = 'GET', body } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF-Token'] = await token();
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a ação.');
    return data;
  }
  const notify = message => {
    const toast = document.getElementById('platformNotice');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  };
  function card(title, content, className = '') {
    return `<section class="card convoy-card ${className}"><h2>${title}</h2>${content}</section>`;
  }
  function render() {
    const pendingReceived = state.connections.filter(
      item => item.status === 'PENDING' && item.requesterId !== state.profile.userId
    );
    const accepted = state.connections.filter(item => item.status === 'ACCEPTED');
    root.innerHTML = [
      card(
        'Meu ID RASTREON',
        `<p>Compartilhe este código somente com outro administrador.</p><div class="convoy-id"><code>${escape(state.profile.contactId)}</code><button data-copy-id type="button" class="secondary">Copiar</button></div>`
      ),
      card(
        'Conexões administrativas',
        `<form data-connect class="convoy-inline"><label>ID RASTREON<input name="contactId" required placeholder="RT-..." minlength="35" maxlength="35" autocomplete="off" spellcheck="false"></label><button>Solicitar conexão</button></form><div class="convoy-list">${accepted.map(item => `<article><strong>${escape(item.name)}</strong><small>${escape(item.contactId)}</small></article>`).join('') || '<p class="muted-copy">Nenhuma conexão aceita.</p>'}</div>`
      ),
      card(
        'Solicitações e convites',
        `${pendingReceived.map(item => `<article><strong>${escape(item.name)}</strong><div><button data-connection="${item.id}" data-status="ACCEPTED">Aceitar</button><button class="secondary" data-connection="${item.id}" data-status="REJECTED">Recusar</button></div></article>`).join('')}${state.invites.map(invite => `<article><strong>Comboio de ${escape(invite.ownerName)}</strong><div><button data-invite="${invite.id}" data-status="ACCEPTED">Entrar</button><button class="secondary" data-invite="${invite.id}" data-status="REJECTED">Recusar</button></div></article>`).join('') || (!pendingReceived.length ? '<p class="muted-copy">Nenhuma solicitação pendente.</p>' : '')}`
      ),
      state.convoy
        ? card(
            'Comboio ativo',
            `<p>Localização compartilhada somente enquanto esta sessão estiver ativa.</p><div class="convoy-members">${state.convoy.members.map(member => `<span>${escape(member.name)}</span>`).join('')}</div>${state.convoy.ownerId === state.profile.userId ? `<form data-invite-form class="convoy-inline"><label>ID da conexão<input name="contactId" required placeholder="RT-..." minlength="35" maxlength="35" autocomplete="off" spellcheck="false"></label><button>Convidar</button></form><button data-end class="danger wide">Encerrar comboio</button>` : '<button data-leave class="danger wide">Sair do comboio</button>'}`
          )
        : card(
            'Viagem em comboio',
            '<p>Crie uma sessão temporária para compartilhar a posição ao vivo com administradores convidados.</p><button data-create class="wide">Iniciar comboio</button>'
          )
    ].join('');
    const identityCard = root.querySelector('.convoy-card');
    if (identityCard && state.contactCard?.qrCode) {
      const qr = document.createElement('img');
      qr.className = 'convoy-contact-qr';
      qr.src = state.contactCard.qrCode;
      qr.alt = 'QR Code do meu ID RASTREON';
      identityCard.querySelector('.convoy-id')?.before(qr);
    }
    root.querySelectorAll('[data-connect], [data-invite-form]').forEach(form => {
      const scan = document.createElement('button');
      scan.type = 'button';
      scan.className = 'secondary';
      scan.dataset.scanId = form.matches('[data-invite-form]') ? 'invite' : 'connection';
      scan.textContent = 'Ler QR Code';
      form.querySelector('button')?.before(scan);
    });
    root.insertAdjacentHTML(
      'beforeend',
      '<dialog class="convoy-scanner" data-convoy-scanner><header><strong>Ler ID RASTREON</strong><button type="button" class="secondary" data-close-scanner>Fechar</button></header><div class="convoy-scanner-frame"><video data-scanner-video playsinline muted></video><span></span></div><p>Aponte a câmera para o QR Code da outra pessoa.</p></dialog>'
    );
    root.querySelector('[data-convoy-scanner]')?.addEventListener('close', stopScanner);
  }
  async function load() {
    const [convoy, contactCard, me] = await Promise.all([
      api('/api/convoy'),
      api('/api/profile/contact-card'),
      fetch('/api/auth/me').then(response => response.json())
    ]);
    state = convoy;
    state.contactCard = contactCard;
    state.profile.userId = me.user.id;
    render();
    if (state.convoy) startSharing(state.convoy.id);
    else stopSharing();
  }
  function contactIdFromQr(value) {
    const match = String(value || '')
      .trim()
      .toUpperCase()
      .match(/^(?:RASTREON:CONTACT:)?(RT-[A-F0-9]{32})$/);
    return match?.[1] || null;
  }
  function stopScanner() {
    clearTimeout(scannerTimer);
    scannerTimer = null;
    scannerControls?.stop?.();
    scannerControls = null;
    scannerStream?.getTracks().forEach(track => track.stop());
    scannerStream = null;
    const video = root.querySelector('[data-scanner-video]');
    if (video) video.srcObject = null;
  }
  function useScannedId(rawValue) {
    const contactId = contactIdFromQr(rawValue);
    if (!contactId) return false;
    const form = root.querySelector(
      scannerTarget === 'invite' ? '[data-invite-form]' : '[data-connect]'
    );
    const input = form?.querySelector('[name="contactId"]');
    if (!input) return false;
    input.value = contactId;
    stopScanner();
    root.querySelector('[data-convoy-scanner]')?.close();
    input.focus();
    notify('ID lido. Confirme para enviar a solicitação.');
    return true;
  }
  async function nativeScanner(video) {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    video.srcObject = scannerStream;
    await video.play();
    const tick = async () => {
      if (!scannerStream) return;
      try {
        const results = await detector.detect(video);
        if (results[0]?.rawValue && useScannedId(results[0].rawValue)) return;
      } catch {}
      scannerTimer = setTimeout(tick, 180);
    };
    tick();
  }
  async function libraryScanner(video) {
    const reader = new ZXingBrowser.BrowserQRCodeReader();
    scannerControls = await reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } } },
      video,
      result => result && useScannedId(result.getText())
    );
    scannerStream = video.srcObject;
  }
  async function startScanner(target) {
    if (!window.isSecureContext && location.hostname !== 'localhost')
      return notify('A câmera exige uma conexão HTTPS.');
    if (!navigator.mediaDevices?.getUserMedia)
      return notify('Câmera indisponível. Digite ou cole o ID RASTREON.');
    scannerTarget = target;
    const dialog = root.querySelector('[data-convoy-scanner]');
    const video = root.querySelector('[data-scanner-video]');
    dialog.showModal();
    try {
      if (
        'BarcodeDetector' in window &&
        (await BarcodeDetector.getSupportedFormats()
          .then(formats => formats.includes('qr_code'))
          .catch(() => false))
      )
        await nativeScanner(video);
      else await libraryScanner(video);
    } catch (error) {
      stopScanner();
      dialog.close();
      notify(
        error.name === 'NotAllowedError'
          ? 'Permissão da câmera negada.'
          : 'Não foi possível abrir a câmera.'
      );
    }
  }
  function stopSharing() {
    if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
    watchId = null;
    markers.forEach(marker => window.rastreonMap?.layers?.community?.removeLayer(marker));
    markers.clear();
  }
  function startSharing(convoyId) {
    const socket = window.rastreonSocket;
    if (!socket || watchId !== null) return;
    socket.emit('convoy:join', { convoyId }, result => {
      if (!result?.ok)
        return notify(result?.error || 'Não foi possível entrar na sala do comboio.');
      if (!navigator.geolocation) return notify('Geolocalização indisponível.');
      watchId = navigator.geolocation.watchPosition(
        position =>
          socket.emit('convoy:position', {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            heading: position.coords.heading
          }),
        () => notify('Autorize a localização para participar do comboio.'),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
      );
    });
    socket.off('convoy:position');
    socket.on('convoy:position', position => {
      const map = window.rastreonMap;
      if (!map) return;
      let marker = markers.get(position.userId);
      if (!marker) {
        marker = map.L.marker([position.latitude, position.longitude])
          .addTo(map.layers.community)
          .bindTooltip(position.name, { permanent: true });
        markers.set(position.userId, marker);
      } else marker.setLatLng([position.latitude, position.longitude]);
    });
  }
  root.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const contactId = new FormData(event.target).get('contactId');
      if (event.target.matches('[data-connect]'))
        await api('/api/convoy/connections', { method: 'POST', body: { contactId } });
      if (event.target.matches('[data-invite-form]'))
        await api(`/api/convoy/sessions/${state.convoy.id}/invites`, {
          method: 'POST',
          body: { contactId }
        });
      await load();
    } catch (error) {
      notify(error.message);
    }
  });
  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.matches('[data-close-scanner]')) {
      stopScanner();
      root.querySelector('[data-convoy-scanner]')?.close();
      return;
    }
    if (button.dataset.scanId) {
      await startScanner(button.dataset.scanId);
      return;
    }
    try {
      if (button.matches('[data-copy-id]'))
        await navigator.clipboard.writeText(state.profile.contactId);
      if (button.dataset.connection)
        await api(`/api/convoy/connections/${button.dataset.connection}`, {
          method: 'PATCH',
          body: { status: button.dataset.status }
        });
      if (button.dataset.invite)
        await api(`/api/convoy/invites/${button.dataset.invite}`, {
          method: 'PATCH',
          body: { status: button.dataset.status }
        });
      if (button.matches('[data-create]'))
        await api('/api/convoy/sessions', { method: 'POST', body: {} });
      if (button.matches('[data-leave]'))
        await api(`/api/convoy/sessions/${state.convoy.id}/leave`, { method: 'POST', body: {} });
      if (button.matches('[data-end]'))
        await api(`/api/convoy/sessions/${state.convoy.id}/end`, { method: 'POST', body: {} });
      await load();
    } catch (error) {
      notify(error.message);
    }
  });
  fetch('/api/auth/me')
    .then(response => response.json())
    .then(data => {
      if (data.user?.role !== 'ADMIN') return;
      tab.classList.remove('hidden');
      tab.addEventListener('click', () => load().catch(error => notify(error.message)));
    });
})();
