import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Card, Screen, StatusBadge, styles } from '../components/ui';
import { RastreonMap } from '../components/RastreonMap';
import { socketService } from '../services/socket';
import { useApp } from '../state/AppContext';
import type { Position } from '../types';

export default function MapScreen() {
  const { session, setConnection, connection, selectedVehicle, theme } = useApp();
  const [position, setPosition] = useState<Position | undefined>(session?.positions?.at(-1));

  useEffect(() => {
    setPosition(session?.positions?.at(-1));
    const socket = socketService.connect(setPosition, setConnection);
    if (session?.id) socketService.joinDashboard(session.id).catch(() => setConnection('OFFLINE'));
    return () => { socket.off('position:update'); };
  }, [session?.id, setConnection]);

  return (
    <Screen
      scroll={false}
      style={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 76, gap: 0 }}
    >
      <RastreonMap
        focus={position}
        vehiclePosition={position}
        track={session?.positions || []}
        perspective
      />
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 12, left: 12, right: 12 }}
      >
        <Card style={{ padding: 12, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
              {selectedVehicle?.nickname || 'Mapa do veículo'}
            </Text>
            <Text style={[styles.caption, { color: theme.colors.muted }]}>
              {selectedVehicle
                ? `${selectedVehicle.brand} ${selectedVehicle.model} · ${selectedVehicle.plate || 'sem placa'}`
                : 'Selecione um veículo'}
            </Text>
          </View>
          <StatusBadge status={connection === 'ONLINE' ? 'AO VIVO' : connection} />
        </Card>
      </View>
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 12, right: 12, bottom: 88 }}
      >
        <Card style={{ padding: 12 }}>
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
            {position ? 'Posição confirmada pelo GPS' : 'Aguardando sinal do rastreador'}
          </Text>
          {position && (
            <Text style={{ color: theme.colors.muted }}>
              {position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}
              {position.speed != null ? ` · ${Math.max(0, position.speed * 3.6).toFixed(0)} km/h` : ''}
            </Text>
          )}
        </Card>
      </View>
    </Screen>
  );
}
