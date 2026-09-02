import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type LngLat
} from '@maplibre/maplibre-react-native';
import React, { forwardRef, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { Text, View } from 'react-native';
import { api } from '../services/api';
import { useApp } from '../state/AppContext';
import type { Geofence, Position } from '../types';
import { placeVisual } from './places';
import { Icon } from './ui';

export type MapPoint = {
  id: string;
  latitude: number;
  longitude: number;
  kind?: string;
  label?: string;
  category?: string;
  name?: string;
  data?: unknown;
};

// Pino de local: círculo com ícone + ponta. A altura é fixa para que a âncora
// do marcador fique exatamente na ponta, sobre a coordenada.
const POI_PIN_SIZE = 34;
const POI_TIP_SIZE = 12;
const POI_PIN_HEIGHT = 42;
const POI_LABEL_HEIGHT = 22;
const POI_LABEL_WIDTH = 150;

function PoiPin({ point }: { point: MapPoint }) {
  const visual = placeVisual(point.category);
  return (
    <View
      style={{
        width: POI_LABEL_WIDTH,
        height: point.name ? POI_PIN_HEIGHT + POI_LABEL_HEIGHT : POI_PIN_HEIGHT,
        alignItems: 'center'
      }}
    >
      <View
        style={{
          width: POI_PIN_SIZE,
          height: POI_PIN_SIZE,
          borderRadius: POI_PIN_SIZE / 2,
          backgroundColor: visual.color,
          borderWidth: 2.5,
          borderColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#041626',
          shadowOpacity: 0.32,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 4 },
          elevation: 5,
          zIndex: 2
        }}
      >
        <Icon name={visual.icon} size={18} color="#FFFFFF" />
      </View>
      <View
        style={{
          width: POI_TIP_SIZE,
          height: POI_TIP_SIZE,
          marginTop: -POI_TIP_SIZE / 2 - 1,
          backgroundColor: visual.color,
          borderRightWidth: 2.5,
          borderBottomWidth: 2.5,
          borderColor: '#FFFFFF',
          transform: [{ rotate: '45deg' }],
          zIndex: 1
        }}
      />
      {!!point.name && (
        <View
          style={{
            marginTop: 3,
            height: POI_LABEL_HEIGHT - 3,
            maxWidth: POI_LABEL_WIDTH,
            paddingHorizontal: 8,
            borderRadius: 999,
            justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.96)',
            borderWidth: 1,
            borderColor: 'rgba(16,40,59,0.14)'
          }}
        >
          <Text numberOfLines={1} style={{ color: '#142B40', fontSize: 10.5, fontWeight: '900' }}>
            {point.name}
          </Text>
        </View>
      )}
    </View>
  );
}

type MapConfig = {
  provider: 'maplibre' | 'mapbox';
  styleUrl: string;
  mapboxAccessToken?: string;
  routeProvider: string;
  geocodingProvider: string;
};

const DEFAULT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

type NativeMapStyle = NonNullable<ComponentProps<typeof Map>['mapStyle']>;

function withMapboxToken(url: string, token: string) {
  return `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
}

async function nativeMapStyle(config: MapConfig): Promise<NativeMapStyle> {
  const token = config.mapboxAccessToken || '';
  if (config.provider !== 'mapbox' || !config.styleUrl.startsWith('mapbox://styles/') || !token)
    return config.styleUrl;
  const stylePath = config.styleUrl.slice('mapbox://styles/'.length);
  const tilesUrl = withMapboxToken(
    `https://api.mapbox.com/styles/v1/${stylePath}/tiles/512/{z}/{x}/{y}@2x`,
    token
  );
  return {
    version: 8,
    sources: {
      'rastreon-mapbox': {
        type: 'raster',
        tiles: [tilesUrl],
        tileSize: 512,
        attribution: '© Mapbox © OpenStreetMap'
      }
    },
    layers: [
      {
        id: 'rastreon-mapbox-background',
        type: 'background',
        paint: { 'background-color': '#06121d' }
      },
      {
        id: 'rastreon-mapbox-tiles',
        type: 'raster',
        source: 'rastreon-mapbox',
        paint: { 'raster-fade-duration': 0 }
      }
    ]
  } as NativeMapStyle;
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
              ? [
                  ...item.points.map(point => [point.longitude, point.latitude]),
                  [item.points[0].longitude, item.points[0].latitude]
                ]
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
  onPointPress?: (point: MapPoint) => void;
  showUserLocation?: boolean;
  onMapReady?: () => void;
  onMapError?: () => void;
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
    onPointPress,
    showUserLocation = true,
    onMapReady,
    onMapError
  },
  ref
) {
  const { theme } = useApp();
  const [mapStyle, setMapStyle] = useState<NativeMapStyle>(DEFAULT_STYLE);
  const [remoteStyleApplied, setRemoteStyleApplied] = useState(false);
  useEffect(() => {
    api
      .get<MapConfig>('/api/map/config')
      .then(nativeMapStyle)
      .then(style => {
        setMapStyle(style);
        setRemoteStyleApplied(style !== DEFAULT_STYLE);
      })
      .catch(() => {
        setMapStyle(DEFAULT_STYLE);
        setRemoteStyleApplied(false);
      });
  }, []);
  const center: LngLat = focus ? [focus.longitude, focus.latitude] : [-42.64, -19.58];
  const fences = useMemo(() => fenceCollection(geofences), [geofences]);
  const route = useMemo(() => (track.length > 1 ? lineFeature(track) : undefined), [track]);
  return (
    <Map
      style={{ flex: 1 }}
      mapStyle={mapStyle}
      androidView="texture"
      logo={false}
      attribution
      attributionPosition={{ bottom: 4, left: 4 }}
      compass
      compassPosition={{ top: 72, right: 12 }}
      scaleBar={false}
      onDidFinishLoadingMap={onMapReady}
      onDidFailLoadingMap={() => {
        if (remoteStyleApplied) {
          setMapStyle(DEFAULT_STYLE);
          setRemoteStyleApplied(false);
          return;
        }
        onMapError?.();
      }}
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
      {showUserLocation && phonePosition && (
        <Marker id="phone-location" lngLat={[phonePosition.longitude, phonePosition.latitude]}>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: theme.colors.primaryBright + '44',
              borderWidth: 2,
              borderColor: theme.colors.text,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: theme.colors.primaryBright
              }}
            />
          </View>
        </Marker>
      )}
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
      {points.map(point =>
        point.kind === 'poi' ? (
          <Marker
            key={point.id}
            id={point.id}
            lngLat={[point.longitude, point.latitude]}
            anchor="bottom"
            // Com rótulo abaixo do pino, desloca o marcador para que a ponta
            // (e não a base do rótulo) fique sobre a coordenada.
            offset={point.name ? [0, POI_LABEL_HEIGHT] : [0, 0]}
            onPress={() => onPointPress?.(point)}
          >
            <PoiPin point={point} />
          </Marker>
        ) : (
          <Marker key={point.id} id={point.id} lngLat={[point.longitude, point.latitude]}>
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {point.kind === 'convoy' && point.label && (
                <View
                  style={{
                    backgroundColor: theme.colors.mapOverlay,
                    borderRadius: 8,
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    marginBottom: 3,
                    borderWidth: 1,
                    borderColor: theme.colors.success
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontSize: 10, fontWeight: '900' }}>
                    {point.label}
                  </Text>
                </View>
              )}
              <View
                style={{
                  width: point.kind === 'convoy' ? 40 : 32,
                  height: point.kind === 'convoy' ? 40 : 32,
                  borderRadius: point.kind === 'convoy' ? 20 : 16,
                  backgroundColor: theme.colors.card,
                  borderWidth: 2,
                  borderColor:
                    point.kind === 'convoy'
                      ? theme.colors.success
                      : point.kind === 'radar'
                        ? theme.colors.danger
                        : theme.colors.warning,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Icon
                  name={
                    point.kind === 'convoy'
                      ? 'car'
                      : point.kind === 'radar'
                        ? 'speedometer'
                        : 'map-marker-alert'
                  }
                  size={point.kind === 'convoy' ? 22 : 17}
                  color={
                    point.kind === 'convoy'
                      ? theme.colors.success
                      : point.kind === 'radar'
                        ? theme.colors.danger
                        : theme.colors.warning
                  }
                />
              </View>
            </View>
          </Marker>
        )
      )}
    </Map>
  );
});
