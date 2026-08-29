(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const escapeHtml = value =>
    String(value ?? '').replace(
      /[&<>"']/g,
      char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
    );
  const healthTypes = [
    ['LOW_FUEL', 'Combustível baixo', 'warning'],
    ['BATTERY_WARNING', 'Bateria', 'warning'],
    ['ELECTRICAL_FAULT', 'Falha elétrica', 'critical'],
    ['ABS_WARNING', 'Aviso ABS', 'warning'],
    ['CHECK_ENGINE', 'Aviso do motor', 'critical'],
    ['ENGINE_TEMPERATURE', 'Temperatura elevada', 'critical'],
    ['OIL_PRESSURE', 'Pressão de óleo', 'critical'],
    ['BRAKE_WARNING', 'Aviso de freio', 'critical'],
    ['TIRE_PRESSURE', 'Pressão dos pneus', 'warning']
  ];
  const helpByPage = {
    tracking: [
      ['Como rastrear meu carro?', 'Crie uma sessão, conecte o celular e inicie a viagem.'],
      ['Por que meu veículo está offline?', 'Confira a conexão do celular usado no veículo.'],
      [
        'O que significa posição estimada?',
        'É um trecho reconstruído quando o GPS ficou temporariamente indisponível.'
      ]
    ],
    timeline: [
      ['Como consultar uma viagem?', 'Escolha o período e toque em Aplicar.'],
      [
        'Saúde e segurança são iguais?',
        'Não. Eventos mecânicos simulados ficam separados dos alertas de segurança.'
      ]
    ],
    vehicles: [
      [
        'Como adicionar um veículo?',
        'Toque em Adicionar veículo e preencha apenas os dados essenciais.'
      ],
      ['Posso editar depois?', 'Sim. Use a ação Editar no veículo escolhido.']
    ],
    profile: [
      ['Onde altero meus dados?', 'As opções da conta ficam reunidas nesta página.'],
      ['Quem vê meus veículos?', 'Somente pessoas autorizadas na sua conta.']
    ],
    plans: [
      ['Isto gera cobrança?', 'Não. Os planos apresentados nesta versão são demonstrativos.']
    ],
    fence: [
      ['O que é um cerco?', 'É uma área protegida. O Rastreon avisa quando o veículo sair.'],
      ['Como proteger minha casa?', 'Busque o endereço, escolha o tamanho e ative a proteção.'],
      ['Posso criar mais de um?', 'Sim. Você pode proteger locais diferentes.'],
      ['Como desativar temporariamente?', 'Abra o local protegido e altere seu estado.'],
      [
        'Por que recebi um alerta de saída?',
        'O veículo teve leituras confirmadas fora da área protegida.'
      ]
    ],
    developer: [
      ['Os alertas são reais?', 'Não. Todo evento deste laboratório tem fonte SIMULATION.'],
      ['O celular lê a ECU?', 'Não. Dados reais exigem integração OBD, CAN ou API compatível.']
    ]
  };
  const tours = {
    tracking: [
      ['.map-column', 'Este é o mapa. Ele permanece como foco do rastreamento.'],
      ['#vehicleSheet', 'Toque no resumo para ver destino, distância e saúde.'],
      ['#mapControls', 'Use aqui navegação, visão 3D, QR Code, trânsito e localização.']
    ],
    timeline: [
      ['#eventTimeline', 'Aqui aparecem os acontecimentos da viagem em ordem.'],
      ['#dateFilter', 'Use o período para encontrar uma atividade.']
    ],
    vehicles: [
      ['#vehiclesGrid', 'Aqui ficam os veículos vinculados à sua conta.'],
      ['#newVehicleBtn', 'Use esta ação para adicionar um veículo.']
    ],
    profile: [
      ['.profile-card', 'Este é o resumo da sua conta.'],
      ['#profileTrips', 'Suas atividades recentes aparecem aqui.']
    ],
    plans: [['.plans-grid', 'Compare os recursos demonstrativos sem realizar cobrança.']],
    fence: [
      ['#fenceSearch', 'Digite um endereço ou CEP aqui.'],
      ['#fenceSizes', 'Escolha uma área aproximada sem precisar pensar em metros.'],
      ['#activateFence', 'Confira a área no mapa e ative a proteção.']
    ],
    trip: [
      ['#originInput', 'Digite um endereço ou CEP de saída.'],
      ['#destinationInput', 'Escolha para onde você vai.'],
      ['#calculateBtn', 'Calcule a rota e confira apenas o resumo principal.']
    ],
    developer: [
      ['#healthOptions', 'Ative avisos simulados para testar a interface.'],
      ['.preset-row', 'Os cenários preparam combinações rapidamente.']
    ]
  };
  let currentPage = 'tracking';
  let tourIndex = 0;
  let selectedVehicleId = null;
  let healthSaveTimer = null;
  let poiRequest = null;
  let poiRefreshTimer = null;
  let poiRetryTimer = null;
  let activeRoute = [];
  let fencePoint = null;
  let fencePreview = null;
  let addressTimer = null;
  let arrivalPlace = null;
  let customPolygon = null;
  let polygonPreview = null;
  const poiPreferenceKey = 'rastreon-map-poi-categories';
  const poiCategories = [
    ['fuel', 'Postos', 'fuel', true],
    ['hospital', 'Hospitais', 'hospital', true],
    ['charge', 'Postos elétricos', 'fuel'],
    ['parking', 'Estacionamentos', 'parking'],
    ['airport', 'Aeroportos', 'parking'],
    ['restaurant', 'Restaurantes e fast food', 'food'],
    ['cafe', 'Cafeterias e sorveterias', 'food'],
    ['bakery', 'Padarias', 'food'],
    ['bar', 'Bares', 'food'],
    ['pharmacy', 'Farmácias', 'hospital'],
    ['dentist', 'Dentistas', 'hospital'],
    ['veterinary', 'Veterinários', 'hospital'],
    ['supermarket', 'Mercados e atacados', 'shopping'],
    ['mechanic', 'Oficinas e mecânicas', 'mechanic'],
    ['school', 'Escolas', 'shopping'],
    ['university', 'Universidades', 'shopping'],
    ['library', 'Bibliotecas', 'shopping'],
    ['culture', 'Museus e galerias', 'shopping'],
    ['leisure', 'Parques e áreas verdes', 'parking'],
    ['tourism', 'Turismo e mirantes', 'parking'],
    ['camping', 'Campings', 'parking'],
    ['hotel', 'Hotéis e hospedagem', 'parking'],
    ['worship', 'Templos e igrejas', 'hospital'],
    ['police', 'Polícia', 'police'],
    ['fire_station', 'Corpo de Bombeiros', 'police']
  ];
  const essentialPoiCategories = new Set(
    poiCategories.filter(category => category[3]).map(category => category[0])
  );
  const defaultPoiCategories = [...essentialPoiCategories];
  const icon = name =>
    `<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><use href="/images/ui-icons.svg?v=20260827-3#${name}"></use></svg>`;

  function trackingMarkup() {
    return `<div id="vehicleHealthBadge" class="health-badge hidden"><button id="healthBadgeBtn" aria-label="Abrir avisos de saúde" aria-expanded="false">${icon('warning')}<b>1 aviso</b></button><div id="healthPopover" class="health-popover hidden"></div></div><aside id="arrivalPrompt" class="arrival-prompt hidden"><b id="arrivalTitle">Você chegou.</b><p>Ativar proteção?</p><div><button id="arrivalLater" class="secondary">Agora não</button><button id="arrivalActivate">Ativar</button></div></aside>
      <div id="poiMetadata" class="hidden" aria-hidden="true"><div class="poi-auto-categories">${poiCategories
        .map(x => `<span data-poi-category="${x[0]}">${x[1]}</span>`)
        .join('')}</div></div>
      <section id="vehicleSheet" class="vehicle-sheet minimized" aria-label="Resumo do veículo"><button id="sheetHandle" class="sheet-handle" aria-expanded="false"><span><strong id="sheetVehicleName">Meu veículo</strong><small id="sheetOnline">● Aguardando</small><small id="sheetCurrentAddress"></small></span><span><strong><span id="sheetSpeed">0</span> km/h</strong><small id="sheetUpdated">sem dados</small></span>${icon('chevron-up')}</button><div class="sheet-details"><div><span>Destino</span><strong id="sheetDestination">Não definido</strong></div><div><span>Chegada</span><strong id="sheetEta">—</strong></div><div><span>Distância</span><strong id="sheetDistance">—</strong></div><div><span>Saúde</span><strong id="sheetHealth">Normal</strong></div><button id="openTechnical" class="secondary wide">Ver detalhes da viagem</button></div></section>`;
  }

  function fenceMarkup() {
    return `<aside id="fencePanel" class="fence-simple hidden" aria-label="Criar cerco"><header><div><small>PROTEÇÃO</small><h2>Onde você quer proteger?</h2></div><button id="closeFence" class="icon-btn" aria-label="Fechar cerco">×</button></header><label class="field">Endereço ou CEP<input id="fenceSearch" autocomplete="postal-code" placeholder="Buscar endereço ou CEP"></label><div id="fenceResults" class="simple-results hidden"></div><button id="fenceMapPick" class="secondary wide">Escolher no mapa</button><div id="fenceChosen" class="chosen-place hidden"><span>Local escolhido</span><strong id="fenceAddress"></strong></div><label class="field">Nome<input id="fenceName" value="Casa" maxlength="80"></label><fieldset id="fenceSizes"><legend>Área</legend><label><input type="radio" name="fenceSize" value="150"><b>Pequena</b><small>perto do endereço</small></label><label><input type="radio" name="fenceSize" value="350" checked><b>Média</b><small>alguns quarteirões</small></label><label><input type="radio" name="fenceSize" value="1000"><b>Grande</b><small>região próxima</small></label></fieldset><details class="advanced-size"><summary>Opções avançadas</summary><label>Raio personalizado <input id="fenceCustomSize" type="range" min="50" max="3000" step="50" value="350"><output id="fenceSizeOutput">350 m</output></label><button id="drawCustomArea" type="button" class="secondary wide">Desenhar área personalizada</button></details><div class="saved-places"><b>Locais salvos</b><button data-save-place="home" class="secondary">Casa <span>Adicionar</span></button><button data-save-place="work" class="secondary">Trabalho <span>Adicionar</span></button></div><div id="fenceConfirmation" class="fence-confirm hidden"><span>Confirmar proteção</span><b id="fenceConfirmName"></b><small id="fenceConfirmDetail"></small><button id="confirmFence" class="wide">Confirmar e ativar</button></div><button id="activateFence" class="wide" disabled>Revisar proteção</button><section class="managed-fences"><b>Áreas protegidas</b><div id="managedFenceList"><small>Nenhuma área ativa.</small></div></section></aside>`;
  }

  function developerMarkup() {
    return `<section id="developerView" class="view"><div class="page-content developer-page"><div class="page-heading"><div><span class="eyebrow">LABORATÓRIO</span><h2>Saúde do veículo — Simulação</h2><p>Ferramentas de teste. Estes avisos não vêm da ECU, OBD ou CAN.</p></div><span class="simulation-label">SIMULAÇÃO</span></div><section class="card health-lab"><div class="preset-row" role="group" aria-label="Cenários"><button data-preset="normal" class="secondary">Veículo normal</button><button data-preset="fuel" class="secondary">Combustível baixo</button><button data-preset="electrical" class="secondary">Falha elétrica</button><button data-preset="engine" class="secondary">Falha no motor</button><button data-preset="multiple">Múltiplos alertas</button></div><label class="fuel-level">Nível estimado de combustível <input id="simFuelLevel" type="range" min="1" max="25" value="12"><output id="simFuelOutput">12%</output></label><div id="healthOptions" class="health-options">${healthTypes.map(([type, label]) => `<label><input type="checkbox" value="${type}"><span><b>${label}</b><small>Fonte: SIMULATION</small></span></label>`).join('')}</div><aside class="simulation-note"><strong>Dados de simulação</strong><p>O celular não diagnostica a central eletrônica. Dados reais dependerão de OBD, CAN ou integração compatível.</p></aside></section></div></section>`;
  }

  function setupStructure() {
    const mapCard = document.querySelector('.smart-map');
    const config = window.RASTROTACK_MAP_CONFIG || {};
    const devToolsEnabled =
      config.enableDevTools === true || new URLSearchParams(location.search).get('dev') === 'true';
    document.body.classList.toggle('dev-tools-enabled', devToolsEnabled);
    if (mapCard) {
      mapCard.insertAdjacentHTML('beforeend', trackingMarkup());
      const actions = mapCard.querySelector('.map-toolbar .actions');
      if (!byId('trafficBtn')) {
        const traffic = document.createElement('button');
        traffic.id = 'trafficBtn';
        traffic.className = 'secondary';
        traffic.type = 'button';
        traffic.textContent = 'Trânsito';
        traffic.setAttribute('aria-pressed', 'false');
        actions?.insertBefore(traffic, byId('locateMeBtn'));
      }
      if (!devToolsEnabled) {
        if (!byId('tripPlannerBtn')) {
          const trip = document.createElement('button');
          trip.id = 'tripPlannerBtn';
          trip.className = 'secondary';
          trip.textContent = 'Viagem';
          actions?.appendChild(trip);
        }
      } else {
        if (!byId('tripPlannerBtn')) {
          const trip = document.createElement('button');
          trip.id = 'tripPlannerBtn';
          trip.className = 'secondary';
          trip.textContent = 'Viagem';
          actions?.insertBefore(trip, byId('simulateBtn'));
        }
        if (window.matchMedia('(min-width:781px)').matches) {
          const sidePanel = document.createElement('aside');
          sidePanel.className = 'map-side-panel';
          sidePanel.setAttribute('aria-label', 'Ações do mapa');
          sidePanel.innerHTML =
            '<strong>Ferramentas</strong><small>Ações fora da área de navegação</small>';
          if (actions) sidePanel.append(actions);
          const scenarios = byId('simulationScenarios');
          if (scenarios) sidePanel.append(scenarios);
          mapCard.append(sidePanel);
          mapCard.classList.add('has-side-panel');
        }
      }
      mapCard.insertAdjacentHTML('beforeend', fenceMarkup());
    }
    const tripHelp = helpByPage.tracking;
    helpByPage.tracking = [
      [
        'Como criar uma viagem?',
        'Informe origem e destino, calcule a rota e toque em Iniciar viagem.'
      ],
      [
        'Posso usar apenas o CEP?',
        'Sim. Se faltar o número, o Rastreon pedirá somente esse complemento.'
      ],
      ['Como escolher no mapa?', 'Use o botão de mapa ao lado do campo.'],
      ['O que é rota estimada?', 'É uma previsão calculada sobre a malha viária.'],
      ['Por que a rota mudou?', 'Trânsito, desvios ou nova posição podem alterar a previsão.'],
      ...tripHelp.slice(1)
    ];
    helpByPage.trip = helpByPage.tracking;
    document.querySelector('#originInput')?.setAttribute('placeholder', 'Buscar endereço ou CEP');
    document
      .querySelector('#destinationInput')
      ?.setAttribute('placeholder', 'Buscar endereço ou CEP');
    const originLabel = byId('originInput')?.closest('label');
    if (originLabel?.firstChild) originLabel.firstChild.textContent = 'De onde você vai sair?';
    const destinationLabel = byId('destinationInput')?.closest('label');
    if (destinationLabel?.firstChild)
      destinationLabel.firstChild.textContent = 'Para onde você vai?';
    byId('calculateBtn').textContent = 'Calcular rota';
    byId('createBtn').textContent = 'Conectar celular para iniciar';
    byId('routeSummary')?.insertAdjacentHTML(
      'beforeend',
      '<div class="route-cost"><span>Custo estimado</span><strong id="routeCostSummary">—</strong></div><button id="routeDetailsBtn" class="text-btn" type="button">Ver detalhes</button>'
    );
  }

  function setPage(page) {
    currentPage = page;
    renderHelp();
    if (page === 'developer') {
      document
        .querySelectorAll('.view')
        .forEach(v => v.classList.toggle('active', v.id === 'developerView'));
      document
        .querySelectorAll('.nav-pill')
        .forEach(n => n.classList.toggle('active', n.dataset.view === page));
    }
    if (page === 'timeline') loadHealthTimeline();
    const key = `rastreon-tour-${page}`;
    if (!localStorage.getItem(key) && (tours[page] || helpByPage[page])) showTourWelcome(page);
  }

  async function loadHealthTimeline() {
    try {
      const response = await fetch('/api/vehicle-health'),
        data = await response.json();
      const timeline = byId('eventTimeline');
      if (!timeline || !data.events?.length) return;
      const existing = timeline.querySelector('.health-history');
      existing?.remove();
      const section = document.createElement('section');
      section.className = 'health-history';
      section.innerHTML = `<div class="step-label">Saúde do veículo</div>${data.events.map(event => `<div class="event-item"><b>${healthTypes.find(item => item[0] === event.type)?.[1] || event.type}</b><small>${new Date(event.detectedAt).toLocaleString('pt-BR')} · ${event.source}</small></div>`).join('')}`;
      timeline.appendChild(section);
    } catch (_) {}
  }

  async function searchAddress(query, targetId, onSelect) {
    const target = byId(targetId);
    if (query.trim().length < 3) {
      target.classList.add('hidden');
      return;
    }
    target.innerHTML = '<span class="searching">Buscando endereço…</span>';
    target.classList.remove('hidden');
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`),
        places = await response.json();
      if (!response.ok) throw new Error(places.error);
      target.innerHTML = '';
      for (const place of places.slice(0, 4)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = place.label;
        button.onclick = () => {
          target.classList.add('hidden');
          onSelect(place);
        };
        target.appendChild(button);
      }
      if (!target.children.length)
        target.innerHTML = '<span class="searching">Nenhum endereço encontrado.</span>';
    } catch (error) {
      target.replaceChildren();
      const message = document.createElement('span');
      message.className = 'searching';
      message.textContent = error.message || 'Não conseguimos buscar agora.';
      target.appendChild(message);
    }
  }

  function chooseFencePoint(point, label) {
    fencePoint = { latitude: Number(point.latitude), longitude: Number(point.longitude), label };
    byId('fenceAddress').textContent = label;
    byId('fenceChosen').classList.remove('hidden');
    byId('activateFence').disabled = false;
    const api = window.rastreonMap;
    if (!api) return;
    if (fencePreview) api.map.removeLayer(fencePreview);
    const radius = Number(
      document.querySelector('[name="fenceSize"]:checked')?.value || byId('fenceCustomSize').value
    );
    fencePreview = api.L.circle([fencePoint.latitude, fencePoint.longitude], {
      radius,
      color: '#ff5a0a',
      fillColor: '#ff5a0a',
      fillOpacity: 0.12,
      weight: 3
    })
      .addTo(api.map)
      .bindTooltip(`${byId('fenceName').value || 'Área'} · área protegida`)
      .openTooltip();
    api.map.fitBounds(fencePreview.getBounds(), { padding: [45, 45] });
  }

  async function reverseAddress(lat, lng) {
    const response = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`),
      data = await response.json();
    return response.ok ? data.label : 'Local escolhido no mapa';
  }

  async function activateFence() {
    if (!selectedVehicleId || !fencePoint) return;
    const radius = Number(
      document.querySelector('[name="fenceSize"]:checked')?.value || byId('fenceCustomSize').value
    );
    const payload = customPolygon
      ? {
          name: byId('fenceName').value || 'Área protegida',
          type: 'polygon',
          points: customPolygon,
          centerLat: fencePoint.latitude,
          centerLng: fencePoint.longitude,
          radiusMeters: radius,
          enabled: true
        }
      : {
          name: byId('fenceName').value || 'Área protegida',
          type: 'circle',
          centerLat: fencePoint.latitude,
          centerLng: fencePoint.longitude,
          radiusMeters: radius,
          enabled: true
        };
    const endpoint = customPolygon
      ? `/api/vehicles/${selectedVehicleId}/polygon-geofences`
      : `/api/vehicles/${selectedVehicleId}/geofences`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) return showNotice(data.error);
    showNotice(`${data.geofence.name} está protegida.`);
    byId('fenceConfirmation').classList.add('hidden');
    byId('activateFence').classList.remove('hidden');
    customPolygon = null;
    loadManagedFences();
  }

  function reviewFence() {
    if (!fencePoint) return;
    const size = customPolygon
      ? 'Área personalizada'
      : document.querySelector('[name="fenceSize"]:checked')?.closest('label')?.querySelector('b')
          ?.textContent || `${byId('fenceCustomSize').value} m`;
    byId('fenceConfirmName').textContent = byId('fenceName').value || 'Área protegida';
    byId('fenceConfirmDetail').textContent = `${fencePoint.label} · ${size}`;
    byId('fenceConfirmation').classList.remove('hidden');
    byId('activateFence').classList.add('hidden');
  }

  async function loadManagedFences() {
    if (!selectedVehicleId) return;
    try {
      const data = await fetch(`/api/vehicles/${selectedVehicleId}/geofences`).then(r => r.json()),
        target = byId('managedFenceList');
      target.replaceChildren();
      for (const fence of data.geofences || []) {
        const row = document.createElement('div'),
          summary = document.createElement('span'),
          name = document.createElement('b'),
          state = document.createElement('small'),
          actions = document.createElement('div'),
          toggle = document.createElement('button'),
          remove = document.createElement('button');
        name.textContent = fence.name;
        state.textContent = fence.enabled ? 'Proteção ativa' : 'Pausada';
        summary.append(name, state);
        toggle.className = 'secondary';
        toggle.textContent = fence.enabled ? 'Pausar' : 'Ativar';
        remove.className = 'danger';
        remove.textContent = 'Excluir';
        actions.append(toggle, remove);
        row.append(summary, actions);
        toggle.onclick = async () => {
          await fetch(`/api/geofences/${fence.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !fence.enabled })
          });
          loadManagedFences();
        };
        remove.onclick = async () => {
          await fetch(`/api/geofences/${fence.id}`, { method: 'DELETE' });
          loadManagedFences();
        };
        target.appendChild(row);
      }
      if (!target.children.length) {
        const empty = document.createElement('small');
        empty.textContent = 'Nenhuma área ativa.';
        target.appendChild(empty);
      }
    } catch (_) {}
  }

  function drawCustomArea() {
    const api = window.rastreonMap;
    if (!api) return;
    customPolygon = [];
    if (polygonPreview) api.map.removeLayer(polygonPreview);
    byId('fencePanel').classList.add('picking');
    showNotice('Toque em pelo menos 3 pontos. Toque em “Concluir desenho” quando terminar.');
    byId('drawCustomArea').textContent = 'Concluir desenho';
    const handler = event => {
      customPolygon.push({ latitude: event.latlng.lat, longitude: event.latlng.lng });
      if (polygonPreview) api.map.removeLayer(polygonPreview);
      polygonPreview = api.L.polygon(
        customPolygon.map(p => [p.latitude, p.longitude]),
        { color: '#ff5a0a', fillOpacity: 0.14 }
      ).addTo(api.map);
    };
    api.map.on('click', handler);
    byId('drawCustomArea').onclick = () => {
      api.map.off('click', handler);
      byId('fencePanel').classList.remove('picking');
      byId('drawCustomArea').textContent = 'Desenhar área personalizada';
      byId('drawCustomArea').onclick = drawCustomArea;
      if (customPolygon.length < 3) {
        customPolygon = null;
        showNotice('Marque pelo menos 3 pontos.');
        return;
      }
      const latitude = customPolygon.reduce((n, p) => n + p.latitude, 0) / customPolygon.length,
        longitude = customPolygon.reduce((n, p) => n + p.longitude, 0) / customPolygon.length;
      chooseFencePoint({ latitude, longitude }, 'Área personalizada desenhada no mapa');
    };
  }

  async function activateArrivalFence() {
    if (!arrivalPlace || !selectedVehicleId) return;
    fencePoint = {
      latitude: arrivalPlace.latitude,
      longitude: arrivalPlace.longitude,
      label: arrivalPlace.address
    };
    byId('fenceName').value = arrivalPlace.label;
    document.querySelector('[name="fenceSize"][value="350"]').checked = true;
    await activateFence();
    byId('arrivalPrompt').classList.add('hidden');
  }

  function showNotice(message) {
    const toast = byId('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function requestNumberComplement(input) {
    input.closest('label').querySelector('.address-complement')?.remove();
    const box = document.createElement('div');
    box.className = 'address-complement';
    box.innerHTML =
      '<span>Encontramos o endereço. Qual é o número?</span><div><input inputmode="numeric" aria-label="Número do endereço"><button type="button">Confirmar</button></div>';
    box.querySelector('button').onclick = () => {
      const number = box.querySelector('input').value.trim();
      if (number) input.value = `${input.value}, nº ${number}`;
      box.remove();
    };
    input.closest('label').appendChild(box);
    box.querySelector('input').focus();
  }

  async function savePlace(key) {
    if (!fencePoint) return showNotice('Escolha primeiro um endereço.');
    const response = await fetch(`/api/saved-places/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: fencePoint.label,
        latitude: fencePoint.latitude,
        longitude: fencePoint.longitude
      })
    });
    if (response.ok) {
      showNotice(`${key === 'home' ? 'Casa' : 'Trabalho'} salvo.`);
      loadSavedPlaces();
    }
  }

  async function loadSavedPlaces() {
    try {
      const data = await fetch('/api/saved-places').then(r => r.json());
      for (const key of ['home', 'work']) {
        const button = document.querySelector(`[data-save-place="${key}"]`),
          place = (data.places || []).find(p => p.placeKey === key);
        if (!button) continue;
        button.querySelector('span').textContent = place ? 'Usar / remover' : 'Adicionar';
        button.onclick = () => {
          if (!place) return savePlace(key);
          chooseFencePoint(place, place.address);
          if (confirm(`Remover ${place.label} dos locais salvos?`))
            fetch(`/api/saved-places/${key}`, { method: 'DELETE' }).then(loadSavedPlaces);
        };
      }
    } catch (_) {}
  }

  function openFence() {
    const fencePanel = byId('fencePanel');
    if (!fencePanel) return;
    currentPage = 'fence';
    renderHelp();
    fencePanel.classList.remove('hidden');
    document.body.classList.remove('trip-planning', 'technical-open');
    if (!localStorage.getItem('rastreon-tour-fence')) showTourWelcome('fence');
    loadSavedPlaces();
    loadManagedFences();
  }

  function renderHelp() {
    const questions = helpByPage[currentPage] || helpByPage.tracking;
    byId('helpQuestions').innerHTML = questions
      .map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`)
      .join('');
  }

  function showTourWelcome(page) {
    const names = {
      tracking: 'Rastreamento',
      trip: 'Viagem Inteligente',
      fence: 'Cerco',
      timeline: 'Histórico',
      vehicles: 'Veículos',
      profile: 'Perfil',
      developer: 'Laboratório'
    };
    byId('tourTitle').textContent = `Conheça ${names[page] || 'esta página'}`;
    byId('tourWelcome').classList.remove('hidden');
  }

  function showTip(index) {
    const steps = tours[currentPage] || [];
    document.querySelectorAll('.tour-target').forEach(x => x.classList.remove('tour-target'));
    if (index >= steps.length) return finishTour();
    tourIndex = index;
    const [selector, text] = steps[index];
    const target = document.querySelector(selector);
    target?.classList.add('tour-target');
    const tip = byId('tourTip');
    byId('tourTipText').textContent = text;
    byId('tourProgress').textContent = `${index + 1} de ${steps.length}`;
    byId('tourNext').textContent = index === steps.length - 1 ? 'Concluir' : 'Próximo';
    tip.classList.remove('hidden');
    if (target) {
      const r = target.getBoundingClientRect();
      tip.style.left = `${Math.max(12, Math.min(innerWidth - 300, r.left))}px`;
      tip.style.top = `${Math.max(90, Math.min(innerHeight - 180, r.top + 16))}px`;
    }
  }

  function finishTour(dismissed = false) {
    byId('tourWelcome').classList.add('hidden');
    byId('tourTip').classList.add('hidden');
    document.querySelectorAll('.tour-target').forEach(x => x.classList.remove('tour-target'));
    localStorage.setItem(`rastreon-tour-${currentPage}`, dismissed ? 'dismissed' : 'completed');
    fetch(`/api/tour-preferences/${encodeURIComponent(currentPage)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !dismissed, dismissed })
    }).catch(() => {});
  }

  function selectedHealth() {
    return [...document.querySelectorAll('#healthOptions input:checked')].map(input =>
      healthTypes.find(x => x[0] === input.value)
    );
  }

  function renderHealth() {
    const selected = selectedHealth();
    const badge = byId('vehicleHealthBadge');
    badge.classList.toggle('hidden', !selected.length);
    byId('sheetHealth').textContent = selected.length
      ? `${selected.length} aviso${selected.length > 1 ? 's' : ''}`
      : 'Normal';
    if (!selected.length) return;
    badge.querySelector('b').textContent =
      `${selected.length} aviso${selected.length > 1 ? 's' : ''}`;
    byId('healthPopover').innerHTML =
      `<header><b>Saúde do veículo</b><small>SIMULAÇÃO</small></header>${selected.map(([type, label, severity]) => `<div><span class="severity ${severity}">${severity === 'critical' ? 'Crítico' : 'Atenção'}</span><b>${label}</b><small>${type === 'LOW_FUEL' ? `${byId('simFuelLevel').value}% estimado · ` : ''}Fonte: SIMULATION</small></div>`).join('')}<p>Dados para teste. Não são um diagnóstico da ECU.</p>`;
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const timeline = byId('eventTimeline');
    if (timeline)
      timeline.dataset.healthEvents = `${now} · ${selected.map(x => `${x[1]} — SIMULAÇÃO`).join(' | ')}`;
    localStorage.setItem('rastreon-health-simulation', JSON.stringify(selected.map(x => x[0])));
    clearTimeout(healthSaveTimer);
    if (selectedVehicleId) healthSaveTimer = setTimeout(saveHealth, 350);
  }

  async function saveHealth() {
    const events = selectedHealth().map(([type, , severity]) => ({
      type,
      severity: severity === 'critical' ? 'CRITICAL' : 'WARNING',
      estimatedValue: type === 'LOW_FUEL' ? Number(byId('simFuelLevel').value) : null,
      detectedAt: Date.now()
    }));
    try {
      const response = await fetch('/api/vehicle-health/simulation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: selectedVehicleId, events })
      });
      if (!response.ok) throw new Error();
    } catch (_) {
      document.dispatchEvent(
        new CustomEvent('rastreon:notice', { detail: 'A simulação foi mantida neste dispositivo.' })
      );
    }
  }

  function poiIconId(category) {
    const value = String(category || '').toLowerCase();
    if (value === 'fuel' || value.includes('posto')) return 'fuel';
    if (
      ['restaurant', 'cafe', 'bakery', 'bar'].includes(value) ||
      value.includes('restaurante') ||
      value.includes('lanche')
    )
      return 'food';
    if (
      ['supermarket', 'school', 'university', 'library', 'culture'].includes(value) ||
      value.includes('shopping') ||
      value.includes('mercado')
    )
      return 'shopping';
    if (value === 'mechanic' || value.includes('oficina')) return 'mechanic';
    if (
      ['parking', 'airport', 'hotel', 'leisure', 'tourism', 'camping'].includes(value) ||
      value.includes('estacion')
    )
      return 'parking';
    if (
      ['hospital', 'pharmacy', 'dentist', 'veterinary', 'worship'].includes(value) ||
      value.includes('hospital') ||
      value.includes('farm')
    )
      return 'hospital';
    if (['police', 'fire_station'].includes(value) || value.includes('pol')) return 'police';
    if (value === 'camera' || value.includes('radar')) return 'camera';
    return 'hazard';
  }
  function enabledPoiCategories() {
    try {
      const saved = JSON.parse(localStorage.getItem(poiPreferenceKey) || 'null');
      const selected = Array.isArray(saved) ? saved : defaultPoiCategories;
      return [...new Set([...essentialPoiCategories, ...selected])].filter(category =>
        poiCategories.some(item => item[0] === category)
      );
    } catch (_) {
      return defaultPoiCategories;
    }
  }
  function setupPoiPreferences() {
    const settings = document.querySelectorAll('#profilePoiSettings input');
    if (!settings.length) return;
    const enabled = enabledPoiCategories();
    settings.forEach(input => {
      input.checked = enabled.includes(input.value);
      input.disabled = essentialPoiCategories.has(input.value);
      input.onchange = () => {
        const categories = [
          ...essentialPoiCategories,
          ...Array.from(settings)
            .filter(item => item.checked)
            .map(item => item.value)
        ];
        localStorage.setItem(poiPreferenceKey, JSON.stringify([...new Set(categories)]));
        clearTimeout(poiRefreshTimer);
        poiRefreshTimer = setTimeout(loadPois, 100);
        document.dispatchEvent(
          new CustomEvent('rastreon:notice', {
            detail: 'Preferências de locais atualizadas no mapa.'
          })
        );
      };
    });
    const restore = byId('restorePoiDefaults');
    if (restore)
      restore.onclick = () => {
        localStorage.setItem(poiPreferenceKey, JSON.stringify(defaultPoiCategories));
        settings.forEach(input => (input.checked = essentialPoiCategories.has(input.value)));
        clearTimeout(poiRefreshTimer);
        poiRefreshTimer = setTimeout(loadPois, 100);
        document.dispatchEvent(
          new CustomEvent('rastreon:notice', {
            detail: 'Mapa restaurado: somente postos e hospitais permanecem visíveis.'
          })
        );
      };
  }
  function renderPois(places, category) {
    const api = window.rastreonMap;
    if (!api) return;
    if (!api.layers.pois) api.layers.pois = api.L.layerGroup().addTo(api.map);
    api.layers.pois.clearLayers();
    document.body.dataset.poiCount = String(places.length);
    const zoom = api.map.getZoom(),
      cell = zoom >= 15 ? 0.002 : zoom >= 13 ? 0.008 : 0.025;
    const groups = new Map();
    for (const place of places) {
      const key = `${Math.round(place.latitude / cell)}:${Math.round(place.longitude / cell)}`;
      const group = groups.get(key) || [];
      group.push(place);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const lat = group.reduce((n, p) => n + p.latitude, 0) / group.length,
        lng = group.reduce((n, p) => n + p.longitude, 0) / group.length;
      const iconId = group.length > 1 ? 'comment' : poiIconId(group[0].category || category),
        marker = api.L.marker([lat, lng], {
          icon: api.L.divIcon({
            className: 'map-symbol-host',
            html: `<span class="map-symbol ${group.length > 1 ? 'map-symbol--cluster' : ''}" aria-label="${group.length > 1 ? `${group.length} locais` : escapeHtml(group[0].categoryLabel || category)}"><svg aria-hidden="true"><use href="/images/map-icons.svg#${iconId}"></use></svg>${group.length > 1 ? `<b>${group.length}</b>` : ''}</span>`
          })
        }).addTo(api.layers.pois);
      marker.bindTooltip(group.length > 1 ? `${group.length} locais` : group[0].name, {
        permanent: group.length > 1,
        direction: 'center',
        className: 'poi-cluster-label'
      });
      const popupName = group.length > 1 ? `${group.length} locais próximos` : group[0].name,
        place = group[0],
        details =
          group.length === 1
            ? [place.address, place.openingHours, place.phone]
                .filter(Boolean)
                .map(value => `<br><small>${escapeHtml(value)}</small>`)
                .join('')
            : '',
        stopButton =
          group.length === 1
            ? `<br><button type="button" data-poi-stop="true" data-latitude="${place.latitude}" data-longitude="${place.longitude}" data-name="${encodeURIComponent(place.name)}">Traçar rota</button>`
            : '',
        reviewButton =
          group.length === 1
            ? ` <button type="button" data-poi-review="true" data-place-key="${encodeURIComponent(`osm:${place.id}`)}" data-name="${encodeURIComponent(place.name)}" data-address="${encodeURIComponent(place.address || '')}" data-latitude="${place.latitude}" data-longitude="${place.longitude}">Comentários e avaliações</button>`
            : '';
      marker.bindPopup(
        `<b>${escapeHtml(popupName)}</b><br><small>${escapeHtml(place.categoryLabel || category)} · OpenStreetMap</small>${details}${stopButton}${reviewButton}`
      );
      if (group.length > 1)
        marker.on('click', () => api.map.setView([lat, lng], Math.min(18, zoom + 2)));
    }
  }

  async function loadPois() {
    const api = window.rastreonMap;
    if (!api) return;
    poiRequest?.abort();
    poiRequest = new AbortController();
    const current = window.rastreonLocation?.current(),
      viewportCenter = api.map.getCenter?.(),
      center =
        viewportCenter || (current ? { lat: current.latitude, lng: current.longitude } : null);
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
    try {
      const scope = activeRoute.length >= 2 ? 'route' : 'nearby',
        zoom = Number(api.map.getZoom?.() || 13),
        selectedCategories = enabledPoiCategories(),
        requestedCategories =
          scope === 'route' || zoom >= 12
            ? selectedCategories
            : selectedCategories.filter(category => essentialPoiCategories.has(category));
      if (scope === 'route' && activeRoute.length < 2)
        throw new Error('Calcule uma rota antes de buscar no corredor.');
      const sample =
          activeRoute.length > 30
            ? Array.from(
                { length: 30 },
                (_, index) => activeRoute[Math.round((index * (activeRoute.length - 1)) / 29)]
              )
            : activeRoute,
        route =
          scope === 'route'
            ? `&route=${encodeURIComponent(sample.map(point => `${point[1]},${point[0]}`).join(';'))}`
            : '';
      const response = await fetch(
          `/api/pois?lat=${center.lat}&lng=${center.lng}&zoom=${zoom}&categories=${encodeURIComponent(requestedCategories.join(','))}${route}`,
          { signal: poiRequest.signal }
        ),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const places = (data.places || []).map(place => ({
        ...place,
        categoryLabel: document.querySelector(`[data-poi-category="${place.category}"]`)
          ?.textContent
      }));
      renderPois(places, 'Locais próximos');
      clearTimeout(poiRetryTimer);
    } catch (error) {
      if (error.name !== 'AbortError' && byId('toast')) {
        byId('toast').textContent = error.message || 'Não conseguimos carregar locais agora.';
        byId('toast').classList.add('show');
        setTimeout(() => byId('toast').classList.remove('show'), 2600);
        clearTimeout(poiRetryTimer);
        poiRetryTimer = setTimeout(loadPois, 12000);
      }
    }
  }

  function schedulePoiLoad(delay = 450) {
    clearTimeout(poiRefreshTimer);
    poiRefreshTimer = setTimeout(loadPois, delay);
  }

  async function loadPreferencesAndHealth() {
    try {
      const [vehiclesResponse, preferencesResponse] = await Promise.all([
        fetch('/api/vehicles'),
        fetch('/api/tour-preferences')
      ]);
      const vehicles = await vehiclesResponse.json(),
        preferences = await preferencesResponse.json();
      selectedVehicleId =
        vehicles.vehicles?.find(vehicle => vehicle.selected)?.id ||
        vehicles.vehicles?.[0]?.id ||
        null;
      for (const preference of preferences.preferences || [])
        localStorage.setItem(
          `rastreon-tour-${preference.tourKey}`,
          preference.dismissed ? 'dismissed' : 'completed'
        );
      if (selectedVehicleId) {
        const response = await fetch(`/api/vehicle-health?vehicleId=${selectedVehicleId}`),
          data = await response.json();
        document
          .querySelectorAll('#healthOptions input')
          .forEach(
            input => (input.checked = (data.events || []).some(event => event.type === input.value))
          );
        const fuel = (data.events || []).find(event => event.type === 'LOW_FUEL');
        if (fuel?.estimatedValue) {
          byId('simFuelLevel').value = fuel.estimatedValue;
          byId('simFuelOutput').textContent = `${fuel.estimatedValue}%`;
        }
        renderHealth();
      }
    } catch (_) {}
  }

  function applyPreset(name) {
    const presets = {
      normal: [],
      fuel: ['LOW_FUEL'],
      electrical: ['BATTERY_WARNING', 'ELECTRICAL_FAULT'],
      engine: ['CHECK_ENGINE', 'ENGINE_TEMPERATURE'],
      multiple: ['LOW_FUEL', 'ABS_WARNING', 'CHECK_ENGINE', 'TIRE_PRESSURE']
    };
    document.querySelectorAll('#healthOptions input').forEach(i => {
      i.checked = presets[name].includes(i.value);
    });
    renderHealth();
  }

  function syncSummary() {
    const setText = (element, value) => {
      if (element && element.textContent !== value) element.textContent = value;
    };
    const speed = byId('speed')?.textContent || '0';
    setText(byId('sheetSpeed'), speed.replace(',0', ''));
    const connected = !byId('phoneStatus')?.classList.contains('offline');
    setText(byId('sheetOnline'), connected ? '● Online' : '● Aguardando conexão');
    const onlineStatus = byId('sheetOnline'),
      onlineClass = connected ? 'online-text' : '';
    if (onlineStatus && onlineStatus.className !== onlineClass)
      onlineStatus.className = onlineClass;
    setText(byId('sheetUpdated'), speed !== '0,0' ? 'atualizado agora' : 'sem dados');
    const name =
      byId('vehicleSummary')?.querySelector('b')?.textContent ||
      byId('vNickname')?.value ||
      'Meu veículo';
    setText(byId('sheetVehicleName'), name);
    setText(byId('sheetDestination'), byId('destinationInput')?.value || 'Não definido');
    setText(byId('sheetEta'), byId('plannedArrival')?.textContent || '—');
    setText(byId('sheetDistance'), byId('plannedDistance')?.textContent || '—');
    setText(
      byId('routeCostSummary'),
      `R$ ${byId('costMin')?.textContent || '0,00'}–${byId('costMax')?.textContent || '0,00'}`
    );
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const poiStop = event.target.closest('[data-poi-stop]');
      if (poiStop) {
        window.dispatchEvent(
          new CustomEvent('rastreon:add-route-stop', {
            detail: {
              latitude: Number(poiStop.dataset.latitude),
              longitude: Number(poiStop.dataset.longitude),
              label: decodeURIComponent(poiStop.dataset.name)
            }
          })
        );
        return;
      }
      const poiReview = event.target.closest('[data-poi-review]');
      if (poiReview) {
        window.RastreonCommunity?.openPlace({
          placeKey: decodeURIComponent(poiReview.dataset.placeKey),
          provider: 'osm',
          name: decodeURIComponent(poiReview.dataset.name),
          address: decodeURIComponent(poiReview.dataset.address),
          latitude: Number(poiReview.dataset.latitude),
          longitude: Number(poiReview.dataset.longitude)
        });
        return;
      }
      if (event.target.closest('.search-results [data-index]')) {
        const box = event.target.closest('.search-results'),
          input = box?.closest('.field')?.querySelector('input');
        if (input?.dataset.cepSearch === 'true')
          setTimeout(() => requestNumberComplement(input), 0);
      }
      const nav = event.target.closest('[data-view]');
      if (nav) setTimeout(() => setPage(nav.dataset.view), 0);
      if (event.target.closest('#sheetHandle')) {
        const sheet = byId('vehicleSheet');
        const next = sheet.classList.contains('minimized')
          ? 'half'
          : sheet.classList.contains('half')
            ? 'expanded'
            : 'minimized';
        sheet.className = `vehicle-sheet ${next}`;
        byId('sheetHandle').setAttribute('aria-expanded', String(next !== 'minimized'));
      }
      if (event.target.closest('#openTechnical')) document.body.classList.toggle('technical-open');
      if (event.target.closest('#tripPlannerBtn')) {
        document.body.classList.remove('trip-planning');
        document.body.classList.remove('technical-open');
        byId('quickRouteSearch')?.querySelector('input')?.focus();
        const fencePanel = byId('fencePanel');
        if (fencePanel) fencePanel.classList.add('hidden');
        currentPage = 'trip';
        renderHelp();
        if (!localStorage.getItem('rastreon-tour-trip')) showTourWelcome('trip');
      }
      if (event.target.closest('#fenceBtn')) openFence();
      if (event.target.closest('#closeFence')) {
        const fencePanel = byId('fencePanel');
        if (fencePanel) fencePanel.classList.add('hidden');
        currentPage = 'tracking';
        renderHelp();
      }
      if (event.target.closest('#routeDetailsBtn')) {
        const summary = byId('routeSummary');
        if (summary) {
          summary.classList.toggle('details-open');
          event.target.textContent = summary.classList.contains('details-open')
            ? 'Ocultar detalhes'
            : 'Ver detalhes';
        }
      }
      if (event.target.closest('#healthBadgeBtn')) {
        const popover = byId('healthPopover');
        if (popover) popover.classList.toggle('hidden');
      }
      if (event.target.closest('#automotiveBtn')) {
        document.body.classList.toggle('automotive-mode');
        const active = document.body.classList.contains('automotive-mode');
        byId('automotiveBtn').setAttribute('aria-pressed', String(active));
        byId('automotiveBtn').textContent = active ? 'Sair do modo carro' : 'Modo carro';
        setTimeout(() => window.rastreonMap?.map.invalidateSize(), 50);
      }
      const preset = event.target.closest('[data-preset]');
      if (preset) applyPreset(preset.dataset.preset);
    });
    const helpToggle = byId('helpToggle');
    const helpPanel = byId('helpPanel');
    if (helpToggle && helpPanel) {
      helpToggle.onclick = () => {
        helpPanel.classList.toggle('hidden');
        helpToggle.setAttribute('aria-expanded', String(!helpPanel.classList.contains('hidden')));
      };
    }
    const helpClose = byId('helpClose');
    if (helpClose && helpPanel) helpClose.onclick = () => helpPanel.classList.add('hidden');
    const restartTour = byId('restartTour');
    if (restartTour && helpPanel)
      restartTour.onclick = () => {
        helpPanel.classList.add('hidden');
        showTourWelcome(currentPage);
      };
    const tourStart = byId('tourStart');
    if (tourStart)
      tourStart.onclick = () => {
        const tourWelcome = byId('tourWelcome');
        if (tourWelcome) tourWelcome.classList.add('hidden');
        showTip(0);
      };
    const tourSkip = byId('tourSkip');
    if (tourSkip) tourSkip.onclick = () => finishTour();
    const tourDismiss = byId('tourDismiss');
    if (tourDismiss) tourDismiss.onclick = () => finishTour(true);
    const tourClose = byId('tourClose');
    if (tourClose) tourClose.onclick = () => finishTour();
    const tourNext = byId('tourNext');
    if (tourNext) tourNext.onclick = () => showTip(tourIndex + 1);
    const healthOptions = byId('healthOptions');
    if (healthOptions) healthOptions.addEventListener('change', renderHealth);
    [byId('originInput'), byId('destinationInput')].forEach(input =>
      input?.addEventListener('input', () => {
        input.dataset.cepSearch = String(input.value.replace(/\D/g, '').length === 8);
      })
    );
    const fenceSearch = byId('fenceSearch');
    let fenceSearchTimer;
    if (fenceSearch) {
      fenceSearch.oninput = () => {
        clearTimeout(fenceSearchTimer);
        fenceSearchTimer = setTimeout(
          () =>
            searchAddress(fenceSearch.value, 'fenceResults', place =>
              chooseFencePoint(place, place.label)
            ),
          400
        );
      };
    }
    const fenceMapPick = byId('fenceMapPick');
    const fencePanel = byId('fencePanel');
    if (fenceMapPick && fencePanel) {
      fenceMapPick.onclick = () => {
        showNotice('Toque no mapa para escolher o local.');
        fencePanel.classList.add('picking');
        window.rastreonMap?.map.once('click', async event => {
          fencePanel.classList.remove('picking');
          const label = await reverseAddress(event.latlng.lat, event.latlng.lng);
          chooseFencePoint({ latitude: event.latlng.lat, longitude: event.latlng.lng }, label);
        });
      };
    }
    const activateFenceBtn = byId('activateFence');
    if (activateFenceBtn) activateFenceBtn.onclick = reviewFence;
    const confirmFenceBtn = byId('confirmFence');
    if (confirmFenceBtn) confirmFenceBtn.onclick = activateFence;
    const drawCustomAreaBtn = byId('drawCustomArea');
    if (drawCustomAreaBtn) drawCustomAreaBtn.onclick = drawCustomArea;
    const arrivalLater = byId('arrivalLater');
    if (arrivalLater)
      arrivalLater.onclick = () => {
        const arrivalPrompt = byId('arrivalPrompt');
        if (arrivalPrompt) arrivalPrompt.classList.add('hidden');
      };
    const arrivalActivate = byId('arrivalActivate');
    if (arrivalActivate) arrivalActivate.onclick = activateArrivalFence;
    document
      .querySelectorAll('[name="fenceSize"]')
      .forEach(
        input =>
          (input.onchange = () => fencePoint && chooseFencePoint(fencePoint, fencePoint.label))
      );
    const fenceCustomSize = byId('fenceCustomSize');
    const fenceSizeOutput = byId('fenceSizeOutput');
    if (fenceCustomSize && fenceSizeOutput) {
      fenceCustomSize.oninput = event => {
        fenceSizeOutput.textContent = `${event.target.value} m`;
        document.querySelectorAll('[name="fenceSize"]').forEach(input => (input.checked = false));
        fencePoint && chooseFencePoint(fencePoint, fencePoint.label);
      };
    }
    document
      .querySelectorAll('[data-save-place]')
      .forEach(button => (button.onclick = () => savePlace(button.dataset.savePlace)));
    const simFuelLevel = byId('simFuelLevel');
    const simFuelOutput = byId('simFuelOutput');
    if (simFuelLevel && simFuelOutput) {
      simFuelLevel.oninput = event => {
        simFuelOutput.textContent = `${event.target.value}%`;
        renderHealth();
      };
    }
    window.rastreonMap?.map.on('moveend', () => {
      schedulePoiLoad();
    });
    window.addEventListener('rastreon:route-selected', event => {
      activeRoute = Array.isArray(event.detail?.geometry) ? event.detail.geometry : [];
      schedulePoiLoad();
    });
    window.addEventListener('rastreon:user-location', () => schedulePoiLoad(150));
    window.addEventListener('rastreon:map-ready', () => schedulePoiLoad(0));
    window.addEventListener('rastreon:map-style-restored', () => schedulePoiLoad(100));
    window.rastreonMap?.map.ready?.then(() => schedulePoiLoad(0));
    schedulePoiLoad(0);
    setupPoiPreferences();
    new MutationObserver(syncSummary).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class']
    });
    window.rastreonSocket?.on('vehicle-health:update', payload => {
      if (selectedVehicleId && Number(payload.vehicleId) !== Number(selectedVehicleId)) return;
      document
        .querySelectorAll('#healthOptions input')
        .forEach(
          input => (input.checked = payload.events.some(event => event.type === input.value))
        );
      renderHealth();
    });
    window.rastreonSocket?.on('saved-place:arrival', place => {
      arrivalPlace = place;
      byId('arrivalTitle').textContent = `Você chegou em ${place.label}.`;
      byId('arrivalPrompt').classList.remove('hidden');
    });
    window.rastreonSocket?.on('position:update', position => {
      clearTimeout(addressTimer);
      addressTimer = setTimeout(async () => {
        try {
          const label = await reverseAddress(position.latitude, position.longitude);
          if (byId('sheetCurrentAddress'))
            byId('sheetCurrentAddress').textContent = label.split(',').slice(0, 3).join(',');
        } catch (_) {}
      }, 500);
    });
    window.rastreonMap?.map.on('moveend', () => {
      clearTimeout(addressTimer);
      addressTimer = setTimeout(async () => {
        const center = window.rastreonMap.map.getCenter();
        try {
          const label = await reverseAddress(center.lat, center.lng);
          const short = label.split(',').slice(0, 3).join(',');
          if (byId('sheetCurrentAddress')) byId('sheetCurrentAddress').textContent = short;
        } catch (_) {}
      }, 700);
    });
  }

  setupStructure();
  bindEvents();
  renderHelp();
  syncSummary();
  try {
    const saved = JSON.parse(localStorage.getItem('rastreon-health-simulation') || '[]');
    document
      .querySelectorAll('#healthOptions input')
      .forEach(i => (i.checked = saved.includes(i.value)));
  } catch (_) {}
  renderHealth();
  loadPreferencesAndHealth().finally(() => {
    if (!localStorage.getItem('rastreon-tour-tracking'))
      setTimeout(() => showTourWelcome('tracking'), 250);
  });
})();

// Mantém as páginas secundárias abertas como painel sobre o rastreio.
document.addEventListener('click', event => {
  const button = event.target.closest('.nav-pill[data-view]');
  if (!button) return;
  const view = button.dataset.view;
  document
    .querySelectorAll('.nav-pill[data-view]')
    .forEach(item => item.classList.toggle('active', item === button));
  document.querySelectorAll('.view').forEach(item => item.classList.remove('active'));
  document.getElementById(`${view}View`)?.classList.add('active');
  document.body.classList.toggle('floating-nav-open', view !== 'tracking');
});
