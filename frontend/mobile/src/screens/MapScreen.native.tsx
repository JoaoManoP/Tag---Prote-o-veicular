import { router } from 'expo-router';
import React, {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { RastreonMap, type MapPoint } from '../components/RastreonMap';
import { Card, Icon, IconButton, Screen, StatusBadge } from '../components/ui';
import { api } from '../services/api';
import { convoyMapPoints, type ConvoyState, updateConvoyPosition } from '../services/convoy';
import { currentLocation, requestLocationPermission, watchLocation } from '../services/location';
import { socketService } from '../services/socket';
import { useApp } from '../state/AppContext';
import type { Geofence, Position } from '../types';

const DEFAULT_MAP_POSITION: Position = {
  latitude: -19.58,
  longitude: -42.64,
  accuracy: 0,
  timestamp: 0
};

class MapErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey: number },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    console.warn('map_render_failed');
  }

  componentDidUpdate(previous: Readonly<{ resetKey: number }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function MapScreen() {
  const { session, setConnection, connection, selectedVehicle, theme, user } = useApp();
  const cameraRef = useRef<CameraRef | null>(null);
  const [vehiclePosition, setVehiclePosition] = useState<Position | undefined>(
    session?.positions?.at(-1)
  );
  const [phonePosition, setPhonePosition] = useState<Position>();
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [convoyState, setConvoyState] = useState<ConvoyState>();
  const [follow, setFollow] = useState(true);
  const [perspective, setPerspective] = useState(true);
  const [roadLayers, setRoadLayers] = useState(false);
  const [message, setMessage] = useState('Aguardando o rastreador do veículo');
  const [mapFailed, setMapFailed] = useState(false);
  const [mapResetKey, setMapResetKey] = useState(0);

  useEffect(() => {
    const socket = socketService.connect(position => {
      setVehiclePosition(position);
      setMessage('Posição recebida do rastreador');
    }, setConnection);
    if (session?.id) socketService.joinDashboard(session.id).catch(() => setConnection('OFFLINE'));
    return () => {
      socket.off('position:update');
    };
  }, [session?.id, setConnection]);
  useEffect(() => {
    if (user?.role !== 'ADMIN') {
      setConvoyState(undefined);
      return;
    }
    let active = true;
    const removePositionListener = socketService.onConvoyPosition(position => {
      if (active)
        setConvoyState(current => (current ? updateConvoyPosition(current, position) : current));
    });
    api
      .get<ConvoyState>('/api/convoy')
      .then(async state => {
        if (!active) return;
        setConvoyState(state);
        if (state.convoy) {
          const joined = await socketService.joinConvoy(state.convoy.id);
          if (!joined.ok) throw new Error(joined.error || 'Comboio indisponível.');
        }
      })
      .catch(() => {
        if (active) setConvoyState(undefined);
      });
    return () => {
      active = false;
      removePositionListener();
    };
  }, [user?.role]);
  useEffect(() => {
    if (!selectedVehicle) return;
    api
      .get<{ geofences: Geofence[] }>(`/api/vehicles/${selectedVehicle.id}/geofences`)
      .then(data => setGeofences(data.geofences))
      .catch(() => setGeofences([]));
  }, [selectedVehicle?.id]);
  useEffect(() => {
    let active = true;
    let subscription: { remove: () => void } | undefined;
    (async () => {
      try {
        if (!(await requestLocationPermission()))
          return setMessage('Localização não autorizada — o mapa continua disponível');
        const initial = await currentLocation();
        if (!active) return;
        setPhonePosition(initial);
        if (!vehiclePosition)
          setMessage('Exibindo o telefone como referência — rastreador sem posição');
        subscription = await watchLocation(position => {
          if (active) setPhonePosition(position);
        });
      } catch {
        if (active) setMessage('GPS indisponível — exibindo a visão geral');
      }
    })();
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  const liveFocusPosition = vehiclePosition || phonePosition;
  useEffect(() => {
    if (!convoyState?.convoy || !liveFocusPosition) return;
    socketService.sendConvoyPosition(liveFocusPosition).catch(() => {});
  }, [
    convoyState?.convoy?.id,
    liveFocusPosition?.latitude,
    liveFocusPosition?.longitude,
    liveFocusPosition?.heading
  ]);
  const visibleMapPoints = useMemo(
    () => [...mapPoints, ...convoyMapPoints(convoyState)],
    [mapPoints, convoyState]
  );
  const focusPosition = liveFocusPosition || DEFAULT_MAP_POSITION;
  useEffect(() => {
    if (!liveFocusPosition || !roadLayers) {
      setMapPoints([]);
      return;
    }
    const query = `lat=${liveFocusPosition.latitude}&lng=${liveFocusPosition.longitude}`;
    Promise.all([
      api.get<{ radars: Array<MapPoint & { category?: string }> }>(
        `/api/map/radars/nearby?${query}&radiusMeters=7000`
      ),
      api.get<{ events: Array<MapPoint & { category?: string }> }>(
        `/api/road-events?${query}&radius=7000`
      ),
      api.get<{ places: MapPoint[] }>(`/api/pois?${query}&category=fuel`)
    ])
      .then(([radars, events, places]) =>
        setMapPoints([
          ...radars.radars.map(item => ({ ...item, id: `radar-${item.id}`, kind: 'radar' })),
          ...events.events.map(item => ({ ...item, id: `event-${item.id}`, kind: 'event' })),
          ...places.places.map(item => ({ ...item, id: `poi-${item.id}`, kind: 'poi' }))
        ])
      )
      .catch(() => setMapPoints([]));
  }, [liveFocusPosition?.latitude, liveFocusPosition?.longitude, roadLayers]);
  useEffect(() => {
    if (follow && liveFocusPosition)
      cameraRef.current?.easeTo({
        center: [liveFocusPosition.longitude, liveFocusPosition.latitude],
        zoom: perspective ? 17.5 : 15.5,
        pitch: perspective ? 55 : 0,
        bearing: liveFocusPosition.heading || 0,
        duration: 650
      });
  }, [follow, liveFocusPosition, perspective]);
  const recenter = () => {
    if (!liveFocusPosition) return;
    setFollow(true);
    cameraRef.current?.easeTo({
      center: [liveFocusPosition.longitude, liveFocusPosition.latitude],
      zoom: perspective ? 17.5 : 15.5,
      pitch: perspective ? 55 : 0,
      bearing: liveFocusPosition.heading || 0,
      duration: 500
    });
  };
  const retryMap = () => {
    setMapFailed(false);
    setMapResetKey(value => value + 1);
  };
  const speed =
    vehiclePosition?.speed != null && vehiclePosition.speed >= 0
      ? Math.round(vehiclePosition.speed * 3.6)
      : 0;

  return (
    <Screen scroll={false} style={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 64 }}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <MapErrorBoundary
          resetKey={mapResetKey}
          fallback={
            <View
              style={{
                flex: 1,
                backgroundColor: theme.colors.background,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12
              }}
            >
              <Icon name="map-marker-off-outline" size={44} color={theme.colors.muted} />
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                Não foi possível iniciar o mapa
              </Text>
              <Pressable onPress={retryMap} style={{ padding: 14 }}>
                <Text style={{ color: theme.colors.primaryBright, fontWeight: '900' }}>
                  Tentar novamente
                </Text>
              </Pressable>
            </View>
          }
        >
          <RastreonMap
            key={mapResetKey}
            ref={cameraRef}
            focus={focusPosition}
            vehiclePosition={vehiclePosition}
            phonePosition={phonePosition}
            track={session?.positions}
            geofences={geofences}
            points={visibleMapPoints}
            perspective={liveFocusPosition ? perspective : false}
            follow={follow}
            onUserInteraction={() => setFollow(false)}
            onMapReady={() => setMapFailed(false)}
            onMapError={() => setMapFailed(true)}
          />
        </MapErrorBoundary>

        {mapFailed && (
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 220,
              padding: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.danger,
              backgroundColor: theme.colors.mapOverlay,
              alignItems: 'center',
              gap: 12
            }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
              Falha ao carregar os dados visuais do mapa
            </Text>
            <Pressable onPress={retryMap}>
              <Text style={{ color: theme.colors.primaryBright, fontWeight: '900' }}>
                Recarregar
              </Text>
            </Pressable>
          </View>
        )}

        <View
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            top: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 13,
              backgroundColor: theme.colors.mapOverlay,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Image
              source={require('../../assets/rastreon-app-icon.png')}
              style={{ width: 27, height: 27, borderRadius: 8 }}
              resizeMode="contain"
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                padding: 5,
                borderRadius: 999,
                backgroundColor: theme.colors.mapOverlay,
                borderWidth: 1,
                borderColor: theme.colors.border
              }}
            >
              <StatusBadge status={vehiclePosition ? 'AO VIVO' : 'SEM RASTREADOR'} />
            </View>
            <IconButton
              name="bell-outline"
              label="Alertas"
              onPress={() => router.push('/notifications')}
            />
          </View>
        </View>

        <View style={{ position: 'absolute', right: 10, top: 68, gap: 8 }}>
          <IconButton
            name="crosshairs-gps"
            label="Centralizar no veículo"
            onPress={recenter}
            active={follow}
          />
          <IconButton
            name={perspective ? 'video-3d' : 'map-outline'}
            label="Alternar 2D e 3D"
            onPress={() => setPerspective(value => !value)}
            active={perspective}
          />
          <IconButton
            name="traffic-light"
            label="Radares e ocorrências"
            onPress={() => setRoadLayers(value => !value)}
            active={roadLayers}
          />
          <IconButton
            name="layers-outline"
            label="Áreas e camadas"
            onPress={() => router.push('/geofences')}
          />
        </View>

        <View style={{ position: 'absolute', left: 8, right: 8, bottom: 8 }}>
          <Card
            style={{
              padding: 10,
              gap: 6,
              backgroundColor: theme.colors.mapOverlay,
              borderLeftWidth: 3,
              borderLeftColor: theme.colors.primary
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}
                >
                  {selectedVehicle
                    ? `${selectedVehicle.brand} ${selectedVehicle.model}`
                    : 'Veículo não selecionado'}
                </Text>
                <Text numberOfLines={1} style={{ color: theme.colors.muted, fontSize: 10 }}>
                  {vehiclePosition
                    ? `Rastreador • ${new Date(vehiclePosition.timestamp).toLocaleTimeString('pt-BR')}`
                    : message}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: theme.colors.text, fontSize: 21, fontWeight: '900' }}>
                  {speed}
                </Text>
                <Text style={{ color: theme.colors.muted, fontSize: 10 }}>km/h</Text>
              </View>
            </View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}
