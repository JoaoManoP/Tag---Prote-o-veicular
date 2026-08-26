/* global io */
'use strict';
const preloadAccount = async () => {
  try {
    const response = await fetch('/api/auth/me');
    if (response.status === 401) {
      location.replace('/login.html');
      return;
    }
    const data = await response.json();
    const name = document.getElementById('accountName'),
      email = document.getElementById('accountEmail');
    if (name) name.textContent = data.user.name;
    if (email) email.textContent = data.user.email;
  } catch {}
};
preloadAccount();
console.info('[Rastreon] Dashboard build:', 'PERF-DASHBOARD-01');
window.RastroMap.ready
  .then(context => {
    const { L, mapProvider, maplibregl, error } = context || {};
    const $ = id => document.getElementById(id);
    const normalizeText = value =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const mapHost = $('map');

    if (!L) {
      if (mapHost) {
        mapHost.innerHTML =
          '<div class="map-error"><strong>Google Maps não configurado neste ambiente.</strong><span>Configure GOOGLE_MAPS_API_KEY no .env para ativar o mapa principal.</span></div>';
        const mapCard = mapHost.closest('.map-card');
        if (mapCard) {
          const vehicleHud = document.createElement('div');
          vehicleHud.className = 'vehicle-hud';
          vehicleHud.innerHTML =
            '<div class="vehicle-hud__status">SEM LOCALIZAÇÃO</div><div class="vehicle-hud__title">Meu veículo</div><div class="vehicle-hud__identity"><div><b class="vehicle-hud__model">Nenhum veículo cadastrado</b><small class="vehicle-hud__year"></small></div><div class="vehicle-hud__media"><canvas class="vehicle-hud-3d" aria-label="Modelo 3D do veículo"></canvas><img hidden></div></div><div class="vehicle-hud__meta"><strong>—</strong><span>Localização indisponível</span></div><div class="vehicle-hud__plate"></div><button type="button">Cadastrar veículo</button>';
          mapCard.appendChild(vehicleHud);
        }
      }
      console.error('[Rastreon Dashboard] Mapa indisponível:', error || 'Sem provider disponível.');
      return;
    }

    if (mapHost) {
      const mapCard = mapHost.closest('.map-card');
      if (mapCard) {
        const vehicleHud = document.createElement('div');
        vehicleHud.className = 'vehicle-hud';
        vehicleHud.innerHTML =
          '<div class="vehicle-hud__status">SEM LOCALIZAÇÃO</div><div class="vehicle-hud__title">Meu veículo</div><div class="vehicle-hud__identity"><div><b class="vehicle-hud__model">Nenhum veículo cadastrado</b><small class="vehicle-hud__year"></small></div><div class="vehicle-hud__media"><canvas class="vehicle-hud-3d" aria-label="Modelo 3D do veículo"></canvas><img hidden></div></div><div class="vehicle-hud__meta"><strong>—</strong><span>Localização indisponível</span></div><div class="vehicle-hud__plate"></div><button type="button">Cadastrar veículo</button>';
        mapCard.appendChild(vehicleHud);
      }
    }

    const socket = io({ reconnection: true }),
      map = L.map('map').setView([-14.235, -51.9253], 4);
    window.rastreonSocket = socket;
    const baseMap = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
      crossOrigin: true
    }).addTo(map);
    let tileFailures = 0;
    baseMap.on('tileload', () => {
      tileFailures = 0;
    });
    baseMap.on('tileerror', () => {
      if (++tileFailures === 3)
        toast('Não foi possível carregar o mapa. Verifique a conexão com tile.openstreetmap.org.');
    });
    const layers = {
      planned: L.layerGroup().addTo(map),
      alternatives: L.layerGroup().addTo(map),
      confirmed: L.layerGroup().addTo(map),
      rebuilt: L.layerGroup().addTo(map),
      replay: L.layerGroup().addTo(map),
      points: L.layerGroup().addTo(map),
      geofences: L.layerGroup().addTo(map),
      roadEvents: L.layerGroup().addTo(map),
      community: L.layerGroup().addTo(map),
      traffic: L.layerGroup().addTo(map)
    };
    window.rastreonMap = { map, layers, L };
    window.rastreonMap.provider = mapProvider;
    window.dispatchEvent(new CustomEvent('rastreon:map-ready', { detail: window.rastreonMap }));
    let vehicle = null,
      models = [],
      savedVehicles = [],
      editingVehicleId = null,
      origin = null,
      destination = null,
      routeStops = [],
      pickMode = null,
      plannedRoutes = [],
      selectedRoute = 0,
      sessionId = null,
      mobileUrl = null,
      pairingId = null,
      pairingTimer = null,
      positions = [],
      confirmedMeters = 0,
      rebuiltMeters = 0,
      simulationTimer = null,
      simIndex = 0,
      simulationSequence = Date.now() * 1000,
      tripId = null,
      tripStart = null,
      tripEnd = null,
      movingMs = 0,
      stoppedMs = 0,
      lastTimestamp = null,
      speeds = [],
      offlineMs = 0,
      pendingGap = null,
      events = [],
      metricAnchorPosition = null,
      visualVehiclePosition = null;
    let fuelPricePreference = null;
    let historyTrip = null,
      historyMap = null,
      replayTimer = null,
      replayMarker = null,
      replayIndex = 0;
    let roadEventsEnabled = false,
      lastRoadEventLoad = null,
      roadEventRequest = null,
      userPosition = null,
      lastWeatherQuery = null,
      userWatchId = null,
      passiveLocationWatchId = null,
      dailyNavigationActive = false,
      dailyNavigationMeters = 0,
      lastDailyPosition = null,
      trafficEnabled = false;
    const icon = L.divIcon({
      className: 'vehicle-icon',
      html: '<span class="vehicle-marker-body" aria-label="Veículo"><i></i></span>'
    });
    let vehicleMarker,
      vehicle3DLayer,
      hudVehicle3DPreview,
      accuracyCircle,
      originMarker,
      destinationMarker;
    let garageVehicle3DPreviews = [];
    const navigation = new window.NavigationStateService({
      map,
      container: document.querySelector('.smart-map')
    });
    const vehicle3DModulePromise = import('/js/vehicle-3d-layer.bundle.js?v=20260825-vehicle-3d-2');
    const syncVehicleMarkerFallback = () => {
      const active = Boolean(vehicle3DLayer?.ready),
        vehicleElement = vehicleMarker?.getElement?.();
      if (vehicleElement) vehicleElement.classList.toggle('vehicle-marker-3d-active', active);
    };
    if (mapProvider === 'maplibre' || mapProvider === 'mapbox')
      map.ready?.then(async () => {
        try {
          const module = await vehicle3DModulePromise;
          vehicle3DLayer = module.installVehicle3DLayer({
            map: map.getNativeMap(),
            maplibregl,
            config: window.VEHICLE_3D_CONFIG,
            onReady: () => {
              syncVehicleMarkerFallback();
              if (vehicle?.color) vehicle3DLayer.setBodyColor?.(vehicle.color);
              const current = visualVehiclePosition || positions.at(-1);
              if (current) {
                vehicle3DLayer.move(null, current);
                vehicle3DLayer.setSelected(true);
              }
            },
            onSelect: () => vehicleMarker?.openPopup?.()
          });
        } catch (error) {
          console.warn('[Rastreon 3D] Camada indisponível; marcador padrão mantido.', error);
        }
      });
    const br = (n, d = 1) =>
        Number(n || 0)
          .toFixed(d)
          .replace('.', ','),
      formatDistance = m => (m < 1000 ? `${br(m, 0)} m` : `${br(m / 1000, 2)} km`),
      formatDuration = s =>
        s < 3600
          ? `${Math.round(s / 60)} min`
          : `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}min`;
    const escapeHtml = value =>
      String(value ?? '').replace(
        /[&<>"']/g,
        char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
      );
    function toast(m) {
      $('toast').textContent = m;
      $('toast').classList.add('show');
      setTimeout(() => $('toast').classList.remove('show'), 2600);
    }
    const subscriptionConfirmation = sessionStorage.getItem('rastreon-subscription-confirmation');
    if (subscriptionConfirmation) {
      sessionStorage.removeItem('rastreon-subscription-confirmation');
      setTimeout(() => toast(subscriptionConfirmation), 500);
    }
    function geolocationError(error) {
      const messages = {
          1: 'Localização bloqueada. No navegador, clique no ícone ao lado do endereço e escolha Permitir.',
          2: 'O dispositivo não encontrou sua posição. Ative a Localização nas configurações do Windows ou celular.',
          3: 'O GPS demorou para responder. Verifique o sinal e tente novamente.'
        },
        message = messages[error?.code] || 'Não foi possível obter sua localização.';
      toast(message);
      const card = $('weatherCard');
      if (card) {
        card.querySelector('span:not(.weather-icon)').textContent = 'GPS indisponível';
        card.querySelector('small').textContent = message;
      }
      return message;
    }
    async function requestInitialLocation() {
      if (
        !window.isSecureContext &&
        location.hostname !== 'localhost' &&
        location.hostname !== '127.0.0.1'
      ) {
        geolocationError({ code: 1 });
        return;
      }
      try {
        const permission = await navigator.permissions?.query({ name: 'geolocation' });
        if (permission?.state === 'denied') {
          geolocationError({ code: 1 });
          return;
        }
      } catch {}
      try {
        await currentLocation({ center: true });
        if (passiveLocationWatchId === null && navigator.geolocation)
          passiveLocationWatchId = navigator.geolocation.watchPosition(
            value => renderUserLocation(normalizeBrowserPosition(value), { center: false }),
            () => {},
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 3000 }
          );
      } catch {}
    }
    function normalizeBrowserPosition(position) {
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Math.max(0, position.coords.accuracy || 0),
        speed: Number.isFinite(position.coords.speed) ? position.coords.speed : 0,
        heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
        altitude: Number.isFinite(position.coords.altitude) ? position.coords.altitude : null,
        timestamp: position.timestamp || Date.now(),
        source: 'browser-gps'
      };
    }
    function weatherSymbol(condition = '', isDay = true) {
      const text = condition.toLowerCase();
      if (text.includes('chuva') || text.includes('rain')) return '🌧️';
      if (text.includes('trovo') || text.includes('thunder')) return '⛈️';
      if (text.includes('neve') || text.includes('snow')) return '🌨️';
      if (text.includes('nubl') || text.includes('cloud') || text.includes('encoberto'))
        return '☁️';
      if (text.includes('nevo') || text.includes('fog') || text.includes('mist')) return '🌫️';
      return isDay ? '☀️' : '🌙';
    }
    function ensureWeatherCard() {
      if ($('weatherCard')) return;
      const card = document.createElement('aside');
      card.id = 'weatherCard';
      card.className = 'weather-card';
      card.setAttribute('aria-live', 'polite');
      card.innerHTML =
        '<span class="weather-icon">☀️</span><div><strong>--°C</strong><span>Consultando clima…</span><small>Localização do mapa</small></div>';
      const help = $('helpToggle');
      if (help) {
        help.classList.add('weather-help');
        help.title = 'Ajuda';
        card.appendChild(help);
      }
      document.querySelector('.smart-map')?.appendChild(card);
    }
    function ensureMapControls() {
      const host = document.querySelector('.smart-map');
      if (!host || $('mapControls')) return;
      const controls = document.createElement('div');
      controls.id = 'mapControls';
      controls.className = 'map-controls';
      controls.innerHTML =
        '<button type="button" data-map-zoom="in" aria-label="Aumentar zoom">+</button><button type="button" data-map-zoom="out" aria-label="Diminuir zoom">−</button><button type="button" class="location-control" data-map-location aria-label="Ir para minha localização" title="Minha localização"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"></circle><path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path></svg></button><button type="button" data-map-fullscreen aria-label="Alternar tela cheia" title="Tela cheia">⛶</button>';
      controls.querySelector('[data-map-zoom="in"]').onclick = () =>
        map.setView(map.getCenter(), Math.min(22, map.getZoom() + 1));
      controls.querySelector('[data-map-zoom="out"]').onclick = () =>
        map.setView(map.getCenter(), Math.max(3, map.getZoom() - 1));
      controls.querySelector('[data-map-location]').onclick = () =>
        currentLocation({ center: true });
      controls.querySelector('[data-map-fullscreen]').onclick = async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen?.();
      };
      host.appendChild(controls);
    }
    function supportsComfortable3D() {
      const memory = Number(navigator.deviceMemory || 4),
        connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      return (
        !connection?.saveData &&
        memory > 2 &&
        !/2g/.test(connection?.effectiveType || '') &&
        Boolean(mapProvider === 'google' ? map.setTilt : map.getNativeMap?.()?.getPitch)
      );
    }
    function safePaint(nativeMap, layerId, property, value) {
      try {
        if (nativeMap.getLayer(layerId)) nativeMap.setPaintProperty(layerId, property, value);
      } catch {}
    }
    function beautifyNativeMap(nativeMap) {
      const style = nativeMap?.getStyle?.();
      if (!style?.layers || nativeMap.__rastreonBeautified) return;
      nativeMap.__rastreonBeautified = true;
      for (const layer of style.layers) {
        const sourceLayer = layer['source-layer'] || '',
          id = String(layer.id || '').toLowerCase();
        if (layer.type === 'fill' && (sourceLayer === 'water' || id === 'water'))
          safePaint(nativeMap, layer.id, 'fill-color', '#98d2ec');
        if (layer.type === 'fill' && /park|grass|wood|landcover/.test(id))
          safePaint(
            nativeMap,
            layer.id,
            'fill-opacity',
            Math.max(0.44, Number(layer.paint?.['fill-opacity']) || 0.58)
          );
        if (layer.type === 'line' && /motorway|trunk|primary/.test(id))
          safePaint(nativeMap, layer.id, 'line-opacity', 0.96);
      }
      try {
        nativeMap.setLight({
          anchor: 'viewport',
          color: '#fff9ef',
          intensity: 0.68,
          position: [1.25, 210, 36]
        });
      } catch {}
      try {
        nativeMap.setMaxPitch(70);
      } catch {}
    }
    function buildingLayersFor3D(nativeMap) {
      const style = nativeMap.getStyle?.(),
        layers = style?.layers || [];
      let extrusionLayers = layers
        .filter(layer => layer.type === 'fill-extrusion' && layer['source-layer'] === 'building')
        .map(layer => layer.id);
      if (extrusionLayers.length) return extrusionLayers;
      const buildingLayer = layers.find(
          layer => layer['source-layer'] === 'building' && layer.source
        ),
        firstLabel = layers.find(layer => layer.type === 'symbol')?.id;
      if (!buildingLayer || nativeMap.getLayer('rastreon-3d-buildings'))
        return nativeMap.getLayer('rastreon-3d-buildings') ? ['rastreon-3d-buildings'] : [];
      try {
        nativeMap.addLayer(
          {
            id: 'rastreon-3d-buildings',
            source: buildingLayer.source,
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
                0,
                '#ece8df',
                45,
                '#cedae0',
                140,
                '#a5bac6'
              ],
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 6],
              'fill-extrusion-base': [
                'coalesce',
                ['get', 'render_min_height'],
                ['get', 'min_height'],
                0
              ],
              'fill-extrusion-opacity': 0.82,
              'fill-extrusion-vertical-gradient': true
            }
          },
          firstLabel
        );
        extrusionLayers = ['rastreon-3d-buildings'];
      } catch (error) {
        console.warn('[Rastreon 3D] Prédios indisponíveis neste estilo.', error);
      }
      return extrusionLayers;
    }
    function setMapMode(mode = 'standard', { automatic = false } = {}) {
      const button = $('mapModeBtn'),
        notice = $('mapModeNotice'),
        nativeMap = map.getNativeMap?.();
      if (!button) return;
      if (!['standard', 'explore', 'navigation'].includes(mode)) mode = 'standard';
      if (mode !== 'standard' && !supportsComfortable3D()) {
        mode = 'standard';
        notice.textContent = 'Mapa 2D ativado para manter o aplicativo fluido neste dispositivo.';
        notice.classList.remove('hidden');
        setTimeout(() => notice.classList.add('hidden'), 4200);
      }
      if (mapProvider === 'google') {
        const enable3D = mode !== 'standard',
          current = visualVehiclePosition || positions.at(-1) || userPosition,
          labels = { standard: 'Modo 3D', explore: '3D Ativo', navigation: '3D Navegação' };
        map.setTilt(enable3D ? (mode === 'navigation' ? 67.5 : 45) : 0);
        map.setHeading(enable3D && Number.isFinite(current?.heading) ? current.heading : 0);
        if (current)
          map.setView([current.latitude, current.longitude], enable3D ? 18 : map.getZoom());
        button.dataset.mode = mode;
        button.disabled = false;
        button.setAttribute('aria-pressed', String(enable3D));
        button.textContent = labels[mode];
        button.setAttribute('aria-label', `${labels[mode]}. Toque para alternar o modo do mapa.`);
        document.body.classList.toggle('map-3d-active', enable3D);
        document.body.dataset.mapMode = mode;
        if (!automatic) localStorage.setItem('rastreon:map-mode', mode);
        return;
      }
      if (!nativeMap?.easeTo || !nativeMap?.getStyle) {
        button.disabled = true;
        button.textContent = 'Mapa 2D';
        return;
      }
      const enable3D = mode !== 'standard';
      beautifyNativeMap(nativeMap);
      const style = nativeMap.getStyle(),
        demEntry = Object.entries(style?.sources || {}).find(
          ([, source]) => source.type === 'raster-dem'
        ),
        buildingLayers = buildingLayersFor3D(nativeMap);
      for (const layerId of buildingLayers)
        try {
          nativeMap.setLayoutProperty(layerId, 'visibility', enable3D ? 'visible' : 'none');
        } catch {}
      if (enable3D && demEntry)
        try {
          nativeMap.setTerrain({
            source: demEntry[0],
            exaggeration: mode === 'navigation' ? 1.05 : 1.12
          });
        } catch {}
      else if (!enable3D)
        try {
          nativeMap.setTerrain(null);
        } catch {}
      if (enable3D)
        try {
          nativeMap.setFog?.({
            range: [-0.5, 12],
            color: '#d8e5ec',
            'horizon-blend': 0.16,
            'high-color': '#2a5d84',
            'space-color': '#081523'
          });
        } catch {}
      else
        try {
          nativeMap.setFog?.(null);
        } catch {}
      const current = visualVehiclePosition || positions.at(-1) || userPosition;
      const targetPitch = mode === 'navigation' ? 62 : mode === 'explore' ? 48 : 0;
      const targetBearing =
        mode === 'navigation' && Number.isFinite(current?.heading)
          ? current.heading
          : mode === 'explore'
            ? -15
            : 0;
      const currentZoom = nativeMap.getZoom();
      const targetZoom = enable3D
        ? Math.max(mode === 'navigation' ? 17 : 15.5, currentZoom)
        : currentZoom;
      const cameraOptions = {
        pitch: targetPitch,
        bearing: targetBearing,
        duration: automatic ? 0 : 750
      };
      if (current) {
        cameraOptions.center = [current.longitude, current.latitude];
      }
      if (enable3D && currentZoom < 14.5) {
        cameraOptions.zoom = 15.5;
      } else if (enable3D) {
        cameraOptions.zoom = targetZoom;
      }
      nativeMap.easeTo(cameraOptions);
      const labels = { standard: 'Modo 3D', explore: '3D Ativo', navigation: '3D Navegação' };
      button.dataset.mode = mode;
      button.setAttribute('aria-pressed', String(enable3D));
      button.textContent = labels[mode] || 'Modo 3D';
      button.setAttribute(
        'aria-label',
        `${labels[mode] || 'Modo 3D'}. Toque para alternar o modo do mapa.`
      );
      document.body.classList.toggle('map-3d-active', enable3D);
      document.body.dataset.mapMode = mode;
      if (!automatic) localStorage.setItem('rastreon:map-mode', mode);
    }
    function initializeMapMode() {
      const button = $('mapModeBtn');
      if (!button) return;
      button.onclick = () => {
        const sequence = ['standard', 'explore', 'navigation'],
          index = sequence.indexOf(button.dataset.mode || 'standard');
        setMapMode(sequence[(index + 1) % sequence.length]);
      };
      map.ready?.then(() => {
        beautifyNativeMap(map.getNativeMap?.());
        setMapMode(localStorage.getItem('rastreon:map-mode') || 'standard', { automatic: true });
      });
    }
    async function initializeTraffic() {
      const button = $('trafficBtn');
      if (!button) return;
      map.setTraffic(false);
      button.onclick = async () => {
        trafficEnabled = !trafficEnabled;
        button.disabled = true;
        layers.traffic.clearLayers();
        try {
          const statusResponse = await fetch('/api/platform/status'),
            status = await statusResponse.json();
          if (!statusResponse.ok)
            throw new Error(status.error || 'Camada de trânsito indisponível.');
          if (status.traffic.available && ['google', 'mapbox'].includes(mapProvider)) {
            map.setTraffic(trafficEnabled);
            button.textContent = trafficEnabled ? 'Trânsito ativo' : 'Trânsito';
            button.title = trafficEnabled
              ? 'Verde: livre · amarelo: moderado · laranja: intenso · vermelho: severo'
              : `Exibir ${status.traffic.provider}`;
            if (trafficEnabled)
              toast(
                'Trânsito ativado: verde livre, amarelo moderado, laranja intenso e vermelho severo.'
              );
          } else {
            map.setTraffic(false);
            button.textContent = trafficEnabled ? 'Relatos ativos' : 'Trânsito';
            button.title = status.traffic.reason || 'Relatos comunitários';
            if (trafficEnabled) {
              const center =
                  userPosition ||
                  (() => {
                    const value = map.getCenter();
                    return { latitude: value.lat, longitude: value.lng };
                  })(),
                response = await fetch(
                  `/api/platform/road-reports?latitude=${center.latitude}&longitude=${center.longitude}&radiusMeters=30000`
                ),
                data = await response.json();
              if (!response.ok) throw new Error(data.error || 'Relatos indisponíveis.');
              const reports = (data.reports || []).filter(report => report.category === 'TRAFFIC');
              for (const report of reports) {
                const radius =
                    report.severity === 'HIGH' ? 420 : report.severity === 'MEDIUM' ? 280 : 170,
                  color =
                    report.severity === 'HIGH'
                      ? '#d81934'
                      : report.severity === 'MEDIUM'
                        ? '#ff7a00'
                        : '#f2c230';
                L.circle([report.latitude, report.longitude], {
                  radius,
                  color,
                  fillColor: color,
                  fillOpacity: 0.2,
                  weight: 5,
                  opacity: 0.72
                })
                  .bindPopup(
                    `<strong>Trânsito ${escapeHtml(report.severity.toLowerCase())}</strong><br>${escapeHtml(report.description)}<br><small>Relato comunitário · não oficial · expira ${new Date(report.expiresAt).toLocaleString('pt-BR')}</small>`
                  )
                  .addTo(layers.traffic);
              }
              toast(
                reports.length
                  ? `${reports.length} relato(s) comunitário(s) de trânsito exibido(s).`
                  : 'Nenhum relato comunitário de trânsito ativo nesta região.'
              );
            }
          }
          button.setAttribute('aria-pressed', String(trafficEnabled));
        } catch (error) {
          trafficEnabled = false;
          map.setTraffic(false);
          button.textContent = 'Trânsito';
          button.setAttribute('aria-pressed', 'false');
          toast(error.message);
        } finally {
          button.disabled = false;
        }
      };
    }
    function openQuickTripPanel(place) {
      let panel = $('quickTripPanel');
      if (!panel) {
        panel = document.createElement('section');
        panel.id = 'quickTripPanel';
        panel.className = 'quick-trip-panel';
        panel.innerHTML =
          '<header><div><span class="eyebrow">VIAGEM PRONTA</span><h2>Sua rota</h2></div><button type="button" class="icon-btn" data-close-trip aria-label="Fechar">×</button></header><div class="quick-trip-destination"><small>DESTINO</small><strong data-trip-destination></strong><span>Saída da sua localização atual</span></div><button type="button" class="wide" data-start-device>Iniciar navegação neste dispositivo</button><div class="optional-phone"><span>OPCIONAL</span><h3>Levar a viagem no celular</h3><p>Leia um QR Code para abrir esta viagem no celular. O site continua funcionando sem conexão com o telefone.</p><button type="button" class="secondary wide" data-share-phone>Mostrar QR Code</button></div>';
        document.querySelector('.wizard').prepend(panel);
        panel.querySelector('[data-close-trip]').onclick = () =>
          document.body.classList.remove('trip-planning');
        panel.querySelector('[data-start-device]').onclick = () => toggleDailyNavigation();
        panel.querySelector('[data-share-phone]').onclick = () => openTrackerPairing(false);
      }
      panel.querySelector('[data-trip-destination]').textContent = place.label;
      document.body.classList.add('trip-planning');
      document.body.classList.remove('technical-open');
    }
    function ensureQuickRouteSearch() {
      const host = document.querySelector('.smart-map');
      if (!host || $('quickRouteSearch')) return;
      const historyKey = 'rastreon-address-history';
      const readHistory = () => {
        try {
          return JSON.parse(localStorage.getItem(historyKey) || '[]')
            .filter(
              place =>
                place &&
                place.label &&
                Number.isFinite(place.latitude) &&
                Number.isFinite(place.longitude)
            )
            .slice(0, 8);
        } catch {
          return [];
        }
      };
      const saveHistory = place => {
        try {
          const normalized = {
            label: String(place.label).slice(0, 300),
            latitude: Number(place.latitude),
            longitude: Number(place.longitude),
            type: place.type || 'recent'
          };
          const places = [
            normalized,
            ...readHistory().filter(item => item.label !== normalized.label)
          ].slice(0, 8);
          localStorage.setItem(historyKey, JSON.stringify(places));
        } catch {}
      };
      const form = document.createElement('form');
      form.id = 'quickRouteSearch';
      form.className = 'quick-route-search';
      form.innerHTML =
        '<span aria-hidden="true">⌕</span><input autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-label="Buscar destino" placeholder="Para onde você quer ir?"><button type="submit" aria-label="Buscar destino">→</button><div class="quick-route-results hidden" role="listbox"></div>';
      const input = form.querySelector('input'),
        results = form.querySelector('.quick-route-results');
      let timer = null,
        request = null,
        savedPlaces = [];
      const show = () => {
        results.classList.remove('hidden');
        input.setAttribute('aria-expanded', 'true');
      };
      const hide = () => {
        results.classList.add('hidden');
        input.setAttribute('aria-expanded', 'false');
      };
      const choose = async place => {
        input.value = place.label;
        hide();
        saveHistory(place);
        setPoint('destination', place, place.label);
        if (!userPosition) {
          try {
            await currentLocation({ setAsOrigin: true, center: false });
          } catch {
            toast(
              'Destino selecionado. Ative a localização para calcular a rota a partir de onde você está.'
            );
            return;
          }
        } else setPoint('origin', userPosition, 'Minha localização atual');
        await calculateRoute();
        if (plannedRoutes.length) openQuickTripPanel(place);
      };
      const renderPlaces = (places, { recent = false } = {}) => {
        show();
        results.innerHTML =
          places
            .slice(0, 6)
            .map((place, index) => {
              const description = Number.isFinite(place.distanceMeters)
                ? (place.distanceMeters < 1000
                    ? `${Math.round(place.distanceMeters)} m`
                    : `${br(place.distanceMeters / 1000, 1)} km`) + ' de você'
                : place.meta || (place.type === 'saved' ? 'Local salvo' : 'Pesquisa recente');
              return `<button type="button" role="option" data-place="${index}"><b>${escapeHtml(place.label)}</b><small>${escapeHtml(description)}</small></button>`;
            })
            .join('') ||
          (recent
            ? '<small>Digite ao menos 3 caracteres para pesquisar ruas, bairros, cidades ou CEP.</small>'
            : '<small>Nenhum endereço encontrado. Tente incluir cidade, estado ou CEP.</small>');
        results
          .querySelectorAll('[data-place]')
          .forEach(button => (button.onclick = () => choose(places[Number(button.dataset.place)])));
      };
      const suggestions = () => {
        const query = input.value.trim().toLocaleLowerCase('pt-BR'),
          places = [...savedPlaces, ...readHistory()]
            .filter(
              (place, index, array) => array.findIndex(item => item.label === place.label) === index
            )
            .filter(place => !query || place.label.toLocaleLowerCase('pt-BR').includes(query));
        renderPlaces(places, { recent: true });
      };
      const search = async () => {
        const query = input.value.trim();
        if (query.length < 3) {
          request?.abort();
          suggestions();
          return;
        }
        request?.abort();
        request = new AbortController();
        show();
        results.innerHTML = `<small>${userPosition ? 'Buscando perto da sua posição GPS…' : 'Buscando endereços…'}</small>`;
        try {
          const proximity = userPosition
              ? `&lat=${encodeURIComponent(userPosition.latitude)}&lng=${encodeURIComponent(userPosition.longitude)}`
              : '',
            response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}${proximity}`, {
              signal: request.signal
            }),
            payload = await response.json();
          if (!response.ok) throw new Error(payload.error);
          const places = payload
            .map(place =>
              userPosition ? { ...place, distanceMeters: haversine(userPosition, place) } : place
            )
            .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
          renderPlaces(places);
        } catch (error) {
          if (error.name !== 'AbortError') {
            show();
            results.innerHTML = `<small>${escapeHtml(error.message || 'Busca indisponível.')}</small>`;
          }
        }
      };
      fetch('/api/saved-places')
        .then(response => (response.ok ? response.json() : null))
        .then(data => {
          savedPlaces = (data?.places || []).map(place => ({
            label: `${place.label}: ${place.address}`,
            latitude: Number(place.latitude),
            longitude: Number(place.longitude),
            type: 'saved',
            meta: 'Local salvo'
          }));
        })
        .catch(() => {});
      input.onfocus = () => {
        if (input.value.trim().length < 3) suggestions();
      };
      input.oninput = () => {
        clearTimeout(timer);
        timer = setTimeout(search, 300);
      };
      input.onkeydown = event => {
        if (event.key === 'Escape') hide();
      };
      input.onblur = () => setTimeout(hide, 180);
      form.onsubmit = async event => {
        event.preventDefault();
        clearTimeout(timer);
        if (input.value.trim().length >= 3) {
          await search();
          results.querySelector('[data-place]')?.click();
        } else results.querySelector('[data-place]')?.click();
      };
      host.appendChild(form);
    }
    async function loadWeather(position) {
      ensureWeatherCard();
      const card = $('weatherCard');
      if (!card || !position) return;
      if (
        lastWeatherQuery &&
        Date.now() - lastWeatherQuery.loadedAt < 600000 &&
        haversine(lastWeatherQuery, position) < 5000
      )
        return;
      try {
        const response = await fetch(
            `/api/weather/current?lat=${encodeURIComponent(position.latitude)}&lng=${encodeURIComponent(position.longitude)}`
          ),
          data = await response.json();
        if (!response.ok) throw new Error(data.error);
        lastWeatherQuery = {
          latitude: position.latitude,
          longitude: position.longitude,
          loadedAt: Date.now()
        };
        card.querySelector('.weather-icon').textContent = weatherSymbol(
          data.current.condition,
          data.current.isDay
        );
        card.querySelector('strong').textContent = `${Math.round(data.current.temperatureC)}°C`;
        card.querySelector('span:not(.weather-icon)').textContent =
          data.current.condition || 'Condição atual';
        card.querySelector('small').textContent = [data.location.name, data.location.region]
          .filter(Boolean)
          .join(' · ');
      } catch (error) {
        card.querySelector('span:not(.weather-icon)').textContent = 'Clima indisponível';
        card.querySelector('small').textContent = error.message;
      }
    }
    const accuracyPresentation = accuracy => {
      const meters = Math.max(0, Number(accuracy) || 0);
      if (meters <= 30) return { zoom: 18, opacity: 0.02, label: 'Boa precisão' };
      if (meters <= 100)
        return { zoom: 17, opacity: 0.05, label: `Precisão: ±${Math.round(meters)} m` };
      return {
        zoom: Math.max(14, 17 - Math.log2(Math.max(1, meters / 100))),
        opacity: 0.03,
        label: `Localização aproximada: ±${Math.round(meters)} m`
      };
    };
    function renderUserLocation(position, { center = false } = {}) {
      userPosition = position;
      const ll = [position.latitude, position.longitude],
        presentation = accuracyPresentation(position.accuracy);
      if (center) map.setView(ll, presentation.zoom);
      loadWeather(position);
      window.dispatchEvent(new CustomEvent('rastreon:user-location', { detail: position }));
      return position;
    }
    function currentLocation({ setAsOrigin = false, center = true } = {}) {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          const error = { code: 2 };
          geolocationError(error);
          reject(error);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          async value => {
            const position = renderUserLocation(normalizeBrowserPosition(value), { center });
            if (setAsOrigin) {
              let label = 'Minha localização atual';
              try {
                const response = await fetch(
                    `/api/reverse-geocode?lat=${position.latitude}&lng=${position.longitude}`
                  ),
                  place = await response.json();
                if (response.ok) label = place.label;
              } catch {}
              setPoint('origin', position, label);
            }
            resolve(position);
          },
          error => {
            geolocationError(error);
            reject(error);
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
        );
      });
    }
    function updateDailyNavigation(value) {
      const position = renderUserLocation(normalizeBrowserPosition(value));
      if (lastDailyPosition) {
        const step = haversine(lastDailyPosition, position);
        if (step < 2000) dailyNavigationMeters += step;
      }
      lastDailyPosition = position;
      navigation.update(position, Math.max(0, position.speed || 0) * 3.6, dailyNavigationMeters);
      loadRoadEvents(position);
    }
    async function toggleDailyNavigation() {
      if (dailyNavigationActive) {
        navigator.geolocation?.clearWatch(userWatchId);
        userWatchId = null;
        dailyNavigationActive = false;
        navigation.stop();
        $('startNavigationBtn').textContent = 'Iniciar GPS';
        toast('Navegação diária encerrada.');
        return;
      }
      if (!plannedRoutes.length) return toast('Calcule uma rota antes de iniciar o GPS.');
      try {
        const first = await currentLocation({ center: true });
        dailyNavigationActive = true;
        dailyNavigationMeters = 0;
        lastDailyPosition = first;
        navigation.start();
        navigation.update(first, Math.max(0, first.speed || 0) * 3.6, 0);
        userWatchId = navigator.geolocation.watchPosition(updateDailyNavigation, geolocationError, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 3000
        });
        $('startNavigationBtn').textContent = 'Encerrar GPS';
        toast('GPS diário iniciado. Sua posição não é enviada ao rastreamento.');
      } catch {}
    }
    window.rastreonLocation = {
      current: () => userPosition,
      request: currentLocation,
      start: toggleDailyNavigation
    };
    async function loadAccount() {
      const response = await fetch('/api/auth/me');
      if (response.status === 401) {
        location.replace('/login.html');
        return;
      }
      const data = await response.json();
      if ($('accountName')) $('accountName').textContent = data.user.name;
      if ($('accountEmail')) $('accountEmail').textContent = data.user.email;
    }
    function haversine(a, b) {
      const R = 6371000,
        r = x => (x * Math.PI) / 180,
        d1 = r(b.latitude - a.latitude),
        d2 = r(b.longitude - a.longitude),
        q =
          Math.sin(d1 / 2) ** 2 +
          Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(d2 / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(q));
    }
    function measuredLiveSegment(previous, current) {
      if (!previous) {
        metricAnchorPosition = current;
        return { distance: 0, moving: 0, stopped: 0 };
      }
      const elapsed = Math.max(0, Number(current.timestamp) - Number(previous.timestamp));
      if (!elapsed || elapsed > 120000 || current.suspicious) {
        metricAnchorPosition = current;
        return { distance: 0, moving: 0, stopped: 0 };
      }
      if ((Number(current.accuracy) || 0) > 120 || (Number(previous.accuracy) || 0) > 120)
        return { distance: 0, moving: 0, stopped: 0 };
      const anchor = metricAnchorPosition || previous,
        step = haversine(anchor, current),
        anchorSeconds = Math.max(
          0.25,
          (Number(current.timestamp) - Number(anchor.timestamp)) / 1000
        ),
        accuracyAllowance = (Number(anchor.accuracy) || 25) + (Number(current.accuracy) || 25),
        speeds = [previous.speed, current.speed]
          .filter(value => value !== null && value !== undefined)
          .map(Number)
          .filter(Number.isFinite),
        plausible = speeds.length
          ? anchorSeconds * 70 + Math.max(100, accuracyAllowance)
          : Math.max(2000, anchorSeconds * 70 + Math.max(100, accuracyAllowance));
      if (step > plausible) {
        metricAnchorPosition = current;
        return { distance: 0, moving: 0, stopped: 0 };
      }
      const noise = Math.max(3, Math.min(25, accuracyAllowance * 0.35)),
        moved = step > noise,
        speed = speeds.length
          ? speeds.reduce((sum, value) => sum + Math.max(0, value), 0) / speeds.length
          : null;
      if (moved) metricAnchorPosition = current;
      const moving = (speed !== null && speed >= 0.8) || (moved && step / (elapsed / 1000) >= 0.8);
      return {
        distance: moved ? step : 0,
        moving: moving ? elapsed : 0,
        stopped: moving ? 0 : elapsed
      };
    }
    function projectPositionToRoute(position) {
      const geometry = plannedRoutes[selectedRoute]?.geometry;
      if (!Array.isArray(geometry) || geometry.length < 2) return position;
      const latitudeScale = 111320,
        longitudeScale =
          latitudeScale * Math.max(0.2, Math.cos((position.latitude * Math.PI) / 180));
      let best = null;
      for (let index = 1; index < geometry.length; index++) {
        const [latA, lngA] = geometry[index - 1],
          [latB, lngB] = geometry[index];
        if (![latA, lngA, latB, lngB].every(Number.isFinite)) continue;
        const ax = (lngA - position.longitude) * longitudeScale,
          ay = (latA - position.latitude) * latitudeScale,
          bx = (lngB - position.longitude) * longitudeScale,
          by = (latB - position.latitude) * latitudeScale,
          dx = bx - ax,
          dy = by - ay,
          lengthSquared = dx * dx + dy * dy,
          t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0,
          x = ax + dx * t,
          y = ay + dy * t,
          distance = Math.hypot(x, y);
        if (!best || distance < best.distance)
          best = {
            distance,
            latitude: position.latitude + y / latitudeScale,
            longitude: position.longitude + x / longitudeScale
          };
      }
      const limit = Math.min(80, Math.max(22, (Number(position.accuracy) || 15) * 1.5));
      return best && best.distance <= limit
        ? {
            ...position,
            latitude: best.latitude,
            longitude: best.longitude,
            visualSnapped: true,
            snapDistance: best.distance
          }
        : position;
    }
    function accuracyLabel(m) {
      return m <= 5 ? 'Excelente' : m <= 15 ? 'Boa' : m <= 50 ? 'Moderada' : 'Baixa';
    }
    function roadEventIcon(category) {
      return category === 'speed_bump'
        ? 'speed-bump'
        : category === 'toll'
          ? 'toll'
          : category === 'traffic_light_camera'
            ? 'traffic-light'
            : category === 'police'
              ? 'police'
              : 'camera';
    }
    async function loadRoadEvents(center, force = false) {
      if (!roadEventsEnabled || !center) return;
      if (!force && lastRoadEventLoad && haversine(lastRoadEventLoad, center) < 1000) return;
      roadEventRequest?.abort();
      roadEventRequest = new AbortController();
      try {
        const response = await fetch(
            `/api/road-events?lat=${center.latitude}&lng=${center.longitude}&radius=7000&categories=speed_camera,mobile_camera,traffic_light_camera,speed_bump,toll`,
            { signal: roadEventRequest.signal }
          ),
          data = await response.json();
        if (!response.ok) throw new Error(data.error);
        layers.roadEvents.clearLayers();
        data.events.forEach(event =>
          L.marker([event.latitude, event.longitude], {
            icon: L.divIcon({
              className: 'map-symbol-host',
              html: `<span class="map-symbol map-symbol--road" aria-label="${escapeHtml(event.label)}"><svg aria-hidden="true"><use href="/images/map-icons.svg#${roadEventIcon(event.category)}"></use></svg></span>`
            })
          })
            .bindPopup(
              `<b>${escapeHtml(event.label)}</b><br>${event.speedLimit ? `Limite: ${event.speedLimit} km/h<br>` : ''}${formatDistance(event.distanceMeters)}<br><small>Fonte: ${escapeHtml(event.source || 'não informada')}</small>`
            )
            .addTo(layers.roadEvents)
        );
        lastRoadEventLoad = { latitude: center.latitude, longitude: center.longitude };
      } catch (error) {
        if (error.name !== 'AbortError') toast(error.message || 'Eventos viários indisponíveis.');
      }
    }
    window.addEventListener('rastreon:road-events-toggle', event => {
      roadEventsEnabled = event.detail.enabled;
      if (!roadEventsEnabled) {
        layers.roadEvents.clearLayers();
        return;
      }
      const current = positions.at(-1),
        center = map.getCenter();
      loadRoadEvents(current || { latitude: center.lat, longitude: center.lng }, true);
    });
    window.addEventListener('rastreon:route-deviation', event =>
      rerouteFrom(event.detail.position)
    );
    window.addEventListener('rastreon:add-route-stop', event => {
      if (routeStops.length >= 8) return toast('Use no máximo 8 paradas.');
      routeStops.push(event.detail);
      renderStops();
      toast(`${event.detail.label} adicionado como parada.`);
    });
    function renderTimelineEvents() {
      const hourly = {};
      for (let i = 1; i < positions.length; i++) {
        const p = positions[i],
          prev = positions[i - 1],
          key = new Date(p.timestamp).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit'
          }),
          meters = haversine(prev, p);
        if (meters < 2000) hourly[key] = (hourly[key] || 0) + meters;
      }
      const avg = vehicle ? 1 / (0.55 / vehicle.city + 0.45 / vehicle.road) : 10,
        hours = Object.entries(hourly)
          .map(
            ([h, m]) =>
              `<div class="event-item"><b>${escapeHtml(h)}h · ${formatDistance(m)}</b><small>Consumo estimado nesta hora: ${br(m / 1000 / avg, 3)} L</small></div>`
          )
          .join('');
      const eventHtml = events
        .map(
          e =>
            `<div class="event-item ${e.alert ? 'alert' : ''}"><b>${escapeHtml(e.title)}</b><small>${new Date(e.time).toLocaleString('pt-BR')} · ${escapeHtml(e.detail)}</small></div>`
        )
        .join('');
      $('eventTimeline').innerHTML =
        (eventHtml ||
          '<div class="empty-state">Inicie uma viagem para registrar eventos por hora.</div>') +
        (hours ? `<div class="step-label">Distância e consumo por hora</div>${hours}` : '');
    }
    function addEvent(title, detail = '', alert = false, time = Date.now()) {
      events.unshift({ title, detail, alert, time });
      renderTimelineEvents();
    }
    function setPoint(type, point, label) {
      const oldMarker = type === 'origin' ? originMarker : destinationMarker;
      if (oldMarker) layers.points.removeLayer(oldMarker);
      const marker = L.marker([point.latitude, point.longitude])
          .addTo(layers.points)
          .bindPopup(label),
        input = type === 'origin' ? $('originInput') : $('destinationInput');
      input.value = label;
      input.dataset.selectedLabel = label;
      if (type === 'origin') {
        origin = point;
        originMarker = marker;
      } else {
        destination = point;
        destinationMarker = marker;
      }
    }
    const geocodeRequests = new Map();
    async function geocode(inputId, resultId, type) {
      const input = $(inputId),
        box = $(resultId),
        q = input.value.trim();
      if (q.length < 3) {
        box.classList.add('hidden');
        input.setAttribute('aria-expanded', 'false');
        return [];
      }
      geocodeRequests.get(resultId)?.abort();
      const controller = new AbortController();
      geocodeRequests.set(resultId, controller);
      box.replaceChildren();
      const loading = document.createElement('button');
      loading.type = 'button';
      loading.disabled = true;
      loading.textContent = 'Buscando endereços…';
      box.appendChild(loading);
      box.classList.remove('hidden');
      input.setAttribute('aria-expanded', 'true');
      try {
        const proximity = userPosition
            ? `&lat=${encodeURIComponent(userPosition.latitude)}&lng=${encodeURIComponent(userPosition.longitude)}`
            : '',
          res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}${proximity}`, {
            signal: controller.signal
          }),
          data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (controller.signal.aborted) return [];
        box.replaceChildren();
        for (const place of data) {
          const button = document.createElement('button');
          button.type = 'button';
          const title = document.createElement('b'),
            meta = document.createElement('small');
          title.textContent = place.label;
          meta.textContent = place.provider
            ? `Resultado por ${place.provider}`
            : 'Endereço encontrado';
          button.append(title, meta);
          button.onclick = () => {
            setPoint(type, place, place.label);
            box.classList.add('hidden');
            input.setAttribute('aria-expanded', 'false');
            if (type === 'destination' && !origin)
              currentLocation({ setAsOrigin: true, center: false }).catch(() => {});
          };
          box.appendChild(button);
        }
        if (!data.length) {
          const empty = document.createElement('button');
          empty.type = 'button';
          empty.disabled = true;
          empty.textContent = 'Nenhum endereço encontrado. Tente incluir cidade ou CEP.';
          box.appendChild(empty);
        }
        return data;
      } catch (error) {
        if (error.name === 'AbortError') return [];
        box.replaceChildren();
        const failure = document.createElement('button');
        failure.type = 'button';
        failure.disabled = true;
        failure.textContent = error.message || 'Não foi possível buscar o endereço.';
        box.appendChild(failure);
        return [];
      } finally {
        if (geocodeRequests.get(resultId) === controller) geocodeRequests.delete(resultId);
      }
    }
    function bindAddressAutocomplete(inputId, resultId, type) {
      const input = $(inputId),
        box = $(resultId);
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-controls', resultId);
      input.setAttribute('aria-expanded', 'false');
      box.setAttribute('role', 'listbox');
      let timer;
      input.addEventListener('input', () => {
        if (input.value !== input.dataset.selectedLabel) {
          if (type === 'origin') {
            origin = null;
            if (originMarker) layers.points.removeLayer(originMarker);
            originMarker = null;
          } else {
            destination = null;
            if (destinationMarker) layers.points.removeLayer(destinationMarker);
            destinationMarker = null;
          }
          delete input.dataset.selectedLabel;
        }
        clearTimeout(timer);
        if (input.value.trim().length < 3) {
          box.classList.add('hidden');
          input.setAttribute('aria-expanded', 'false');
          return;
        }
        timer = setTimeout(() => geocode(inputId, resultId, type), 300);
      });
      input.addEventListener('keydown', async event => {
        if (event.key === 'Escape') {
          box.classList.add('hidden');
          input.setAttribute('aria-expanded', 'false');
          return;
        }
        if (event.key !== 'Enter') return;
        event.preventDefault();
        let first = box.querySelector('button:not(:disabled)');
        if (!first) {
          await geocode(inputId, resultId, type);
          first = box.querySelector('button:not(:disabled)');
        }
        first?.click();
      });
      input.addEventListener('focus', () => {
        if (input.value.trim().length >= 3 && !input.dataset.selectedLabel)
          geocode(inputId, resultId, type);
      });
      input.addEventListener('blur', () =>
        setTimeout(() => {
          box.classList.add('hidden');
          input.setAttribute('aria-expanded', 'false');
        }, 180)
      );
    }
    function debounce(fn, ms = 450) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
      };
    }
    function renderStops() {
      const box = $('routeStops');
      box.innerHTML = routeStops
        .map(
          (stop, index) =>
            `<div class="route-stop"><input data-stop-input="${index}" value="${escapeHtml(stop.label || '')}" placeholder="Parada ${index + 1}: busque e pressione Enter"><button type="button" data-stop-up="${index}" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-stop-down="${index}" ${index === routeStops.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-stop-remove="${index}">×</button></div>`
        )
        .join('');
      box.querySelectorAll('[data-stop-input]').forEach(
        input =>
          (input.onkeydown = async event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const index = Number(input.dataset.stopInput),
              query = input.value.trim();
            if (query.length < 3)
              return toast('Digite ao menos 3 caracteres para buscar a parada.');
            try {
              const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`),
                places = await response.json();
              if (!response.ok) throw new Error(places.error);
              if (!places.length) throw new Error('Parada não encontrada.');
              routeStops[index] = { ...places[0], label: places[0].label };
              renderStops();
              toast('Parada localizada.');
            } catch (error) {
              toast(error.message);
            }
          })
      );
      box.querySelectorAll('[data-stop-remove]').forEach(
        button =>
          (button.onclick = () => {
            routeStops.splice(Number(button.dataset.stopRemove), 1);
            renderStops();
          })
      );
      box.querySelectorAll('[data-stop-up]').forEach(
        button =>
          (button.onclick = () => {
            const index = Number(button.dataset.stopUp);
            [routeStops[index - 1], routeStops[index]] = [routeStops[index], routeStops[index - 1]];
            renderStops();
          })
      );
      box.querySelectorAll('[data-stop-down]').forEach(
        button =>
          (button.onclick = () => {
            const index = Number(button.dataset.stopDown);
            [routeStops[index + 1], routeStops[index]] = [routeStops[index], routeStops[index + 1]];
            renderStops();
          })
      );
    }
    function addStop() {
      if (routeStops.length >= 8) return toast('Use no máximo 8 paradas.');
      routeStops.push({ label: '', latitude: null, longitude: null });
      renderStops();
      $('routeStops').querySelector('[data-stop-input]:last-of-type')?.focus();
    }
    function routeQuery(from, to) {
      const validStops = routeStops.filter(
          stop => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)
        ),
        waypoints = validStops.map(stop => `${stop.longitude},${stop.latitude}`).join(';');
      return `from=${from}&to=${to}&waypoints=${encodeURIComponent(waypoints)}&avoidTolls=${$('avoidTolls').checked}&vehicleType=${vehicle?.type === 'motorcycle' ? 'motorcycle' : 'car'}&departureTime=${encodeURIComponent(new Date().toISOString())}`;
    }
    async function calculateRoute() {
      if (!destination) return toast('Selecione o destino nas sugestões ou no mapa.');
      if (!origin) {
        try {
          await currentLocation({ setAsOrigin: true, center: false });
        } catch {
          return toast(
            'Permita sua localização para calcular a previsão a partir de onde você está.'
          );
        }
      }
      if (routeStops.some(stop => !Number.isFinite(stop.latitude)))
        return toast('Busque e confirme todas as paradas antes de calcular.');
      $('calculateBtn').disabled = true;
      $('calculateBtn').textContent = 'Calculando a partir da sua localização…';
      try {
        const from = `${origin.longitude},${origin.latitude}`,
          to = `${destination.longitude},${destination.latitude}`,
          res = await fetch(`/api/route?${routeQuery(from, to)}`),
          data = await res.json();
        if (!res.ok) throw new Error(data.error);
        plannedRoutes = data.routes;
        renderRoutes(0);
        $('routeSummary').classList.remove('hidden');
        $('startNavigationBtn').disabled = false;
        $('alternativeCount').textContent = Math.max(0, data.routes.length - 1);
        let provider = $('routeProvider');
        if (!provider) {
          provider = document.createElement('small');
          provider.id = 'routeProvider';
          $('routeSummary').appendChild(provider);
        }
        provider.textContent = `Provider: ${data.source} · origem: localização atual · saída: agora · trânsito: ${data.traffic === 'available' ? 'considerado' : 'indisponível'} · pedágios: ${data.tolls === 'unavailable' ? 'indisponíveis' : data.tolls === 'avoided' ? 'evitados' : 'consultados'}`;
        toast(`${data.routes.length} rota(s) encontrada(s) por ${data.source}.`);
      } catch (e) {
        toast(e.message);
      } finally {
        $('calculateBtn').disabled = false;
        $('calculateBtn').textContent = 'Calcular rota rodoviária';
      }
    }
    async function rerouteFrom(position) {
      if (!destination) return;
      toast('Desvio confirmado. Recalculando rota…');
      try {
        const from = `${position.longitude},${position.latitude}`,
          to = `${destination.longitude},${destination.latitude}`,
          response = await fetch(`/api/route?${routeQuery(from, to)}`),
          data = await response.json();
        if (!response.ok) throw new Error(data.error);
        origin = { ...position };
        plannedRoutes = data.routes;
        dailyNavigationMeters = 0;
        lastDailyPosition = position;
        renderRoutes(0, false);
        navigation.start();
        navigation.update(position, Math.max(0, position.speed || 0) * 3.6, 0);
        toast('Nova rota calculada a partir da sua posição.');
      } catch (error) {
        toast(error.message || 'Não foi possível recalcular a rota.');
      }
    }
    function renderRoutes(primaryIndex, fit = true) {
      selectedRoute = primaryIndex;
      layers.planned.clearLayers();
      layers.alternatives.clearLayers();
      plannedRoutes.forEach((r, i) => {
        const layer = L.polyline(r.geometry, {
          color: i === primaryIndex ? '#3c91e6' : '#8997a2',
          weight: i === primaryIndex ? 6 : 3,
          opacity: i === primaryIndex ? 0.95 : 0.65,
          dashArray: i === primaryIndex ? null : '7 9'
        }).addTo(i === primaryIndex ? layers.planned : layers.alternatives);
        layer.bindTooltip(
          `${i === primaryIndex ? 'Rota principal' : 'Alternativa ' + i}: ${formatDistance(r.distance)} · ${formatDuration(r.duration)}`
        );
        if (i !== primaryIndex) layer.on('click', () => renderRoutes(i));
      });
      const r = plannedRoutes[primaryIndex];
      navigation.setRoute(r, $('destinationInput').value);
      window.dispatchEvent(
        new CustomEvent('rastreon:route-selected', { detail: { geometry: r.geometry } })
      );
      $('plannedDistance').textContent = formatDistance(r.distance);
      $('plannedDuration').textContent = formatDuration(r.duration);
      $('plannedArrival').textContent = new Date(Date.now() + r.duration * 1000).toLocaleTimeString(
        'pt-BR',
        { hour: '2-digit', minute: '2-digit' }
      );
      if (fit) map.fitBounds(L.latLngBounds(r.geometry), { padding: [30, 30] });
      updateConsumption();
    }
    async function loadVehicles() {
      const [references, owned] = await Promise.all([
        fetch('/api/vehicles/reference').then(r => r.json()),
        fetch('/api/vehicles').then(r => r.json())
      ]);
      models = references;
      savedVehicles = owned.vehicles;
      $('referenceModel').innerHTML = models
        .map(
          m =>
            `<option value="${m.id}">${escapeHtml(m.brand)} ${escapeHtml(m.model)} ${escapeHtml(m.version)}</option>`
        )
        .join('');
      if (!document.getElementById('vType')) {
        $('referenceModel')
          .closest('label')
          .insertAdjacentHTML(
            'afterend',
            '<label class="field">Tipo de veículo<select id="vType"><option value="car">Carro</option><option value="motorcycle">Moto</option></select></label>'
          );
      }
      if (savedVehicles.length) {
        vehicle = savedVehicles.find(v => v.selected) || savedVehicles[0];
        renderVehicleSummary();
        await loadFuelPrice();
      } else {
        vehicle = null;
        fuelPricePreference = null;
        applyModel(models[0]);
        renderFuelPrice();
        renderVehicleHud();
      }
      renderVehicleCards();
      await loadDevices();
    }
    function ensureGeofencePanel() {
      if ($('geofencePanel')) return;
      const panel = document.createElement('section');
      panel.id = 'geofencePanel';
      panel.className = 'card geofence-panel';
      panel.innerHTML =
        '<div class="section-head"><div><span class="eyebrow">ZONA SEGURA</span><h2>Área de cobertura</h2></div></div><p class="muted-copy">Escolha o centro no mapa ou use a última posição recebida.</p><div class="geofence-form"><input id="geofenceName" placeholder="Nome, ex.: Casa"><input id="geofenceLat" type="number" step="any" placeholder="Latitude"><input id="geofenceLng" type="number" step="any" placeholder="Longitude"><select id="geofenceRadius"><option value="100">100 m</option><option value="250">250 m</option><option value="500" selected>500 m</option><option value="1000">1 km</option><option value="5000">5 km</option></select><button id="useGeofencePoint" class="secondary">Usar ponto atual</button><button id="saveGeofence">Salvar área</button></div><div id="geofenceList" class="geofence-list"></div>';
      $('vehiclesGrid').insertAdjacentElement('afterend', panel);
      $('useGeofencePoint').onclick = () => {
        const point = positions.at(-1) || origin;
        if (!point) return toast('Selecione um ponto no mapa ou receba uma posição.');
        $('geofenceLat').value = point.latitude;
        $('geofenceLng').value = point.longitude;
      };
      $('saveGeofence').onclick = saveGeofence;
    }
    async function loadGeofences() {
      ensureGeofencePanel();
      if (!vehicle?.id) return;
      const response = await fetch(`/api/vehicles/${vehicle.id}/geofences`),
        data = await response.json();
      if (!response.ok) return;
      layers.geofences.clearLayers();
      data.geofences.forEach(fence =>
        L.circle([fence.centerLat, fence.centerLng], {
          radius: fence.radiusMeters,
          color: '#ff5a0a',
          fillColor: '#ff5a0a',
          fillOpacity: 0.08,
          dashArray: '8 6'
        })
          .bindTooltip(`${fence.name} · ${formatDistance(fence.radiusMeters)}`)
          .addTo(layers.geofences)
      );
      $('geofenceList').innerHTML = data.geofences.length
        ? data.geofences
            .map(
              fence =>
                `<div><span><b>${escapeHtml(fence.name)}</b><small>${formatDistance(fence.radiusMeters)}</small></span><button class="danger" data-remove-geofence="${fence.id}">Excluir</button></div>`
            )
            .join('')
        : '<p class="muted-copy">Nenhuma área configurada.</p>';
      $('geofenceList')
        .querySelectorAll('[data-remove-geofence]')
        .forEach(
          button =>
            (button.onclick = async () => {
              await fetch(`/api/geofences/${button.dataset.removeGeofence}`, { method: 'DELETE' });
              loadGeofences();
            })
        );
    }
    async function saveGeofence() {
      if (!vehicle?.id) return toast('Selecione um veículo.');
      const payload = {
          name: $('geofenceName').value,
          type: 'circle',
          centerLat: Number($('geofenceLat').value),
          centerLng: Number($('geofenceLng').value),
          radiusMeters: Number($('geofenceRadius').value),
          enabled: true
        },
        response = await fetch(`/api/vehicles/${vehicle.id}/geofences`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }),
        data = await response.json();
      if (!response.ok) return toast(data.error);
      toast('Área de cobertura salva.');
      loadGeofences();
    }
    function applyModel(m) {
      const fields = {
        vBrand: m.brand,
        vModel: m.model,
        vVersion: m.version,
        vEngine: m.engine,
        vTransmission: m.transmission,
        vFuel: m.fuel,
        vCity: m.city,
        vRoad: m.road,
        vTank: m.tank || 50
      };
      Object.entries(fields).forEach(([id, v]) => ($(id).value = v || ''));
      $('pbeSource').textContent =
        m.source === 'manual' ? 'Consumo informado manualmente pelo usuário.' : m.source;
    }
    function setVehicleFieldsReadonly(readonly) {
      [
        'vBrand',
        'vModel',
        'vYear',
        'vVersion',
        'vColor',
        'vEngine',
        'vTransmission',
        'vFuel'
      ].forEach(id => {
        if ($(id)) $(id).readOnly = readonly;
      });
      $('vehicleForm').classList.toggle('manual-vehicle-entry', !readonly);
    }
    function renderVehicleLookupPreview(item) {
      const preview = $('vehicleLookupPreview'),
        image = item.image || { url: '/images/vehicle-placeholder.svg', found: false };
      preview.classList.remove('hidden');
      preview.innerHTML = `<img alt="Imagem ilustrativa do modelo ${escapeHtml(item.make)} ${escapeHtml(item.model)}"><div><span class="eyebrow">VEÍCULO ENCONTRADO</span><h3>${escapeHtml(item.make)} ${escapeHtml(item.model)}</h3><p>${escapeHtml(item.version || 'Versão não informada')}</p><dl><div><dt>Ano/modelo</dt><dd>${item.manufactureYear || '—'} / ${item.modelYear || '—'}</dd></div><div><dt>Cor</dt><dd>${escapeHtml(item.color || '—')}</dd></div><div><dt>Combustível</dt><dd>${escapeHtml(item.fuel || '—')}</dd></div><div><dt>Placa</dt><dd>${escapeHtml(item.plate)}</dd></div></dl><small>Imagem ilustrativa do modelo${image.attribution ? ` · ${escapeHtml(image.attribution)}` : ''}</small></div>`;
      const img = preview.querySelector('img');
      img.src = image.url || '/images/vehicle-placeholder.svg';
      img.onerror = () => {
        img.onerror = null;
        img.src = '/images/vehicle-placeholder.svg';
      };
    }
    function ensurePlateLookup() {
      if ($('lookupPlateBtn')) return;
      const input = $('vPlate'),
        label = input.closest('label'),
        box = document.createElement('div');
      $('referenceModel').closest('label').classList.add('legacy-reference-model');
      $('vType')?.closest('label').classList.add('identified-vehicle-type');
      if (!$('vColor'))
        $('vFuel')
          .closest('label')
          .insertAdjacentHTML('afterend', '<label>Cor<input id="vColor"></label>');
      setVehicleFieldsReadonly(true);
      box.className = 'plate-lookup';
      input.insertAdjacentElement('beforebegin', box);
      box.append(input);
      box.insertAdjacentHTML(
        'beforeend',
        '<button id="lookupPlateBtn" type="button">Buscar veículo</button>'
      );
      label.insertAdjacentHTML(
        'beforeend',
        '<small id="plateLookupStatus" class="plate-lookup-status">Digite sua placa.</small><button id="manualVehicleBtn" type="button" class="text-btn hidden">Preencher manualmente</button>'
      );
      label.insertAdjacentHTML(
        'afterend',
        '<section id="vehicleLookupPreview" class="vehicle-lookup-preview hidden"></section>'
      );
      input.addEventListener('input', () => {
        input.value = input.value
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 7);
        $('vehicleForm').dataset.lookupComplete = 'false';
        $('vehicleLookupPreview').classList.add('hidden');
      });
      $('lookupPlateBtn').onclick = lookupPlate;
      $('manualVehicleBtn').onclick = () => {
        setVehicleFieldsReadonly(false);
        $('vehicleForm').dataset.lookupComplete = 'manual';
        $('manualVehicleBtn').classList.add('hidden');
        $('plateLookupStatus').textContent =
          'Preencha os dados conhecidos. Nenhuma informação será inventada.';
      };
    }
    async function lookupPlate() {
      const plate = $('vPlate')
          .value.toUpperCase()
          .replace(/[^A-Z0-9]/g, ''),
        button = $('lookupPlateBtn'),
        status = $('plateLookupStatus'),
        manual = $('manualVehicleBtn');
      if (!/^[A-Z]{3}(?:[0-9]{4}|[0-9][A-Z][0-9]{2})$/.test(plate)) {
        status.textContent = 'Confira a placa informada.';
        manual.classList.remove('hidden');
        return;
      }
      button.disabled = true;
      button.textContent = 'Buscando…';
      status.textContent = 'Buscando veículo…';
      manual.classList.add('hidden');
      try {
        const response = await fetch(`/api/vehicles/lookup/${encodeURIComponent(plate)}`),
          data = await response.json();
        if (!response.ok) {
          const error = new Error(data.error);
          error.code = data.code;
          throw error;
        }
        const item = data.vehicle,
          reference = models.find(
            model =>
              normalizeText(model.brand) === normalizeText(item.make) &&
              normalizeText(item.model).includes(normalizeText(model.model))
          );
        if (reference) applyModel(reference);
        const normalizedType = /moto|motocicleta|ciclomotor|scooter/i.test(item.type || '')
            ? 'motorcycle'
            : 'car',
          fields = {
            vPlate: item.plate,
            vBrand: item.make,
            vModel: item.model,
            vYear: item.modelYear,
            vVersion: item.version,
            vColor: item.color,
            vFuel: item.fuel,
            vType: normalizedType
          };
        Object.entries(fields).forEach(([id, value]) => {
          if (value != null && $(id)) $(id).value = value;
        });
        $('vehicleForm').dataset.lookupComplete = 'true';
        $('vehicleForm').dataset.manufactureYear = item.manufactureYear || '';
        $('vehicleForm').dataset.lookupImage = JSON.stringify(item.image || null);
        $('pbeSource').textContent = `vehicle-lookup:${item.provider || 'cache'}`;
        setVehicleFieldsReadonly(true);
        renderVehicleLookupPreview(item);
        status.textContent = data.cached
          ? 'Dados recuperados do cache.'
          : 'Veículo encontrado. Confira antes de salvar.';
        toast('Veículo identificado pela placa.');
      } catch (error) {
        $('vehicleForm').dataset.lookupComplete = 'false';
        status.textContent =
          error.code === 'PLATE_NOT_FOUND'
            ? 'Não encontramos esse veículo. Você pode preencher os dados manualmente.'
            : 'Não foi possível consultar o veículo agora. Tente novamente.';
        manual.classList.remove('hidden');
        toast(status.textContent);
      } finally {
        button.disabled = false;
        button.textContent = 'Buscar veículo';
      }
    }
    function renderVehicleSummary() {
      $('vehicleSummary').classList.remove('empty');
      $('vehicleSummary').innerHTML =
        `<b>${escapeHtml(vehicle.nickname)}</b> · ${escapeHtml(vehicle.plate || 'sem placa')}<br>${escapeHtml(vehicle.brand)} ${escapeHtml(vehicle.model)} ${escapeHtml(vehicle.version)} · ${escapeHtml(vehicle.fuel)}`;
      if (vehicle?.color) vehicle3DLayer?.setBodyColor?.(vehicle.color);
      renderVehicleHud();
      updateConsumption();
    }
    function applyVehicleImageFallback(image, item) {
      if (!image) return;
      if (window.VehicleImageService)
        window.VehicleImageService.applyVehicleImage(image, item, () => {
          image.hidden = false;
          image.src = '/images/vehicle-placeholder.svg';
        });
      else {
        image.hidden = false;
        image.src = item.image?.url || '/images/vehicle-placeholder.svg';
      }
    }
    async function installVehiclePreview(canvas, item, { hud = false } = {}) {
      if (!canvas || item?.type === 'motorcycle') {
        canvas?.setAttribute('hidden', '');
        applyVehicleImageFallback(canvas?.parentElement?.querySelector('img'), item);
        return null;
      }
      const fallback = canvas.parentElement?.querySelector('img');
      try {
        const module = await vehicle3DModulePromise;
        if (!canvas.isConnected) return null;
        const preview = await module.installVehicle3DPreview({
          canvas,
          config: window.VEHICLE_3D_CONFIG,
          color: item.color,
          autoRotate: true,
          onReady: () => {
            canvas.hidden = false;
            if (fallback) fallback.hidden = true;
          }
        });
        if (!canvas.isConnected) {
          preview.destroy();
          return null;
        }
        canvas.dataset.ready = 'true';
        canvas.title = 'Arraste para girar o modelo 3D';
        return preview;
      } catch (error) {
        console.warn('[Rastreon 3D] Prévia indisponível; usando imagem de apoio.', error);
        canvas.hidden = true;
        applyVehicleImageFallback(fallback, item);
        if (hud) hudVehicle3DPreview = null;
        return null;
      }
    }
    function renderVehicleHud() {
      const hud = document.querySelector('.vehicle-hud');
      if (!hud) return;
      hud.querySelector('.vehicle-hud__visual')?.remove();
      hudVehicle3DPreview?.destroy?.();
      hudVehicle3DPreview = null;
      const button = hud.querySelector('button'),
        canvas = hud.querySelector('.vehicle-hud-3d'),
        image = hud.querySelector('.vehicle-hud__media img');
      button.onclick = () => document.querySelector('[data-view="vehicles"]')?.click();
      if (!vehicle) {
        hud.querySelector('.vehicle-hud__model').textContent = 'Nenhum veículo cadastrado';
        hud.querySelector('.vehicle-hud__year').textContent = '';
        hud.querySelector('.vehicle-hud__plate').textContent = '';
        if (canvas) canvas.hidden = true;
        if (image) image.hidden = true;
        button.textContent = 'Cadastrar veículo';
        return;
      }
      hud.querySelector('.vehicle-hud__title').textContent = vehicle.nickname || 'Meu veículo';
      hud.querySelector('.vehicle-hud__model').textContent =
        `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();
      hud.querySelector('.vehicle-hud__year').textContent = vehicle.year || '';
      hud.querySelector('.vehicle-hud__plate').textContent = vehicle.plate || 'SEM PLACA';
      button.textContent = 'Ver detalhes';
      if (canvas) {
        canvas.hidden = false;
        installVehiclePreview(canvas, vehicle, { hud: true }).then(preview => {
          if (preview) hudVehicle3DPreview = preview;
        });
      } else applyVehicleImageFallback(image, vehicle);
      hud.classList.toggle('vehicle-identified', Boolean(vehicle.plate));
    }
    function renderFuelPrice() {
      const input = $('fuelPriceInput'),
        source = $('fuelPriceSource');
      if (!input || !source) return;
      input.value = fuelPricePreference?.pricePerLiter ?? '';
      source.textContent = fuelPricePreference
        ? `Fonte: ${fuelPricePreference.source === 'user-provided' ? 'informado pelo usuário' : fuelPricePreference.source}${fuelPricePreference.region ? ` · ${fuelPricePreference.region}` : ''}`
        : 'Fonte: não informada';
      updateConsumption();
    }
    async function loadFuelPrice() {
      fuelPricePreference = null;
      if (!vehicle?.fuel) return renderFuelPrice();
      try {
        const response = await fetch(
            `/api/fuel-price?fuelType=${encodeURIComponent(vehicle.fuel)}`
          ),
          data = await response.json();
        if (response.ok) fuelPricePreference = data.preference;
      } catch {}
      renderFuelPrice();
    }
    async function saveFuelPrice() {
      if (!vehicle?.fuel) return toast('Selecione um veículo com combustível informado.');
      const pricePerLiter = Number($('fuelPriceInput').value);
      if (!(pricePerLiter > 0 && pricePerLiter <= 100))
        return toast('Informe um preço válido por litro.');
      const response = await fetch('/api/fuel-price', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fuelType: vehicle.fuel, pricePerLiter })
        }),
        data = await response.json();
      if (!response.ok) return toast(data.error);
      fuelPricePreference = data.preference;
      renderFuelPrice();
      toast('Preço salvo separadamente do veículo.');
    }
    function vehiclePayload() {
      let image = null;
      try {
        image = JSON.parse($('vehicleForm').dataset.lookupImage || 'null');
      } catch {}
      return {
        nickname: $('vNickname').value,
        type: $('vType')?.value || 'car',
        plate: $('vPlate').value.toUpperCase(),
        brand: $('vBrand').value,
        model: $('vModel').value,
        year: Number($('vYear').value),
        manufactureYear: Number($('vehicleForm').dataset.manufactureYear) || null,
        version: $('vVersion').value,
        color: $('vColor')?.value || '',
        image,
        engine: $('vEngine').value,
        transmission: $('vTransmission').value,
        fuel: $('vFuel').value,
        city: Number($('vCity').value),
        road: Number($('vRoad').value),
        tank: Number($('vTank').value),
        dataSource: $('pbeSource').textContent || 'manual',
        sourceDate: new Date().toISOString().slice(0, 10)
      };
    }
    async function saveVehicle() {
      if (
        !['true', 'manual'].includes($('vehicleForm').dataset.lookupComplete) &&
        !editingVehicleId
      )
        throw new Error('Busque a placa ou escolha o preenchimento manual.');
      const payload = vehiclePayload(),
        url = editingVehicleId ? `/api/vehicles/${editingVehicleId}` : '/api/vehicles',
        method = editingVehicleId ? 'PUT' : 'POST';
      const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }),
        data = await res.json();
      if (!res.ok) throw new Error(data.error);
      vehicle = data.vehicle;
      editingVehicleId = null;
      $('vehicleDialog').close();
      await loadVehicles();
      toast('Veículo salvo no seu perfil.');
    }
    function openVehicleForm(item = null) {
      if (!item && savedVehicles.length) return openAdditionalVehiclePlan();
      ensurePlateLookup();
      editingVehicleId = item?.id || null;
      $('vehicleForm').dataset.lookupComplete = item ? 'true' : 'false';
      $('vehicleLookupPreview').classList.add('hidden');
      $('manualVehicleBtn').classList.add('hidden');
      setVehicleFieldsReadonly(!item);
      if (item) {
        const fields = {
          vNickname: item.nickname,
          vPlate: item.plate,
          vBrand: item.brand,
          vModel: item.model,
          vYear: item.year,
          vVersion: item.version,
          vColor: item.color,
          vEngine: item.engine,
          vTransmission: item.transmission,
          vFuel: item.fuel,
          vCity: item.city,
          vRoad: item.road,
          vTank: item.tank,
          vType: item.type
        };
        Object.entries(fields).forEach(([id, value]) => {
          if ($(id)) $(id).value = value ?? '';
        });
        $('vehicleForm').dataset.manufactureYear = item.manufactureYear || '';
        $('vehicleForm').dataset.lookupImage = JSON.stringify(item.image || null);
      } else {
        $('vehicleForm').reset();
        $('vNickname').value = 'Meu veículo';
        applyModel(models[0]);
        $('vehicleForm').dataset.manufactureYear = '';
        $('vehicleForm').dataset.lookupImage = '';
      }
      $('plateLookupStatus').textContent = item
        ? 'Dados salvos. Busque novamente para atualizar.'
        : 'Digite sua placa.';
      $('vehicleDialog').showModal();
    }
    function openAdditionalVehiclePlan() {
      let dialog = $('additionalVehicleDialog');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'additionalVehicleDialog';
        dialog.className = 'upgrade-dialog';
        dialog.innerHTML =
          '<div class="modal-head"><div><span class="eyebrow">VEÍCULO ADICIONAL</span><h2>Proteja mais um veículo</h2></div><button type="button" class="icon-btn" data-close-upgrade>×</button></div><p class="upgrade-message">Para cadastrar outro veículo é necessário contratar um plano multi veículos. A solicitação e o envio de mais um aparelho rastreador já estão inclusos.</p><ul class="upgrade-benefits"><li>Novo rastreador incluso no plano</li><li>Acompanhamento de todos os veículos na mesma conta</li><li>Histórico e alertas individuais</li></ul><div class="dialog-actions"><button type="button" class="secondary" data-close-upgrade>Agora não</button><button type="button" data-view-plans>Ver planos disponíveis</button></div>';
        document.body.appendChild(dialog);
        dialog
          .querySelectorAll('[data-close-upgrade]')
          .forEach(button => (button.onclick = () => dialog.close()));
        dialog.querySelector('[data-view-plans]').onclick = () => {
          location.href = '/#planos';
        };
      }
      dialog.showModal();
    }
    function ensureFinesCard() {
      const layout = document.querySelector('#profileView .profile-layout');
      if (!layout || $('profileFinesCard')) return;
      const card = document.createElement('section');
      card.id = 'profileFinesCard';
      card.className = 'card fines-card';
      card.innerHTML =
        '<div class="section-head"><div><span class="eyebrow">DOCUMENTOS DO VEÍCULO</span><h2>Multas</h2></div><span class="fines-status">Em dia</span></div><p class="muted-copy">Acompanhe notificações e vencimentos dos veículos cadastrados.</p><div class="empty-fines"><span>✓</span><div><b>Nenhuma multa encontrada</b><small>Quando houver uma notificação vinculada ao veículo, ela aparecerá aqui.</small></div></div><button type="button" class="secondary wide">Atualizar consulta</button>';
      card.querySelector('button').onclick = () =>
        toast('Consulta de multas atualizada. Nenhuma pendência encontrada.');
      layout.insertBefore(card, layout.querySelector('.privacy-card'));
    }
    function renderVehicleCards() {
      const grid = $('vehiclesGrid');
      if (!grid) return;
      garageVehicle3DPreviews.forEach(preview => preview?.destroy?.());
      garageVehicle3DPreviews = [];
      grid.innerHTML = savedVehicles.length
        ? savedVehicles
            .map(
              v =>
                `<article class="vehicle-card ${v.selected ? 'selected' : ''}"><div class="vehicle-card-3d-wrap"><canvas class="vehicle-card-3d" data-vehicle-id="${v.id}" aria-label="Modelo 3D de ${escapeHtml(v.brand)} ${escapeHtml(v.model)}"></canvas><img class="vehicle-card-image" hidden alt="Imagem de apoio de ${escapeHtml(v.brand)} ${escapeHtml(v.model)}"><span>MODELO 3D</span></div><div class="vehicle-card-head"><span class="vehicle-type">${v.type === 'motorcycle' ? 'MOTO' : 'VEÍCULO'}</span>${v.selected ? '<span class="badge online">Selecionado</span>' : ''}</div><h3>${escapeHtml(v.nickname)}</h3><p>${escapeHtml(v.brand)} ${escapeHtml(v.model)} ${escapeHtml(v.version)}</p><dl><div><dt>Ano</dt><dd>${v.manufactureYear || '—'} / ${v.year || '—'}</dd></div><div><dt>Placa</dt><dd>${escapeHtml(v.plate || 'Não informada')}</dd></div><div><dt>Cor</dt><dd>${escapeHtml(v.color || '—')}</dd></div><div><dt>Combustível</dt><dd>${escapeHtml(v.fuel || '—')}</dd></div></dl>${v.image?.attribution ? `<small class="image-credit">Créditos da imagem de apoio: ${escapeHtml(v.image.attribution)}</small>` : ''}<div class="vehicle-actions">${v.selected ? '' : `<button data-select="${v.id}">Selecionar</button>`}<button class="secondary" data-edit="${v.id}">Editar</button><button class="danger" data-delete="${v.id}">Excluir</button></div></article>`
            )
            .join('')
        : '<div class="empty-garage"><h3>Nenhum veículo cadastrado</h3><p>Adicione seu primeiro veículo para começar uma viagem.</p></div>';
      grid.querySelectorAll('[data-vehicle-id]').forEach(canvas => {
        const item = savedVehicles.find(value => value.id === Number(canvas.dataset.vehicleId));
        installVehiclePreview(canvas, item).then(preview => {
          if (preview) garageVehicle3DPreviews.push(preview);
        });
      });
      grid.querySelectorAll('.vehicle-card-image').forEach(
        img =>
          (img.onerror = () => {
            img.onerror = null;
            img.src = '/images/vehicle-placeholder.svg';
          })
      );
      grid
        .querySelectorAll('[data-select]')
        .forEach(b => (b.onclick = () => selectVehicle(Number(b.dataset.select))));
      grid
        .querySelectorAll('[data-edit]')
        .forEach(
          b =>
            (b.onclick = () =>
              openVehicleForm(savedVehicles.find(v => v.id === Number(b.dataset.edit))))
        );
      grid
        .querySelectorAll('[data-delete]')
        .forEach(b => (b.onclick = () => deleteVehicle(Number(b.dataset.delete))));
    }
    function deviceState(device) {
      if (device.status === 'REVOKED') return { key: 'revoked', label: 'Revogado' };
      if (!device.lastSeen) return { key: 'offline', label: 'Nunca conectado' };
      const age = Date.now() - device.lastSeen;
      if (age <= 120000) return { key: 'online', label: 'Online' };
      if (age <= 600000) return { key: 'stale', label: 'Sem atualização' };
      return { key: 'offline', label: 'Offline' };
    }
    async function loadDevices() {
      const list = $('devicesList');
      if (!list) return;
      if (!vehicle?.id) {
        list.innerHTML = '<div class="empty-state">Cadastre e selecione um veículo.</div>';
        return;
      }
      const response = await fetch(`/api/vehicles/${vehicle.id}/devices`),
        data = await response.json();
      if (!response.ok) {
        list.innerHTML =
          '<div class="empty-state">Não foi possível carregar os dispositivos.</div>';
        return;
      }
      list.innerHTML = data.devices.length
        ? data.devices
            .map(device => {
              const state = deviceState(device);
              return `<article class="device-row"><span class="device-symbol">${device.type === 'PHONE' ? '▣' : '●'}</span><div><b>${escapeHtml(device.name)}</b><small>${device.lastSeen ? `Último contato: ${new Date(device.lastSeen).toLocaleString('pt-BR')}` : 'Ainda não realizou conexão GPS'}</small></div><span class="device-status ${state.key}">● ${state.label}</span>${device.status === 'ACTIVE' ? `<button class="danger" data-revoke-device="${device.id}">Desvincular</button>` : ''}</article>`;
            })
            .join('')
        : '<div class="empty-state">Nenhum rastreador vinculado a este veículo.</div>';
      list
        .querySelectorAll('[data-revoke-device]')
        .forEach(button => (button.onclick = () => revokeDevice(button.dataset.revokeDevice)));
    }
    async function revokeDevice(id) {
      if (!confirm('Desvincular este celular? Ele deixará de enviar localização imediatamente.'))
        return;
      const response = await fetch(`/api/devices/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        return toast(data.error || 'Não foi possível desvincular.');
      }
      await loadDevices();
      toast('Celular desvinculado.');
    }
    async function connectSelectedPhone() {
      if (!vehicle?.id) return toast('Cadastre e selecione um veículo.');
      document.querySelector('[data-view="tracking"]').click();
      document.body.classList.add('trip-planning');
      await createSession();
    }
    async function selectVehicle(id) {
      const res = await fetch(`/api/vehicles/${id}/select`, { method: 'POST' });
      if (!res.ok) return toast('Não foi possível selecionar o veículo.');
      await loadVehicles();
      toast('Veículo selecionado para a viagem.');
    }
    async function deleteVehicle(id) {
      if (!confirm('Excluir este veículo?')) return;
      const res = await fetch(`/api/vehicles/${id}`, { method: 'DELETE' });
      if (!res.ok) return toast('Não foi possível excluir o veículo.');
      await loadVehicles();
      toast('Veículo excluído.');
    }
    function ensureProfileAvatarEditor() {
      const avatar = $('profileInitial');
      if (!avatar || $('profileAvatarInput')) return;
      avatar.classList.add('editable-avatar');
      avatar.setAttribute('role', 'button');
      avatar.setAttribute('tabindex', '0');
      avatar.setAttribute('aria-label', 'Alterar foto de perfil');
      avatar.insertAdjacentHTML(
        'afterend',
        '<input id="profileAvatarInput" type="file" accept="image/jpeg,image/png,image/webp" hidden><button id="changeAvatarBtn" type="button" class="text-btn profile-avatar-action">Alterar foto</button>'
      );
      const open = () => $('profileAvatarInput').click();
      avatar.onclick = open;
      avatar.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      };
      $('changeAvatarBtn').onclick = open;
      $('profileAvatarInput').onchange = event => saveProfileAvatar(event.target.files?.[0]);
    }
    function resizeProfileAvatar(file) {
      return new Promise((resolve, reject) => {
        if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type))
          return reject(new Error('Escolha uma imagem JPG, PNG ou WebP.'));
        if (file.size > 8 * 1024 * 1024)
          return reject(new Error('A imagem deve ter no máximo 8 MB.'));
        const image = new Image(),
          url = URL.createObjectURL(file);
        image.onload = () => {
          URL.revokeObjectURL(url);
          const size = Math.min(image.naturalWidth, image.naturalHeight),
            sx = (image.naturalWidth - size) / 2,
            sy = (image.naturalHeight - size) / 2,
            canvas = document.createElement('canvas');
          canvas.width = canvas.height = 192;
          canvas.getContext('2d').drawImage(image, sx, sy, size, size, 0, 0, 192, 192);
          let quality = 0.82,
            data = canvas.toDataURL('image/jpeg', quality);
          while (data.length > 44000 && quality > 0.42) {
            quality -= 0.08;
            data = canvas.toDataURL('image/jpeg', quality);
          }
          resolve(data);
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Não foi possível abrir essa imagem.'));
        };
        image.src = url;
      });
    }
    function renderProfileAvatar(avatarData, name) {
      const avatar = $('profileInitial');
      if (!avatar) return;
      avatar.classList.toggle('has-photo', Boolean(avatarData));
      avatar.style.backgroundImage = avatarData ? `url(${avatarData})` : '';
      avatar.textContent = avatarData
        ? ''
        : String(name || 'U')
            .slice(0, 1)
            .toUpperCase();
    }
    async function saveProfileAvatar(file) {
      if (!file) return;
      const button = $('changeAvatarBtn');
      button.disabled = true;
      button.textContent = 'Salvando…';
      try {
        const avatarData = await resizeProfileAvatar(file),
          csrfResponse = await fetch('/api/auth/csrf'),
          csrf = await csrfResponse.json();
        if (!csrfResponse.ok) throw new Error(csrf.error);
        const response = await fetch('/api/profile/avatar', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf.token },
            body: JSON.stringify({ avatarData })
          }),
          data = await response.json();
        if (!response.ok) throw new Error(data.error);
        renderProfileAvatar(data.avatarData, $('profileName').textContent);
        toast('Foto de perfil atualizada.');
      } catch (error) {
        toast(error.message || 'Não foi possível atualizar a foto.');
      } finally {
        button.disabled = false;
        button.textContent = 'Alterar foto';
        $('profileAvatarInput').value = '';
      }
    }
    async function loadProfile() {
      ensureProfileAvatarEditor();
      const res = await fetch('/api/profile'),
        data = await res.json();
      if (!res.ok) return;
      $('profileName').textContent = data.user.name;
      $('profileEmail').textContent = data.user.email;
      renderProfileAvatar(data.user.avatarData, data.user.name);
      $('profileCreated').textContent = new Date(data.user.createdAt).toLocaleDateString('pt-BR');
      $('profilePlan').textContent = data.plan;
      $('profileVehicleCount').textContent = data.vehicleCount;
      $('profileAlertCount').textContent = data.recentAlertCount;
      $('profileTrips').innerHTML = data.recentTrips.length
        ? data.recentTrips
            .map(
              t =>
                `<div class="profile-trip"><b>${escapeHtml(t.vehicle?.nickname || 'Veículo')}</b><span>${new Date(t.createdAt).toLocaleString('pt-BR')}</span><small>${t.closedAt ? 'Finalizada' : 'Em aberto'}</small></div>`
            )
            .join('')
        : '<div class="empty-state">Nenhuma viagem registrada.</div>';
    }
    async function exportPrivacyData() {
      const button = $('exportDataBtn');
      button.disabled = true;
      try {
        const response = await fetch('/api/privacy/export');
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Não foi possível exportar os dados.');
        }
        const blob = await response.blob(),
          url = URL.createObjectURL(blob),
          link = document.createElement('a');
        link.href = url;
        link.download = `rastreon-dados-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast('Arquivo de dados gerado com segurança.');
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
      }
    }
    async function changePassword() {
      const currentPassword = $('changeCurrentPassword').value,
        newPassword = $('changeNewPassword').value,
        button = $('changePasswordBtn');
      if (!currentPassword || !newPassword) return toast('Preencha a senha atual e a nova senha.');
      button.disabled = true;
      try {
        const csrfResponse = await fetch('/api/auth/csrf'),
          csrfData = await csrfResponse.json();
        if (!csrfResponse.ok) throw new Error(csrfData.error);
        const response = await fetch('/api/auth/password', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfData.token },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error);
        }
        $('changeCurrentPassword').value = '';
        $('changeNewPassword').value = '';
        toast('Senha atualizada. Outras sessões foram encerradas.');
      } catch (error) {
        toast(error.message || 'Não foi possível alterar a senha.');
      } finally {
        button.disabled = false;
      }
    }
    async function deletePrivacyAccount() {
      const password = $('privacyPassword').value,
        confirmation = $('deleteConfirmation').value;
      if (!password) return toast('Informe sua senha atual.');
      if (confirmation !== 'EXCLUIR MINHA CONTA')
        return toast('Digite a frase de confirmação exatamente como exibida.');
      if (
        !confirm(
          'Esta ação é permanente. Deseja realmente excluir a conta e todos os dados associados?'
        )
      )
        return;
      const button = $('deleteAccountBtn');
      button.disabled = true;
      try {
        const csrfResponse = await fetch('/api/auth/csrf'),
          csrfData = await csrfResponse.json();
        if (!csrfResponse.ok)
          throw new Error(csrfData.error || 'Não foi possível validar esta operação.');
        const response = await fetch('/api/privacy/account', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfData.token },
          body: JSON.stringify({ password, confirmation })
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Não foi possível excluir a conta.');
        }
        location.replace('/login.html');
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    }
    const achievementNames = {
      PRIMEIRA_VIAGEM: 'Primeira viagem',
      EXPLORADOR_RESPONSAVEL: 'Explorador responsável',
      CONEXAO_CONSISTENTE: 'Conexão consistente',
      ROTINA_PROTEGIDA: 'Rotina protegida',
      GUARDIAO_DA_AREA: 'Guardião da área'
    };
    async function loadGamification() {
      const [mine, ranking] = await Promise.all([
        fetch('/api/gamification/me').then(r => r.json()),
        fetch('/api/gamification/ranking').then(r => r.json())
      ]);
      $('safeScore').textContent = mine.progress.score;
      $('rankingEnabled').checked = mine.profile.enabled;
      $('rankingName').value = mine.profile.displayName || '';
      const labels = {
        completedTrips: 'Viagens concluídas',
        continuity: 'Continuidade',
        scheduleCompliance: 'Respeito aos horários',
        geofenceCompliance: 'Proteção de área',
        dataQuality: 'Qualidade do GPS'
      };
      $('scoreBreakdown').innerHTML = Object.entries(mine.progress.breakdown)
        .map(([key, value]) => `<div><span>${labels[key]}</span><b>+${value}</b></div>`)
        .join('');
      $('achievementList').innerHTML =
        mine.progress.achievements
          .map(item => `<span>◆ ${achievementNames[item] || item}</span>`)
          .join('') || '<small>Finalize uma viagem para liberar conquistas.</small>';
      $('rankingList').innerHTML = ranking.ranking.length
        ? ranking.ranking
            .map(
              item =>
                `<div><b>${item.position}º</b><span>${escapeHtml(item.displayName)}</span><strong>${item.score}</strong></div>`
            )
            .join('')
        : '<p class="muted-copy">Ainda não há participantes no ranking.</p>';
    }
    async function saveRankingPreference() {
      const response = await fetch('/api/gamification/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: $('rankingEnabled').checked,
            displayName: $('rankingName').value
          })
        }),
        data = await response.json();
      if (!response.ok) return toast(data.error);
      toast(
        data.profile.enabled
          ? 'Participação no ranking ativada.'
          : 'Participação no ranking desativada.'
      );
      loadGamification();
    }
    async function createSession() {
      if (!vehicle) {
        openVehicleForm();
        toast('Configure o veículo antes de criar a sessão.');
        return null;
      }
      try {
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicleId: vehicle.id })
          }),
          d = await res.json();
        if (!res.ok) throw new Error(d.error);
        sessionId = d.id;
        pairingId = d.pairingId;
        mobileUrl = d.pairUrl;
        $('qrImage').src = d.qrCode;
        $('sessionCode').textContent = d.pairingCode;
        $('sessionCode').parentElement.firstChild.textContent = 'Código ';
        let instructions = $('manualMobileInstructions');
        if (!instructions) {
          instructions = document.createElement('small');
          instructions.id = 'manualMobileInstructions';
          $('sessionCode').parentElement.insertAdjacentElement('afterend', instructions);
        }
        const renderExpiry = () => {
          const remaining = Math.max(0, d.pairingExpiresAt - Date.now()),
            minutes = Math.floor(remaining / 60000),
            seconds = Math.floor((remaining % 60000) / 1000);
          instructions.textContent = remaining
            ? `No celular, abra ${new URL(d.pairUrl).origin}/pair e leia o QR ou digite o código. Expira em ${minutes}:${String(seconds).padStart(2, '0')}.`
            : 'QR Code expirado. Gere uma nova sessão.';
          if (!remaining) {
            clearInterval(pairingTimer);
            $('phoneStatus').textContent = '● QR expirado';
          }
        };
        clearInterval(pairingTimer);
        renderExpiry();
        pairingTimer = setInterval(renderExpiry, 1000);
        $('sessionEmpty').classList.add('hidden');
        $('sessionActive').classList.remove('hidden');
        $('clearBtn').disabled = false;
        $('closeBtn').disabled = false;
        socket.emit('session:join', { sessionId, role: 'dashboard' });
        toast('QR seguro criado. Aguardando leitura no celular.');
        return d;
      } catch (e) {
        toast(e.message || 'Não foi possível criar a sessão.');
        return null;
      }
    }
    function ensureTrackerPairing() {
      const actions = document.querySelector('.map-toolbar .actions');
      if (!actions || $('trackerPairBtn')) return;
      const button = document.createElement('button');
      button.id = 'trackerPairBtn';
      button.className = 'secondary';
      button.textContent = 'Rastreador';
      button.title = 'Conectar celular como rastreador';
      button.onclick = () => openTrackerPairing(false);
      actions.appendChild(button);
    }
    async function openTrackerPairing(forceNew = false) {
      let dialog = $('trackerPairDialog');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'trackerPairDialog';
        dialog.className = 'tracker-pair-dialog';
        dialog.innerHTML =
          '<div class="modal-head"><div><span class="eyebrow">OPÇÃO PARA CELULAR</span><h2>Levar a viagem no celular</h2></div><button type="button" class="icon-btn" data-close-tracker>×</button></div><p class="tracker-intro">Esta etapa é opcional. Leia o QR Code para acompanhar o teste da viagem no celular; a navegação deste site funciona de forma independente.</p><div class="tracker-qr-state"><img alt="QR Code para abrir a viagem no celular"><strong>Preparando QR Code…</strong><small></small></div><button type="button" class="secondary wide" data-new-tracker>Gerar novo QR Code</button>';
        document.body.appendChild(dialog);
        dialog.querySelector('[data-close-tracker]').onclick = () => dialog.close();
        dialog.querySelector('[data-new-tracker]').onclick = () => openTrackerPairing(true);
      }
      dialog.showModal();
      const image = dialog.querySelector('img'),
        code = dialog.querySelector('strong'),
        note = dialog.querySelector('small');
      if (!vehicle) {
        code.textContent = 'Cadastre um veículo primeiro';
        note.textContent = 'Abra a aba Veículos e informe a placa.';
        image.removeAttribute('src');
        return;
      }
      if (!forceNew && sessionId && $('qrImage').src) {
        image.src = $('qrImage').src;
        code.textContent = `Código ${$('sessionCode').textContent}`;
        note.textContent = 'Leia o QR Code para abrir a sessão desta viagem no celular.';
        return;
      }
      code.textContent = 'Gerando QR Code seguro…';
      note.textContent = '';
      const data = await createSession();
      if (!data) return;
      image.src = data.qrCode;
      code.textContent = `Código ${data.pairingCode}`;
      note.textContent = `Expira em ${data.pairingExpiresInMinutes} minutos. O compartilhamento é opcional e não bloqueia a navegação no site.`;
    }
    async function startTrip() {
      if (!plannedRoutes.length) return toast('Calcule uma rota antes de iniciar.');
      if (!sessionId) return toast('Crie uma sessão de rastreamento antes de iniciar.');
      if (!tripStart) {
        tripStart = Date.now();
        tripEnd = null;
        try {
          const response = await fetch('/api/trips', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                trackingSessionId: sessionId,
                vehicleId: vehicle.id,
                plannedRoute: plannedRoutes[selectedRoute],
                startedAt: tripStart
              })
            }),
            data = await response.json();
          if (!response.ok) throw new Error(data.error);
          tripId = data.trip.id;
          $('tripStarted').textContent = new Date(tripStart).toLocaleString('pt-BR');
          $('startTripBtn').textContent = 'Finalizar viagem';
          navigation.start();
          addEvent('Viagem iniciada', `${vehicle.nickname} · rota planejada preservada`);
          socket.emit('trip:update', {
            startedAt: tripStart,
            route: plannedRoutes[selectedRoute],
            vehicle
          });
          checkSchedule();
        } catch (error) {
          tripStart = null;
          toast(error.message);
        }
      } else {
        tripEnd = Date.now();
        if (tripId) {
          const response = await fetch(`/api/trips/${tripId}/finish`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endedAt: tripEnd })
          });
          if (!response.ok) return toast('Não foi possível finalizar a viagem.');
        }
        navigation.stop();
        $('tripEnded').textContent = new Date(tripEnd).toLocaleString('pt-BR');
        $('startTripBtn').textContent = 'Viagem finalizada';
        $('startTripBtn').disabled = true;
        addEvent(
          'Viagem finalizada',
          `Distância total estimada: ${formatDistance(confirmedMeters + rebuiltMeters)}`
        );
        updateTimeline();
      }
    }
    function historyRouteSvg(track = []) {
      const points = track.filter(
        point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
      );
      if (points.length < 2)
        return '<div class="empty-state">Esta viagem ainda não possui percurso suficiente.</div>';
      const lats = points.map(point => point.latitude),
        lngs = points.map(point => point.longitude),
        minLat = Math.min(...lats),
        maxLat = Math.max(...lats),
        minLng = Math.min(...lngs),
        maxLng = Math.max(...lngs),
        latSpan = Math.max(maxLat - minLat, 0.0001),
        lngSpan = Math.max(maxLng - minLng, 0.0001),
        project = point =>
          `${24 + ((point.longitude - minLng) / lngSpan) * 752},${226 - ((point.latitude - minLat) / latSpan) * 190}`,
        path = points.map((point, index) => `${index ? 'L' : 'M'}${project(point)}`).join(' '),
        start = project(points[0]).split(','),
        end = project(points.at(-1)).split(',');
      return `<svg viewBox="0 0 800 250" role="img" aria-label="Traçado da viagem selecionada"><defs><pattern id="historyGrid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#dce4e7" stroke-width="1"/></pattern><filter id="routeShadow"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#ff5a0a" flood-opacity=".22"/></filter></defs><rect width="800" height="250" rx="18" fill="#f6f8f7"/><rect width="800" height="250" rx="18" fill="url(#historyGrid)" opacity=".65"/><path d="${path}" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="${path}" fill="none" stroke="#ff5a0a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#routeShadow)"/><circle cx="${start[0]}" cy="${start[1]}" r="10" fill="#16a765" stroke="#fff" stroke-width="5"/><circle cx="${end[0]}" cy="${end[1]}" r="10" fill="#ff5a0a" stroke="#fff" stroke-width="5"/></svg>`;
    }
    function destroyHistoryMap() {
      if (historyMap) {
        historyMap.remove();
        historyMap = null;
      }
    }
    function historyMarkerElement(kind, label) {
      const element = document.createElement('div');
      element.className = `history-map-marker ${kind}`;
      element.setAttribute('aria-label', label);
      element.title = label;
      return element;
    }
    function renderHistoryMap(track = [], plannedGeometry = []) {
      const preview = $('historyRoutePreview'),
        points = track.filter(
          point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
        );
      destroyHistoryMap();
      if (points.length < 2) {
        preview.innerHTML =
          '<div class="empty-state">Esta viagem ainda não possui percurso suficiente.</div>';
        return;
      }
      if (!maplibregl || !['maplibre', 'mapbox'].includes(mapProvider)) {
        preview.innerHTML = historyRouteSvg(points);
        return;
      }
      preview.replaceChildren();
      const container = document.createElement('div');
      container.id = 'historyRouteMap';
      container.className = 'history-route-map';
      container.setAttribute('aria-label', 'Mapa interativo do percurso selecionado');
      preview.appendChild(container);
      const style =
        window.RASTROTACK_MAP_CONFIG?.mapStyleUrl || 'https://tiles.openfreemap.org/styles/liberty';
      try {
        historyMap = new maplibregl.Map({
          container,
          style,
          center: [points[0].longitude, points[0].latitude],
          zoom: 13,
          pitch: 24,
          bearing: 0,
          maxPitch: 55,
          antialias: true,
          pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
          attributionControl: true
        });
        historyMap.addControl(
          new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
          'bottom-right'
        );
        historyMap.once('load', () => {
          const actualCoordinates = points.map(point => [point.longitude, point.latitude]),
            plannedCoordinates = (Array.isArray(plannedGeometry) ? plannedGeometry : [])
              .filter(point => Array.isArray(point) && point.length === 2)
              .map(([latitude, longitude]) => [longitude, latitude]);
          if (plannedCoordinates.length > 1) {
            historyMap.addSource('history-planned', {
              type: 'geojson',
              data: {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: plannedCoordinates }
              }
            });
            historyMap.addLayer({
              id: 'history-planned',
              type: 'line',
              source: 'history-planned',
              paint: {
                'line-color': '#53687a',
                'line-width': 3,
                'line-opacity': 0.65,
                'line-dasharray': [2, 2]
              }
            });
          }
          historyMap.addSource('history-actual', {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: actualCoordinates }
            }
          });
          historyMap.addLayer({
            id: 'history-actual-casing',
            type: 'line',
            source: 'history-actual',
            paint: { 'line-color': '#fff', 'line-width': 10, 'line-opacity': 0.96 }
          });
          historyMap.addLayer({
            id: 'history-actual',
            type: 'line',
            source: 'history-actual',
            paint: { 'line-color': '#ff5a0a', 'line-width': 5, 'line-opacity': 0.96 }
          });
          new maplibregl.Marker({ element: historyMarkerElement('start', 'Início da viagem') })
            .setLngLat(actualCoordinates[0])
            .addTo(historyMap);
          new maplibregl.Marker({ element: historyMarkerElement('finish', 'Fim da viagem') })
            .setLngLat(actualCoordinates.at(-1))
            .addTo(historyMap);
          const bounds = actualCoordinates.reduce(
            (value, coordinate) => value.extend(coordinate),
            new maplibregl.LngLatBounds(actualCoordinates[0], actualCoordinates[0])
          );
          historyMap.fitBounds(bounds, { padding: 46, maxZoom: 16.8, duration: 0 });
          setTimeout(() => historyMap?.resize(), 50);
        });
      } catch (error) {
        console.warn('[Rastreon Histórico] Mapa interativo indisponível.', error);
        preview.innerHTML = historyRouteSvg(points);
      }
    }
    function historyTimeline(trip) {
      const track = Array.isArray(trip.actualTrack) ? trip.actualTrack : [],
        hourly = new Map();
      for (let index = 1; index < track.length; index++) {
        const previous = track[index - 1],
          current = track[index],
          step = haversine(previous, current),
          noise = Math.max(
            3,
            Math.min(
              25,
              ((Number(previous.accuracy) || 25) + (Number(current.accuracy) || 25)) * 0.35
            )
          );
        if (step <= noise || step >= 2000) continue;
        const key = new Date(current.timestamp).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit'
        });
        hourly.set(key, (hourly.get(key) || 0) + step);
      }
      const items = [
        `<div class="event-item start"><b>Viagem iniciada</b><small>${new Date(trip.startedAt).toLocaleString('pt-BR')}</small></div>`
      ];
      for (const [hour, meters] of hourly)
        items.push(
          `<div class="event-item movement"><b>${escapeHtml(hour)}h · em movimento</b><small>${formatDistance(meters)} confirmados nesse período</small></div>`
        );
      for (const item of trip.interruptions || [])
        items.push(
          `<div class="event-item alert"><b>Interrupção de conexão</b><small>${formatDuration((item.duration || 0) / 1000)} · ${escapeHtml(item.classification)}</small></div>`
        );
      if (trip.endedAt)
        items.push(
          `<div class="event-item finish"><b>Viagem finalizada</b><small>${new Date(trip.endedAt).toLocaleString('pt-BR')} · ${formatDistance(trip.comparison.actualDistanceMeters)}</small></div>`
        );
      return items.join('');
    }
    function localDateValue(date) {
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 10);
    }
    function configureHistoryFilters() {
      const select = $('dateFilter'),
        from = $('historyDateFrom'),
        to = $('historyDateTo'),
        separator = $('historyDateSeparator'),
        today = new Date();
      from.value = to.value = localDateValue(today);
      const update = () => {
        const specific = select.value === 'specific',
          range = select.value === 'range';
        from.classList.toggle('hidden', !specific && !range);
        to.classList.toggle('hidden', !range);
        separator.classList.toggle('hidden', !range);
      };
      select.onchange = update;
      update();
    }
    function filterTripsByPeriod(trips) {
      const mode = $('dateFilter').value,
        now = new Date();
      let fromDate, toDate;
      if (mode === 'today' || mode === 'yesterday') {
        const shift = mode === 'yesterday' ? -1 : 0,
          day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift);
        fromDate = toDate = localDateValue(day);
      } else {
        fromDate = $('historyDateFrom').value;
        toDate = mode === 'range' ? $('historyDateTo').value : fromDate;
      }
      if (!fromDate || !toDate) return trips;
      const from = new Date(`${fromDate}T${$('timeFrom').value || '00:00'}:00`).getTime(),
        to = new Date(`${toDate}T${$('timeTo').value || '23:59'}:59.999`).getTime();
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
      return trips.filter(trip => Number(trip.startedAt) >= from && Number(trip.startedAt) <= to);
    }
    async function loadTripHistory(selectedId) {
      const response = await fetch('/api/trips'),
        data = await response.json();
      historyTrip = null;
      $('replayTripBtn').disabled = true;
      const trips = response.ok ? filterTripsByPeriod(data.trips || []) : [];
      $('historyTripCount').textContent =
        `${trips.length} ${trips.length === 1 ? 'viagem' : 'viagens'}`;
      $('historyTripList').innerHTML = trips.length
        ? trips
            .slice(0, 12)
            .map(
              trip =>
                `<button type="button" class="history-trip-row ${String(trip.id) === String(selectedId || trips[0].id) ? 'selected' : ''}" data-history-trip="${escapeHtml(trip.id)}"><span><b>${new Date(trip.startedAt).toLocaleDateString('pt-BR')}</b><small>${new Date(trip.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></span><span><small>Distância GPS</small><b>${formatDistance(trip.comparison.actualDistanceMeters)}</b></span><span><small>Tempo total</small><b>${formatDuration(trip.comparison.actualDurationSeconds)}</b></span><i>Ver no mapa</i></button>`
            )
            .join('')
        : '<div class="empty-state">Nenhuma viagem neste período.</div>';
      document
        .querySelectorAll('[data-history-trip]')
        .forEach(button => (button.onclick = () => loadTripHistory(button.dataset.historyTrip)));
      if (!trips.length) {
        destroyHistoryMap();
        $('historyRoutePreview').innerHTML =
          '<div class="empty-state">Nenhum percurso registrado neste período.</div>';
        return;
      }
      const id = selectedId || trips[0].id,
        detailResponse = await fetch(`/api/trips/${encodeURIComponent(id)}`),
        detailData = await detailResponse.json();
      if (!detailResponse.ok)
        return toast(detailData.error || 'Não foi possível carregar a viagem.');
      const latest = detailData.trip;
      let displayTrack = latest.actualTrack;
      try {
        const displayResponse = await fetch(`/api/trips/${encodeURIComponent(id)}/display-track`),
          displayData = await displayResponse.json();
        if (displayResponse.ok && Array.isArray(displayData.displayTrack))
          displayTrack = displayData.displayTrack;
      } catch {}
      historyTrip = latest;
      renderHistoryMap(displayTrack, latest.plannedRoute?.geometry);
      $('replayTripBtn').disabled =
        !Array.isArray(latest.actualTrack) || latest.actualTrack.length < 2;
      $('tripStarted').textContent = new Date(latest.startedAt).toLocaleString('pt-BR');
      $('tripEnded').textContent = latest.endedAt
        ? new Date(latest.endedAt).toLocaleString('pt-BR')
        : 'Em andamento';
      $('tripDuration').textContent = formatDuration(latest.comparison.actualDurationSeconds);
      $('movingTime').textContent = formatDuration(latest.comparison.movingSeconds);
      $('stoppedTime').textContent = formatDuration(latest.comparison.stoppedSeconds);
      $('speedStats').textContent =
        `${br(latest.comparison.averageSpeedKmh)} / ${br(latest.comparison.maximumSpeedKmh)} km/h`;
      $('eventTimeline').innerHTML = historyTimeline(latest);
      const badge = document.querySelector('.history-route-badge');
      if (badge)
        badge.textContent = `GPS filtrado · ${latest.comparison.metricSampleCount || 0} pontos`;
    }
    function stopTripReplay({ clear = true } = {}) {
      if (replayTimer) clearInterval(replayTimer);
      replayTimer = null;
      replayMarker = null;
      replayIndex = 0;
      if (clear) {
        layers.replay.clearLayers();
        $('replayBadge').classList.add('hidden');
      }
    }
    function playTripHistory() {
      const track = historyTrip?.actualTrack;
      if (!Array.isArray(track) || track.length < 2)
        return toast('Esta viagem não possui pontos suficientes para reprodução.');
      stopTripReplay();
      document.querySelector('[data-view="tracking"]')?.click();
      $('replayBadge').classList.remove('hidden');
      $('replayProgress').textContent = `1 de ${track.length} pontos históricos`;
      const geometry = track.map(point => [point.latitude, point.longitude]),
        replayIcon = L.divIcon({
          className: 'replay-vehicle-icon',
          html: '<span aria-label="Veículo em reprodução">R</span>'
        });
      L.polyline(geometry, { color: '#7d3fe0', weight: 5, opacity: 0.75, dashArray: '7 7' }).addTo(
        layers.replay
      );
      replayMarker = L.marker(geometry[0], { icon: replayIcon })
        .addTo(layers.replay)
        .bindTooltip('REPRODUÇÃO — não é ao vivo');
      map.fitBounds(L.latLngBounds(geometry), { padding: [35, 35] });
      replayIndex = 0;
      replayTimer = setInterval(() => {
        replayIndex++;
        if (replayIndex >= track.length) {
          clearInterval(replayTimer);
          replayTimer = null;
          $('replayProgress').textContent = `Concluída · ${track.length} pontos históricos`;
          return;
        }
        replayMarker.setLatLng(geometry[replayIndex]);
        $('replayProgress').textContent = `${replayIndex + 1} de ${track.length} pontos históricos`;
      }, 450);
    }
    function checkSchedule() {
      if (!$('scheduleEnabled').checked) return;
      const now = new Date(),
        weekday = now.getDay(),
        time = now.toTimeString().slice(0, 5),
        outside =
          weekday === 0 ||
          weekday === 6 ||
          time < $('allowedFrom').value ||
          time > $('allowedTo').value;
      $('scheduleAlert').classList.toggle('hidden', !outside);
      if (outside)
        addEvent(
          'Uso fora do horário permitido',
          `Regra: ${$('allowedFrom').value} às ${$('allowedTo').value}`,
          true
        );
    }
    async function loadSchedule() {
      if (!vehicle?.id) return;
      const response = await fetch(`/api/vehicles/${vehicle.id}/schedule`),
        data = await response.json();
      if (data.schedule) {
        $('scheduleEnabled').checked = data.schedule.enabled;
        $('allowedFrom').value = data.schedule.from;
        $('allowedTo').value = data.schedule.to;
      }
    }
    async function saveSchedule() {
      if (!vehicle?.id) return toast('Selecione um veículo.');
      const response = await fetch(`/api/vehicles/${vehicle.id}/schedule`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: $('scheduleEnabled').checked,
            days: [1, 2, 3, 4, 5],
            from: $('allowedFrom').value,
            to: $('allowedTo').value,
            timezone: 'America/Sao_Paulo'
          })
        }),
        data = await response.json();
      if (!response.ok) return toast(data.error);
      toast('Horário autorizado salvo para este veículo.');
      checkSchedule();
    }
    function renderPosition(p) {
      if (replayTimer || !$('replayBadge').classList.contains('hidden')) stopTripReplay();
      const previous = positions.at(-1),
        segment = measuredLiveSegment(previous, p);
      confirmedMeters += segment.distance;
      movingMs += segment.moving;
      stoppedMs += segment.stopped;
      positions.push(p);
      layers.confirmed.clearLayers();
      layers.rebuilt.clearLayers();
      layers.alternatives.clearLayers();
      const displayPosition = projectPositionToRoute(p),
        previousDisplay = visualVehiclePosition;
      visualVehiclePosition = displayPosition;
      const ll = [displayPosition.latitude, displayPosition.longitude],
        presentation = accuracyPresentation(p.accuracy);
      if (!vehicleMarker)
        vehicleMarker = L.marker(ll, { icon })
          .addTo(map)
          .bindPopup(
            `<b>Meu veículo</b><br>${escapeHtml(vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Veículo selecionado')}<br>${escapeHtml(vehicle?.plate || '')}<br><small>${presentation.label}${displayPosition.visualSnapped ? ' · visual alinhado à rota' : ''}</small>`
          );
      navigation.interpolator.move(vehicleMarker, previousDisplay, displayPosition);
      vehicle3DLayer?.move(previousDisplay, displayPosition);
      syncVehicleMarkerFallback();
      if (Number.isFinite(p.heading) && (p.speed || 0) > 0.8) {
        vehicleMarker.setHeading?.(p.heading);
        if (document.body.classList.contains('map-3d-active')) map.setHeading?.(p.heading);
      }
      if (accuracyCircle) {
        map.removeLayer(accuracyCircle);
        accuracyCircle = null;
      }
      $('latitude').textContent = p.latitude.toFixed(6);
      $('longitude').textContent = p.longitude.toFixed(6);
      $('accuracy').textContent = `${br(p.accuracy)} m`;
      $('accuracyClass').textContent = accuracyLabel(p.accuracy);
      const kmh = Math.max(0, p.speed || 0) * 3.6;
      navigation.update(p, kmh, confirmedMeters + rebuiltMeters);
      loadRoadEvents(p);
      $('speed').textContent = br(kmh);
      $('heading').textContent = p.heading == null ? 'Indisponível' : `${br(p.heading, 0)}°`;
      $('dataSource').className = 'badge online';
      $('dataSource').textContent =
        p.source === 'simulation'
          ? 'Dados simulados'
          : displayPosition.visualSnapped
            ? 'GPS autorizado · alinhado à rota'
            : 'GPS autorizado';
      const hud = document.querySelector('.vehicle-hud');
      if (hud) {
        hud.querySelector('.vehicle-hud__status').textContent =
          Date.now() - p.timestamp < 120000 ? '● AO VIVO' : 'ÚLTIMA POSIÇÃO';
        hud.querySelector('.vehicle-hud__meta strong').textContent = `${br(kmh, 0)} km/h`;
        hud.querySelector('.vehicle-hud__meta span').textContent =
          kmh > 3 ? 'Em movimento' : 'Parado';
      }
      speeds.push(kmh);
      lastTimestamp = p.timestamp;
      updateStats();
      checkSchedule();
      if (pendingGap && !p.capturedOffline) {
        reconstructGap(pendingGap, p);
        pendingGap = null;
      }
    }
    function updateStats() {
      const total = confirmedMeters + rebuiltMeters;
      $('confirmedDistance').textContent = formatDistance(confirmedMeters);
      $('rebuiltDistance').textContent = formatDistance(rebuiltMeters);
      $('totalDistance').textContent = formatDistance(total);
      $('confirmedDuration').textContent = formatDuration((movingMs + stoppedMs) / 1000);
      $('offlineTime').textContent = formatDuration(offlineMs / 1000);
      const planned = plannedRoutes[selectedRoute]?.distance;
      $('routeDelta').textContent = planned ? `${br((total - planned) / 1000, 2)} km` : '—';
      updateConsumption();
      updateTimeline();
    }
    function updateTimeline() {
      const end = tripEnd || lastTimestamp || Date.now(),
        duration = tripStart ? end - tripStart : 0;
      $('tripDuration').textContent = formatDuration(duration / 1000);
      $('movingTime').textContent = formatDuration(movingMs / 1000);
      $('stoppedTime').textContent = formatDuration(stoppedMs / 1000);
      const avg = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0,
        max = Math.max(0, ...speeds);
      $('speedStats').textContent = `${br(avg)} / ${br(max)} km/h`;
      renderTimelineEvents();
    }
    function updateConsumption() {
      if (!vehicle) return;
      const distanceMeters =
          plannedRoutes[selectedRoute]?.distance || confirmedMeters + rebuiltMeters,
        urbanShare = 0.55,
        totalKm = distanceMeters / 1000,
        urbanKm = totalKm * urbanShare,
        roadKm = totalKm - urbanKm,
        urbanLiters = urbanKm / vehicle.city,
        roadLiters = roadKm / vehicle.road,
        idleLiters = (stoppedMs / 3600000) * 0.8,
        base = urbanLiters + roadLiters + idleLiters,
        min = base * 0.92,
        max = base * 1.18,
        price = fuelPricePreference?.pricePerLiter,
        pctMin = vehicle.tank ? (min / vehicle.tank) * 100 : 0,
        pctMax = vehicle.tank ? (max / vehicle.tank) * 100 : 0;
      $('fuelMin').textContent = br(min, 2);
      $('fuelMax').textContent = br(max, 2);
      $('fuelCostLine').textContent = price
        ? `R$ ${br(min * price, 2)}–${br(max * price, 2)} · preço ${fuelPricePreference.source === 'user-provided' ? 'informado' : fuelPricePreference.source}`
        : 'Custo indisponível sem preço informado';
      $('tankUse').style.width = `${Math.min(100, pctMax)}%`;
      $('tankText').textContent = `≈ ${br(pctMin)}% – ${br(pctMax)}% do tanque`;
      let details = $('fuelBreakdown');
      if (!details) {
        details = document.createElement('dl');
        details.id = 'fuelBreakdown';
        details.className = 'fuel-breakdown';
        document.querySelector('.consumption .range').insertAdjacentElement('afterend', details);
      }
      details.innerHTML = `<div><dt>Consumo urbano</dt><dd>${br(vehicle.city)} km/L</dd></div><div><dt>Consumo rodoviário</dt><dd>${br(vehicle.road)} km/L</dd></div><div><dt>Distância urbana estimada</dt><dd>${br(urbanKm, 2)} km</dd></div><div><dt>Distância rodoviária estimada</dt><dd>${br(roadKm, 2)} km</dd></div>`;
    }
    async function reconstructGap(gap, after) {
      offlineMs += gap.duration || 0;
      const lostLabel = gap.lostAt
          ? new Date(gap.lostAt).toLocaleTimeString('pt-BR')
          : 'horário desconhecido',
        backLabel = new Date(gap.reconnectedAt || Date.now()).toLocaleTimeString('pt-BR');
      if (gap.pointCount >= 3) {
        $('confidence').textContent = 'Confirmado por GPS local';
        addEvent(
          'Conexão recuperada',
          `Perda ${lostLabel}, retorno ${backLabel}, ${formatDuration((gap.duration || 0) / 1000)}. ${gap.pointCount} pontos GPS confirmados.`
        );
        updateStats();
        return;
      }
      const before = positions.filter(p => p.timestamp < (gap.lostAt || 0)).at(-1);
      if (!before) {
        $('confidence').textContent = 'Não foi possível reconstruir';
        return;
      }
      try {
        if (!tripId || !after) throw new Error();
        const res = await fetch(`/api/trips/${tripId}/reconstruct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              before,
              after,
              lostAt: gap.lostAt,
              reconnectedAt: gap.reconnectedAt,
              duration: gap.duration,
              vehicleType: vehicle?.type
            })
          }),
          data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const candidates = [data.probableRoute, ...data.alternatives],
          best = data.probableRoute,
          labels = {
            RECONSTRUCTED_HIGH: 'alta',
            RECONSTRUCTED_MEDIUM: 'média',
            RECONSTRUCTED_LOW: 'baixa',
            UNRECONSTRUCTABLE: 'insuficiente'
          };
        rebuiltMeters += best.distanceMeters;
        $('confidence').textContent =
          `Rota provável · ${best.confidence}% · confiança ${labels[best.classification]}`;
        addEvent(
          'Trecho reconstruído — rota provável',
          `Perda ${lostLabel}, retorno ${backLabel}. ${candidates.length} alternativa(s), confiança ${best.confidence}%. Resultado estimado, não confirmado.`,
          best.confidence < 50
        );
        updateStats();
      } catch {
        $('confidence').textContent = 'Não foi possível reconstruir';
        addEvent(
          'Lacuna sem reconstrução',
          `Perda ${lostLabel}, retorno ${backLabel}; evidência insuficiente.`,
          true
        );
      }
    }
    function startSimulation() {
      if (!sessionId) return toast('Crie uma sessão primeiro.');
      if (!plannedRoutes.length) return toast('Calcule uma rota antes de simular.');
      if (simulationTimer) {
        clearInterval(simulationTimer);
        simulationTimer = null;
        $('simulateBtn').textContent = 'Simular percurso';
        return;
      }
      if (!tripStart) startTrip();
      const geometry = plannedRoutes[selectedRoute].geometry;
      $('simulateBtn').textContent = 'Parar simulação';
      simulationTimer = setInterval(() => {
        const current = geometry[simIndex % geometry.length],
          next = geometry[(simIndex + 1) % geometry.length] || current,
          speed = 10 + Math.random() * 7,
          heading =
            ((Math.atan2(next[1] - current[1], next[0] - current[0]) * 180) / Math.PI + 360) % 360;
        socket.emit('position:update', {
          deviceId: 'dashboard-simulation',
          latitude: current[0],
          longitude: current[1],
          accuracy: 7 + Math.random() * 5,
          speed,
          heading,
          altitude: null,
          timestamp: Date.now(),
          source: 'simulation',
          sequence: ++simulationSequence
        });
        simIndex++;
        if (simIndex >= geometry.length) {
          clearInterval(simulationTimer);
          simulationTimer = null;
          $('simulateBtn').textContent = 'Simular percurso';
        }
      }, 700);
    }
    function ensureSimulationControls() {
      if ($('simulationScenarios')) return;
      const box = document.createElement('div');
      box.id = 'simulationScenarios';
      box.className = 'simulation-scenarios';
      box.innerHTML =
        '<button id="simulateOfflineBtn" class="secondary">Testar offline</button><button id="simulateGeofenceBtn" class="secondary">Testar saída</button><button id="simulateScheduleBtn" class="secondary">Testar horário</button>';
      const side = document.querySelector('.map-side-panel');
      side
        ? side.append(box)
        : document.querySelector('.map-legend').insertAdjacentElement('afterend', box);
      $('simulateOfflineBtn').onclick = simulateOfflineScenario;
      $('simulateGeofenceBtn').onclick = simulateGeofenceExit;
      $('simulateScheduleBtn').onclick = simulateOutsideSchedule;
    }
    async function simulateOfflineScenario() {
      if (!sessionId || !plannedRoutes.length) return toast('Crie a sessão e calcule uma rota.');
      const geometry = plannedRoutes[selectedRoute].geometry,
        step = Math.max(1, Math.floor(geometry.length / 5)),
        now = Date.now(),
        points = Array.from({ length: 5 }, (_, index) => {
          const point = geometry[Math.min(geometry.length - 1, index * step)];
          return {
            latitude: point[0],
            longitude: point[1],
            accuracy: 10,
            speed: 10,
            heading: 0,
            timestamp: now + index * 15000,
            source: 'simulation',
            sequence: now * 1000 + index
          };
        }),
        response = await fetch('/api/simulations/offline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, points, lostAt: now, reconnectedAt: now + 60000 })
        }),
        data = await response.json();
      toast(response.ok ? `${data.received} pontos de queda simulada sincronizados.` : data.error);
    }
    async function simulateGeofenceExit() {
      if (!sessionId || !vehicle?.id) return toast('Crie a sessão e selecione um veículo.');
      const response = await fetch(`/api/vehicles/${vehicle.id}/geofences`),
        data = await response.json(),
        fence = data.geofences?.[0];
      if (!fence) return toast('Crie uma área de cobertura primeiro.');
      const latitude = fence.centerLat + (fence.radiusMeters * 2.2) / 111320,
        send = () =>
          socket.emit('position:update', {
            deviceId: 'dashboard-simulation',
            latitude,
            longitude: fence.centerLng,
            accuracy: 6,
            speed: 8,
            heading: 0,
            timestamp: Date.now(),
            source: 'simulation',
            sequence: ++simulationSequence
          });
      send();
      setTimeout(send, 350);
      toast('Duas leituras externas enviadas para confirmar a saída.');
    }
    async function simulateOutsideSchedule() {
      if (!sessionId || !vehicle?.id) return toast('Crie uma sessão e selecione um veículo.');
      const now = new Date(),
        anotherDay = (now.getDay() + 1) % 7;
      await fetch(`/api/vehicles/${vehicle.id}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          days: [anotherDay],
          from: '07:00',
          to: '19:00',
          timezone: 'America/Sao_Paulo'
        })
      });
      const point = positions.at(-1) || origin || { latitude: -19.47, longitude: -42.54 };
      socket.emit('position:update', {
        deviceId: 'dashboard-simulation',
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: 8,
        speed: 8,
        heading: 0,
        timestamp: Date.now(),
        source: 'simulation',
        sequence: ++simulationSequence
      });
      toast('Movimentação fora do dia autorizado enviada para validar o alerta.');
    }
    function clearHistory() {
      positions = [];
      confirmedMeters = rebuiltMeters = movingMs = stoppedMs = offlineMs = 0;
      speeds = [];
      metricAnchorPosition = null;
      visualVehiclePosition = null;
      layers.confirmed.clearLayers();
      layers.rebuilt.clearLayers();
      layers.alternatives.clearLayers();
      vehicle3DLayer?.clear();
      if (vehicleMarker) {
        map.removeLayer(vehicleMarker);
        vehicleMarker = null;
      }
      syncVehicleMarkerFallback();
      if (accuracyCircle) {
        map.removeLayer(accuracyCircle);
        accuracyCircle = null;
      }
      socket.emit('history:clear');
      updateStats();
      toast('Histórico apagado.');
    }
    function closeSession() {
      if (!sessionId) return;
      socket.emit('session:close');
      sessionId = null;
      pairingId = null;
      clearInterval(pairingTimer);
      if (simulationTimer) clearInterval(simulationTimer);
      $('sessionActive').classList.add('hidden');
      $('sessionEmpty').classList.remove('hidden');
      $('clearBtn').disabled = $('closeBtn').disabled = true;
      toast('Sessão encerrada.');
    }
    async function ensureTwoFactorCard() {
      const layout = document.querySelector('#profileView .profile-layout');
      if (!layout || $('profileTwoFactorCard')) return;
      const card = document.createElement('section');
      card.id = 'profileTwoFactorCard';
      card.className = 'card';
      card.innerHTML =
        '<span class="eyebrow">VERIFICAÇÃO EM DUAS ETAPAS</span><h2>Proteção de ações críticas</h2><p id="twoFactorStatus">Consultando…</p><div id="twoFactorSetup" class="hidden"><p>Adicione a chave ao seu aplicativo autenticador e guarde os códigos de recuperação fora deste dispositivo.</p><code id="twoFactorSecret"></code><pre id="twoFactorRecovery"></pre><label class="field">Código de 6 dígitos<input id="twoFactorCode" inputmode="numeric" maxlength="17" autocomplete="one-time-code"></label><button id="enableTwoFactor" type="button" class="wide">Confirmar e ativar</button></div><button id="setupTwoFactor" type="button" class="secondary wide">Configurar 2FA</button>';
      layout.insertBefore(card, layout.querySelector('.privacy-card'));
      let csrf = null;
      const securityApi = async (path, { method = 'GET', body } = {}) => {
        if (method !== 'GET' && !csrf) {
          const tokenResponse = await fetch('/api/auth/csrf'),
            tokenData = await tokenResponse.json();
          if (!tokenResponse.ok) throw new Error(tokenData.error);
          csrf = tokenData.token;
        }
        const response = await fetch(path, {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...(csrf ? { 'X-CSRF-Token': csrf } : {})
            },
            body: body ? JSON.stringify(body) : undefined
          }),
          data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      };
      try {
        const status = await securityApi('/api/security/2fa/status');
        $('twoFactorStatus').textContent = status.twoFactor.enabled
          ? '2FA ativo nesta conta.'
          : status.twoFactor.required
            ? '2FA obrigatório para seu perfil administrativo.'
            : '2FA ainda não configurado.';
        $('setupTwoFactor').textContent = status.twoFactor.enabled ? '2FA ativo' : 'Configurar 2FA';
        $('setupTwoFactor').disabled = status.twoFactor.enabled;
      } catch (error) {
        $('twoFactorStatus').textContent = error.message;
      }
      $('setupTwoFactor').onclick = async () => {
        try {
          const data = await securityApi('/api/security/2fa/setup', { method: 'POST', body: {} });
          $('twoFactorSecret').textContent = data.setup.secret;
          $('twoFactorRecovery').textContent = data.setup.recoveryCodes.join('\n');
          $('twoFactorSetup').classList.remove('hidden');
          $('setupTwoFactor').classList.add('hidden');
        } catch (error) {
          toast(error.message);
        }
      };
      $('enableTwoFactor').onclick = async () => {
        try {
          await securityApi('/api/security/2fa/enable', {
            method: 'POST',
            body: { code: $('twoFactorCode').value }
          });
          $('twoFactorSetup').classList.add('hidden');
          $('twoFactorStatus').textContent = '2FA ativo nesta conta.';
          toast('Verificação em duas etapas ativada.');
        } catch (error) {
          toast(error.message);
        }
      };
    }
    async function ensureNotificationPreferencesCard() {
      const layout = document.querySelector('#profileView .profile-layout');
      if (!layout || $('profileNotificationCard')) return;
      const labels = {
          VEHICLE_OFFLINE: 'Veículo offline',
          VEHICLE_MOVING: 'Veículo em movimento',
          GEOFENCE: 'Entrada e saída de áreas',
          SPEED: 'Excesso de velocidade',
          NEARBY_REPORT: 'Ocorrências próximas',
          CONVERSATION_REQUEST: 'Solicitações de conversa',
          COMMENT_REPLY: 'Respostas a comentários',
          FUEL_PRICE: 'Preços de combustível',
          PARTNER_BENEFIT: 'Benefícios de parceiros'
        },
        card = document.createElement('section');
      card.id = 'profileNotificationCard';
      card.className = 'card';
      card.innerHTML =
        '<span class="eyebrow">NOTIFICAÇÕES</span><h2>Preferências de alertas</h2><p>Escolha quais eventos aparecem na caixa interna. Push externo depende da configuração do aplicativo.</p><div id="notificationPreferenceList" class="notification-preference-list"><small>Carregando…</small></div>';
      layout.insertBefore(card, layout.querySelector('.privacy-card'));
      try {
        const response = await fetch('/api/platform/notification-preferences'),
          data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const host = $('notificationPreferenceList');
        host.replaceChildren();
        for (const preference of data.preferences) {
          const row = document.createElement('label');
          row.className = 'toggle-row';
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = preference.enabled;
          input.onchange = async () => {
            input.disabled = true;
            try {
              const tokenResponse = await fetch('/api/auth/csrf'),
                tokenData = await tokenResponse.json(),
                update = await fetch(`/api/platform/notification-preferences/${preference.type}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tokenData.token },
                  body: JSON.stringify({ enabled: input.checked })
                }),
                payload = await update.json();
              if (!update.ok) throw new Error(payload.error);
              toast('Preferência atualizada.');
            } catch (error) {
              input.checked = !input.checked;
              toast(error.message);
            } finally {
              input.disabled = false;
            }
          };
          row.append(
            input,
            document.createTextNode(` ${labels[preference.type] || preference.type}`)
          );
          host.append(row);
        }
      } catch (error) {
        $('notificationPreferenceList').textContent = error.message;
      }
    }
    async function ensureSpeedRulePanel() {
      const page = document.querySelector('#vehiclesView .page-content');
      if (!page || $('speedRulePanel')) return;
      const card = document.createElement('section');
      card.id = 'speedRulePanel';
      card.className = 'card';
      card.innerHTML =
        '<div class="section-head"><div><span class="eyebrow">SEGURANÇA VIÁRIA</span><h2>Alerta de velocidade</h2></div><label class="toggle-row"><input id="speedRuleEnabled" type="checkbox"> Ativo</label></div><p>O alerta orienta a reduzir a velocidade e respeitar a sinalização. Não substitui o limite da via.</p><label class="field">Limite configurado (km/h)<input id="speedRuleMaximum" type="number" min="20" max="200" value="80"></label><button id="saveSpeedRule" type="button" class="secondary wide">Salvar alerta</button>';
      page.append(card);
      if (vehicle?.id) {
        try {
          const response = await fetch(`/api/vehicles/${vehicle.id}/speed-rule`),
            data = await response.json();
          if (data.rule) {
            $('speedRuleEnabled').checked = data.rule.enabled;
            $('speedRuleMaximum').value = data.rule.maximumKmh;
          }
        } catch {}
      }
      $('saveSpeedRule').onclick = async () => {
        if (!vehicle?.id) return toast('Selecione um veículo.');
        try {
          const csrfResponse = await fetch('/api/auth/csrf'),
            csrfData = await csrfResponse.json(),
            response = await fetch(`/api/vehicles/${vehicle.id}/speed-rule`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfData.token },
              body: JSON.stringify({
                enabled: $('speedRuleEnabled').checked,
                maximumKmh: Number($('speedRuleMaximum').value)
              })
            }),
            data = await response.json();
          if (!response.ok) throw new Error(data.error);
          toast('Alerta de velocidade salvo.');
        } catch (error) {
          toast(error.message);
        }
      };
    }
    document.querySelectorAll('.nav-pill').forEach(
      b =>
        (b.onclick = () => {
          document
            .querySelectorAll('.nav-pill')
            .forEach(x => x.classList.toggle('active', x === b));
          document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
          $(`${b.dataset.view}View`).classList.add('active');
          if (b.dataset.view === 'tracking') setTimeout(() => map.invalidateSize(), 50);
          if (b.dataset.view === 'profile') {
            ensureFinesCard();
            ensureTwoFactorCard();
            ensureNotificationPreferencesCard();
            loadProfile();
          }
          if (b.dataset.view === 'vehicles') {
            ensureSpeedRulePanel();
            loadVehicles().then(loadGeofences);
          }
          if (b.dataset.view === 'timeline') {
            loadTripHistory();
            loadSchedule();
          }
        })
    );
    window.addEventListener('rastreon:focus-place', event => {
      const place = event.detail || {};
      if (Number.isFinite(Number(place.latitude)) && Number.isFinite(Number(place.longitude)))
        setTimeout(() => {
          map.setView([Number(place.latitude), Number(place.longitude)], 17);
          map.invalidateSize();
        }, 60);
    });
    window.addEventListener('rastreon:community-map', event => {
      layers.community.clearLayers();
      const payload = event.detail || {},
        icon = symbol =>
          L.divIcon({
            className: 'map-symbol-marker',
            html: `<svg aria-hidden="true"><use href="/images/map-icons.svg#${symbol}"></use></svg>`,
            iconSize: [34, 34],
            iconAnchor: [17, 28],
            popupAnchor: [0, -26]
          });
      for (const station of payload.stations || []) {
        if (
          !Number.isFinite(Number(station.latitude)) ||
          !Number.isFinite(Number(station.longitude))
        )
          continue;
        L.marker([station.latitude, station.longitude], { icon: icon('fuel') })
          .bindPopup(
            `<strong>${escapeHtml(station.name)}</strong><br>${escapeHtml(station.address || 'Posto cadastrado')}<br><small>Fonte: ${escapeHtml(station.source || 'RASTREON')}</small>`
          )
          .addTo(layers.community);
      }
      for (const report of payload.reports || []) {
        if (!Number.isFinite(Number(report.latitude)) || !Number.isFinite(Number(report.longitude)))
          continue;
        const symbols = {
          ACCIDENT: 'accident',
          BLOCKAGE: 'blockage',
          ROADWORK: 'roadwork',
          FLOOD: 'flood',
          MOBILE_CAMERA: 'camera',
          TRAFFIC: 'traffic-light'
        };
        L.marker([report.latitude, report.longitude], {
          icon: icon(symbols[report.category] || 'hazard')
        })
          .bindPopup(
            `<strong>${escapeHtml(report.category.replaceAll('_', ' '))}</strong><br>${escapeHtml(report.description)}<br><small>Fonte: Comunidade RASTREON · expira ${new Date(report.expiresAt).toLocaleString('pt-BR')}</small>`
          )
          .addTo(layers.community);
      }
    });
    bindAddressAutocomplete('originInput', 'originResults', 'origin');
    bindAddressAutocomplete('destinationInput', 'destinationResults', 'destination');
    $('useMyLocationBtn').onclick = () => currentLocation({ setAsOrigin: true, center: true });
    $('locateMeBtn').onclick = () => currentLocation({ center: true });
    $('startNavigationBtn').onclick = toggleDailyNavigation;
    $('addStopBtn').onclick = addStop;
    $('originMapBtn').onclick = () => {
      pickMode = 'origin';
      $('mapPickHint').classList.remove('hidden');
    };
    $('destinationMapBtn').onclick = () => {
      pickMode = 'destination';
      $('mapPickHint').classList.remove('hidden');
    };
    map.on('click', async e => {
      if (!pickMode) return;
      let label = 'Local escolhido no mapa';
      try {
        const response = await fetch(
            `/api/reverse-geocode?lat=${e.latlng.lat}&lng=${e.latlng.lng}`
          ),
          place = await response.json();
        if (response.ok) label = place.label;
      } catch {}
      setPoint(pickMode, { latitude: e.latlng.lat, longitude: e.latlng.lng }, label);
      pickMode = null;
      $('mapPickHint').classList.add('hidden');
    });
    $('calculateBtn').onclick = calculateRoute;
    $('editVehicleBtn').onclick = () => openVehicleForm(vehicle);
    $('newVehicleBtn').onclick = () => openVehicleForm();
    $('closeVehicle').onclick = () => {
      $('vehicleDialog').close();
      editingVehicleId = null;
    };
    $('referenceModel').onchange = e => applyModel(models.find(m => m.id === e.target.value));
    $('vehicleForm').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await saveVehicle();
      } catch (error) {
        toast(error.message);
      }
    });
    $('createBtn').onclick = createSession;
    $('startTripBtn').onclick = startTrip;
    $('simulateBtn').onclick = startSimulation;
    $('clearBtn').onclick = clearHistory;
    $('closeBtn').onclick = closeSession;
    $('centerBtn').onclick = () =>
      vehicleMarker
        ? map.setView(
            vehicleMarker.getLatLng(),
            accuracyPresentation(positions.at(-1)?.accuracy).zoom
          )
        : userPosition
          ? map.setView(
              [userPosition.latitude, userPosition.longitude],
              accuracyPresentation(userPosition.accuracy).zoom
            )
          : plannedRoutes.length &&
            map.fitBounds(L.latLngBounds(plannedRoutes[selectedRoute].geometry));
    $('copyBtn').onclick = async () => {
      await navigator.clipboard.writeText(mobileUrl);
      toast('Link copiado.');
    };
    $('saveSchedule').onclick = saveSchedule;
    $('applyFilter').onclick = () => loadTripHistory();
    $('connectPhoneBtn').onclick = connectSelectedPhone;
    $('saveRanking').onclick = saveRankingPreference;
    $('saveFuelPrice').onclick = saveFuelPrice;
    $('replayTripBtn').onclick = playTripHistory;
    $('stopReplayBtn').onclick = () => stopTripReplay();
    $('exportHistoryBtn').onclick = () => {
      if (!historyTrip) return toast('Selecione uma viagem para exportar.');
      const report = {
          exportedAt: new Date().toISOString(),
          trip: {
            id: historyTrip.id,
            startedAt: historyTrip.startedAt,
            endedAt: historyTrip.endedAt,
            comparison: historyTrip.comparison,
            interruptions: historyTrip.interruptions,
            actualTrack: historyTrip.actualTrack
          }
        },
        blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
        url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `rastreon-viagem-${historyTrip.id}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $('changePasswordBtn').onclick = changePassword;
    $('exportDataBtn').onclick = exportPrivacyData;
    $('deleteAccountBtn').onclick = deletePrivacyAccount;
    $('logoutBtn').onclick = async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      location.replace('/login.html');
    };
    socket.on('connect', () => {
      $('panelStatus').className = 'badge online';
      $('panelStatus').textContent = '● Painel conectado';
      if (sessionId) socket.emit('session:join', { sessionId, role: 'dashboard' });
    });
    socket.on('disconnect', () => {
      $('panelStatus').className = 'badge offline';
      $('panelStatus').textContent = '● Painel offline';
    });
    socket.on('session:status', s => {
      if (!$('phoneStatus')) return;
      $('phoneStatus').className = `badge ${s.phoneConnected ? 'online' : 'offline'}`;
      $('phoneStatus').textContent = s.phoneConnected ? '● Celular conectado' : '● Desconectado';
    });
    socket.on('position:update', renderPosition);
    socket.on('offline:recovered', gap => {
      if (gap.pointCount >= 3) reconstructGap(gap, null);
      else pendingGap = gap;
    });
    socket.on('history:cleared', () => {
      if (positions.length) clearHistory();
    });
    socket.on('pairing:scanned', () => {
      $('phoneStatus').textContent = '● QR lido · aguardando confirmação';
      const status = $('trackerPairDialog')?.querySelector('strong');
      if (status) status.textContent = 'QR lido · confirme no celular';
    });
    socket.on('device:paired', () => {
      clearInterval(pairingTimer);
      $('phoneStatus').className = 'badge online';
      $('phoneStatus').textContent = '● Celular sincronizado';
      const status = $('trackerPairDialog')?.querySelector('strong'),
        note = $('trackerPairDialog')?.querySelector('small');
      if (status) status.textContent = 'Celular conectado';
      if (note) note.textContent = 'A localização autorizada será exibida ao vivo no mapa.';
      loadDevices();
      toast('Celular vinculado ao veículo.');
    });
    socket.on('device:revoked', () => {
      $('phoneStatus').className = 'badge offline';
      $('phoneStatus').textContent = '● Celular desvinculado';
      loadDevices();
    });
    socket.on('alert:new', alert => {
      toast(`ALERTA: ${alert.title}`);
      const detail =
        alert.type === 'OUTSIDE_ALLOWED_TIME'
          ? `Horário configurado: ${alert.details.configured}`
          : `Área: ${alert.details.geofenceName || 'configurada'} · distância ${formatDistance(alert.details.distanceMeters || 0)}`;
      addEvent(
        alert.title,
        `${detail} · precisão ${br(alert.details.accuracy)} m`,
        alert.severity !== 'info',
        alert.occurredAt
      );
    });
    socket.on('geofence:pending', event =>
      toast(`Possível saída de ${event.name} — aguardando confirmação (${br(event.accuracy)} m)`)
    );
    socket.on('position:update', position => {
      if (position?.source === 'traccar') {
        $('dataSource').textContent = 'Hardware real · Traccar';
        $('dataSource').className = 'badge online';
      }
    });
    ensureSimulationControls();
    ensureTrackerPairing();
    ensureWeatherCard();
    ensureMapControls();
    initializeMapMode();
    initializeTraffic();
    ensureQuickRouteSearch();
    configureHistoryFilters();
    window.RastreonCommunity?.init();
    loadAccount();
    loadVehicles().catch(() => toast('Não foi possível carregar os modelos de referência.'));
    requestInitialLocation();
  })
  .catch(error => {
    const target = document.getElementById('map');
    if (target)
      target.innerHTML = `<div class="map-load-error"><strong>Mapa indisponível</strong><span>${String(error?.message || 'Não foi possível iniciar o mapa.')}</span></div>`;
  });
