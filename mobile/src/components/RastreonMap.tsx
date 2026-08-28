import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  UserLocation,
  type CameraRef,
  type LngLat
} from '@maplibre/maplibre-react-native';
import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { api } from '../services/api';
import { useApp } from '../state/AppContext';
import type { Geofence, Position } from '../types';
import { Icon } from './ui';

export type MapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  kind?: string;
  label?: string;
};

type MapConfig = {
  provider: 'maplibre' | 'mapbox';
  styleUrl: string;
  mapboxAccessToken?: string;
  routeProvider: string;
  geocodingProvider: string;
};

const DEFAULT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

function nativeStyleUrl(config?: MapConfig) {
  if (!config) return DEFAULT_STYLE;
  if (config.provider !== 'mapbox' || !config.styleUrl.startsWith('mapbox://styles/'))
    return config.styleUrl;
  const style = config.styleUrl.replace('mapbox://styles/', '');
  return `https://api.mapbox.com/styles/v1/${style}?access_token=${encodeURIComponent(config.mapboxAccessToken || '')}`;
}

function lineFeature(points: Position[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map(point => [point.longitude, point.latitude])
    }
  };
}

function circleCoordinates(fence: Geofence) {
  const result: number[][] = [];
  const latitudeRadius = fence.radiusMeters / 111320;
  const longitudeRadius =
    fence.radiusMeters / (111320 * Math.max(0.2, Math.cos((fence.centerLat * Math.PI) / 180)));
  for (let index = 0; index <= 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2;
    result.push([
      fence.centerLng + Math.cos(angle) * longitudeRadius,
      fence.centerLat + Math.sin(angle) * latitudeRadius
    ]);
  }
  return result;
}

function fenceCollection(geofences: Geofence[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: geofences
      .filter(item => item.enabled)
      .map(item => ({
        type: 'Feature',
        properties: { id: item.id, name: item.name },
        geometry: {
          type: 'Polygon',
          coordinates: [
            item.type === 'polygon' && item.points?.length
              ? [...item.points.map(point => [point.longitude, point.latitude]), [item.points[0].longitude, item.points[0].latitude]]
              : circleCoordinates(item)
          ]
        }
      })) as GeoJSON.Feature[]
  };
}

export type RastreonMapProps = {
  focus?: Position;
  vehiclePosition?: Position;
  phonePosition?: Position;
  track?: Position[];
  geofences?: Geofence[];
  points?: MapPoint[];
  perspective?: boolean;
  follow?: boolean;
  onUserInteraction?: () => void;
  showUserLocation?: boolean;
};

export const RastreonMap = forwardRef<CameraRef, RastreonMapProps>(function RastreonMap(
  {
    focus,
    vehiclePosition,
    phonePosition,
    track = [],
    geofences = [],
    points = [],
    perspective = true,
    follow = true,
    onUserInteraction,
    showUserLocation = true
  },
  ref
) {
  const { theme } = useApp();
  const [config, setConfig] = useState<MapConfig>();
  useEffect(() => {
    api
      .get<MapConfig>('/api/map/config')
      .then(setConfig)
      .catch(() => setConfig({
        provider: 'maplibre',
        styleUrl: DEFAULT_STYLE,
        routeProvider: 'osrm',
        geocodingProvider: 'photon'
      }));
  }, []);
  const center: LngLat = focus ? [focus.longitude, focus.latitude] : [-42.64, -19.58];
  const fences = useMemo(() => fenceCollection(geofences), [geofences]);
  const route = useMemo(() => (track.length > 1 ? lineFeature(track) : undefined), [track]);
  return (
    <Map
      style={{ flex: 1 }}
      mapStyle={nativeStyleUrl(config)}
      logo={false}
      attribution
      attributionPosition={{ bottom: 4, left: 4 }}
      compass
      compassPosition={{ top: 72, right: 12 }}
      scaleBar={false}
      onRegionWillChange={event => {
        if (event.nativeEvent.userInteraction) onUserInteraction?.();
      }}
    >
      <Camera
        ref={ref}
        center={center}
        zoom={focus ? (perspective ? 17.5 : 15.5) : 5}
        pitch={perspective ? 55 : 0}
        bearing={focus?.heading && focus.heading >= 0 ? focus.heading : 0}
        duration={follow ? 650 : 0}
        easing="ease"
      />
      {showUserLocation && phonePosition && <UserLocation animated accuracy heading />}
      {route && (
        <GeoJSONSource id="rastreon-track" data={route}>
          <Layer
            id="rastreon-track-line"
            type="line"
            paint={{
              'line-color': theme.colors.primaryBright,
              'line-width': 6,
              'line-opacity': 0.95
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </GeoJSONSource>
      )}
      {!!fences.features.length && (
        <GeoJSONSource id="rastreon-fences" data={fences}>
          <Layer
            id="rastreon-fences-fill"
            type="fill"
            paint={{ 'fill-color': theme.colors.success, 'fill-opacity': 0.12 }}
          />
          <Layer
            id="rastreon-fences-line"
            type="line"
            paint={{ 'line-color': theme.colors.success, 'line-width': 2 }}
          />
        </GeoJSONSource>
      )}
      {vehiclePosition && (
        <Marker id="vehicle" lngLat={[vehiclePosition.longitude, vehiclePosition.latitude]}>
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              backgroundColor: theme.colors.primary + '44',
              borderWidth: 2,
              borderColor: theme.colors.primaryBright,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ rotate: `${vehiclePosition.heading || 0}deg` }]
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: theme.colors.card,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Icon name="car" size={25} color={theme.colors.text} />
            </View>
          </View>
        </Marker>
      )}
      {points.map(point => (
        <Marker key={point.id} id={point.id} lngLat={[point.longitude, point.latitude]}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: theme.colors.card,
              borderWidth: 2,
              borderColor: point.kind === 'radar' ? theme.colors.danger : theme.colors.warning,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Icon
              name={point.kind === 'radar' ? 'speedometer' : 'map-marker-alert'}
              size={17}
              color={point.kind === 'radar' ? theme.colors.danger : theme.colors.warning}
            />
          </View>
        </Marker>
      ))}
    </Map>
  );
});
