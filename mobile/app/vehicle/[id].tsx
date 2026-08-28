import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import {
  Card,
  Button,
  EmptyState,
  Header,
  Screen,
  StatusBadge,
  VehicleCard,
  styles
} from '../../src/components/ui';
import { useApp } from '../../src/state/AppContext';
export default function VehicleDetail() {
  const { id } = useLocalSearchParams(),
    { vehicles, connection, theme } = useApp(),
    vehicle = vehicles.find(value => String(value.id) === String(id));
  if (!vehicle)
    return (
      <Screen>
        <EmptyState
          title="Veículo não encontrado"
          message="Atualize sua garagem e tente novamente."
        />
      </Screen>
    );
  const field = (label: string, value: unknown) => (
    <View style={{ paddingVertical: 8 }}>
      <Text style={[styles.caption, { color: theme.colors.muted }]}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
        {value ? String(value) : 'Não informado'}
      </Text>
    </View>
  );
  return (
    <Screen>
      <Header title="Meu veículo" action={<StatusBadge status={connection} />} />
      <VehicleCard vehicle={vehicle} />
      <Card>
        {field('Placa', vehicle.plate)}
        {field('Marca', vehicle.brand)}
        {field('Modelo', vehicle.model)}
        {field('Versão', vehicle.version)}
        {field(
          'Ano fabricação / modelo',
          [vehicle.manufactureYear, vehicle.year].filter(Boolean).join(' / ')
        )}
        {field('Combustível', vehicle.fuel)}
        {field('Cor', vehicle.color)}
        {field('Motor', vehicle.engine)}
        {field('Câmbio', vehicle.transmission)}
        {field('Capacidade do tanque', vehicle.tank ? `${vehicle.tank} L` : null)}
        {field('Consumo urbano', vehicle.city ? `${vehicle.city} km/L` : null)}
        {field('Consumo rodoviário', vehicle.road ? `${vehicle.road} km/L` : null)}
        {field('FIPE', 'Não disponível para este cadastro')}
      </Card>
      <Button icon="car-cog" title="Horários, velocidade e combustível" onPress={() => router.push('/vehicle-controls')} />
    </Screen>
  );
}
