import React, { useEffect, useState } from 'react';
import { FlatList, Text } from 'react-native';
import { Button, Card, EmptyState, Header, Input, Screen } from '../src/components/ui';
import { api } from '../src/services/api';
import { currentLocation, requestLocationPermission } from '../src/services/location';
import { useApp } from '../src/state/AppContext';
import type { Geofence } from '../src/types';
export default function Geofences() {
  const { selectedVehicle, theme } = useApp();
  const [items, setItems] = useState<Geofence[]>([]),
    [name, setName] = useState('Casa'),
    [radius, setRadius] = useState('500'),
    [message, setMessage] = useState('');
  const load = async () => {
    if (!selectedVehicle) return;
    try {
      setItems(
        (await api.get<{ geofences: Geofence[] }>(`/api/vehicles/${selectedVehicle.id}/geofences`))
          .geofences
      );
    } catch {
      setMessage('Não foi possível carregar as áreas.');
    }
  };
  useEffect(() => {
    void load();
  }, [selectedVehicle?.id]);
  const add = async () => {
    if (!selectedVehicle) return;
    if (!(await requestLocationPermission())) {
      setMessage('Permissão negada. A área não foi criada.');
      return;
    }
    const position = await currentLocation();
    await api.post(`/api/vehicles/${selectedVehicle.id}/geofences`, {
      name,
      type: 'circle',
      centerLat: position.latitude,
      centerLng: position.longitude,
      radiusMeters: Number(radius),
      enabled: true
    });
    setMessage('Área criada na sua localização atual.');
    await load();
  };
  return (
    <Screen scroll={false}>
      <Header title="Áreas de proteção" subtitle="Alertas de entrada e saída" />
      {selectedVehicle ? (
        <>
          <Input label="Nome da área" value={name} onChangeText={setName} />
          <Input
            label="Raio em metros"
            value={radius}
            onChangeText={setRadius}
            keyboardType="number-pad"
          />
          <Button title="Criar na localização atual" onPress={add} />
          <Text style={{ color: theme.colors.muted }}>{message}</Text>
          <FlatList
            data={items}
            keyExtractor={item => item.id}
            contentContainerStyle={{ gap: 10 }}
            ListEmptyComponent={
              <EmptyState
                title="Nenhuma área criada"
                message="Crie Casa, Trabalho ou outra área autorizada."
              />
            }
            renderItem={({ item }) => (
              <Card>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{item.name}</Text>
                <Text style={{ color: theme.colors.muted }}>
                  Raio: {item.radiusMeters} m · {item.enabled ? 'Ativa' : 'Pausada'}
                </Text>
              </Card>
            )}
          />
        </>
      ) : (
        <EmptyState
          title="Selecione um veículo"
          message="Cada área pertence a um veículo autorizado."
        />
      )}
    </Screen>
  );
}
