import type mapboxgl from 'mapbox-gl';
import React, { forwardRef, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { api } from '../services/api';
import type { RastreonMapProps } from './RastreonMap';

export type { MapPoint, RastreonMapProps } from './RastreonMap';
type MapConfig = { styleUrl: string; mapboxAccessToken?: string };
const DEFAULT_CENTER: [number, number] = [-42.64, -19.58];

export const RastreonMap = forwardRef<unknown, RastreonMapProps>(function RastreonMap(
  { focus, vehiclePosition, phonePosition, track = [], points = [], perspective = true,
    follow = true, onUserInteraction, onMapReady, onMapError }, _ref
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
    Promise.all([api.get<MapConfig>('/api/map/config'), import('mapbox-gl')]).then(([config, module]) => {
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
          map.addSource('rastreon-track', { type: 'geojson', data: {
            type: 'Feature', properties: {}, geometry: { type: 'LineString',
              coordinates: track.map(item => [item.longitude, item.latitude]) }
          }});
          map.addLayer({ id: 'rastreon-track-line', type: 'line', source: 'rastreon-track',
            paint: { 'line-color': '#24A0FF', 'line-width': 6 } });
          const bounds = new mapboxgl.LngLatBounds();
          track.forEach(item => bounds.extend([item.longitude, item.latitude]));
          map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
        }
        onMapReady?.();
      });
      map.on('error', event => { if (event.error) onMapError?.(); });
    }).catch(() => onMapError?.());
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
    const add = (longitude: number, latitude: number, color: string) => {
      markersRef.current.push(new mapboxgl.Marker({ color }).setLngLat([longitude, latitude]).addTo(map));
    };
    if (phonePosition) add(phonePosition.longitude, phonePosition.latitude, '#24A0FF');
    if (vehiclePosition) add(vehiclePosition.longitude, vehiclePosition.latitude, '#FFC400');
    points.forEach(point => add(point.longitude, point.latitude, point.kind === 'radar' ? '#F04444' : '#FF9F1C'));
    if (position && follow) map.easeTo({ center: [position.longitude, position.latitude],
      bearing: position.heading || 0, pitch: perspective ? 50 : 0, duration: 650 });
  }, [position?.latitude, position?.longitude, position?.heading, phonePosition?.latitude,
    phonePosition?.longitude, points, follow, perspective]);

  return <View style={{ flex: 1, minHeight: 220 }}>
    <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 220 }} />
  </View>;
});
