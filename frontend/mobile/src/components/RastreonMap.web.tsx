import type mapboxgl from 'mapbox-gl';
import React, { forwardRef, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { api } from '../services/api';
import { placeVisual } from './places';
import type { MapPoint, RastreonMapProps } from './RastreonMap';

export type { MapPoint, RastreonMapProps } from './RastreonMap';
type MapConfig = { styleUrl: string; mapboxAccessToken?: string };
const DEFAULT_CENTER: [number, number] = [-42.64, -19.58];

export const RastreonMap = forwardRef<unknown, RastreonMapProps>(function RastreonMap(
  {
    focus,
    vehiclePosition,
    phonePosition,
    track = [],
    points = [],
    perspective = true,
    follow = true,
    onUserInteraction,
    onPointPress,
    onMapReady,
    onMapError
  },
  _ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const mapboxRef = useRef<typeof import('mapbox-gl').default | null>(null);
  const position = vehiclePosition || focus || track.at(-1);

  useEffect(() => {
    if (!document.querySelector('link[data-rastreon-mapbox]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.27.0/mapbox-gl.css';
      link.dataset.rastreonMapbox = 'true';
      document.head.appendChild(link);
    }
    let disposed = false;
    Promise.all([api.get<MapConfig>('/api/map/config'), import('mapbox-gl')])
      .then(([config, module]) => {
        if (disposed || !containerRef.current) return;
        const mapboxgl = module.default;
        mapboxRef.current = mapboxgl;
        mapboxgl.accessToken = config.mapboxAccessToken || '';
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: config.styleUrl || 'mapbox://styles/mapbox/streets-v12',
          center: position ? [position.longitude, position.latitude] : DEFAULT_CENTER,
          zoom: position ? 15 : 5,
          pitch: perspective ? 50 : 0
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.on('dragstart', onUserInteraction || (() => {}));
        map.on('zoomstart', onUserInteraction || (() => {}));
        map.on('load', () => {
          if (track.length > 1) {
            map.addSource('rastreon-track', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: track.map(item => [item.longitude, item.latitude])
                }
              }
            });
            map.addLayer({
              id: 'rastreon-track-line',
              type: 'line',
              source: 'rastreon-track',
              paint: { 'line-color': '#FF5A0A', 'line-width': 5 }
            });
            const bounds = new mapboxgl.LngLatBounds();
            track.forEach(item => bounds.extend([item.longitude, item.latitude]));
            map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
          }
          onMapReady?.();
        });
        map.on('error', event => {
          if (event.error) onMapError?.();
        });
      })
      .catch(() => onMapError?.());
    return () => {
      disposed = true;
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      mapboxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl) return;
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    const add = (longitude: number, latitude: number, color: string, label?: string) => {
      const element = label ? document.createElement('div') : undefined;
      if (element) {
        element.style.cssText =
          'display:flex;flex-direction:column;align-items:center;color:#fff;font:700 11px system-ui;white-space:nowrap';
        const caption = document.createElement('span');
        caption.textContent = label || '';
        caption.style.cssText =
          'background:#07131fdd;border:1px solid #35d07f;border-radius:7px;padding:3px 6px;margin-bottom:3px';
        const car = document.createElement('span');
        car.textContent = '●';
        car.style.cssText =
          'display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#07131f;border:3px solid #35d07f;color:#35d07f';
        element.append(caption, car);
      }
      markersRef.current.push(
        new mapboxgl.Marker(element ? { element } : { color })
          .setLngLat([longitude, latitude])
          .addTo(map)
      );
    };
    // Pino de local: âncora inferior (ponta) exatamente na coordenada, com
    // rótulo ao lado, no mesmo desenho do app nativo e da web.
    const addPlace = (point: MapPoint) => {
      const visual = placeVisual(point.category);
      const element = document.createElement('div');
      element.style.cssText = 'position:relative;width:0;height:0;overflow:visible;cursor:pointer';
      const pin = document.createElement('span');
      pin.style.cssText = `position:absolute;left:-17px;top:-42px;display:grid;place-items:center;width:34px;height:34px;box-sizing:border-box;border:2.5px solid #fff;border-radius:50%;background:${visual.color};color:#fff;font:900 15px system-ui;box-shadow:0 8px 18px rgba(4,22,38,.32)`;
      pin.textContent = visual.glyph;
      const tip = document.createElement('span');
      tip.style.cssText = `position:absolute;left:-6px;top:-12px;width:12px;height:12px;box-sizing:border-box;border-right:2.5px solid #fff;border-bottom:2.5px solid #fff;background:${visual.color};transform:rotate(45deg);clip-path:polygon(100% 0,100% 100%,0 100%)`;
      element.append(pin, tip);
      if (point.name) {
        const label = document.createElement('span');
        label.textContent = point.name;
        label.style.cssText =
          'position:absolute;left:19px;top:-36px;max-width:160px;padding:3px 8px;border:1px solid rgba(16,40,59,.14);border-radius:999px;background:rgba(255,255,255,.96);color:#142b40;font:800 11px system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none';
        element.append(label);
      }
      element.addEventListener('click', () => onPointPress?.(point));
      markersRef.current.push(
        new mapboxgl.Marker({ element, anchor: 'center' })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map)
      );
    };
    if (phonePosition) add(phonePosition.longitude, phonePosition.latitude, '#1478C9');
    if (vehiclePosition) add(vehiclePosition.longitude, vehiclePosition.latitude, '#FF5A0A');
    points.forEach(point => {
      if (point.kind === 'poi') return addPlace(point);
      const color =
        point.kind === 'convoy' ? '#35D07F' : point.kind === 'radar' ? '#F04444' : '#FF9F1C';
      add(
        point.longitude,
        point.latitude,
        color,
        point.kind === 'convoy' ? point.label : undefined
      );
    });
    if (position && follow)
      map.easeTo({
        center: [position.longitude, position.latitude],
        bearing: position.heading || 0,
        pitch: perspective ? 50 : 0,
        duration: 650
      });
  }, [
    position?.latitude,
    position?.longitude,
    position?.heading,
    phonePosition?.latitude,
    phonePosition?.longitude,
    points,
    follow,
    perspective
  ]);

  return (
    <View style={{ flex: 1, minHeight: 220 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 220 }} />
    </View>
  );
});
