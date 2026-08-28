import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, EmptyState, Header, Input, Screen } from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';

type Place = { label: string; address?: string; latitude: number; longitude: number };
type SavedPlace = Place & { placeKey: 'home' | 'work'; updatedAt: number };

export default function Places() {
  const { theme } = useApp();
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [message, setMessage] = useState('');
  const load = () =>
    api.get<{ places: SavedPlace[] }>('/api/saved-places').then(data => setPlaces(data.places));
  useEffect(() => {
    void load().catch(() => setMessage('Não foi possível carregar os locais.'));
  }, []);
  const search = async () => {
    try {
      const [addresses, system] = await Promise.all([
        api.get<Place[]>(`/api/geocode?q=${encodeURIComponent(query)}`),
        api.get<{ results: Array<Place & { title?: string; subtitle?: string }> }>(
          `/api/platform/search?q=${encodeURIComponent(query)}`
        )
      ]);
      const combined = [
        ...system.results
          .filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
          .map(item => ({
            ...item,
            label: item.title || item.label,
            address: item.subtitle || item.address
          })),
        ...addresses
      ];
      setResults(combined);
      if (!combined.length) setMessage('Nenhum endereço encontrado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Busca indisponível.');
    }
  };
  const save = async (key: 'home' | 'work', place: Place) => {
    await api.put(`/api/saved-places/${key}`, {
      address: place.address || place.label,
      latitude: place.latitude,
      longitude: place.longitude
    });
    setMessage(`${key === 'home' ? 'Casa' : 'Trabalho'} sincronizado com o site.`);
    await load();
  };
  return (
    <Screen>
      <Header title="Locais e busca" subtitle="Os mesmos favoritos usados no planejador web" />
      <Card>
        <Input
          label="Endereço, CEP ou estabelecimento"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
        />
        <Button icon="magnify" title="Buscar" disabled={query.trim().length < 2} onPress={search} />
      </Card>
      {!!message && <Text style={{ color: theme.colors.muted }}>{message}</Text>}
      {results.slice(0, 8).map((item, index) => (
        <Card key={`${item.latitude}-${item.longitude}-${index}`}>
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{item.label}</Text>
          {!!item.address && <Text style={{ color: theme.colors.muted }}>{item.address}</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button compact secondary title="Salvar Casa" onPress={() => save('home', item)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                compact
                secondary
                title="Salvar Trabalho"
                onPress={() => save('work', item)}
              />
            </View>
          </View>
        </Card>
      ))}
      {places.length ? (
        places.map(item => (
          <Card key={item.placeKey}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 17 }}>
              {item.placeKey === 'home' ? 'Casa' : 'Trabalho'}
            </Text>
            <Text style={{ color: theme.colors.muted }}>{item.address}</Text>
            <Button
              secondary
              compact
              icon="delete-outline"
              title="Remover"
              onPress={async () => {
                await api.delete(`/api/saved-places/${item.placeKey}`);
                await load();
              }}
            />
          </Card>
        ))
      ) : (
        <EmptyState
          icon="map-marker-star-outline"
          title="Nenhum local salvo"
          message="Busque um endereço para sincronizar Casa ou Trabalho."
        />
      )}
    </Screen>
  );
}
