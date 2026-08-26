import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  Header,
  Screen,
  StatusBadge,
  VehicleCard,
  styles
} from '../../src/components/ui';
import { useApp } from '../../src/state/AppContext';
export default function Home() {
  const { user, selectedVehicle, alerts, connection, theme } = useApp();
  return (
    <Screen>
      <Header
        title={`Olá, ${user?.name?.split(' ')[0] || 'motorista'}`}
        subtitle="Aqui está a situação do seu veículo"
        action={<StatusBadge status={connection} />}
      />
      {!selectedVehicle ? (
        <EmptyState
          title="Bem-vindo ao RASTREON"
          message="Cadastre seu primeiro veículo para começar."
          action={<Button title="Adicionar veículo" onPress={() => router.push('/vehicle/add')} />}
        />
      ) : (
        <>
          <VehicleCard
            vehicle={selectedVehicle}
            onPress={() => router.push(`/vehicle/${selectedVehicle.id}`)}
          />
          <Button title="Ver localização" onPress={() => router.push('/(tabs)/map')} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Card style={{ flex: 1 }}>
              <Text style={[styles.caption, { color: theme.colors.muted }]}>RASTREADOR</Text>
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                {connection === 'ONLINE' ? 'Online' : 'Sem conexão'}
              </Text>
            </Card>
            <Card style={{ flex: 1 }}>
              <Text style={[styles.caption, { color: theme.colors.muted }]}>ALERTAS</Text>
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                {alerts.filter(a => !a.readAt).length || 'Nenhum'}
              </Text>
            </Card>
          </View>
          <Button
            secondary
            title="Dispositivos e QR Code"
            onPress={() => router.push('/devices')}
          />
          <Button secondary title="Áreas de proteção" onPress={() => router.push('/geofences')} />
          <Button secondary title="Diagnóstico" onPress={() => router.push('/diagnostics')} />
        </>
      )}
    </Screen>
  );
}
