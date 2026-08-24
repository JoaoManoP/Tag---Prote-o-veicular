import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, EmptyState, Header, Screen, StatusBadge, styles } from '../components/ui';
import { socketService } from '../services/socket';
import { useApp } from '../state/AppContext';
import type { Position } from '../types';

export default function MapScreen() {
  const { session, setConnection, connection, selectedVehicle, theme } = useApp();
  const [position, setPosition] = useState<Position | undefined>(session?.positions?.at(-1));

  useEffect(() => {
    const socket = socketService.connect(setPosition, setConnection);
    if (session?.id) {
      socketService.joinDashboard(session.id).catch(() => setConnection('OFFLINE'));
    }
    return () => {
      socket.off('position:update');
    };
  }, [session?.id, setConnection]);

  return (
    <Screen scroll={false}>
      <Header
        title="Mapa"
        subtitle={selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : 'Selecione um veículo'}
        action={<StatusBadge status={connection === 'ONLINE' ? 'AO VIVO' : connection} />}
      />
      {position ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Card>
            <Text style={[styles.caption, { color: theme.colors.muted }]}>LOCALIZAÇÃO DO VEÍCULO</Text>
            <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>
              Posição confirmada pelo GPS
            </Text>
            <Text style={{ color: theme.colors.muted }}>
              {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}
            </Text>
            {position.speed != null && (
              <Text style={{ fontSize: 28, fontWeight: '900', color: theme.colors.text }}>
                {Math.max(0, position.speed * 3.6).toFixed(0)} km/h
              </Text>
            )}
            <Text style={[styles.caption, { color: theme.colors.muted }]}>O mapa interativo está disponível no aplicativo Android/iOS.</Text>
          </Card>
        </View>
      ) : (
        <EmptyState
          title="Aguardando primeira localização"
          message="Conecte um rastreador autorizado. O mapa não usa coordenadas falsas."
          action={<Button title="Conectar celular" onPress={() => {}} />}
        />
      )}
    </Screen>
  );
}
