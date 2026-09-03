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
import {
  MAP_PLACE_CATEGORIES,
  PlaceBadge,
  bestPrice,
  distanceLabel,
  money,
  openPlace,
  placeVisual,
  type Place
} from '../components/places';
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
  const { session, setConnection, connection, selectedVehicle, theme, user, graphicsPreference } =
    useApp();
  // Modo leve: mapa 2D, pinos sem rótulo e menos locais carregados.
  const liteGraphics = graphicsPreference === 'lite';
  const cameraRef = useRef<CameraRef | null>(null);
  const [vehiclePosition, setVehiclePosition] = useState<Position | undefined>(
    session?.positions?.at(-1)
  );
  const [phonePosition, setPhonePosition] = useState<Position>();
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [showPlaces, setShowPlaces] = useState(true);
  const [selectedPlace, setSelectedPlace] = useState<Place>();
  const [convoyState, setConvoyState] = useState<ConvoyState>();
  const [follow, setFollow] = useState(true);
  const [perspective, setPerspective] = useState(graphicsPreference !== 'lite');
  const [roadLayers, setRoadLayers] = useState(false);
  const [message, setMessage] = useState('Aguardando o rastreador do veículo');
  const [mapFailed, setMapFailed] = useState(false);
  const [mapResetKey, setMapResetKey] = useState(0);

  useEffect(() => {
    if (liteGraphics) setPerspective(false);
  }, [liteGraphics]);

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
  // Locais próximos (postos, hospitais, padarias…) na coordenada exata do OSM.
  // A chave arredondada evita refazer a busca a cada metro percorrido.
  const placesKey =
    liveFocusPosition && showPlaces
      ? `${liveFocusPosition.latitude.toFixed(3)}:${liveFocusPosition.longitude.toFixed(3)}`
      : '';
  useEffect(() => {
    if (!placesKey || !liveFocusPosition) {
      setPlaces([]);
      return;
    }
    let active = true;
    api
      .get<{ places: Place[] }>(
        `/api/places/nearby?lat=${liveFocusPosition.latitude}&lng=${liveFocusPosition.longitude}&categories=${MAP_PLACE_CATEGORIES.join(',')}&radiusMeters=${liteGraphics ? 1500 : 2500}&limit=${liteGraphics ? 30 : 60}`
      )
      .then(data => {
        if (active) setPlaces(data.places);
      })
      .catch(() => {
        if (active) setPlaces([]);
      });
    return () => {
      active = false;
    };
  }, [placesKey, liteGraphics]);
  const placePoints = useMemo<MapPoint[]>(
    () =>
      places.map(place => ({
        id: `place-${place.placeKey}`,
        kind: 'poi',
        category: place.category,
        name: liteGraphics ? undefined : place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        data: place
      })),
    [places, liteGraphics]
  );
  const visibleMapPoints = useMemo(
    () => [...mapPoints, ...placePoints, ...convoyMapPoints(convoyState)],
    [mapPoints, placePoints, convoyState]
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
      )
    ])
      .then(([radars, events]) =>
        setMapPoints([
          ...radars.radars.map(item => ({ ...item, id: `radar-${item.id}`, kind: 'radar' })),
          ...events.events.map(item => ({ ...item, id: `event-${item.id}`, kind: 'event' }))
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
            onPointPress={point => {
              if (point.kind !== 'poi' || !point.data) return;
              setSelectedPlace(point.data as Place);
              setFollow(false);
            }}
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
          {!liteGraphics && (
            <IconButton
              name={perspective ? 'video-3d' : 'map-outline'}
              label="Alternar 2D e 3D"
              onPress={() => setPerspective(value => !value)}
              active={perspective}
            />
          )}
          <IconButton
            name="traffic-light"
            label="Radares e ocorrências"
            onPress={() => setRoadLayers(value => !value)}
            active={roadLayers}
          />
          <IconButton
            name="map-marker-multiple-outline"
            label="Postos e locais próximos"
            onPress={() => {
              setSelectedPlace(undefined);
              setShowPlaces(value => !value);
            }}
            active={showPlaces}
          />
          <IconButton
            name="layers-outline"
            label="Áreas e camadas"
            onPress={() => router.push('/geofences')}
          />
        </View>

        <View style={{ position: 'absolute', left: 8, right: 8, bottom: 8, gap: 8 }}>
          {selectedPlace && (
            <Card
              style={{
                padding: 12,
                gap: 10,
                backgroundColor: theme.colors.mapOverlay,
                borderLeftWidth: 3,
                borderLeftColor: placeVisual(selectedPlace.category).color
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <PlaceBadge category={selectedPlace.category} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: theme.colors.text, fontSize: 14, fontWeight: '900' }}
                  >
                    {selectedPlace.name}
                  </Text>
                  <Text numberOfLines={1} style={{ color: theme.colors.muted, fontSize: 11 }}>
                    {[
                      selectedPlace.brand || placeVisual(selectedPlace.category).label,
                      distanceLabel(selectedPlace.distanceMeters),
                      selectedPlace.commentCount
                        ? `${selectedPlace.commentCount} comentário(s)`
                        : ''
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {selectedPlace.category === 'fuel' && (
                  <View style={{ alignItems: 'flex-end' }}>
                    {(() => {
                      const price = bestPrice(selectedPlace);
                      return price ? (
                        <>
                          <Text
                            style={{
                              color: theme.colors.success,
                              fontSize: 18,
                              fontWeight: '900'
                            }}
                          >
                            {money(price.price)}
                          </Text>
                          <Text style={{ color: theme.colors.muted, fontSize: 9 }}>
                            {price.confirmations || 0} confirm.
                          </Text>
                        </>
                      ) : (
                        <Text style={{ color: theme.colors.muted, fontSize: 10 }}>Sem preço</Text>
                      );
                    })()}
                  </View>
                )}
                <IconButton
                  name="close"
                  label="Fechar"
                  onPress={() => setSelectedPlace(undefined)}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {selectedPlace.category === 'fuel' && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openPlace(selectedPlace, 'prices')}
                    style={({ pressed }) => ({
                      flex: 1,
                      minHeight: 38,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      borderRadius: 10,
                      backgroundColor: theme.colors.accent,
                      opacity: pressed ? 0.8 : 1
                    })}
                  >
                    <Icon name="cash" size={16} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>
                      Preços
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openPlace(selectedPlace, 'comments')}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 38,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor:
                      selectedPlace.category === 'fuel'
                        ? theme.colors.cardElevated
                        : theme.colors.accent,
                    opacity: pressed ? 0.8 : 1
                  })}
                >
                  <Icon
                    name="comment-text-outline"
                    size={16}
                    color={selectedPlace.category === 'fuel' ? theme.colors.text : '#FFFFFF'}
                  />
                  <Text
                    style={{
                      color: selectedPlace.category === 'fuel' ? theme.colors.text : '#FFFFFF',
                      fontSize: 12,
                      fontWeight: '900'
                    }}
                  >
                    Comentários
                  </Text>
                </Pressable>
              </View>
            </Card>
          )}
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
