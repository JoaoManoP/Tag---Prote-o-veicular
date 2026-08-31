import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  Screen,
  StatusBadge,
  styles
} from '../../src/components/ui';
import { useApp } from '../../src/state/AppContext';
import type { Trip } from '../../src/types';

type Range = 'all' | 'today' | '7d' | '30d';
export default function Trips() {
  const { trips, theme } = useApp();
  const [range, setRange] = useState<Range>('all');
  const filtered = useMemo(() => {
    const now = Date.now();
    const startToday = new Date().setHours(0, 0, 0, 0);
    return trips.filter(
      item =>
        range === 'all' ||
        (range === 'today'
          ? item.startedAt >= startToday
          : item.startedAt >= now - (range === '7d' ? 7 : 30) * 86400000)
    );
  }, [trips, range]);
  const metric = (item: Trip, key: string) =>
    Number((item.comparison as Record<string, number> | undefined)?.[key] || 0);
  return (
    <Screen scroll={false}>
      <Header
        eyebrow="ROTAS E PERCURSOS"
        title="Viagens"
        subtitle="Planejado × realizado, sem misturar estimativas com GPS"
        action={
          <Button compact icon="plus" title="Nova" onPress={() => router.push('/trip/new')} />
        }
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(
          [
            ['all', 'Todas'],
            ['today', 'Hoje'],
            ['7d', '7 dias'],
            ['30d', '30 dias']
          ] as [Range, string][]
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setRange(value)}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: 12,
              alignItems: 'center',
              backgroundColor: range === value ? theme.colors.primary : theme.colors.card,
              borderWidth: 1,
              borderColor: range === value ? theme.colors.primaryBright : theme.colors.border
            }}
          >
            <Text
              style={{
                color: range === value ? '#fff' : theme.colors.muted,
                fontSize: 11,
                fontWeight: '900'
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={{ gap: 12, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="routes"
            title="Nenhuma viagem registrada"
            message="Planeje um destino e acompanhe o percurso real pelo rastreador."
            action={
              <Button
                icon="map-marker-path"
                title="Planejar viagem"
                onPress={() => router.push('/trip/new')}
              />
            }
          />
        }
        renderItem={({ item }) => {
          const route = (item.plannedRoute || {}) as Record<string, any>;
          const km = metric(item, 'actualDistanceMeters') / 1000;
          const minutes = Math.round(
            (metric(item, 'actualDurationSeconds') ||
              Math.max(0, (item.endedAt || Date.now()) - item.startedAt) / 1000) / 60
          );
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/trip/[id]', params: { id: item.id } })}
            >
              <Card>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
                    {new Date(item.startedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short'
                    })}
                  </Text>
                  <StatusBadge status={item.endedAt ? 'FINALIZADA' : 'EM VIAGEM'} />
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ alignItems: 'center', gap: 5 }}>
                    <Icon name="circle" size={10} color={theme.colors.success} />
                    <View style={{ width: 2, height: 26, backgroundColor: theme.colors.border }} />
                    <Icon name="map-marker" size={19} color={theme.colors.danger} />
                  </View>
                  <View style={{ flex: 1, gap: 11 }}>
                    <Text
                      numberOfLines={1}
                      style={{ color: theme.colors.textSoft, fontWeight: '700' }}
                    >
                      {route.originLabel || 'Origem registrada'}
                    </Text>
                    <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900' }}>
                      {route.destinationLabel || 'Destino registrado'}
                    </Text>
                  </View>
                  <Icon name="chevron-right" color={theme.colors.muted} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.caption, { color: theme.colors.muted }]}>SAÍDA</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                      {new Date(item.startedAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.caption, { color: theme.colors.muted }]}>TEMPO</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                      {minutes || '—'} min
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.caption, { color: theme.colors.muted }]}>DISTÂNCIA</Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                      {km ? `${km.toFixed(1)} km` : '—'}
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}
