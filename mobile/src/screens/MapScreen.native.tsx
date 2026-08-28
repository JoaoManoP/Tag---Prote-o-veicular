import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { RastreonMap, type MapPoint } from '../components/RastreonMap';
import { Card, Icon, IconButton, Screen, StatusBadge, styles } from '../components/ui';
import { api } from '../services/api';
import { currentLocation, requestLocationPermission, watchLocation } from '../services/location';
import { socketService } from '../services/socket';
import { useApp } from '../state/AppContext';
import type { Geofence, Position } from '../types';

export default function MapScreen() {
  const { session, setConnection, connection, selectedVehicle, theme } = useApp();
  const cameraRef = useRef<CameraRef | null>(null);
  const [vehiclePosition, setVehiclePosition] = useState<Position | undefined>(
    session?.positions?.at(-1)
  );
  const [phonePosition, setPhonePosition] = useState<Position>();
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [follow, setFollow] = useState(true);
  const [perspective, setPerspective] = useState(true);
  const [roadLayers, setRoadLayers] = useState(false);
  const [message, setMessage] = useState('Aguardando o rastreador do veículo');

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
          return setMessage('Localização do telefone não autorizada');
        const initial = await currentLocation();
        if (!active) return;
        setPhonePosition(initial);
        if (!vehiclePosition)
          setMessage('Exibindo o telefone como referência — rastreador sem posição');
        subscription = await watchLocation(position => {
          if (active) setPhonePosition(position);
        });
      } catch {
        if (active) setMessage('GPS indisponível no momento');
      }
    })();
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  const focusPosition = vehiclePosition || phonePosition;
  useEffect(() => {
    if (!focusPosition || !roadLayers) {
      setMapPoints([]);
      return;
    }
    const query = `lat=${focusPosition.latitude}&lng=${focusPosition.longitude}`;
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
  }, [focusPosition?.latitude, focusPosition?.longitude, roadLayers]);
  useEffect(() => {
    if (follow && focusPosition)
      cameraRef.current?.easeTo({
        center: [focusPosition.longitude, focusPosition.latitude],
        zoom: perspective ? 17.5 : 15.5,
        pitch: perspective ? 55 : 0,
        bearing: focusPosition.heading || 0,
        duration: 650
      });
  }, [follow, focusPosition, perspective]);
  const recenter = () => {
    if (!focusPosition) return;
    setFollow(true);
    cameraRef.current?.easeTo({
      center: [focusPosition.longitude, focusPosition.latitude],
      zoom: perspective ? 17.5 : 15.5,
      pitch: perspective ? 55 : 0,
      bearing: focusPosition.heading || 0,
      duration: 500
    });
  };
  const speed =
    vehiclePosition?.speed != null && vehiclePosition.speed >= 0
      ? Math.round(vehiclePosition.speed * 3.6)
      : 0;

  return (
    <Screen scroll={false} style={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 76 }}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        {focusPosition ? (
          <RastreonMap
            ref={cameraRef}
            focus={focusPosition}
            vehiclePosition={vehiclePosition}
            phonePosition={phonePosition}
            track={session?.positions}
            geofences={geofences}
            points={mapPoints}
            perspective={perspective}
            follow={follow}
            onUserInteraction={() => setFollow(false)}
          />
        ) : (
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
              Aguardando localização
            </Text>
            <Text style={{ color: theme.colors.muted }}>{message}</Text>
          </View>
        )}

        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10
          }}
        >
          <View
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 16,
              backgroundColor: theme.colors.mapOverlay,
              borderWidth: 1,
              borderColor: theme.colors.border
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>
                {selectedVehicle?.nickname || 'Meu veículo'}
              </Text>
              <StatusBadge status={vehiclePosition ? 'AO VIVO' : 'SEM RASTREADOR'} />
            </View>
            <Text numberOfLines={1} style={[styles.caption, { color: theme.colors.muted }]}>
              {message}
            </Text>
          </View>
          <IconButton
            name="bell-outline"
            label="Alertas"
            onPress={() => router.push('/notifications')}
          />
        </View>

        <View style={{ position: 'absolute', right: 14, top: 122, gap: 10 }}>
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

        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 14 }}>
          <Card style={{ backgroundColor: theme.colors.mapOverlay }}>
            <View
              style={{
                width: 44,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.colors.border,
                alignSelf: 'center'
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                  {selectedVehicle
                    ? `${selectedVehicle.brand} ${selectedVehicle.model}`
                    : 'Veículo não selecionado'}
                </Text>
                <Text style={{ color: theme.colors.muted }}>
                  {vehiclePosition
                    ? `Rastreador • ${new Date(vehiclePosition.timestamp).toLocaleTimeString('pt-BR')}`
                    : 'Telefone apenas como referência'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: '900' }}>
                  {speed}
                </Text>
                <Text style={{ color: theme.colors.muted, fontSize: 10 }}>km/h</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => router.push('/trip/new')}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 12,
                  backgroundColor: theme.colors.accent,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7
                }}
              >
                <Icon name="navigation-variant" color="#030B12" />
                <Text style={{ color: '#030B12', fontWeight: '900' }}>Navegar</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/geofences')}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 12,
                  backgroundColor: theme.colors.cardElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7
                }}
              >
                <Icon name="shield-home-outline" />
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Proteção</Text>
              </Pressable>
            </View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}
