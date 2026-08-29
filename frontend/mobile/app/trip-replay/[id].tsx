import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, EmptyState, Header, Metric, Screen } from '../../src/components/ui';
import { RastreonMap } from '../../src/components/RastreonMap';
import { api } from '../../src/services/api';
import { useApp } from '../../src/state/AppContext';
import type { Position } from '../../src/types';

export default function TripReplay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useApp();
  const [track, setTrack] = useState<Position[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    api
      .get<{ displayTrack: Position[] }>(`/api/trips/${id}/display-track`)
      .then(data => setTrack(data.displayTrack));
  }, [id]);
  useEffect(() => {
    if (!playing || track.length < 2) return;
    const timer = setInterval(
      () =>
        setIndex(current => {
          if (current >= track.length - 1) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        }),
      Math.max(80, 700 / speed)
    );
    return () => clearInterval(timer);
  }, [playing, speed, track.length]);
  const current = track[index];
  const elapsed = useMemo(
    () => (current && track[0] ? Math.max(0, current.timestamp - track[0].timestamp) : 0),
    [current, track]
  );
  return (
    <Screen scroll={false}>
      <Header
        eyebrow="REPLAY GPS"
        title="Reproduzir viagem"
        subtitle={`${index + 1} de ${track.length || 0} pontos`}
      />
      {current ? (
        <>
          <View
            style={{
              height: 420,
              borderRadius: 18,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: theme.colors.border
            }}
          >
            <RastreonMap
              focus={current}
              vehiclePosition={current}
              track={track.slice(0, index + 1)}
              showUserLocation={false}
              perspective
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Metric
              icon="clock-outline"
              label="Decorrido"
              value={`${Math.round(elapsed / 60000)} min`}
            />
            <Metric
              icon="speedometer"
              label="Velocidade"
              value={`${Math.round((current.speed || 0) * 3.6)} km/h`}
            />
            <Metric icon="play-speed" label="Replay" value={`${speed}x`} tone="warning" />
          </View>
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button
                  secondary
                  icon="skip-previous"
                  title="Voltar"
                  onPress={() => setIndex(value => Math.max(0, value - 10))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  icon={playing ? 'pause' : 'play'}
                  title={playing ? 'Pausar' : 'Reproduzir'}
                  onPress={() => setPlaying(value => !value)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  secondary
                  icon="skip-next"
                  title="Avançar"
                  onPress={() => setIndex(value => Math.min(track.length - 1, value + 10))}
                />
              </View>
            </View>
            <Button
              secondary
              title={`Velocidade ${speed}x`}
              onPress={() => setSpeed(value => (value >= 4 ? 0.5 : value * 2))}
            />
          </Card>
        </>
      ) : (
        <EmptyState
          icon="routes-clock"
          title="Sem percurso para replay"
          message="A viagem precisa ter telemetria registrada."
        />
      )}
    </Screen>
  );
}
