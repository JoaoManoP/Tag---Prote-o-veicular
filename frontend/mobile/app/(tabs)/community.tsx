import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  CategoryChips,
  PLACE_CATEGORIES,
  PlaceCarousel,
  type Place
} from '../../src/components/places';
import {
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  Input,
  LoadingState,
  Screen,
  StatusBadge,
  styles
} from '../../src/components/ui';
import { api } from '../../src/services/api';
import { currentLocation, requestLocationPermission } from '../../src/services/location';
import { useApp } from '../../src/state/AppContext';
import type { Position } from '../../src/types';

type Report = {
  id: string;
  category: string;
  severity: string;
  description: string;
  sourceLabel: string;
  expiresAt: number;
  confirmations: number;
};
type PxMessage = { id: string; body: string; author: { displayName: string }; createdAt: number };
type Tab = 'stations' | 'places' | 'reports' | 'px';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'stations', label: 'Postos' },
  { key: 'places', label: 'Locais' },
  { key: 'reports', label: 'Ocorrências' },
  { key: 'px', label: 'PX' }
];
const STATION_RADIUS = 3000;

export default function Community() {
  const { theme } = useApp(),
    [tab, setTab] = useState<Tab>('stations'),
    [position, setPosition] = useState<Position>(),
    [stations, setStations] = useState<Place[]>([]),
    [stationsLoading, setStationsLoading] = useState(true),
    [places, setPlaces] = useState<Place[]>([]),
    [placesLoading, setPlacesLoading] = useState(false),
    [placeCategory, setPlaceCategory] = useState('bakery'),
    [reports, setReports] = useState<Report[]>([]),
    [px, setPx] = useState<PxMessage[]>([]),
    [description, setDescription] = useState(''),
    [pxBody, setPxBody] = useState(''),
    [message, setMessage] = useState('');

  const locate = useCallback(async () => {
    if (position) return position;
    if (!(await requestLocationPermission())) return undefined;
    const location = await currentLocation();
    setPosition(location);
    return location;
  }, [position]);

  const loadStations = useCallback(async () => {
    setStationsLoading(true);
    try {
      const location = await locate();
      if (!location) {
        setStations([]);
        setMessage('Autorize a localização para ver postos próximos.');
        return;
      }
      const data = await api.get<{ places: Place[] }>(
        `/api/places/nearby?lat=${location.latitude}&lng=${location.longitude}&categories=fuel&radiusMeters=${STATION_RADIUS}&limit=30`
      );
      setStations(data.places);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Postos indisponíveis.');
    } finally {
      setStationsLoading(false);
    }
  }, [locate]);

  const loadPlaces = useCallback(
    async (category: string) => {
      setPlacesLoading(true);
      try {
        const location = await locate();
        if (!location) {
          setPlaces([]);
          setMessage('Autorize a localização para ver locais próximos.');
          return;
        }
        const data = await api.get<{ places: Place[] }>(
          `/api/places/nearby?lat=${location.latitude}&lng=${location.longitude}&categories=${category}&radiusMeters=${STATION_RADIUS}&limit=24`
        );
        setPlaces(data.places);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Locais indisponíveis.');
      } finally {
        setPlacesLoading(false);
      }
    },
    [locate]
  );

  const loadFeed = useCallback(async () => {
    try {
      let query = '';
      const location = await locate().catch(() => undefined);
      if (location)
        query = `?latitude=${location.latitude}&longitude=${location.longitude}&radiusMeters=20000`;
      const [reportData, pxData] = await Promise.all([
        api.get<{ reports: Report[] }>(`/api/platform/road-reports${query}`),
        api.get<{ messages: PxMessage[] }>('/api/platform/px/channels/px-geral/messages')
      ]);
      setReports(reportData.reports);
      setPx(pxData.messages);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Comunidade indisponível.');
    }
  }, [locate]);

  useEffect(() => {
    void loadStations();
    void loadFeed();
  }, []);
  useEffect(() => {
    if (tab === 'places') void loadPlaces(placeCategory);
  }, [tab, placeCategory]);

  const report = async () => {
    try {
      const location = await locate();
      if (!location) return setMessage('Autorize a localização para informar o ponto do evento.');
      await api.securePost('/api/platform/road-reports', {
        category: 'HAZARD',
        severity: 'LOW',
        description,
        latitude: location.latitude,
        longitude: location.longitude
      });
      setDescription('');
      setMessage('Ocorrência publicada como informação comunitária.');
      await loadFeed();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível publicar.');
    }
  };
  const sendPx = async () => {
    try {
      await api.securePost('/api/platform/px/channels/px-geral/messages', { body: pxBody });
      setPxBody('');
      await loadFeed();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar.');
    }
  };
  const cheapest = stations
    .filter(station => station.prices?.length)
    .sort(
      (a, b) =>
        Math.min(...(a.prices || []).map(p => p.price)) -
        Math.min(...(b.prices || []).map(p => p.price))
    )[0];

  return (
    <Screen>
      <Header
        title="Comunidade"
        subtitle="Informações colaborativas, nunca oficiais"
        action={<StatusBadge status="PRIVACIDADE" />}
      />
      <View
        style={{
          flexDirection: 'row',
          padding: 4,
          borderRadius: 14,
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border
        }}
      >
        {TABS.map(item => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(item.key)}
              style={{
                flex: 1,
                minHeight: 38,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 11,
                backgroundColor: active ? theme.colors.accent : 'transparent'
              }}
            >
              <Text
                style={{
                  color: active ? '#FFFFFF' : theme.colors.textSoft,
                  fontSize: 12,
                  fontWeight: '900'
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            secondary
            icon="message-text-outline"
            title="Conversas"
            onPress={() => router.push('/conversations')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            secondary
            icon="car-multiple"
            title="Comboio"
            onPress={() => router.push('/convoy')}
          />
        </View>
      </View>
      {!!message && <Text style={{ color: theme.colors.muted }}>{message}</Text>}

      {tab === 'stations' && (
        <>
          <SectionHeading
            icon="gas-station"
            title="Postos em até 3 km"
            subtitle={
              cheapest && cheapest.prices?.length
                ? `Menor preço: ${cheapest.name}`
                : 'Preços informados pela comunidade; nada é estimado.'
            }
            onReload={loadStations}
          />
          {stationsLoading ? (
            <LoadingState label="Buscando postos próximos…" />
          ) : (
            <PlaceCarousel
              places={stations}
              emptyTitle="Nenhum posto por perto"
              emptyMessage="Não encontramos postos em 3 km. Toque em atualizar após mudar de lugar."
            />
          )}
          <Card>
            <Text style={[styles.caption, { color: theme.colors.muted }]}>
              Deslize para ver mais postos. Toque em um posto para ver a lista completa de preços,
              confirmar valores e ler ou deixar comentários.
            </Text>
          </Card>
        </>
      )}

      {tab === 'places' && (
        <>
          <SectionHeading
            icon="map-search-outline"
            title="Perto de você"
            subtitle="Padarias, mercados, farmácias e mais, com comentários da comunidade."
            onReload={() => loadPlaces(placeCategory)}
          />
          <CategoryChips
            value={placeCategory}
            categories={PLACE_CATEGORIES.filter(item => item.key !== 'fuel')}
            onChange={setPlaceCategory}
          />
          {placesLoading ? (
            <LoadingState label="Buscando locais próximos…" />
          ) : (
            <PlaceCarousel
              places={places}
              emptyTitle="Nada encontrado nesta categoria"
              emptyMessage="Tente outra categoria ou atualize depois de se deslocar."
            />
          )}
        </>
      )}

      {tab === 'reports' && (
        <>
          <Card>
            <Input
              label="Condição da via"
              value={description}
              maxLength={500}
              onChangeText={setDescription}
              placeholder="Descreva sem dados pessoais"
            />
            <Button
              title="Publicar alerta leve"
              disabled={description.trim().length < 3}
              onPress={report}
            />
          </Card>
          {reports.length ? (
            reports.map(item => (
              <Card key={item.id}>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                  {item.category} · {item.severity}
                </Text>
                <Text style={{ color: theme.colors.muted }}>{item.description}</Text>
                <Text style={[styles.caption, { color: theme.colors.muted }]}>
                  {item.sourceLabel} · {item.confirmations} confirmação(ões)
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      compact
                      secondary
                      title="Confirmar"
                      onPress={async () => {
                        await api.securePut(`/api/platform/road-reports/${item.id}/vote`, {
                          vote: 'CONFIRM'
                        });
                        await loadFeed();
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      compact
                      secondary
                      title="Não está mais lá"
                      onPress={async () => {
                        await api.securePut(`/api/platform/road-reports/${item.id}/vote`, {
                          vote: 'RESOLVED'
                        });
                        await loadFeed();
                      }}
                    />
                  </View>
                </View>
              </Card>
            ))
          ) : (
            <EmptyState
              title="Sem ocorrências ativas"
              message="Informações temporárias expiram automaticamente."
            />
          )}
        </>
      )}

      {tab === 'px' && (
        <>
          <Card>
            <Input
              label="Mensagem curta"
              value={pxBody}
              maxLength={300}
              onChangeText={setPxBody}
              placeholder="Sem telefone, e-mail ou localização de terceiros"
            />
            <Button
              title="Enviar ao PX Geral"
              disabled={pxBody.trim().length < 2}
              onPress={sendPx}
            />
          </Card>
          {px.map(item => (
            <Card key={item.id}>
              <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                {item.author.displayName}
              </Text>
              <Text style={{ color: theme.colors.muted }}>{item.body}</Text>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

function SectionHeading({
  icon,
  title,
  subtitle,
  onReload
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  title: string;
  subtitle: string;
  onReload: () => void;
}) {
  const { theme } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon name={icon} size={20} color={theme.colors.primaryBright} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>{title}</Text>
        <Text numberOfLines={2} style={[styles.caption, { color: theme.colors.muted }]}>
          {subtitle}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Atualizar"
        onPress={onReload}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.card,
          opacity: pressed ? 0.7 : 1
        })}
      >
        <Icon name="refresh" size={18} color={theme.colors.text} />
      </Pressable>
    </View>
  );
}
