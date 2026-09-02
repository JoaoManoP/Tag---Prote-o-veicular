/* global L */
'use strict';

(function initializeMapService() {
  const config = window.RASTROTACK_MAP_CONFIG || {};
  const leaflet = window.L;

  function loadGoogleMaps() {
    if (window.google?.maps) return Promise.resolve(window.google.maps);
    return new Promise((resolve, reject) => {
      const callback = `__rastroMapsReady_${Date.now()}`;
      const script = document.createElement('script');
      const params = new URLSearchParams({
        key: config.googleMapsApiKey,
        loading: 'async',
        callback,
        language: 'pt-BR',
        region: 'BR',
        v: 'weekly'
      });
      window[callback] = () => {
        delete window[callback];
        resolve(window.google.maps);
      };
      script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
      script.async = true;
      script.onerror = () => {
        delete window[callback];
        reject(new Error('Google Maps não pôde ser carregado.'));
      };
      document.head.appendChild(script);
    });
  }

  const point = value =>
    Array.isArray(value)
      ? { lat: Number(value[0]), lng: Number(value[1]) }
      : { lat: Number(value.lat ?? value.latitude), lng: Number(value.lng ?? value.longitude) };
  const eventPoint = value => ({ lat: value.lat(), lng: value.lng() });

  function googleFacade(maps) {
    class LayerGroup {
      constructor() {
        this.items = new Set();
      }
      addTo() {
        return this;
      }
      addLayer(item) {
        this.items.add(item);
        item._attach?.();
        return this;
      }
      removeLayer(item) {
        item?.remove?.();
        this.items.delete(item);
        return this;
      }
      clearLayers() {
        this.items.forEach(item => item.remove?.());
        this.items.clear();
        return this;
      }
    }

    class Shape {
      constructor(kind, value, options = {}) {
        this.kind = kind;
        this.value = value;
        this.options = options;
        this.listeners = [];
      }
      addTo(target) {
        this.target = target;
        target instanceof LayerGroup ? target.addLayer(this) : this._attach(target);
        return this;
      }
      _attach(target = this.target) {
        if (target instanceof LayerGroup) {
          this.group = target;
          target = mapInstance;
        }
        this.map = target?._map || target || mapInstance;
        if (this.object) {
          if (this.object.setMap) this.object.setMap(this.map);
          else this.object.map = this.map;
        } else this.object = this._create();
        return this;
      }
      _create() {
        const common = { map: this.map, clickable: true };
        let object;
        if (this.kind === 'marker' && config.googleMapsMapId) {
          const element = document.createElement('div');
          element.className = this.options.icon?.options?.className || 'map-pin';
          element.innerHTML = this.options.icon?.options?.html || '<span></span>';
          object = new maps.marker.AdvancedMarkerElement({
            ...common,
            position: point(this.value),
            content: element
          });
        } else if (this.kind === 'marker') {
          const vehicle = this.options.icon?.options?.className === 'vehicle-icon';
          object = new maps.Marker({
            ...common,
            position: point(this.value),
            icon: vehicle
              ? {
                  path: 'M-5,-10 L5,-10 Q8,-7 8,-2 L8,7 Q8,10 5,10 L-5,10 Q-8,10 -8,7 L-8,-2 Q-8,-7 -5,-10 Z M-4,-6 L4,-6 L5,-1 L-5,-1 Z',
                  fillColor: '#ff5a0a',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                  scale: 1.15,
                  rotation: 0
                }
              : undefined
          });
        } else if (this.kind === 'circleMarker')
          object = new maps.Circle({
            ...common,
            center: point(this.value),
            radius: this.options.radius || 8,
            strokeColor: this.options.color,
            strokeWeight: this.options.weight,
            fillColor: this.options.fillColor,
            fillOpacity: this.options.fillOpacity
          });
        else if (this.kind === 'circle')
          object = new maps.Circle({
            ...common,
            center: point(this.value),
            radius: this.options.radius || 0,
            strokeColor: this.options.color,
            strokeWeight: this.options.weight || 2,
            strokeOpacity: this.options.opacity ?? 1,
            fillColor: this.options.fillColor || this.options.color,
            fillOpacity: this.options.fillOpacity ?? 0
          });
        else if (this.kind === 'polygon')
          object = new maps.Polygon({
            ...common,
            paths: this.value.map(point),
            strokeColor: this.options.color,
            strokeWeight: this.options.weight || 2,
            fillColor: this.options.fillColor || this.options.color,
            fillOpacity: this.options.fillOpacity ?? 0.12
          });
        else
          object = new maps.Polyline({
            ...common,
            path: this.value.map(point),
            strokeColor: this.options.color,
            strokeWeight: this.options.weight || 4,
            strokeOpacity: this.options.opacity ?? 1,
            icons: this.options.dashArray
              ? [
                  {
                    icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 2 },
                    offset: '0',
                    repeat: '12px'
                  }
                ]
              : undefined
          });
        this.listeners.forEach(([name, handler]) => this._listen(object, name, handler));
        return object;
      }
      _listen(object, name, handler) {
        return object.addListener(name, event =>
          handler(
            event?.latLng
              ? { latlng: eventPoint(event.latLng), originalEvent: event.domEvent }
              : event
          )
        );
      }
      on(name, handler) {
        this.listeners.push([name, handler]);
        if (this.object) this._listen(this.object, name, handler);
        return this;
      }
      bindTooltip(text) {
        this.tooltip = text;
        return this;
      }
      bindPopup(text) {
        this.tooltip = text;
        this.on('click', () => {
          this.info?.close();
          this.info = new maps.InfoWindow({ content: String(text) });
          this.info.open({ map: this.map, anchor: this.object });
        });
        return this;
      }
      openTooltip() {
        return this;
      }
      openPopup() {
        this.object?.togglePopup?.();
        return this;
      }
      setLatLng(value) {
        this.value = value;
        if (this.kind === 'marker')
          this.object.setPosition
            ? this.object.setPosition(point(value))
            : (this.object.position = point(value));
        else this.object.setCenter(point(value));
        return this;
      }
      getLatLng() {
        const p = this.kind === 'marker' ? this.object.position : this.object.getCenter();
        return {
          lat: typeof p.lat === 'function' ? p.lat() : p.lat,
          lng: typeof p.lng === 'function' ? p.lng() : p.lng
        };
      }
      setRadius(radius) {
        this.options.radius = radius;
        this.object?.setRadius(radius);
        return this;
      }
      setHeading(heading) {
        if (!this.object) return this;
        const content = this.object.content;
        if (content) content.style.transform = `rotate(${heading}deg)`;
        else if (this.object.getIcon) {
          const icon = { ...this.object.getIcon(), rotation: heading };
          this.object.setIcon(icon);
        }
        return this;
      }
      getBounds() {
        return this.object?.getBounds?.();
      }
      remove() {
        this.info?.close();
        if (this.object?.setMap) this.object.setMap(null);
        else if (this.object) this.object.map = null;
        this.object = null;
        return this;
      }
    }

    let mapInstance;
    class MapWrapper {
      constructor(id) {
        this._map = new maps.Map(document.getElementById(id), {
          center: { lat: -19.47, lng: -42.54 },
          zoom: 10,
          mapId: config.googleMapsMapId || undefined,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy'
        });
        mapInstance = this._map;
        this.traffic = new maps.TrafficLayer();
      }
      setView(center, zoom) {
        this._map.setCenter(point(center));
        if (Number.isFinite(zoom)) this._map.setZoom(zoom);
        return this;
      }
      fitBounds(bounds, options = {}) {
        const value = bounds instanceof maps.LatLngBounds ? bounds : bounds?._bounds || bounds;
        this._map.fitBounds(value, options.padding?.[0] || 30);
        return this;
      }
      removeLayer(layer) {
        layer?.remove?.();
        return this;
      }
      getZoom() {
        return this._map.getZoom() || 10;
      }
      getCenter() {
        return eventPoint(this._map.getCenter());
      }
      panTo(center) {
        this._map.panTo(point(center));
        return this;
      }
      setTraffic(enabled) {
        this.traffic.setMap(enabled ? this._map : null);
        return this;
      }
      setTilt(value) {
        this._map.setTilt(value);
        return this;
      }
      setHeading(value) {
        this._map.setHeading(value);
        return this;
      }
      invalidateSize() {
        maps.event.trigger(this._map, 'resize');
        return this;
      }
      getNativeMap() {
        return this._map;
      }
      on(name, handler) {
        return this._map.addListener(name === 'moveend' ? 'idle' : name, event =>
          handler(
            event?.latLng
              ? { latlng: eventPoint(event.latLng), originalEvent: event.domEvent }
              : event
          )
        );
      }
      once(name, handler) {
        const listener = this.on(name, event => {
          listener.remove();
          handler(event);
        });
        return listener;
      }
      off(name) {
        maps.event.clearListeners(this._map, name === 'moveend' ? 'idle' : name);
        return this;
      }
    }

    const boundsFrom = values => {
      const bounds = new maps.LatLngBounds();
      const visit = value => {
        if (Array.isArray(value) && value.length === 2 && value.every(Number.isFinite))
          bounds.extend(point(value));
        else if (Array.isArray(value)) value.forEach(visit);
      };
      visit(values);
      return bounds;
    };
    return {
      map: id => new MapWrapper(id),
      tileLayer: () => ({
        addTo() {
          return this;
        },
        on() {
          return this;
        }
      }),
      layerGroup: () => new LayerGroup(),
      marker: (value, options) => new Shape('marker', value, options),
      circle: (value, options) => new Shape('circle', value, options),
      circleMarker: (value, options) => new Shape('circleMarker', value, options),
      polygon: (value, options) => new Shape('polygon', value, options),
      polyline: (value, options) => new Shape('polyline', value, options),
      latLngBounds: boundsFrom,
      divIcon: options => ({ options })
    };
  }

  function mapLibreFacade(maplibregl) {
    let mapInstance,
      idCounter = 0;
    const lngLat = value => {
      const p = point(value);
      return [p.lng, p.lat];
    };
    const boundsFrom = values => {
      const bounds = new maplibregl.LngLatBounds();
      const visit = value => {
        if (Array.isArray(value) && value.length === 2 && value.every(Number.isFinite))
          bounds.extend(lngLat(value));
        else if (Array.isArray(value)) value.forEach(visit);
      };
      visit(values);
      return bounds;
    };
    const circleGeometry = (center, radius) => {
      const p = point(center),
        coordinates = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i * Math.PI) / 32,
          dy = (Math.sin(angle) * radius) / 111320,
          dx = (Math.cos(angle) * radius) / (111320 * Math.cos((p.lat * Math.PI) / 180));
        coordinates.push([p.lng + dx, p.lat + dy]);
      }
      return { type: 'Polygon', coordinates: [coordinates] };
    };

    class LayerGroup {
      constructor() {
        this.items = new Set();
      }
      addTo(target) {
        this.target = target;
        this.items.forEach(item => item._attach(target));
        return this;
      }
      addLayer(item) {
        this.items.add(item);
        if (this.target) item._attach(this.target);
        return this;
      }
      removeLayer(item) {
        item?.remove?.();
        this.items.delete(item);
        return this;
      }
      clearLayers() {
        this.items.forEach(item => item.remove?.());
        this.items.clear();
        return this;
      }
    }
    class Shape {
      constructor(kind, value, options = {}) {
        this.kind = kind;
        this.value = value;
        this.options = options;
        this.listeners = [];
        this.id = `rastro-${++idCounter}`;
      }
      addTo(target) {
        target instanceof LayerGroup ? target.addLayer(this) : this._attach(target);
        return this;
      }
      _attach(target) {
        this.wrapper = target instanceof LayerGroup ? target.target : target;
        this.wrapper = this.wrapper || mapInstance;
        this.map = this.wrapper?._map || this.wrapper;
        this.wrapper?._shapes?.add(this);
        this.wrapper?.ready.then(() => this._create()).catch(() => {});
        return this;
      }
      _feature() {
        if (this.kind === 'circle')
          return {
            type: 'Feature',
            geometry: circleGeometry(this.value, this.options.radius || 0)
          };
        const coordinates =
          this.kind === 'polygon' ? [this.value.map(lngLat)] : this.value.map(lngLat);
        return {
          type: 'Feature',
          geometry: { type: this.kind === 'polygon' ? 'Polygon' : 'LineString', coordinates }
        };
      }
      _create() {
        if (this.object || !this.map) return;
        if (this.kind === 'marker' || this.kind === 'circleMarker') {
          const element = document.createElement('div');
          element.className =
            this.options.icon?.options?.className ||
            (this.kind === 'circleMarker' ? 'maplibre-circle-marker' : 'map-pin');
          element.innerHTML = this.options.icon?.options?.html || '';
          if (this.kind === 'circleMarker') {
            const size = (this.options.radius || 8) * 2;
            Object.assign(element.style, {
              width: `${size}px`,
              height: `${size}px`,
              borderRadius: '50%',
              background: this.options.fillColor || this.options.color || '#ff5a0a',
              opacity: String(this.options.fillOpacity ?? 1),
              border: `${this.options.weight || 2}px solid ${this.options.color || '#fff'}`
            });
          }
          const iconOptions = this.options.icon?.options || {},
            iconSize = iconOptions.iconSize,
            iconAnchor = iconOptions.iconAnchor,
            // Ícones com contêiner 0×0 desenham a ponta do pino na própria origem;
            // ícones com tamanho declarado usam a âncora inferior (ponta do pino).
            zeroSized = Array.isArray(iconSize) && iconSize[0] === 0 && iconSize[1] === 0,
            anchor = zeroSized ? 'center' : iconAnchor ? 'bottom' : 'center',
            popupOffset = Array.isArray(iconOptions.popupAnchor)
              ? [Number(iconOptions.popupAnchor[0]) || 0, Number(iconOptions.popupAnchor[1]) || 0]
              : 18;
          this.object = new maplibregl.Marker({ element, anchor })
            .setLngLat(lngLat(this.value))
            .addTo(this.map);
          this.listeners.forEach(([name, handler]) =>
            element.addEventListener(name, event =>
              handler({ latlng: this.getLatLng(), originalEvent: event })
            )
          );
          if (this.popup)
            this.object.setPopup(
              new maplibregl.Popup({ offset: popupOffset }).setHTML(String(this.popup))
            );
          return;
        }
        const feature = this._feature();
        if (!this.map.getSource(this.id))
          this.map.addSource(this.id, { type: 'geojson', data: feature });
        const polygon = this.kind === 'polygon' || this.kind === 'circle';
        if (!this.map.getLayer(this.id))
          this.map.addLayer({
            id: this.id,
            type: polygon ? 'fill' : 'line',
            source: this.id,
            paint: polygon
              ? {
                  'fill-color': this.options.fillColor || this.options.color || '#ff5a0a',
                  'fill-opacity': this.options.fillOpacity ?? 0.12,
                  'fill-outline-color': this.options.color || '#ff5a0a'
                }
              : {
                  'line-color': this.options.color || '#ff5a0a',
                  'line-width': this.options.weight || 4,
                  'line-opacity': this.options.opacity ?? 1,
                  'line-dasharray': this.options.dashArray ? [2, 2] : [1, 0]
                }
          });
        if (!this.listenersBound) {
          this.listeners.forEach(([name, handler]) =>
            this.map.on(name, this.id, event =>
              handler({
                latlng: event.lngLat ? { lat: event.lngLat.lat, lng: event.lngLat.lng } : null,
                originalEvent: event.originalEvent
              })
            )
          );
          this.listenersBound = true;
        }
      }
      on(name, handler) {
        this.listeners.push([name, handler]);
        return this;
      }
      bindTooltip(text) {
        this.tooltip = text;
        return this;
      }
      bindPopup(text) {
        this.popup = text;
        return this;
      }
      openTooltip() {
        return this;
      }
      openPopup() {
        if (this.object?.getPopup?.() && !this.object.getPopup().isOpen())
          this.object.togglePopup();
        return this;
      }
      setLatLng(value) {
        this.value = value;
        this.object?.setLngLat(lngLat(value));
        return this;
      }
      setIcon(icon) {
        this.options.icon = icon;
        const element = this.object?.getElement?.();
        if (element) {
          element.className = icon?.options?.className || 'map-pin';
          element.innerHTML = icon?.options?.html || '';
        }
        return this;
      }
      getLatLng() {
        const value = this.object?.getLngLat() || point(this.value);
        return { lat: value.lat, lng: value.lng };
      }
      getElement() {
        return this.object?.getElement?.();
      }
      setRadius(radius) {
        this.options.radius = radius;
        const source = this.map?.getSource(this.id);
        if (source) source.setData(this._feature());
        return this;
      }
      setHeading(heading) {
        this.object?.setRotation?.(heading);
        return this;
      }
      getBounds() {
        return this.kind === 'circle'
          ? boundsFrom(this._feature().geometry.coordinates[0].map(([lng, lat]) => [lat, lng]))
          : boundsFrom(this.value);
      }
      remove() {
        if (this.object) {
          this.object.remove();
          this.object = null;
        }
        if (this.map?.getLayer(this.id)) this.map.removeLayer(this.id);
        if (this.map?.getSource(this.id)) this.map.removeSource(this.id);
        return this;
      }
    }
    class MapWrapper {
      constructor(id) {
        this.container = document.getElementById(id);
        this._shapes = new Set();
        this._trafficEnabled = false;
        this._styleUrl = config.mapStyleUrl || 'https://tiles.openfreemap.org/styles/liberty';
        this._map = new maplibregl.Map({
          container: id,
          style: this._styleUrl,
          center: [-42.54, -19.47],
          zoom: 10,
          pitch: 0,
          maxPitch: 70,
          antialias: true,
          pixelRatio: Math.min(1.75, window.devicePixelRatio || 1),
          fadeDuration: 180,
          attributionControl: true
        });
        this._map.on('style.load', () => {
          this._restoreNativePoiVisibility();
          this._shapes.forEach(shape => {
            if (shape.kind === 'marker' || shape.kind === 'circleMarker') return;
            shape.object = null;
            shape._create();
          });
          if (this._trafficEnabled) this.setTraffic(true);
          window.dispatchEvent(new CustomEvent('rastreon:map-style-restored'));
        });
        this._mapLoaded = false;
        this._mapLoadAttempts = 0;
        this.ready = new Promise(resolve => {
          const onLoad = () => {
            this._mapLoaded = true;
            clearTimeout(this._mapSlowTimer);
            clearTimeout(this._mapRetryTimer);
            this._map.off('load', onLoad);
            this._clearLoadStatus();
            resolve(this);
          };
          this._map.on('load', onLoad);
          this._map.on('error', event => {
            if (this._mapLoaded) return;
            const message =
              event?.error?.message || 'O estilo do mapa ainda não pôde ser carregado.';
            console.warn(
              '[Rastreon Map] Carregamento interrompido; uma nova tentativa será feita.',
              event?.error || event
            );
            this._showLoadStatus('Falha temporária ao carregar o mapa.', true);
            this._scheduleMapRetry();
            window.dispatchEvent(
              new CustomEvent('rastreon:map-error', { detail: { message: String(message) } })
            );
          });
          this._mapSlowTimer = setTimeout(() => {
            if (this._mapLoaded) return;
            this._showLoadStatus('O mapa está demorando para carregar.', true);
            this._scheduleMapRetry();
          }, 20000);
        });
        mapInstance = this;
      }
      _showLoadStatus(message, allowRetry = false) {
        if (!this.container) return;
        let status = this.container.querySelector('.map-load-status');
        if (!status) {
          status = document.createElement('div');
          status.className = 'map-load-status';
          status.setAttribute('role', 'status');
          status.innerHTML =
            '<strong>Carregando mapa</strong><span></span><button type="button">Tentar novamente</button>';
          status.querySelector('button').addEventListener('click', () => this._retryMapLoad());
          this.container.appendChild(status);
        }
        status.querySelector('span').textContent = message;
        status.querySelector('button').hidden = !allowRetry;
      }
      _clearLoadStatus() {
        this.container?.querySelector('.map-load-status')?.remove();
      }
      _scheduleMapRetry() {
        if (this._mapLoaded || this._mapRetryTimer) return;
        const delay = Math.min(5000 * 2 ** this._mapLoadAttempts, 30000);
        this._mapRetryTimer = setTimeout(() => {
          this._mapRetryTimer = null;
          this._retryMapLoad();
        }, delay);
      }
      _retryMapLoad() {
        if (this._mapLoaded) return;
        clearTimeout(this._mapRetryTimer);
        this._mapRetryTimer = null;
        this._mapLoadAttempts += 1;
        this._showLoadStatus('Tentando reconectar ao serviço de mapas…');
        try {
          this._map.setStyle(this._styleUrl);
        } catch (error) {
          console.warn('[Rastreon Map] Não foi possível reiniciar o estilo do mapa.', error);
        }
        this._scheduleMapRetry();
      }
      // Os POIs do estilo-base são a camada resiliente do mapa. Marcadores
      // enriquecidos da aplicação devem ser sobrepostos, nunca substituí-los.
      _restoreNativePoiVisibility() {
        const layers = this._map.getStyle?.().layers || [];
        layers.forEach(layer => {
          const sourceLayer = String(layer['source-layer'] || ''),
            isNativePoi =
              /(^|[-_])poi([-_]|$)/i.test(layer.id) || /(^|[-_])poi([-_]|$)/i.test(sourceLayer);
          if (!isNativePoi || layer.type !== 'symbol') return;
          try {
            this._map.setLayoutProperty(layer.id, 'visibility', 'visible');
          } catch {}
        });
      }
      setView(center, zoom) {
        this._map.jumpTo({
          center: lngLat(center),
          zoom: Number.isFinite(zoom) ? zoom : this.getZoom()
        });
        return this;
      }
      fitBounds(bounds, options = {}) {
        this._map.fitBounds(bounds, {
          padding: options.padding?.[0] || 30,
          maxZoom: options.maxZoom
        });
        return this;
      }
      removeLayer(layer) {
        layer?.remove?.();
        return this;
      }
      getZoom() {
        return this._map.getZoom();
      }
      getCenter() {
        const p = this._map.getCenter();
        return { lat: p.lat, lng: p.lng };
      }
      panTo(center) {
        this._map.easeTo({ center: lngLat(center) });
        return this;
      }
      setTraffic(enabled) {
        if (config.provider !== 'mapbox') return this;
        this._trafficEnabled = Boolean(enabled);
        const sourceId = 'rastreon-mapbox-traffic',
          layerId = 'rastreon-mapbox-traffic-flow';
        this.ready.then(() => {
          if (this._map.getLayer(layerId)) {
            this._map.setLayoutProperty(layerId, 'visibility', enabled ? 'visible' : 'none');
            return;
          }
          if (!enabled) return;
          if (!this._map.getSource(sourceId))
            this._map.addSource(sourceId, {
              type: 'vector',
              url: 'mapbox://mapbox.mapbox-traffic-v1'
            });
          this._map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            'source-layer': 'traffic',
            slot: 'middle',
            minzoom: 5,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': [
                'match',
                ['get', 'congestion'],
                'low',
                '#25a65a',
                'moderate',
                '#f2c230',
                'heavy',
                '#ff7a00',
                'severe',
                '#d81934',
                '#788694'
              ],
              'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 12, 3, 18, 7],
              'line-offset': 1.5,
              'line-opacity': 0.86
            }
          });
        });
        return this;
      }
      setStyle(styleUrl) {
        if (!styleUrl || styleUrl === this._styleUrl) return this;
        this._styleUrl = styleUrl;
        this._map.setStyle(styleUrl, { diff: true });
        return this;
      }
      setTilt(value) {
        this._map.easeTo({ pitch: value });
        return this;
      }
      setHeading(value) {
        this._map.easeTo({ bearing: value });
        return this;
      }
      invalidateSize() {
        this._map.resize();
        return this;
      }
      getNativeMap() {
        return this._map;
      }
      on(name, handler) {
        const normalized = name === 'moveend' ? 'moveend' : name;
        this._map.on(normalized, event =>
          handler(
            event.lngLat
              ? {
                  latlng: { lat: event.lngLat.lat, lng: event.lngLat.lng },
                  originalEvent: event.originalEvent
                }
              : event
          )
        );
        return this;
      }
      once(name, handler) {
        this._map.once(name === 'moveend' ? 'moveend' : name, event =>
          handler(
            event.lngLat
              ? {
                  latlng: { lat: event.lngLat.lat, lng: event.lngLat.lng },
                  originalEvent: event.originalEvent
                }
              : event
          )
        );
        return this;
      }
      off(name, handler) {
        this._map.off(name === 'moveend' ? 'moveend' : name, handler);
        return this;
      }
    }
    return {
      map: id => new MapWrapper(id),
      tileLayer: () => ({
        addTo() {
          return this;
        },
        on() {
          return this;
        }
      }),
      layerGroup: () => new LayerGroup(),
      marker: (value, options) => new Shape('marker', value, options),
      circle: (value, options) => new Shape('circle', value, options),
      circleMarker: (value, options) => new Shape('circleMarker', value, options),
      polygon: (value, options) => new Shape('polygon', value, options),
      polyline: (value, options) => new Shape('polyline', value, options),
      latLngBounds: boundsFrom,
      divIcon: options => ({ options })
    };
  }

  async function ready() {
    if (config.provider === 'maplibre' || config.provider === 'mapbox') {
      try {
        const maplibregl = window.maplibregl || (await window.RastroMapLibre);
        if (maplibregl)
          return { L: mapLibreFacade(maplibregl), mapProvider: config.provider, maplibregl };
        throw new Error('MapLibre indisponível.');
      } catch (error) {
        console.warn('[Rastreon Map] MapLibre indisponível, usando Leaflet como fallback.', error);
        if (config.allowMapFallback && leaflet) {
          return { L: leaflet, mapProvider: 'leaflet-fallback', message: 'Fallback Leaflet ativo' };
        }
        return {
          L: null,
          mapProvider: config.provider,
          error: `${config.provider === 'mapbox' ? 'Mapbox' : 'MapLibre'} não configurado neste ambiente.`
        };
      }
    }
    if (config.provider !== 'google') {
      if (config.allowMapFallback && leaflet) {
        console.info('[Rastreon Map] Fallback Leaflet ativo.');
        return { L: leaflet, mapProvider: 'leaflet-fallback', message: 'Fallback Leaflet ativo' };
      }
      return {
        L: null,
        mapProvider: config.provider || 'unknown',
        error: 'Provider de mapa não disponível neste ambiente.'
      };
    }
    if (!config.googleMapsApiKey) {
      if (config.allowMapFallback && leaflet) {
        console.info('[Rastreon Map] Fallback Leaflet ativo.');
        return { L: leaflet, mapProvider: 'leaflet-fallback', message: 'Fallback Leaflet ativo' };
      }
      console.warn(
        '[Rastreon Map] GOOGLE_MAPS_API_KEY ausente. Google Maps não está configurado neste ambiente.'
      );
      return {
        L: null,
        mapProvider: 'google',
        error: 'Google Maps não configurado neste ambiente. Configure GOOGLE_MAPS_API_KEY no .env.'
      };
    }
    try {
      const maps = await loadGoogleMaps();
      await maps.importLibrary('maps');
      await maps.importLibrary('marker');
      return { L: googleFacade(maps), mapProvider: 'google' };
    } catch (error) {
      if (config.allowMapFallback && leaflet) {
        console.warn(
          '[Rastreon Map] Google Maps falhou ao inicializar, usando Leaflet como fallback explícito.',
          error
        );
        return { L: leaflet, mapProvider: 'leaflet-fallback', message: 'Fallback Leaflet ativo' };
      }
      console.warn('[Rastreon Map] Google Maps falhou ao inicializar.', error);
      return {
        L: null,
        mapProvider: 'google',
        error: 'Google Maps não configurado neste ambiente.'
      };
    }
  }

  window.RastroMap = { ready: ready() };
})();
