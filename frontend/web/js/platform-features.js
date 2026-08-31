'use strict';

(() => {
  const state = {
    csrf: null,
    position: null,
    activeConversation: null,
    initialized: false,
    searchTimer: null,
    stations: [],
    reports: [],
    stationRadius: 3000,
    pxReply: null,
    pxCanModerate: false,
    conversations: []
  };
  const NEARBY_STATION_RADIUS_METERS = 3000;
  const FUEL_TYPES = [
    ['GASOLINE', 'Gasolina'],
    ['ADDITIVE_GASOLINE', 'Gasolina aditivada'],
    ['ETHANOL', 'Etanol'],
    ['DIESEL', 'Diesel'],
    ['DIESEL_S10', 'Diesel S10'],
    ['CNG', 'GNV']
  ];
  const byId = id => document.getElementById(id);
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  };
  const formatDate = value => (value ? new Date(value).toLocaleString('pt-BR') : '—');
  const notice = message => {
    const target = byId('platformNotice');
    if (!target) return;
    target.textContent = message;
    target.classList.add('show');
    setTimeout(() => target.classList.remove('show'), 3000);
  };

  async function token() {
    if (state.csrf) return state.csrf;
    const response = await fetch('/api/auth/csrf', { headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Sessão inválida.');
    state.csrf = data.token;
    return state.csrf;
  }
  async function api(path, { method = 'GET', body, csrf = false } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf) headers['X-CSRF-Token'] = await token();
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 403 && csrf) state.csrf = null;
      throw new Error(data?.error || 'Não foi possível concluir a operação.');
    }
    return data;
  }
  async function locate() {
    if (state.position) return state.position;
    if (!navigator.geolocation) throw new Error('Geolocalização indisponível.');
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        value => {
          state.position = {
            latitude: value.coords.latitude,
            longitude: value.coords.longitude,
            accuracy: value.coords.accuracy
          };
          resolve(state.position);
        },
        () => reject(new Error('Autorize a localização para usar este recurso.')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      )
    );
  }

  function item(title, subtitle) {
    const article = node('article', 'platform-item');
    const header = node('header');
    header.append(node('strong', '', title));
    article.append(header);
    if (subtitle) article.append(node('p', '', subtitle));
    return article;
  }
  function actions(host, definitions) {
    const footer = node('div', 'platform-item__actions');
    for (const definition of definitions) {
      const button = node('button', definition.secondary ? 'secondary' : '', definition.label);
      button.type = 'button';
      button.addEventListener('click', definition.action);
      footer.append(button);
    }
    host.append(footer);
  }
  function empty(host, message) {
    host.replaceChildren(node('div', 'empty-state', message));
  }
  function distanceMeters(a, b) {
    const radians = value => (value * Math.PI) / 180;
    const dLat = radians(b.latitude - a.latitude);
    const dLng = radians(b.longitude - a.longitude);
    const value =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(value));
  }
  function updateCommunityMap() {
    const detail = { stations: state.stations, reports: state.reports };
    window.rastreonCommunityMapState = detail;
    window.dispatchEvent(
      new CustomEvent('rastreon:community-map', {
        detail
      })
    );
  }
  function distanceLabel(value) {
    if (value == null) return 'Distância indisponível';
    return value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toFixed(1)} km`;
  }
  function renderMiniMap(host, entries, kind) {
    if (!host) return;
    host.querySelectorAll('button').forEach(marker => marker.remove());
    if (!entries.length) return;
    const latitudes = entries.map(entry => Number(entry.latitude)).filter(Number.isFinite);
    const longitudes = entries.map(entry => Number(entry.longitude)).filter(Number.isFinite);
    if (!latitudes.length) return;
    const minLat = Math.min(...latitudes),
      maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes),
      maxLng = Math.max(...longitudes);
    for (const entry of entries) {
      const marker = node('button', `mini-map-marker ${kind}`, kind === 'report' ? '!' : '⛽');
      marker.type = 'button';
      marker.title = entry.name || entry.description || 'Ver no mapa';
      marker.style.left = `${8 + ((entry.longitude - minLng) / (maxLng - minLng || 1)) * 84}%`;
      marker.style.top = `${8 + ((maxLat - entry.latitude) / (maxLat - minLat || 1)) * 78}%`;
      marker.addEventListener('click', event => {
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent('rastreon:focus-place', { detail: entry }));
      });
      host.append(marker);
    }
  }
  function navigateTo(entry) {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${entry.latitude},${entry.longitude}`)}`,
      '_blank',
      'noopener,noreferrer'
    );
  }
  window.addEventListener('rastreon:map-style-restored', updateCommunityMap);
  async function submitFuelPrice(station) {
    const fuelType = (
      prompt('Tipo: GASOLINE, ADDITIVE_GASOLINE, ETHANOL, DIESEL, DIESEL_S10 ou CNG', 'GASOLINE') ||
      ''
    )
      .trim()
      .toUpperCase();
    if (!fuelType) return;
    const price = Number(
      (prompt(`Preço observado em ${station.name}:`, '') || '').replace(',', '.')
    );
    if (!Number.isFinite(price)) return notice('Informe um preço válido.');
    try {
      await api(`/api/platform/stations/${station.id}/prices`, {
        method: 'POST',
        body: { fuelType, price, observedAt: Date.now() },
        csrf: true
      });
      notice('Preço enviado para validação da comunidade.');
      loadStations();
    } catch (error) {
      notice(error.message);
    }
  }
  async function confirmFuelPrice(station, fuelType = '') {
    const price = (station.prices || []).find(
      value => !fuelType || String(value.fuelType).toUpperCase() === fuelType
    );
    if (!price) return notice('Não há preço informado para confirmar.');
    try {
      const result = await api(`/api/platform/stations/${station.id}/prices/${price.id}/confirm`, {
        method: 'PUT',
        body: {},
        csrf: true
      });
      notice(`Preço confirmado por ${result.confirmations} pessoa(s).`);
      loadStations(state.stationRadius);
    } catch (error) {
      notice(error.message);
    }
  }
  async function uploadPhoto(entityType, entityId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return notice('A foto deve ter até 5 MB.');
      try {
        const response = await fetch(
          `/api/platform/photos?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': file.type,
              'X-CSRF-Token': await token()
            },
            body: file
          }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Falha no envio.');
        notice(
          data.photo.status === 'PUBLISHED' ? 'Foto publicada.' : 'Foto enviada para moderação.'
        );
      } catch (error) {
        notice(error.message);
      }
    });
    input.click();
  }
  async function comments(entityType, entityId) {
    try {
      const [data, gallery] = await Promise.all([
        api(`/api/platform/comments/${entityType}/${entityId}`),
        api(
          `/api/platform/photos?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`
        )
      ]);
      const current =
        data.comments.map(value => `${value.author.displayName}: ${value.body}`).join('\n') ||
        'Ainda não há comentários.';
      const body = prompt(
        `${current}\n\n${gallery.photos.length} foto(s) disponível(is). Escreva um novo comentário (Cancelar apenas fecha):`,
        ''
      );
      if (!body?.trim()) return;
      await api(`/api/platform/comments/${entityType}/${entityId}`, {
        method: 'POST',
        body: { body },
        csrf: true
      });
      notice('Comentário publicado.');
    } catch (error) {
      notice(error.message);
    }
  }

  function showTab(name) {
    document
      .querySelectorAll('[data-platform-tab]')
      .forEach(button =>
        button.setAttribute('aria-selected', String(button.dataset.platformTab === name))
      );
    document.querySelectorAll('.platform-pane').forEach(pane => pane.classList.add('hidden'));
    byId(`platform${name[0].toUpperCase()}${name.slice(1)}`)?.classList.remove('hidden');
    if (name === 'reports') loadReports();
    if (name === 'stations') loadStations(Number(byId('stationRadius')?.value || 3000));
    if (name === 'px') loadPx();
    if (name === 'chat') loadChat();
    if (name === 'routes') loadRoutes();
    if (name === 'benefits') loadBenefits();
  }

  async function loadStatus() {
    const data = await api('/api/platform/status');
    byId('platformTrafficStatus').textContent = data.traffic.available
      ? 'Trânsito ao vivo'
      : data.traffic.communityAvailable
        ? 'Trânsito comunitário'
        : 'Trânsito indisponível';
    byId('platformTrafficStatus').className =
      `badge ${data.traffic.available ? 'online' : 'offline'}`;
    byId('platformTrafficStatus').title = data.traffic.reason || data.traffic.provider || '';
  }
  async function loadStations(radius = state.stationRadius) {
    state.stationRadius = Number(radius) || 3000;
    const host = byId('communityStationSummary');
    empty(host, `Buscando postos em até ${state.stationRadius / 1000} km…`);
    let position;
    try {
      position = await locate();
    } catch {
      state.stations = [];
      updateCommunityMap();
      return empty(host, 'Autorize a localização para consultar postos em até 3 km.');
    }
    const query = `latitude=${position.latitude}&longitude=${position.longitude}&radiusMeters=${state.stationRadius}`;
    const [registeredResult, nearbyResult] = await Promise.allSettled([
      api(`/api/platform/stations?${query}`),
      api(
        `/api/pois?lat=${position.latitude}&lng=${position.longitude}&categories=fuel&radiusMeters=${state.stationRadius}`
      )
    ]);
    const registered =
      registeredResult.status === 'fulfilled' ? registeredResult.value.stations || [] : [];
    const nearby = nearbyResult.status === 'fulfilled' ? nearbyResult.value.places || [] : [];
    if (!registered.length && !nearby.length && nearbyResult.status === 'rejected') {
      notice('A busca de postos está temporariamente indisponível. Tente atualizar.');
      return empty(
        host,
        'Não foi possível consultar os postos agora. Use “Atualizar” para tentar novamente.'
      );
    }

    const matchedIds = new Set();
    const stations = nearby.map(place => {
      const match = registered.find(station => {
        if (station.providerPlaceId && station.providerPlaceId === place.id) return true;
        return distanceMeters(station, place) <= 80;
      });
      if (match) matchedIds.add(match.id);
      return {
        ...place,
        ...(match || {}),
        id: match?.id || `osm:${place.id}`,
        providerPlaceId: place.id,
        distanceMeters: place.distanceMeters,
        prices: match?.prices || [],
        registered: Boolean(match),
        source: match?.source || place.source || 'OpenStreetMap'
      };
    });
    for (const station of registered)
      if (!matchedIds.has(station.id)) stations.push({ ...station, registered: true });
    state.stations = stations
      .map(station => ({
        ...station,
        distanceMeters: station.distanceMeters ?? Math.round(distanceMeters(position, station))
      }))
      .filter(station => station.distanceMeters <= state.stationRadius)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    updateCommunityMap();
    host.replaceChildren();
    if (!state.stations.length) {
      renderStationTab();
      return empty(
        host,
        `Nenhum posto encontrado em ${state.stationRadius / 1000} km. Amplie o raio para 5, 10 ou 20 km.`
      );
    }
    for (const station of state.stations) {
      const article = item(
        station.name,
        [
          station.brand,
          station.address,
          station.distanceMeters != null ? `${(station.distanceMeters / 1000).toFixed(1)} km` : ''
        ]
          .filter(Boolean)
          .join(' · ')
      );
      article.classList.add('nearby-station');
      article.append(
        node(
          'span',
          'platform-confidence',
          station.registered ? 'Preços da comunidade' : 'Localização: OpenStreetMap'
        )
      );
      const prices = node('dl', 'station-price-grid');
      const pricesByType = new Map(
        (station.prices || []).map(price => [String(price.fuelType).toUpperCase(), price])
      );
      for (const [fuelType, label] of FUEL_TYPES) {
        const price = pricesByType.get(fuelType);
        const row = node('div', price ? 'has-price' : 'no-price');
        row.append(node('dt', '', label));
        row.append(
          node(
            'dd',
            '',
            price ? `R$ ${Number(price.price).toFixed(2).replace('.', ',')}` : 'Não informado'
          )
        );
        if (price)
          row.title = `Fonte: ${price.source || 'Comunidade RASTREON'} · situação: ${price.status} · ${price.confirmations || 0} confirmação(ões)`;
        prices.append(row);
      }
      article.append(prices);
      if (station.partnerBenefit)
        article.append(
          node('span', 'platform-price', `Parceiro: ${station.partnerBenefit.description}`)
        );
      if (station.registered)
        actions(article, [
          {
            label: station.favorite ? 'Favoritado' : 'Favoritar',
            secondary: true,
            action: async event => {
              try {
                await api(`/api/platform/stations/${station.id}/favorite`, {
                  method: 'POST',
                  csrf: true
                });
                event.currentTarget.textContent = 'Favoritado';
              } catch (error) {
                notice(error.message);
              }
            }
          },
          { label: 'Informar preço', action: () => submitFuelPrice(station) },
          { label: 'Confirmar preço', secondary: true, action: () => confirmFuelPrice(station) },
          {
            label: 'Comentar',
            secondary: true,
            action: () => comments('FUEL_STATION', station.id)
          }
        ]);
      else actions(article, [{ label: 'Ir até o posto', action: () => navigateTo(station) }]);
      host.append(article);
    }
    renderStationTab();
  }

  function stationBestPrice(station, fuelType) {
    const prices = (station.prices || []).filter(
      price => !fuelType || String(price.fuelType).toUpperCase() === fuelType
    );
    return prices.length ? Math.min(...prices.map(price => Number(price.price))) : Infinity;
  }
  function renderStationTab() {
    const host = byId('stationTabList');
    if (!host) return;
    const fuel = byId('stationFuel')?.value || '';
    const brand = (byId('stationBrand')?.value || '').trim().toLowerCase();
    const sort = byId('stationSort')?.value || 'distance';
    const stations = state.stations
      .filter(
        station =>
          !brand ||
          String(station.brand || '')
            .toLowerCase()
            .includes(brand)
      )
      .filter(station => !fuel || stationBestPrice(station, fuel) !== Infinity)
      .sort((a, b) =>
        sort === 'price'
          ? stationBestPrice(a, fuel) - stationBestPrice(b, fuel)
          : a.distanceMeters - b.distanceMeters
      );
    host.replaceChildren();
    renderMiniMap(byId('stationMiniMap'), stations, 'station');
    if (!stations.length) return empty(host, 'Nenhum posto corresponde aos filtros desta aba.');
    for (const station of stations) {
      const confirmationCount = Math.max(
        0,
        ...(station.prices || []).map(value => value.confirmations || 0)
      );
      const article = item(
        station.name,
        `${station.brand || 'Sem bandeira'} · ${distanceLabel(station.distanceMeters)} · ${station.address || ''}`
      );
      const price = stationBestPrice(station, fuel);
      article.append(
        node(
          'span',
          'platform-confidence',
          station.registered
            ? `${confirmationCount >= 2 ? 'Alta confiança' : 'Confiança comunitária'} · ${confirmationCount} confirmação(ões) · atualizado ${formatDate(station.updatedAt)}`
            : 'Preço não informado · localização externa'
        ),
        node(
          'strong',
          'station-featured-price',
          price === Infinity
            ? 'Preço não informado'
            : `A partir de R$ ${price.toFixed(2).replace('.', ',')}`
        )
      );
      const stationActions = [{ label: 'Ir até o posto', action: () => navigateTo(station) }];
      if (station.registered) {
        stationActions.unshift({
          label: 'Atualizar preço',
          action: () => submitFuelPrice(station)
        });
        stationActions.unshift({
          label: 'Confirmar preço',
          secondary: true,
          action: () => confirmFuelPrice(station, fuel)
        });
      }
      actions(article, stationActions);
      host.append(article);
    }
  }

  async function search() {
    const input = byId('platformSearchInput'),
      host = byId('platformSearchResults'),
      query = input.value.trim();
    if (query.length < 2) return host.replaceChildren();
    const params = new URLSearchParams({ q: query });
    if (state.position) {
      params.set('latitude', state.position.latitude);
      params.set('longitude', state.position.longitude);
    }
    try {
      const data = await api(`/api/platform/search?${params}`);
      host.replaceChildren();
      if (!data.results.length)
        return empty(
          host,
          'Nenhum resultado interno. Use a busca do mapa para endereços externos.'
        );
      for (const result of data.results) {
        const article = item(
          result.title,
          [
            result.type.replaceAll('_', ' '),
            result.subtitle,
            result.distanceMeters != null ? `${Math.round(result.distanceMeters)} m` : ''
          ]
            .filter(Boolean)
            .join(' · ')
        );
        if (result.latitude != null)
          actions(article, [
            {
              label: 'Ver no mapa',
              action: () => {
                document.querySelector('[data-view="tracking"]')?.click();
                window.dispatchEvent(new CustomEvent('rastreon:focus-place', { detail: result }));
              }
            }
          ]);
        host.append(article);
      }
    } catch (error) {
      empty(host, error.message);
    }
  }

  async function loadReports() {
    const host = byId('roadReportList');
    empty(host, 'Carregando ocorrências…');
    let suffix = '';
    try {
      const position = await locate();
      const params = new URLSearchParams({
        latitude: position.latitude,
        longitude: position.longitude,
        radiusMeters: byId('reportDistance')?.value || 10000,
        category: byId('reportCategoryFilter')?.value || '',
        severity: byId('reportSeverityFilter')?.value || '',
        sinceHours: byId('reportTimeFilter')?.value || 24
      });
      suffix = `?${params}`;
    } catch {}
    try {
      const data = await api(`/api/platform/road-reports${suffix}`);
      state.reports = data.reports;
      if (byId('communityReportCount'))
        byId('communityReportCount').textContent = String(data.reports.length);
      const summary = byId('communityOccurrenceSummary');
      if (summary) {
        summary.replaceChildren();
        if (!data.reports.length) empty(summary, 'Nenhuma ocorrência comunitária ativa por perto.');
        for (const report of data.reports.slice(0, 4)) {
          const article = node('article');
          const icon = node('i', 'occurrence-icon orange', '!');
          const copy = node('span');
          copy.append(
            node('b', '', report.category.replaceAll('_', ' ')),
            node('small', '', report.description || 'Ocorrência informada pela comunidade')
          );
          article.append(
            icon,
            copy,
            node('time', '', formatDate(report.createdAt)),
            node('em', '', `${report.confirmations || 0} confirmação(ões)`)
          );
          summary.append(article);
        }
      }
      updateCommunityMap();
      renderMiniMap(byId('roadReportMiniMap'), data.reports, 'report');
      host.replaceChildren();
      if (!data.reports.length)
        return empty(host, 'Nenhuma ocorrência comunitária ativa por perto.');
      for (const report of data.reports) {
        const article = item(
          `${report.category.replaceAll('_', ' ')} · ${report.severity}`,
          report.description
        );
        article.append(
          node(
            'small',
            '',
            `Fonte: ${report.sourceLabel || 'Comunidade RASTREON'} (não oficial) · ${report.confirmations} confirmação(ões) · última ${formatDate(report.lastConfirmationAt || report.createdAt)}`
          )
        );
        actions(article, [
          {
            label: report.myVote === 'CONFIRM' ? 'Confirmado' : 'Confirmar',
            action: () => voteReport(report.id, 'CONFIRM')
          },
          {
            label: 'Não está mais ocorrendo',
            secondary: true,
            action: () => voteReport(report.id, 'RESOLVED')
          },
          { label: 'Comentar', secondary: true, action: () => comments('ROAD_REPORT', report.id) },
          {
            label: 'Enviar foto',
            secondary: true,
            action: () => uploadPhoto('ROAD_REPORT', report.id)
          },
          {
            label: 'Informação incorreta',
            secondary: true,
            action: () => reportContent('ROAD_REPORT', report.id)
          }
        ]);
        host.append(article);
      }
    } catch (error) {
      empty(host, error.message);
    }
  }
  async function voteReport(id, vote) {
    try {
      await api(`/api/platform/road-reports/${id}/vote`, {
        method: 'PUT',
        body: { vote },
        csrf: true
      });
      notice('Ocorrência atualizada.');
      loadReports();
    } catch (error) {
      notice(error.message);
    }
  }
  async function reportContent(entityType, entityId) {
    const reason = prompt('Motivo da denúncia:');
    if (!reason) return;
    try {
      await api('/api/platform/content-reports', {
        method: 'POST',
        body: { entityType, entityId, reason },
        csrf: true
      });
      notice('Denúncia enviada para moderação.');
    } catch (error) {
      notice(error.message);
    }
  }
  async function submitReport(event) {
    event.preventDefault();
    try {
      const position = await locate();
      const latitude = Number(byId('roadReportLatitude').value || position.latitude);
      const longitude = Number(byId('roadReportLongitude').value || position.longitude);
      const created = await api('/api/platform/road-reports', {
        method: 'POST',
        csrf: true,
        body: {
          category: byId('roadReportCategory').value,
          severity: byId('roadReportSeverity').value,
          description: byId('roadReportDescription').value,
          latitude,
          longitude
        }
      });
      const photo = byId('roadReportPhoto').files?.[0];
      if (photo) await uploadPhotoFile('ROAD_REPORT', created.report.id, photo);
      byId('roadReportDescription').value = '';
      byId('roadReportPhoto').value = '';
      notice('Ocorrência publicada como informação comunitária.');
      loadReports();
    } catch (error) {
      notice(error.message);
    }
  }

  async function uploadPhotoFile(entityType, entityId, file) {
    if (file.size > 5 * 1024 * 1024) throw new Error('A foto deve ter até 5 MB.');
    const response = await fetch(
      `/api/platform/photos?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': file.type,
          'X-CSRF-Token': await token()
        },
        body: file
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Falha no envio da foto.');
    return data;
  }

  async function chooseReportPosition() {
    try {
      const position = await locate();
      byId('roadReportLatitude').value = position.latitude.toFixed(6);
      byId('roadReportLongitude').value = position.longitude.toFixed(6);
      notice('Posição selecionada. Toque no mapa para fazer um ajuste fino.');
    } catch (error) {
      notice(error.message);
    }
  }

  async function loadPx() {
    try {
      const data = await api('/api/platform/px/channels'),
        select = byId('pxChannel');
      state.pxCanModerate = Boolean(data.canModerate);
      if (!select.options.length)
        for (const channel of data.channels) {
          const option = node('option', '', channel.name);
          option.value = channel.id;
          select.append(option);
        }
      await loadPxMessages();
    } catch (error) {
      empty(byId('pxMessages'), error.message);
    }
  }
  async function loadPxMessages() {
    const channelId = byId('pxChannel').value;
    if (!channelId) return;
    const params = new URLSearchParams();
    if (state.position) {
      params.set('latitude', state.position.latitude);
      params.set('longitude', state.position.longitude);
    }
    const data = await api(`/api/platform/px/channels/${channelId}/messages?${params}`),
      host = byId('pxMessages');
    host.replaceChildren();
    if (!data.messages.length) return empty(host, 'Nenhuma mensagem neste canal.');
    for (const message of data.messages) {
      const article = item(message.author.displayName, message.body);
      if (message.pinned) article.classList.add('is-pinned');
      if (message.replyTo)
        article.prepend(node('small', 'reply-context', `Em resposta: ${message.replyTo.body}`));
      article.append(
        node(
          'small',
          '',
          `${message.pinned ? 'Fixada · ' : ''}${distanceLabel(message.distanceMeters)} · ${formatDate(message.createdAt)} · expira ${formatDate(message.expiresAt)}`
        )
      );
      actions(article, [
        {
          label: `Confirmo (${message.reactions.confirm})`,
          action: () => reactPx(message.id, 'CONFIRM')
        },
        {
          label: `Obrigado (${message.reactions.thanks})`,
          secondary: true,
          action: () => reactPx(message.id, 'THANKS')
        },
        { label: 'Responder', secondary: true, action: () => setPxReply(message) },
        {
          label: 'Denunciar',
          secondary: true,
          action: () => reportContent('PX_MESSAGE', message.id)
        },
        ...(state.pxCanModerate
          ? [
              {
                label: message.pinned ? 'Desafixar' : 'Fixar',
                secondary: true,
                action: () => pinPx(message)
              }
            ]
          : []),
        ...(!message.mine
          ? [
              {
                label: 'Silenciar',
                secondary: true,
                action: () => managePxUser(message.author.userId, 'mute')
              },
              {
                label: 'Bloquear',
                secondary: true,
                action: () => managePxUser(message.author.userId, 'block')
              }
            ]
          : [])
      ]);
      host.append(article);
    }
    const summary = byId('communityPxSummary');
    if (summary) {
      summary.replaceChildren();
      for (const message of data.messages
        .filter(value => value.pinned || value.reactions.confirm > 0)
        .slice(0, 3))
        summary.append(
          item(
            message.pinned ? 'Mensagem fixada' : `${message.reactions.confirm} confirmações`,
            message.body
          )
        );
      if (!summary.children.length) empty(summary, 'Nenhuma mensagem importante neste momento.');
    }
  }
  function setPxReply(message) {
    state.pxReply = message;
    const preview = byId('pxReplyPreview');
    preview.querySelector('span').textContent =
      `Respondendo a ${message.author.displayName}: ${message.body}`;
    preview.classList.remove('hidden');
    byId('pxBody').focus();
  }
  async function reactPx(id, reaction) {
    try {
      await api(`/api/platform/px/messages/${id}/reactions`, {
        method: 'PUT',
        body: { reaction },
        csrf: true
      });
      await loadPxMessages();
    } catch (error) {
      notice(error.message);
    }
  }
  async function managePxUser(userId, action) {
    try {
      await api(`/api/platform/px/users/${userId}/${action}`, {
        method: 'POST',
        body: {},
        csrf: true
      });
      notice(action === 'mute' ? 'Usuário silenciado.' : 'Usuário bloqueado.');
      await loadPxMessages();
    } catch (error) {
      notice(error.message);
    }
  }
  async function pinPx(message) {
    try {
      await api(`/api/platform/px/messages/${message.id}/pin`, {
        method: 'PATCH',
        body: { pinned: !message.pinned },
        csrf: true
      });
      await loadPxMessages();
    } catch (error) {
      notice(error.message);
    }
  }
  async function submitPx(event) {
    event.preventDefault();
    const body = byId('pxBody').value.trim();
    if (!body) return;
    try {
      await api(`/api/platform/px/channels/${byId('pxChannel').value}/messages`, {
        method: 'POST',
        body: {
          body,
          parentId: state.pxReply?.id || null,
          latitude: state.position?.latitude,
          longitude: state.position?.longitude
        },
        csrf: true
      });
      byId('pxBody').value = '';
      state.pxReply = null;
      byId('pxReplyPreview').classList.add('hidden');
      loadPxMessages();
    } catch (error) {
      notice(error.message);
    }
  }

  async function loadChat() {
    try {
      const [settings, requests, conversations] = await Promise.all([
        api('/api/platform/chat/settings'),
        api('/api/platform/conversation-requests'),
        api('/api/platform/conversations')
      ]);
      byId('chatEnabled').checked = settings.chat.enabled;
      state.conversations = conversations.conversations;
      if (byId('communityConversationCount'))
        byId('communityConversationCount').textContent = String(conversations.conversations.length);
      const summary = byId('communityConversationSummary');
      if (summary) {
        summary.replaceChildren();
        if (!conversations.conversations.length)
          empty(summary, 'Nenhuma conversa aceita nesta conta.');
        for (const conversation of conversations.conversations.slice(0, 3)) {
          const article = node('article');
          const avatar = node(
            'i',
            'px-avatar',
            String(conversation.peer.displayName || '?')
              .slice(0, 2)
              .toUpperCase()
          );
          const copy = node('span');
          copy.append(
            node('b', '', conversation.peer.displayName),
            node('small', '', `Atualizada em ${formatDate(conversation.updatedAt)}`)
          );
          const open = node('button', 'text-btn', 'Abrir');
          open.type = 'button';
          open.addEventListener('click', () => {
            showTab('chat');
            openConversation(conversation.id);
          });
          article.append(avatar, copy, open);
          summary.append(article);
        }
      }
      const requestHost = byId('conversationRequests');
      requestHost.replaceChildren();
      if (!requests.requests.length) empty(requestHost, 'Nenhuma solicitação recebida.');
      for (const request of requests.requests) {
        const article = item(
          request.sender.displayName,
          `${request.contextType} · ${request.status} · ${formatDate(request.createdAt)}`
        );
        if (request.status === 'PENDING')
          actions(article, [
            { label: 'Aceitar', action: () => respondRequest(request.id, 'ACCEPT') },
            {
              label: 'Recusar',
              secondary: true,
              action: () => respondRequest(request.id, 'DECLINE')
            },
            {
              label: 'Bloquear',
              secondary: true,
              action: () => respondRequest(request.id, 'BLOCK')
            }
          ]);
        requestHost.append(article);
      }
      const conversationHost = byId('conversationList');
      conversationHost.replaceChildren();
      if (!conversations.conversations.length) empty(conversationHost, 'Nenhuma conversa aceita.');
      for (const conversation of conversations.conversations) {
        const article = item(
          conversation.peer.displayName,
          `${conversation.archived ? 'Arquivada · ' : ''}${conversation.unreadCount ? `${conversation.unreadCount} não lida(s) · ` : ''}${conversation.lastMessage || 'Sem mensagens'} · ${formatDate(conversation.lastMessageAt || conversation.updatedAt)}`
        );
        article.dataset.conversationSearch =
          `${conversation.peer.displayName} ${conversation.peer.contactId || ''}`.toLowerCase();
        actions(article, [{ label: 'Abrir', action: () => openConversation(conversation.id) }]);
        conversationHost.append(article);
      }
    } catch (error) {
      notice(error.message);
    }
  }
  async function respondRequest(id, action) {
    try {
      await api(`/api/platform/conversation-requests/${id}/respond`, {
        method: 'POST',
        body: { action },
        csrf: true
      });
      loadChat();
    } catch (error) {
      notice(error.message);
    }
  }
  async function openConversation(id) {
    try {
      const data = await api(`/api/platform/conversations/${id}/messages`),
        host = byId('conversationMessages');
      state.activeConversation = id;
      const conversation = state.conversations.find(value => value.id === id);
      byId('activeConversationTitle').textContent = conversation?.peer.displayName || 'Conversa';
      host.replaceChildren();
      if (!data.messages.length) empty(host, 'Conversa aceita. Envie a primeira mensagem.');
      for (const message of data.messages) {
        const locationActive = message.messageType === 'LOCATION' && message.expiresAt > Date.now();
        const article = item(
          message.mine ? 'Você' : 'Motorista',
          locationActive
            ? 'Localização temporária disponível'
            : message.messageType === 'LOCATION'
              ? 'Localização expirada'
              : message.body
        );
        article.classList.add('platform-message');
        if (message.mine) article.classList.add('mine');
        if (locationActive)
          actions(article, [{ label: 'Abrir no mapa', action: () => navigateTo(message) }]);
        const delivery = message.mine
          ? message.readAt
            ? ' · lida'
            : message.deliveredAt
              ? ' · entregue'
              : ' · enviada'
          : '';
        article.append(node('small', '', `${formatDate(message.createdAt)}${delivery}`));
        host.append(article);
      }
      byId('conversationForm').classList.remove('hidden');
      byId('conversationActions').classList.remove('hidden');
    } catch (error) {
      notice(error.message);
    }
  }
  async function conversationAction(action) {
    if (!state.activeConversation) return;
    try {
      await api(`/api/platform/conversations/${state.activeConversation}`, {
        method: 'PATCH',
        body: { action },
        csrf: true
      });
      notice(action === 'ARCHIVE' ? 'Conversa arquivada.' : 'Usuário bloqueado.');
      state.activeConversation = null;
      byId('conversationForm').classList.add('hidden');
      byId('conversationActions').classList.add('hidden');
      loadChat();
    } catch (error) {
      notice(error.message);
    }
  }
  async function shareTemporaryLocation() {
    if (!state.activeConversation) return;
    if (!confirm('Compartilhar sua localização atual por 1 hora nesta conversa?')) return;
    try {
      const position = await locate();
      await api(`/api/platform/conversations/${state.activeConversation}/messages`, {
        method: 'POST',
        body: {
          messageType: 'LOCATION',
          latitude: position.latitude,
          longitude: position.longitude
        },
        csrf: true
      });
      notice('Localização compartilhada por 1 hora.');
      openConversation(state.activeConversation);
    } catch (error) {
      notice(error.message);
    }
  }
  async function submitConversation(event) {
    event.preventDefault();
    if (!state.activeConversation) return;
    const body = byId('conversationBody').value.trim();
    if (!body) return;
    try {
      await api(`/api/platform/conversations/${state.activeConversation}/messages`, {
        method: 'POST',
        body: { body },
        csrf: true
      });
      byId('conversationBody').value = '';
      openConversation(state.activeConversation);
    } catch (error) {
      notice(error.message);
    }
  }
  async function requestConversation({
    contactId,
    contextType = 'COMMUNITY',
    contextId = null
  } = {}) {
    if (!contactId) return notice('Este autor não habilitou conversas.');
    try {
      await api('/api/platform/conversation-requests', {
        method: 'POST',
        body: { recipientContactId: contactId, contextType, contextId },
        csrf: true
      });
      notice('Solicitação enviada sem compartilhar seus dados pessoais.');
    } catch (error) {
      notice(error.message);
    }
  }

  async function loadRoutes() {
    const host = byId('sharedRouteList');
    empty(host, 'Carregando rotas compartilhadas…');
    try {
      const data = await api('/api/platform/shared-routes');
      host.replaceChildren();
      if (!data.routes.length) return empty(host, 'Ainda não há rotas compartilhadas publicadas.');
      for (const route of data.routes) {
        const article = item(route.title, `${route.originLabel} → ${route.destinationLabel}`);
        if (route.stops.length)
          article.append(node('p', '', `Paradas: ${route.stops.join(' · ')}`));
        if (route.alerts.length)
          article.append(node('p', '', `Alertas: ${route.alerts.join(' · ')}`));
        if (route.sponsored)
          article.append(node('span', 'sponsored-label', 'Conteúdo patrocinado'));
        host.append(article);
      }
    } catch (error) {
      empty(host, error.message);
    }
  }
  async function loadBenefits() {
    const host = byId('benefitList');
    empty(host, 'Carregando benefícios…');
    try {
      const data = await api('/api/platform/benefits');
      host.replaceChildren();
      if (!data.benefits.length) return empty(host, 'Nenhum benefício ativo neste momento.');
      for (const benefit of data.benefits) {
        const article = item(benefit.partnerName, benefit.description);
        article.append(
          node('span', 'sponsored-label', 'Parceiro patrocinado'),
          node('p', '', `Regras: ${benefit.rules}`),
          node('small', '', `Válido até ${formatDate(benefit.validUntil)}`)
        );
        actions(article, [{ label: 'Ir até o parceiro', action: () => navigateTo(benefit) }]);
        host.append(article);
      }
    } catch (error) {
      empty(host, error.message);
    }
  }
  function customizeDiscover() {
    const blocks = [...document.querySelectorAll('[data-discover-block]')];
    const names = blocks.map(block => block.dataset.discoverBlock).join(', ');
    const selected = prompt(
      `Blocos disponíveis: ${names}. Digite os que deseja mostrar, separados por vírgula:`,
      localStorage.getItem('rastreon:community-blocks') || names
    );
    if (selected == null) return;
    const visible = new Set(selected.split(',').map(value => value.trim().toLowerCase()));
    localStorage.setItem('rastreon:community-blocks', [...visible].join(','));
    blocks.forEach(block =>
      block.classList.toggle('hidden', !visible.has(block.dataset.discoverBlock))
    );
  }
  function restoreDiscoverBlocks() {
    const saved = localStorage.getItem('rastreon:community-blocks');
    if (!saved) return;
    const visible = new Set(saved.split(','));
    document
      .querySelectorAll('[data-discover-block]')
      .forEach(block =>
        block.classList.toggle('hidden', !visible.has(block.dataset.discoverBlock))
      );
  }

  async function initialize() {
    if (state.initialized || !byId('communityView')) return;
    state.initialized = true;
    document
      .querySelectorAll('[data-platform-tab]')
      .forEach(button =>
        button.addEventListener('click', () => showTab(button.dataset.platformTab))
      );
    byId('reloadStations').addEventListener('click', loadStations);
    byId('reloadReports').addEventListener('click', loadReports);
    byId('roadReportForm').addEventListener('submit', submitReport);
    byId('useReportLocation').addEventListener('click', chooseReportPosition);
    byId('roadReportMiniMap').addEventListener('click', event => {
      if (!state.position) return chooseReportPosition();
      const bounds = event.currentTarget.getBoundingClientRect();
      const latitude =
        state.position.latitude + (0.5 - (event.clientY - bounds.top) / bounds.height) * 0.04;
      const longitude =
        state.position.longitude + ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.04;
      byId('roadReportLatitude').value = latitude.toFixed(6);
      byId('roadReportLongitude').value = longitude.toFixed(6);
      notice('Posição da ocorrência ajustada no mapa.');
    });
    ['reportDistance', 'reportCategoryFilter', 'reportSeverityFilter', 'reportTimeFilter'].forEach(
      id => byId(id).addEventListener('change', loadReports)
    );
    byId('pxForm').addEventListener('submit', submitPx);
    byId('pxChannel').addEventListener('change', loadPxMessages);
    byId('pxReplyPreview')
      .querySelector('button')
      .addEventListener('click', () => {
        state.pxReply = null;
        byId('pxReplyPreview').classList.add('hidden');
      });
    byId('conversationForm').addEventListener('submit', submitConversation);
    byId('shareTemporaryLocation').addEventListener('click', shareTemporaryLocation);
    byId('archiveConversation').addEventListener('click', () => conversationAction('ARCHIVE'));
    byId('blockConversation').addEventListener('click', () => conversationAction('BLOCK'));
    byId('reportConversation').addEventListener('click', () =>
      reportContent('CONVERSATION', state.activeConversation)
    );
    byId('conversationSearch').addEventListener('input', event => {
      const query = event.target.value.trim().toLowerCase();
      byId('conversationList')
        .querySelectorAll('[data-conversation-search]')
        .forEach(article =>
          article.classList.toggle('hidden', !article.dataset.conversationSearch.includes(query))
        );
    });
    byId('stationRadius').addEventListener('change', event =>
      loadStations(Number(event.target.value))
    );
    byId('reloadStationTab').addEventListener('click', () =>
      loadStations(Number(byId('stationRadius').value))
    );
    ['stationFuel', 'stationSort'].forEach(id =>
      byId(id).addEventListener('change', renderStationTab)
    );
    byId('stationBrand').addEventListener('input', renderStationTab);
    byId('stationListMode').addEventListener('click', () => {
      byId('stationMiniMap').classList.add('hidden');
      byId('stationTabList').classList.remove('hidden');
    });
    byId('stationMapMode').addEventListener('click', () => {
      byId('stationMiniMap').classList.remove('hidden');
      byId('stationTabList').classList.add('hidden');
      renderStationTab();
    });
    byId('customizeDiscover').addEventListener('click', customizeDiscover);
    byId('communityMoreTab').addEventListener('change', event => {
      if (event.target.value) showTab(event.target.value);
    });
    restoreDiscoverBlocks();
    byId('chatEnabled').addEventListener('change', async event => {
      try {
        await api('/api/platform/chat/settings', {
          method: 'PATCH',
          body: { enabled: event.target.checked },
          csrf: true
        });
        notice(event.target.checked ? 'Solicitações habilitadas.' : 'Solicitações desabilitadas.');
      } catch (error) {
        event.target.checked = !event.target.checked;
        notice(error.message);
      }
    });
    byId('platformSearchInput').addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(search, 250);
    });
    window.addEventListener('rastreon:user-location', event => {
      state.position = event.detail;
    });
    await Promise.allSettled([loadStatus()]);
    await loadStations().catch(error => notice(error.message));
    await Promise.allSettled([loadReports(), loadPx(), loadChat()]);
  }
  document.querySelector('[data-view="community"]')?.addEventListener('click', initialize);
  window.RastreonPlatform = { initialize, requestConversation, reportContent };
})();
