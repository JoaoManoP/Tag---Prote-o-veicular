import React, { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Screen, StatusBadge } from '../components/ui';
import { RastreonMap } from '../components/RastreonMap';
import { api } from '../services/api';
import { convoyMapPoints, type ConvoyState, updateConvoyPosition } from '../services/convoy';
import { socketService } from '../services/socket';
import { useApp } from '../state/AppContext';
import type { Position } from '../types';

export default function MapScreen() {
  const { session, setConnection, connection, theme, user } = useApp();
  const [position, setPosition] = useState<Position | undefined>(session?.positions?.at(-1));
  const [convoyState, setConvoyState] = useState<ConvoyState>();

  useEffect(() => {
    setPosition(session?.positions?.at(-1));
    const socket = socketService.connect(setPosition, setConnection);
    if (session?.id) socketService.joinDashboard(session.id).catch(() => setConnection('OFFLINE'));
    return () => {
      socket.off('position:update');
    };
  }, [session?.id, setConnection]);
  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    let active = true;
    const removePositionListener = socketService.onConvoyPosition(value => {
      if (active)
        setConvoyState(current => (current ? updateConvoyPosition(current, value) : current));
    });
    api
      .get<ConvoyState>('/api/convoy')
      .then(async state => {
        if (!active) return;
        setConvoyState(state);
        if (state.convoy) await socketService.joinConvoy(state.convoy.id);
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
    if (!convoyState?.convoy || !position) return;
    socketService.sendConvoyPosition(position).catch(() => {});
  }, [convoyState?.convoy?.id, position?.latitude, position?.longitude, position?.heading]);
  const convoyPoints = useMemo(() => convoyMapPoints(convoyState), [convoyState]);

  return (
    <Screen
      scroll={false}
      style={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 64, gap: 0 }}
    >
      <RastreonMap
        focus={position}
        vehiclePosition={position}
        track={session?.positions || []}
        points={convoyPoints}
        perspective
      />
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          right: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.mapOverlay,
            borderWidth: 1,
            borderColor: theme.colors.border
          }}
        >
          <Image
            source={require('../../assets/rastreon-app-icon.png')}
            style={{ width: 25, height: 25, borderRadius: 7 }}
            resizeMode="contain"
          />
        </View>
        <View
          style={{
            padding: 5,
            borderRadius: 999,
            backgroundColor: theme.colors.mapOverlay,
            borderWidth: 1,
            borderColor: theme.colors.border
          }}
        >
          <StatusBadge status={connection === 'ONLINE' ? 'AO VIVO' : connection} />
        </View>
      </View>
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 8, right: 8, bottom: 72 }}
      >
        <View
          style={{
            minHeight: 34,
            paddingHorizontal: 11,
            paddingVertical: 7,
            borderRadius: 12,
            backgroundColor: theme.colors.mapOverlay,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8
          }}
        >
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: theme.colors.text, fontSize: 11, fontWeight: '800' }}
          >
            {position ? 'Posição confirmada pelo GPS' : 'Aguardando sinal do rastreador'}
          </Text>
          {position && (
            <Text style={{ color: theme.colors.text, fontSize: 11, fontWeight: '900' }}>
              {position.speed != null
                ? `${Math.max(0, position.speed * 3.6).toFixed(0)} km/h`
                : 'GPS'}
            </Text>
          )}
        </View>
      </View>
    </Screen>
  );
}
