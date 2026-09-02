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
    return openPriceSheet(station);
  }
  async function confirmFuelPrice(station, fuelType = '') {
    const stationId = station.stationId || station.id;
    const price = (station.prices || []).find(
      value => !fuelType || String(value.fuelType).toUpperCase() === fuelType
    );
    if (!price || !stationId) return notice('Não há preço informado para confirmar.');
    try {
      const result = await api(`/api/platform/stations/${stationId}/prices/${price.id}/confirm`, {
        method: 'PUT',
        body: {},
        csrf: true
      });
      notice(`Preço confirmado por ${result.confirmations} pessoa(s).`);
      loadStations(state.stationRadius);
      return result;
    } catch (error) {
      notice(error.message);
      return null;
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
  async function comments(entityType, entityId, place = null) {
    return openCommentsSheet(
      place || { entityType, entityId, name: 'Comentários', categoryLabel: '' }
    );
  }

  // ---------------------------------------------------------------------------
  // Locais próximos (postos, padarias, mercados…): carrossel, preços e comentários
  // ---------------------------------------------------------------------------
  const PLACE_CATEGORIES = [
    ['fuel', 'Postos', 'fuel'],
    ['bakery', 'Padarias', 'food'],
    ['restaurant', 'Restaurantes', 'food'],
    ['cafe', 'Cafeterias', 'food'],
    ['supermarket', 'Mercados', 'shopping'],
    ['pharmacy', 'Farmácias', 'hospital'],
    ['hospital', 'Hospitais', 'hospital'],
    ['mechanic', 'Oficinas', 'mechanic'],
    ['charge', 'Recarga elétrica', 'fuel']
  ];
  const FUEL_LABELS = new Map(FUEL_TYPES);
  state.placeCategory = 'bakery';
  state.places = [];
  function placeIcon(category) {
    const found = PLACE_CATEGORIES.find(([key]) => key === category);
    if (found) return found[2];
    if (['bar'].includes(category)) return 'food';
    if (['dentist', 'veterinary'].includes(category)) return 'hospital';
    if (['parking', 'airport', 'hotel'].includes(category)) return 'parking';
    if (['police', 'fire_station'].includes(category)) return 'police';
    return 'pin';
  }
  function money(value) {
    return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
  }
  function bestPrice(place) {
    const prices = (place.prices || []).filter(price => Number.isFinite(Number(price.price)));
    if (!prices.length) return null;
    return prices.reduce((best, price) =>
      Number(price.price) < Number(best.price) ? price : best
    );
  }
  function svgIcon(id) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `/images/map-icons.svg#${id}`);
    svg.append(use);
    return svg;
  }
  function placeEntity(place) {
    return {
      entityType: place.entityType || (place.stationId ? 'FUEL_STATION' : 'POI'),
      entityId: place.entityId || place.stationId || place.placeKey || place.id
    };
  }
  function focusPlaceOnMap(place) {
    window.dispatchEvent(new CustomEvent('rastreon:focus-place', { detail: place }));
    document.querySelector('[data-view="tracking"]')?.click();
  }
  function placeCard(place, { kind = 'place' } = {}) {
    const icon = placeIcon(place.category);
    const article = node('article', `place-card place-card--${icon}`);
    article.dataset.placeKey = place.placeKey || place.id;
    const head = node('div', 'place-card__head');
    const badge = node('span', 'place-card__icon');
    badge.append(svgIcon(icon));
    const copy = node('div', 'place-card__copy');
    copy.append(node('strong', '', place.name));
    copy.append(
      node(
        'small',
        '',
        [place.brand || place.categoryLabel, distanceLabel(place.distanceMeters)]
          .filter(Boolean)
          .join(' · ')
      )
    );
    head.append(badge, copy);
    if (place.registered && (place.stationId || kind === 'station')) {
      const favorite = node(
        'button',
        `place-card__fav${place.favorite ? ' is-active' : ''}`,
        place.favorite ? '♥' : '♡'
      );
      favorite.type = 'button';
      favorite.setAttribute(
        'aria-label',
        place.favorite ? 'Remover dos favoritos' : 'Favoritar posto'
      );
      favorite.addEventListener('click', async () => {
        try {
          await api(`/api/platform/stations/${place.stationId || place.id}/favorite`, {
            method: place.favorite ? 'DELETE' : 'POST',
            csrf: true
          });
          place.favorite = !place.favorite;
          favorite.textContent = place.favorite ? '♥' : '♡';
          favorite.classList.toggle('is-active', place.favorite);
        } catch (error) {
          notice(error.message);
        }
      });
      head.append(favorite);
    }
    article.append(head);
    if (place.category === 'fuel') {
      const price = bestPrice(place);
      const block = node('div', `place-card__price${price ? '' : ' is-empty'}`);
      if (price) {
        block.append(node('b', '', money(price.price)));
        block.append(
          node(
            'small',
            '',
            `${FUEL_LABELS.get(String(price.fuelType).toUpperCase()) || price.fuelType} · ${price.confirmations || 0} confirmação(ões)`
          )
        );
      } else {
        block.append(node('b', '', 'Sem preço'));
        block.append(node('small', '', 'Seja o primeiro a informar'));
      }
      article.append(block);
    } else if (place.address) {
      article.append(node('p', 'place-card__address', place.address));
    }
    const meta = node('div', 'place-card__meta');
    const rating = place.rating?.count
      ? `★ ${Number(place.rating.average).toFixed(1).replace('.', ',')} (${place.rating.count})`
      : '';
    if (rating) meta.append(node('span', 'place-card__rating', rating));
    meta.append(
      node(
        'span',
        '',
        place.commentCount ? `${place.commentCount} comentário(s)` : 'Nenhum comentário ainda'
      )
    );
    if (place.partnerBenefit)
      meta.append(
        node('span', 'place-card__benefit', `Parceiro: ${place.partnerBenefit.description}`)
      );
    article.append(meta);
    const buttons = [];
    if (place.category === 'fuel')
      buttons.push({ label: 'Preços', action: () => openPriceSheet(place) });
    buttons.push({
      label: 'Comentários',
      secondary: place.category === 'fuel',
      action: () => openCommentsSheet(place)
    });
    buttons.push({ label: 'Ver no mapa', secondary: true, action: () => focusPlaceOnMap(place) });
    actions(article, buttons);
    return article;
  }
  function renderCarousel(host, places, options = {}) {
    host.replaceChildren();
    host.classList.add('has-carousel');
    const carousel = node('div', 'place-carousel');
    const track = node('div', 'place-carousel__track');
    track.setAttribute('role', 'list');
    for (const place of places) {
      const card = placeCard(place, options);
      card.setAttribute('role', 'listitem');
      track.append(card);
    }
    const previous = node('button', 'place-carousel__nav place-carousel__nav--prev', '‹');
    previous.type = 'button';
    previous.setAttribute('aria-label', 'Anterior');
    const next = node('button', 'place-carousel__nav place-carousel__nav--next', '›');
    next.type = 'button';
    next.setAttribute('aria-label', 'Próximo');
    const step = () => Math.max(220, track.clientWidth * 0.8);
    previous.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
    const syncNav = () => {
      previous.disabled = track.scrollLeft <= 4;
      next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    };
    track.addEventListener('scroll', syncNav, { passive: true });
    carousel.append(previous, track, next);
    host.append(carousel);
    requestAnimationFrame(syncNav);
    return carousel;
  }
  async function loadNearbyPlaces(category = state.placeCategory) {
    state.placeCategory = category;
    const host = byId('communityPlaceCarousel');
    if (!host) return;
    document
      .querySelectorAll('#communityPlaceChips [data-place-category]')
      .forEach(chip =>
        chip.setAttribute('aria-pressed', String(chip.dataset.placeCategory === category))
      );
    const label = PLACE_CATEGORIES.find(([key]) => key === category)?.[1] || 'Locais';
    empty(host, `Buscando ${label.toLowerCase()} em até 3 km…`);
    let position;
    try {
      position = await locate();
    } catch {
      return empty(host, 'Autorize a localização para ver locais próximos.');
    }
    try {
      const data = await api(
        `/api/places/nearby?lat=${position.latitude}&lng=${position.longitude}&categories=${category}&radiusMeters=3000&limit=24`
      );
      if (state.placeCategory !== category) return;
      state.places = data.places || [];
      if (!state.places.length)
        return empty(host, `Nenhum local de “${label}” encontrado em 3 km.`);
      renderCarousel(host, state.places);
    } catch (error) {
      empty(host, error.message || 'Locais indisponíveis no momento.');
    }
  }
  function setupNearbyPlaces() {
    const chips = byId('communityPlaceChips');
    if (!chips) return;
    chips.replaceChildren();
    for (const [key, label, icon] of PLACE_CATEGORIES) {
      if (key === 'fuel') continue;
      const chip = node('button', 'place-chip');
      chip.type = 'button';
      chip.dataset.placeCategory = key;
      chip.setAttribute('aria-pressed', String(key === state.placeCategory));
      chip.append(svgIcon(icon), node('span', '', label));
      chip.addEventListener('click', () => loadNearbyPlaces(key));
      chips.append(chip);
    }
    byId('reloadPlaces')?.addEventListener('click', () => loadNearbyPlaces());
  }

  function sheet(className) {
    let dialog = document.querySelector(`dialog.${className}`);
    if (dialog) {
      dialog.replaceChildren();
      return dialog;
    }
    dialog = node('dialog', `place-sheet ${className}`);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    document.body.append(dialog);
    return dialog;
  }
  function sheetHeader(dialog, place, eyebrow) {
    const header = node('header', 'place-sheet__header');
    const copy = node('div');
    copy.append(node('span', 'place-sheet__eyebrow', eyebrow));
    copy.append(node('h3', '', place.name || 'Local'));
    copy.append(
      node(
        'p',
        '',
        [place.address, distanceLabel(place.distanceMeters)].filter(Boolean).join(' · ') ||
          place.categoryLabel ||
          ''
      )
    );
    const close = node('button', 'place-sheet__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar');
    close.addEventListener('click', () => dialog.close());
    header.append(copy, close);
    dialog.append(header);
    return header;
  }
  async function refreshPlacePrices(place) {
    try {
      const data = await api(
        `/api/places/nearby?lat=${place.latitude}&lng=${place.longitude}&categories=fuel&radiusMeters=300&limit=10`
      );
      const match = (data.places || []).find(
        item =>
          item.placeKey === place.placeKey ||
          (place.stationId && item.stationId === place.stationId) ||
          distanceMeters(item, place) <= 40
      );
      if (match) {
        Object.assign(place, {
          stationId: match.stationId,
          registered: match.registered,
          prices: match.prices,
          entityType: match.entityType,
          entityId: match.entityId,
          commentCount: match.commentCount,
          rating: match.rating
        });
      }
    } catch {}
    return place;
  }
  async function openPriceSheet(place) {
    const dialog = sheet('place-sheet--prices');
    sheetHeader(dialog, place, 'Preços informados pela comunidade');
    const body = node('div', 'place-sheet__body');
    dialog.append(body);
    if (!dialog.open) dialog.showModal();
    body.append(node('div', 'empty-state', 'Carregando preços…'));
    await refreshPlacePrices(place);
    const render = () => {
      body.replaceChildren();
      const grid = node('dl', 'station-price-grid station-price-grid--sheet');
      const pricesByType = new Map(
        (place.prices || []).map(price => [String(price.fuelType).toUpperCase(), price])
      );
      for (const [fuelType, label] of FUEL_TYPES) {
        const price = pricesByType.get(fuelType);
        const row = node('div', price ? 'has-price' : 'no-price');
        row.append(node('dt', '', label));
        row.append(node('dd', '', price ? money(price.price) : 'Não informado'));
        if (price) {
          row.append(
            node(
              'small',
              '',
              `${price.status === 'CONFIRMED' ? 'Confirmado' : 'Aguardando confirmação'} · ${price.confirmations || 0} confirmação(ões) · ${formatDate(price.observedAt)}`
            )
          );
          const confirm = node('button', 'secondary', 'Confirmar');
          confirm.type = 'button';
          confirm.addEventListener('click', async () => {
            confirm.disabled = true;
            const result = await confirmFuelPrice(place, fuelType);
            if (result) {
              price.confirmations = result.confirmations;
              price.status = result.status;
              render();
            } else confirm.disabled = false;
          });
          row.append(confirm);
        }
        grid.append(row);
      }
      body.append(grid);
      const form = node('form', 'place-sheet__form');
      form.append(node('h4', '', 'Informar preço observado'));
      const select = node('select');
      select.setAttribute('aria-label', 'Tipo de combustível');
      for (const [fuelType, label] of FUEL_TYPES) {
        const option = node('option', '', label);
        option.value = fuelType;
        select.append(option);
      }
      const input = node('input');
      input.type = 'number';
      input.step = '0.01';
      input.min = '0.5';
      input.max = '100';
      input.placeholder = 'Ex.: 5,89';
      input.required = true;
      input.setAttribute('aria-label', 'Preço por litro');
      const submit = node('button', '', 'Enviar preço');
      submit.type = 'submit';
      const fields = node('div', 'place-sheet__fields');
      fields.append(select, input, submit);
      form.append(fields);
      form.append(
        node(
          'small',
          '',
          'O preço fica pendente até ser confirmado por outras pessoas. Nunca informe dados pessoais.'
        )
      );
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const price = Number(String(input.value).replace(',', '.'));
        if (!Number.isFinite(price) || price <= 0) return notice('Informe um preço válido.');
        submit.disabled = true;
        try {
          const payload = { fuelType: select.value, price, observedAt: Date.now() };
          const result = place.stationId
            ? await api(`/api/platform/stations/${place.stationId}/prices`, {
                method: 'POST',
                body: payload,
                csrf: true
              })
            : await api(`/api/platform/places/${encodeURIComponent(place.placeKey)}/prices`, {
                method: 'POST',
                body: {
                  ...payload,
                  place: {
                    name: place.name,
                    brand: place.brand,
                    address: place.address,
                    latitude: place.latitude,
                    longitude: place.longitude,
                    phone: place.phone,
                    source: 'OpenStreetMap'
                  }
                },
                csrf: true
              });
          if (result.station) {
            place.stationId = result.station.id;
            place.registered = true;
            place.prices = result.station.prices;
            place.entityType = 'FUEL_STATION';
            place.entityId = result.station.id;
          }
          notice('Preço enviado para validação da comunidade.');
          input.value = '';
          render();
          loadStations(state.stationRadius);
        } catch (error) {
          notice(error.message);
        } finally {
          submit.disabled = false;
        }
      });
      body.append(form);
    };
    render();
  }
  async function openCommentsSheet(place) {
    const dialog = sheet('place-sheet--comments');
    sheetHeader(dialog, place, place.categoryLabel || 'Comentários da comunidade');
    const body = node('div', 'place-sheet__body');
    dialog.append(body);
    if (!dialog.open) dialog.showModal();
    body.append(node('div', 'empty-state', 'Carregando comentários…'));
    if (place.category === 'fuel' && !place.entityType) await refreshPlacePrices(place);
    const { entityType, entityId } = placeEntity(place);
    const list = node('div', 'place-comments');
    const load = async () => {
      try {
        const data = await api(
          `/api/platform/comments/${entityType}/${encodeURIComponent(entityId)}`
        );
        list.replaceChildren();
        if (!data.comments.length)
          list.append(
            node('div', 'empty-state', 'Ainda não há comentários. Compartilhe sua experiência.')
          );
        for (const comment of data.comments) {
          const item = node('article', 'place-comment');
          const head = node('header');
          head.append(node('strong', '', comment.author?.displayName || 'Usuário'));
          head.append(node('small', '', formatDate(comment.createdAt)));
          item.append(head, node('p', '', comment.body));
          const footer = node('div', 'place-comment__actions');
          const like = node('button', 'text-btn', `Útil (${comment.likes || 0})`);
          like.type = 'button';
          like.addEventListener('click', async () => {
            try {
              await api(`/api/platform/comments/${comment.id}/reaction`, {
                method: 'PUT',
                body: { reaction: 'LIKE' },
                csrf: true
              });
              load();
            } catch (error) {
              notice(error.message);
            }
          });
          footer.append(like);
          if (!comment.mine) {
            const report = node('button', 'text-btn', 'Denunciar');
            report.type = 'button';
            report.addEventListener('click', () => reportContent('COMMENT', comment.id));
            footer.append(report);
          }
          item.append(footer);
          list.append(item);
        }
      } catch (error) {
        list.replaceChildren(node('div', 'empty-state', error.message));
      }
    };
    body.replaceChildren(list);
    const form = node('form', 'place-sheet__form');
    const textarea = node('textarea');
    textarea.maxLength = 1000;
    textarea.rows = 3;
    textarea.placeholder = 'Como foi sua experiência? Sem telefone, e-mail ou dados de terceiros.';
    textarea.setAttribute('aria-label', 'Novo comentário');
    const submit = node('button', '', 'Publicar comentário');
    submit.type = 'submit';
    form.append(textarea, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const value = textarea.value.trim();
      if (value.length < 2) return notice('Escreva um comentário com pelo menos 2 caracteres.');
      submit.disabled = true;
      try {
        await api(`/api/platform/comments/${entityType}/${encodeURIComponent(entityId)}`, {
          method: 'POST',
          body: { body: value },
          csrf: true
        });
        textarea.value = '';
        place.commentCount = (place.commentCount || 0) + 1;
        notice('Comentário publicado.');
        await load();
      } catch (error) {
        notice(error.message);
      } finally {
        submit.disabled = false;
      }
    });
    body.append(form);
    if (window.RastreonCommunity?.isEnabled?.() && place.placeKey && place.latitude != null) {
      const review = node('button', 'secondary place-sheet__review', 'Avaliar com nota (1 a 5)');
      review.type = 'button';
      review.addEventListener('click', () =>
        window.RastreonCommunity.openPlace({
          placeKey: place.placeKey,
          provider: place.placeKey.split(':')[0],
          name: place.name,
          address: place.address || '',
          latitude: place.latitude,
          longitude: place.longitude
        })
      );
      body.append(review);
    }
    await load();
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
    let data;
    try {
      data = await api(
        `/api/places/nearby?lat=${position.latitude}&lng=${position.longitude}&categories=fuel&radiusMeters=${state.stationRadius}&limit=40`
      );
    } catch {
      notice('A busca de postos está temporariamente indisponível. Tente atualizar.');
      return empty(
        host,
        'Não foi possível consultar os postos agora. Use “Atualizar” para tentar novamente.'
      );
    }
    state.stations = (data.places || [])
      .map(place => ({
        ...place,
        // Compatibilidade com o restante do módulo: `id` continua sendo o
        // identificador do posto cadastrado quando existir.
        id: place.stationId || place.placeKey,
        providerPlaceId: place.placeKey,
        source: place.registered ? 'Comunidade RASTREON' : 'OpenStreetMap',
        distanceMeters: place.distanceMeters ?? Math.round(distanceMeters(position, place))
      }))
      .filter(station => station.distanceMeters <= state.stationRadius)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    updateCommunityMap();
    if (!state.stations.length) {
      renderStationTab();
      return empty(
        host,
        `Nenhum posto encontrado em ${state.stationRadius / 1000} km. Amplie o raio para 5, 10 ou 20 km.`
      );
    }
    renderCarousel(host, state.stations, { kind: 'station' });
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
    setupNearbyPlaces();
    window.addEventListener('rastreon:place-prices', event => openPriceSheet(event.detail));
    window.addEventListener('rastreon:place-comments', event => openCommentsSheet(event.detail));
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
    await Promise.allSettled([loadNearbyPlaces(), loadReports(), loadPx(), loadChat()]);
  }
  document.querySelector('[data-view="community"]')?.addEventListener('click', initialize);
  window.RastreonPlatform = { initialize, requestConversation, reportContent };
})();
