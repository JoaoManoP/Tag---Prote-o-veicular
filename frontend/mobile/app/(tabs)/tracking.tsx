import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { Button, Card, EmptyState, Header, Icon, Screen, StatusBadge } from '../../src/components/ui';
import { useApp } from '../../src/state/AppContext';

export default function Tracking() {
  const { selectedVehicle, session, connection, theme } = useApp();

  return (
    <Screen>
      <Header
        eyebrow="RASTREIO VEICULAR"
        title="Acompanhar veículo"
        subtitle={selectedVehicle ? selectedVehicle.nickname : 'Nenhum veículo selecionado'}
        action={<StatusBadge status={connection === 'ONLINE' ? 'AO VIVO' : 'AGUARDANDO'} />}
      />
      {!selectedVehicle ? (
        <EmptyState
          icon="car-cog"
          title="Cadastre um veículo"
          message="O mapa e o rastreio serão configurados automaticamente para ele."
          action={<Button title="Adicionar veículo" onPress={() => router.push('/vehicle/add')} />}
        />
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Icon name="car-connected" size={36} color={theme.colors.primaryBright} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 19, fontWeight: '900' }}>
                  {selectedVehicle.nickname || `${selectedVehicle.brand} ${selectedVehicle.model}`}
                </Text>
                <Text style={{ color: theme.colors.muted }}>
                  {selectedVehicle.plate || 'Sem placa'} · {selectedVehicle.brand} {selectedVehicle.model}
                </Text>
              </View>
              <StatusBadge status={session ? 'CONFIGURADO' : 'SEM DISPOSITIVO'} />
            </View>
          </Card>
          <Button
            icon="map-marker-radius"
            title="Abrir mapa do veículo"
            onPress={() => router.push('/(tabs)/map')}
          />
          <Button
            secondary
            icon="access-point"
            title={session ? 'Gerenciar rastreador' : 'Configurar rastreador'}
            onPress={() => router.push('/devices')}
          />
          {!session && (
            <Text style={{ color: theme.colors.muted, textAlign: 'center' }}>
              Selecione um dispositivo uma única vez; depois o app recuperará este veículo e o rastreio automaticamente.
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}
