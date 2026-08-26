import { router } from 'expo-router';
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, Header, Screen, styles } from '../../src/components/ui';
import { useApp } from '../../src/state/AppContext';
export default function Trips() {
  const { trips, theme } = useApp();
  return (
    <Screen scroll={false}>
      <Header
        title="Viagens"
        subtitle="Planejado × realizado"
        action={<Button title="Nova viagem" onPress={() => router.push('/trip/new')} />}
      />
      {trips.length ? (
        <FlatList
          data={trips}
          keyExtractor={item => item.id}
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Card>
              <Text style={{ fontWeight: '900', fontSize: 17, color: theme.colors.text }}>
                Viagem de {new Date(item.startedAt).toLocaleDateString('pt-BR')}
              </Text>
              <Text style={[styles.caption, { color: theme.colors.muted }]}>
                {new Date(item.startedAt).toLocaleTimeString('pt-BR')} ·{' '}
                {item.endedAt ? 'Finalizada' : 'Em andamento'}
              </Text>
              {item.comparison && (
                <Text style={{ color: theme.colors.text }}>
                  {((item.comparison.actualDistanceMeters || 0) / 1000).toFixed(1)} km realizados
                </Text>
              )}
            </Card>
          )}
        />
      ) : (
        <EmptyState
          title="Nenhuma viagem registrada"
          message="Planeje seu destino e acompanhe o percurso real sem misturar estimativas com GPS."
          action={<Button title="Criar viagem" onPress={() => router.push('/trip/new')} />}
        />
      )}
    </Screen>
  );
}
