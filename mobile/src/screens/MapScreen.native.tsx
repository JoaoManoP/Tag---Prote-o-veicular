import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type Camera } from 'react-native-maps';
import { Button, Card, EmptyState, Header, Screen, StatusBadge, styles } from '../components/ui';
import { currentLocation, requestLocationPermission, watchLocation } from '../services/location';
import { socketService } from '../services/socket';
import { useApp } from '../state/AppContext';
import type { Position } from '../types';

const FOLLOW_PITCH = 60;
const FOLLOW_ZOOM = 18;

function cameraFor(position: Position): Camera {
  return {
    center: { latitude: position.latitude, longitude: position.longitude },
    heading: position.heading != null && position.heading >= 0 ? position.heading : 0,
    pitch: FOLLOW_PITCH,
    zoom: FOLLOW_ZOOM,
    altitude: 650
  };
}

export default function MapScreen() {
  const { session, setConnection, connection, selectedVehicle, theme } = useApp();
  const mapRef = useRef<MapView | null>(null);
  const [vehiclePosition, setVehiclePosition] = useState<Position | undefined>(
    session?.positions?.at(-1)
  );
  const [userPosition, setUserPosition] = useState<Position>();
  const [locationMessage, setLocationMessage] = useState('');
  const [followUser, setFollowUser] = useState(true);

  useEffect(() => {
    const socket = socketService.connect(setVehiclePosition, setConnection);
    if (session?.id) socketService.joinDashboard(session.id).catch(() => setConnection('OFFLINE'));
    return () => {
      socket.off('position:update');
    };
  }, [session?.id, setConnection]);

  useEffect(() => {
    let active = true;
    let subscription: { remove: () => void } | undefined;
    (async () => {
      try {
        const granted = await requestLocationPermission();
        if (!granted) {
          if (active) setLocationMessage('Autorize a localização para ativar a visão 3D.');
          return;
        }
        const initial = await currentLocation();
        if (!active) return;
        setUserPosition(initial);
        subscription = await watchLocation(position => {
          if (active) setUserPosition(position);
        });
      } catch {
        if (active) setLocationMessage('Não foi possível obter sua localização atual.');
      }
    })();
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (followUser && userPosition)
      mapRef.current?.animateCamera(cameraFor(userPosition), { duration: 700 });
  }, [followUser, userPosition]);

  const initialPosition = userPosition || vehiclePosition;
  const recenter = () => {
    if (userPosition) {
      setFollowUser(true);
      mapRef.current?.animateCamera(cameraFor(userPosition), { duration: 500 });
    }
  };

  return (
    <Screen scroll={false}>
      <Header
        title="Mapa 3D"
        subtitle="Visão em terceira pessoa da sua localização"
        action={
          <StatusBadge
            status={userPosition ? 'GPS ATIVO' : connection === 'ONLINE' ? 'AO VIVO' : connection}
          />
        }
      />
      {initialPosition ? (
        <>
          <View style={{ flex: 1, borderRadius: 18, overflow: 'hidden' }}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_DEFAULT}
              style={{ flex: 1 }}
              initialCamera={cameraFor(initialPosition)}
              showsUserLocation
              showsMyLocationButton={false}
              showsBuildings
              pitchEnabled
              rotateEnabled
              toolbarEnabled={false}
              onPanDrag={() => setFollowUser(false)}
            >
              {vehiclePosition && (
                <Marker
                  coordinate={vehiclePosition}
                  rotation={vehiclePosition.heading || 0}
                  flat
                  title={selectedVehicle?.nickname || 'Veículo'}
                  description={
                    vehiclePosition.speed != null
                      ? `${Math.max(0, vehiclePosition.speed * 3.6).toFixed(0)} km/h`
                      : undefined
                  }
                />
              )}
              {session?.positions && (
                <Polyline
                  coordinates={session.positions}
                  strokeColor={theme.colors.primary}
                  strokeWidth={4}
                />
              )}
            </MapView>
            <View style={{ position: 'absolute', right: 12, bottom: 12 }}>
              <Button
                title={followUser ? '3D ativo' : 'Voltar ao 3D'}
                onPress={recenter}
                disabled={!userPosition}
              />
            </View>
          </View>
          <Card>
            <Text style={[styles.caption, { color: theme.colors.muted }]}>SUA LOCALIZAÇÃO</Text>
            <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>
              {followUser
                ? 'Câmera acompanhando seu deslocamento'
                : 'Mapa livre · toque em Voltar ao 3D'}
            </Text>
            {userPosition?.speed != null && userPosition.speed >= 0 && (
              <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.text }}>
                {Math.max(0, userPosition.speed * 3.6).toFixed(0)} km/h
              </Text>
            )}
            <Text style={[styles.caption, { color: theme.colors.muted }]}>
              {locationMessage ||
                `Atualizada em ${new Date((userPosition || vehiclePosition)!.timestamp).toLocaleTimeString('pt-BR')} · precisão ${Math.round((userPosition || vehiclePosition)!.accuracy)} m`}
            </Text>
          </Card>
        </>
      ) : (
        <EmptyState
          title="Localização necessária"
          message={locationMessage || 'Aguardando o GPS do aparelho para iniciar a visão 3D.'}
          action={
            <Button
              title="Tentar novamente"
              onPress={() => {
                void currentLocation()
                  .then(setUserPosition)
                  .catch(() =>
                    setLocationMessage('Ative a localização nas configurações do aparelho.')
                  );
              }}
            />
          }
        />
      )}
    </Screen>
  );
}
