import { router } from 'expo-router';
import React from 'react';
import { FlatList } from 'react-native';
import { Button, EmptyState, Header, Screen, VehicleCard } from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';
export default function Vehicles() {
  const { vehicles, setSelected, refresh } = useApp();
  return (
    <Screen scroll={false}>
      <Header
        title="Meus veículos"
        subtitle="Sua garagem protegida"
        action={<Button title="Adicionar" onPress={() => router.push('/vehicle/add')} />}
      />
      {vehicles.length ? (
        <FlatList
          data={vehicles}
          keyExtractor={v => String(v.id)}
          contentContainerStyle={{ gap: 12, paddingBottom: 20 }}
          renderItem={({ item }) => (
            <VehicleCard
              vehicle={item}
              onPress={async () => {
                await api.post(`/api/vehicles/${item.id}/select`);
                setSelected(item);
                await refresh();
                router.push(`/vehicle/${item.id}`);
              }}
            />
          )}
        />
      ) : (
        <EmptyState
          title="Você ainda não possui veículos"
          message="Consulte uma placa ou preencha os dados manualmente."
          action={<Button title="Adicionar veículo" onPress={() => router.push('/vehicle/add')} />}
        />
      )}
    </Screen>
  );
}
