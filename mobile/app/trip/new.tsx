import { router } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, Text } from 'react-native';
import { Button, Card, Header, Input, Screen, styles } from '../../src/components/ui';
import { api } from '../../src/services/api';
import { currentLocation, requestLocationPermission } from '../../src/services/location';
import { useApp } from '../../src/state/AppContext';
import type { TrackingSession, Trip } from '../../src/types';
type Place = { label: string; latitude: number; longitude: number };
export default function NewTrip() {
  const { selectedVehicle, session, setSession, refresh, theme } = useApp(),
    [destination, setDestination] = useState(''),
    [results, setResults] = useState<Place[]>([]),
    [selected, setSelected] = useState<Place | null>(null),
    [route, setRoute] = useState<any>(null),
    [message, setMessage] = useState(''),
    [loading, setLoading] = useState(false);
  const search = async () => {
    setLoading(true);
    try {
      setResults(await api.get<Place[]>(`/api/geocode?q=${encodeURIComponent(destination)}`));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Busca indisponível.');
    } finally {
      setLoading(false);
    }
  };
  const calculate = async () => {
    if (!selected || !selectedVehicle) return;
    setLoading(true);
    try {
      if (!(await requestLocationPermission())) {
        setMessage('Permissão de localização negada. Informe uma origem futuramente.');
        return;
      }
      const origin = await currentLocation(),
        query = `from=${origin.longitude},${origin.latitude}&to=${selected.longitude},${selected.latitude}&vehicleType=${selectedVehicle.type}&departureTime=${encodeURIComponent(new Date().toISOString())}`,
        data = await api.get<any>(`/api/route?${query}`);
      setRoute({
        ...data.routes[0],
        provider: data.provider,
        originLabel: 'Minha localização',
        destinationLabel: selected.label
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Rota indisponível.');
    } finally {
      setLoading(false);
    }
  };
  const start = async () => {
    if (!route || !selectedVehicle) return;
    setLoading(true);
    try {
      let active = session;
      if (!active) {
        active = await api.post<TrackingSession>('/api/sessions', {
          vehicleId: selectedVehicle.id
        });
        setSession(active);
      }
      await api.post<{ trip: Trip }>('/api/trips', {
        trackingSessionId: active.id,
        vehicleId: selectedVehicle.id,
        plannedRoute: route,
        startedAt: Date.now()
      });
      await refresh();
      router.replace('/(tabs)/trips');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível iniciar a viagem.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Screen>
      <Header title="Nova viagem" subtitle="Rota rodoviária e estimativas identificadas" />
      <Input
        label="Destino"
        value={destination}
        onChangeText={setDestination}
        placeholder="Endereço ou CEP"
      />
      <Button
        title={loading ? 'Aguarde…' : 'Buscar destino'}
        disabled={loading || destination.length < 3}
        onPress={search}
      />
      <FlatList
        scrollEnabled={false}
        data={results}
        keyExtractor={(place, index) => `${place.latitude}:${place.longitude}:${index}`}
        renderItem={({ item }) => (
          <Card>
            <Text
              onPress={() => {
                setSelected(item);
                setDestination(item.label);
                setResults([]);
              }}
              style={{ color: theme.colors.text, fontWeight: '700' }}
            >
              {item.label}
            </Text>
          </Card>
        )}
      />
      {selected && !route && (
        <Button title="Calcular rota da minha localização" onPress={calculate} />
      )}{' '}
      {!!message && <Text style={{ color: theme.colors.text }}>{message}</Text>}
      {route && (
        <Card>
          <Text style={[styles.subtitle, { color: theme.colors.text }]}>Resumo da rota</Text>
          <Text style={{ color: theme.colors.text }}>
            {(route.distanceMeters / 1000).toFixed(1)} km ·{' '}
            {Math.round((route.durationInTrafficSeconds || route.durationSeconds) / 60)} min
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            Fonte: {route.provider}. Pedágios: {route.tolls ?? 'não informado'}. Consumo será
            estimado com os dados do veículo.
          </Text>
          <Button
            title={loading ? 'Iniciando…' : 'Iniciar viagem'}
            disabled={loading}
            onPress={start}
          />
        </Card>
      )}
    </Screen>
  );
}
