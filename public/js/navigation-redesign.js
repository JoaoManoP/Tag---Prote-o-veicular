(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const icon = name =>
    `<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><use href="/images/ui-icons.svg?v=20260827-3#${name}"></use></svg>`;
  const state = { activePanel: null };
  const body = document.body;

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'map-panel-backdrop';
  backdrop.setAttribute('aria-label', 'Fechar painel');
  (document.querySelector('#trackingView') || body).append(backdrop);

  const controlPanel = document.querySelector('#trackingView .control-panel');
  const wizard = controlPanel?.querySelector('.wizard');
  if (wizard) {
    const header = document.createElement('header');
    header.className = 'navigation-sheet-head';
    header.innerHTML = `<span class="sheet-grabber" aria-hidden="true"></span><div><small>NAVEGAÇÃO</small><h2>Planeje sua rota</h2><p>Escolha de onde deseja sair e para onde quer ir.</p></div><button type="button" class="sheet-close" aria-label="Fechar navegação">×</button>`;
    wizard.prepend(header);
    const swap = document.createElement('button');
    swap.type = 'button';
    swap.className = 'swap-route-points';
    swap.setAttribute('aria-label', 'Inverter origem e destino');
    swap.textContent = '⇅';
    byId('destinationInput')?.closest('.field')?.before(swap);
    swap.onclick = () => window.dispatchEvent(new CustomEvent('rastreon:swap-route-points'));
    if (byId('calculateBtn')) byId('calculateBtn').textContent = 'Buscar rota';
    if (byId('startNavigationBtn')) byId('startNavigationBtn').textContent = 'Iniciar navegação';
  }

  document.querySelectorAll('.view:not(#trackingView) .page-content').forEach(content => {
    if (content.querySelector(':scope > .panel-close')) return;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'panel-close';
    close.setAttribute('aria-label', 'Fechar painel');
    close.textContent = '×';
    content.prepend(close);
  });

  const profileLayout = document.querySelector('#profileView .profile-layout');
  if (profileLayout) {
    const menu = document.createElement('section');
    menu.className = 'card profile-menu-card';
    menu.innerHTML = `<span class="eyebrow">PREFERÊNCIAS</span><h2>Perfil</h2><nav><button type="button" data-profile-view="account">Minha conta</button><button type="button" data-open-view="vehicles">Meus veículos</button><button type="button" data-open-view="vehicles">Dispositivos</button><button type="button" data-profile-view="appearance">Aparência</button><button type="button" data-profile-view="settings">Configurações</button></nav><div class="map-theme-setting"><strong>Tema do mapa</strong><label><input type="radio" name="mapTheme" value="auto"> Automático</label><label><input type="radio" name="mapTheme" value="day"> Claro</label><label><input type="radio" name="mapTheme" value="night"> Escuro</label><small id="mapThemeSchedule"></small></div>`;
    profileLayout.prepend(menu);
    const logout = byId('logoutBtn');
    if (logout) {
      logout.className = 'profile-logout';
      logout.textContent = 'Sair da conta';
      menu.append(logout);
    }
  }

  function setPanel(panel) {
    state.activePanel = panel;
    body.dataset.activePanel = panel || '';
    body.classList.toggle('map-panel-open', Boolean(panel));
    body.classList.toggle('trip-planning', panel === 'navigation');
    document.querySelector('#trackingView')?.classList.add('active');
    const panelView = panel && panel !== 'navigation' ? byId(`${panel}View`) : null;
    if (panelView) panelView.scrollTop = 0;
    if (panel === 'navigation') {
      body.classList.remove('floating-nav-open');
      document
        .querySelectorAll('.view:not(#trackingView)')
        .forEach(view => view.classList.remove('active'));
    }
    if (!panel) {
      body.classList.remove('floating-nav-open');
      document
        .querySelectorAll('.view:not(#trackingView)')
        .forEach(view => view.classList.remove('active'));
      document
        .querySelectorAll('.nav-pill')
        .forEach(item => item.classList.toggle('active', item.dataset.view === 'tracking'));
    }
    setTimeout(() => window.rastreonMap?.map.invalidateSize(), 320);
  }

  function openView(view) {
    const button = document.querySelector(`.nav-pill[data-view="${view}"]`);
    button?.click();
    setTimeout(() => setPanel(view), 0);
  }

  function openNavigation() {
    setPanel('navigation');
    byId('originInput')?.focus({ preventScroll: true });
  }

  backdrop.onclick = () => setPanel(null);
  document.addEventListener('click', event => {
    const nav = event.target.closest('.nav-pill[data-view]');
    if (nav)
      setTimeout(() => setPanel(nav.dataset.view === 'tracking' ? null : nav.dataset.view), 0);
    if (event.target.closest('.panel-close, .sheet-close')) setPanel(null);
    const open = event.target.closest('[data-open-view]');
    if (open) openView(open.dataset.openView);
  });

  function enhanceMapUi() {
    const controls = byId('mapControls');
    if (controls && !controls.dataset.redesigned) {
      controls.dataset.redesigned = 'true';
      const navigation = document.createElement('button');
      navigation.type = 'button';
      navigation.dataset.mapAction = 'navigation';
      navigation.setAttribute('aria-label', 'Abrir navegação');
      navigation.title = 'Navegação';
      navigation.innerHTML = icon('navigation');
      const mapMode = document.createElement('button');
      mapMode.type = 'button';
      mapMode.dataset.mapAction = '3d';
      mapMode.setAttribute('aria-label', 'Alternar visão 3D do mapa');
      mapMode.title = 'Visão 3D';
      mapMode.innerHTML = icon('cube');
      const pairing = document.createElement('button');
      pairing.type = 'button';
      pairing.dataset.mapAction = 'qr';
      pairing.setAttribute('aria-label', 'Mostrar QR Code do rastreador');
      pairing.title = 'QR Code';
      pairing.innerHTML = icon('qr-code');
      const traffic = document.createElement('button');
      traffic.type = 'button';
      traffic.dataset.mapAction = 'traffic';
      traffic.setAttribute('aria-label', 'Alternar trânsito');
      traffic.title = 'Trânsito';
      traffic.innerHTML = icon('traffic');
      controls.prepend(navigation, mapMode, pairing);
      controls.append(traffic);
      controls.addEventListener('click', event => {
        const button = event.target.closest('[data-map-action]');
        const action = button?.dataset.mapAction;
        if (action === 'navigation') openNavigation();
        if (action === '3d') {
          byId('mapModeBtn')?.click();
          button.classList.toggle(
            'active',
            byId('mapModeBtn')?.getAttribute('aria-pressed') === 'true'
          );
        }
        if (action === 'qr') byId('trackerPairBtn')?.click();
        if (action === 'traffic') {
          byId('trafficBtn')?.click();
          button.classList.toggle('active');
        }
      });
    }
    const quickSearch = byId('quickRouteSearch');
    if (quickSearch && !quickSearch.dataset.redesigned) {
      quickSearch.dataset.redesigned = 'true';
      const input = quickSearch.querySelector('input');
      quickSearch.querySelector('span').onclick = () => input?.focus();
      input?.addEventListener('focus', () => quickSearch.classList.add('expanded'));
      input?.addEventListener('blur', () =>
        setTimeout(() => quickSearch.classList.remove('expanded'), 220)
      );
    }
    const weather = byId('weatherCard');
    if (weather && !weather.dataset.redesigned) {
      weather.dataset.redesigned = 'true';
      weather.tabIndex = 0;
      weather.setAttribute('role', 'button');
      weather.setAttribute('aria-label', 'Ver detalhes do clima');
      weather.addEventListener('click', event => {
        if (!event.target.closest('#helpToggle')) weather.classList.toggle('expanded');
      });
    }
  }
  const mapUiObserver = new MutationObserver(enhanceMapUi);
  mapUiObserver.observe(document.querySelector('.smart-map'), { childList: true });
  enhanceMapUi();
  window.addEventListener('rastreon:open-navigation', openNavigation);
  window.addEventListener('rastreon:navigation-started', () => setPanel(null));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.activePanel) setPanel(null);
  });
  history.pushState({ rastreon: true }, '');
  window.addEventListener('popstate', () => {
    if (state.activePanel) {
      setPanel(null);
      history.pushState({ rastreon: true }, '');
    }
  });

  const MAP_THEME_CONFIG = Object.freeze({
    dayStart: 5,
    nightStart: 18,
    styles: {
      day: 'mapbox://styles/joaomanoelpera/cmsyr2l11008201s978xy5yqg',
      night: 'mapbox://styles/joaomanoelpera/cmta3n5fi00f001s04j2q4hrw'
    }
  });
  const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  body.dataset.userTimezone = userTimeZone;
  let appliedMapTheme = null;
  let themeTimer = null;
  const selectedTheme = () => localStorage.getItem('rastreon-map-theme') || 'auto';
  const desiredTheme = () => {
    const selected = selectedTheme();
    if (selected !== 'auto') return selected;
    const hour = new Date().getHours();
    return hour >= MAP_THEME_CONFIG.dayStart && hour < MAP_THEME_CONFIG.nightStart
      ? 'day'
      : 'night';
  };
  function scheduleTheme() {
    clearTimeout(themeTimer);
    const now = new Date();
    const next = new Date(now);
    const nextHour =
      now.getHours() < MAP_THEME_CONFIG.dayStart
        ? MAP_THEME_CONFIG.dayStart
        : now.getHours() < MAP_THEME_CONFIG.nightStart
          ? MAP_THEME_CONFIG.nightStart
          : MAP_THEME_CONFIG.dayStart;
    if (now.getHours() >= MAP_THEME_CONFIG.nightStart) next.setDate(next.getDate() + 1);
    next.setHours(nextHour, 0, 0, 0);
    themeTimer = setTimeout(applyMapTheme, Math.max(1000, next - now));
  }
  function applyMapTheme() {
    const theme = desiredTheme();
    body.dataset.mapTheme = theme;
    body.style.colorScheme = theme === 'night' ? 'dark' : 'light';
    document
      .querySelectorAll('[name="mapTheme"]')
      .forEach(input => (input.checked = input.value === selectedTheme()));
    if (byId('mapThemeSchedule'))
      byId('mapThemeSchedule').textContent =
        selectedTheme() === 'auto'
          ? `${userTimeZone} · claro 05:00–17:59 · noturno a partir de 18:00`
          : `Modo ${theme === 'night' ? 'noturno' : 'claro'} fixado manualmente`;
    scheduleTheme();
    if (window.RASTROTACK_MAP_CONFIG?.provider !== 'mapbox') return;
    const map = window.rastreonMap?.map;
    if (map && theme !== appliedMapTheme) {
      appliedMapTheme = theme;
      map.setStyle?.(MAP_THEME_CONFIG.styles[theme]);
      window.dispatchEvent(
        new CustomEvent('rastreon:theme-change', { detail: { theme, timeZone: userTimeZone } })
      );
    }
  }
  document.querySelectorAll('[name="mapTheme"]').forEach(input => {
    input.onchange = () => {
      localStorage.setItem('rastreon-map-theme', input.value);
      appliedMapTheme = null;
      applyMapTheme();
    };
  });
  document.addEventListener('visibilitychange', () => !document.hidden && applyMapTheme());
  window.addEventListener('rastreon:map-ready', applyMapTheme, { once: true });
  if (window.rastreonMap?.map) applyMapTheme();
})();
