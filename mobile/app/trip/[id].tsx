import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, EmptyState, Header, Metric, Screen, styles } from '../../src/components/ui';
import { RastreonMap, type MapPoint } from '../../src/components/RastreonMap';
import { api } from '../../src/services/api';
import { useApp } from '../../src/state/AppContext';
import type { Position, Trip } from '../../src/types';
export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme, refresh } = useApp();
  const [trip, setTrip] = useState<Trip>();
  const [track, setTrack] = useState<Position[]>([]);
  const [error, setError] = useState('');
  const load = () =>
    Promise.all([
      api.get<{ trip: Trip }>(`/api/trips/${id}`),
      api.get<{ displayTrack: Position[] }>(`/api/trips/${id}/display-track`)
    ])
      .then(([detail, points]) => {
        setTrip(detail.trip);
        setTrack(points.displayTrack);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Viagem indisponível.'));
  useEffect(() => {
    void load();
  }, [id]);
  if (error)
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title="Viagem indisponível" message={error} />
      </Screen>
    );
  if (!trip)
    return (
      <Screen>
        <EmptyState
          icon="routes-clock"
          title="Carregando percurso"
          message="Buscando rota e telemetria…"
        />
      </Screen>
    );
  const comparison = (trip.comparison || {}) as Record<string, number>;
  const route = (trip.plannedRoute || {}) as Record<string, any>;
  return (
    <Screen>
      <Header
        eyebrow="DETALHES DA VIAGEM"
        title={route.destinationLabel || 'Percurso registrado'}
        subtitle={new Date(trip.startedAt).toLocaleString('pt-BR')}
      />
      {track.length ? (
        <View
          style={{
            height: 260,
            borderRadius: 18,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: theme.colors.border
          }}
        >
          <RastreonMap
            focus={track[0]}
            track={track}
            showUserLocation={false}
            perspective={false}
            points={[
              {
                id: 'trip-start',
                latitude: track[0].latitude,
                longitude: track[0].longitude,
                kind: 'start'
              },
              {
                id: 'trip-end',
                latitude: track[track.length - 1].latitude,
                longitude: track[track.length - 1].longitude,
                kind: 'end'
              }
            ] satisfies MapPoint[]}
          />
        </View>
      ) : (
        <Card>
          <Text style={{ color: theme.colors.muted }}>
            O rastreador ainda não enviou pontos suficientes para desenhar o percurso.
          </Text>
        </Card>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Metric
          icon="map-marker-distance"
          label="Distância"
          value={
            comparison.actualDistanceMeters
              ? `${(comparison.actualDistanceMeters / 1000).toFixed(1)} km`
              : '—'
          }
        />
        <Metric
          icon="clock-outline"
          label="Duração"
          value={
            comparison.actualDurationSeconds
              ? `${Math.round(comparison.actualDurationSeconds / 60)} min`
              : '—'
          }
        />
        <Metric
          icon="speedometer"
          label="Vel. média"
          value={
            comparison.averageSpeedKmh ? `${Math.round(comparison.averageSpeedKmh)} km/h` : '—'
          }
        />
      </View>
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 17 }}>
          Percurso realizado
        </Text>
        <Text style={[styles.caption, { color: theme.colors.muted }]}>
          Tempo em movimento: {Math.round((comparison.movingSeconds || 0) / 60)} min
        </Text>
        <Text style={[styles.caption, { color: theme.colors.muted }]}>
          Tempo parado: {Math.round((comparison.stoppedSeconds || 0) / 60)} min
        </Text>
        <Text style={[styles.caption, { color: theme.colors.muted }]}>
          Velocidade máxima: {Math.round(comparison.maximumSpeedKmh || 0)} km/h
        </Text>
        <Text style={[styles.caption, { color: theme.colors.muted }]}>
          Amostras válidas de GPS: {comparison.metricSampleCount || track.length}
        </Text>
      </Card>
      <Button icon="play-circle-outline" title="Reproduzir viagem" onPress={() => router.push(`/trip-replay/${trip.id}` as never)} />
      {track.some((point, index) => index > 0 && point.timestamp - track[index - 1].timestamp > 30000) && (
        <Button secondary icon="auto-fix" title="Reconstruir maior lacuna" onPress={async () => {
          let gapIndex = 1;
          for (let index = 2; index < track.length; index += 1)
            if (track[index].timestamp - track[index - 1].timestamp > track[gapIndex].timestamp - track[gapIndex - 1].timestamp) gapIndex = index;
          await api.post(`/api/trips/${trip.id}/reconstruct`, {
            before: track[gapIndex - 1],
            after: track[gapIndex],
            lostAt: track[gapIndex - 1].timestamp,
            reconnectedAt: track[gapIndex].timestamp,
            duration: track[gapIndex].timestamp - track[gapIndex - 1].timestamp
          });
          await load();
        }} />
      )}
      {!trip.endedAt && (
        <Button
          danger
          icon="stop-circle-outline"
          title="Encerrar viagem"
          onPress={async () => {
            await api.patch(`/api/trips/${trip.id}/finish`, { endedAt: Date.now() });
            await refresh();
            await load();
          }}
        />
      )}
    </Screen>
  );
}
