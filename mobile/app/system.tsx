import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Card,
  EmptyState,
  Header,
  Icon,
  Screen,
  StatusBadge,
  styles,
  type IconName
} from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';

type Capabilities = {
  trackerMode: string;
  mapProvider: string;
  routeProvider: string;
  placesProvider: string;
  features: Record<string, boolean | string | string[]>;
};

export default function SystemCenter() {
  const { user, theme } = useApp();
  const [capabilities, setCapabilities] = useState<Capabilities>();
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .get<Capabilities>('/api/capabilities')
      .then(setCapabilities)
      .catch(errorValue =>
        setError(errorValue instanceof Error ? errorValue.message : 'Sistema indisponível.')
      );
  }, []);
  const row = (icon: IconName, title: string, subtitle: string, path: string) => (
    <Pressable
      onPress={() => router.push(path as never)}
      style={({ pressed }) => ({
        minHeight: 62,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: pressed ? 0.65 : 1
      })}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          backgroundColor: theme.colors.primary + '22',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Icon name={icon} color={theme.colors.primaryBright} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{title}</Text>
        <Text style={[styles.caption, { color: theme.colors.muted }]}>{subtitle}</Text>
      </View>
      <Icon name="chevron-right" color={theme.colors.muted} />
    </Pressable>
  );
  return (
    <Screen>
      <Header
        eyebrow="WEB + APP"
        title="Central do sistema"
        subtitle="Mesmas APIs, conta, veículos e regras"
      />
      {error ? (
        <EmptyState icon="server-off" title="Backend indisponível" message={error} />
      ) : capabilities ? (
        <Card>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 17 }}>
              Ambiente sincronizado
            </Text>
            <StatusBadge status="ONLINE" />
          </View>
          <Text style={{ color: theme.colors.muted }}>
            Mapa: {capabilities.mapProvider.toUpperCase()}
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            Rotas: {capabilities.routeProvider.toUpperCase()}
          </Text>
          <Text style={{ color: theme.colors.muted }}>Locais: {capabilities.placesProvider}</Text>
          <Text style={{ color: theme.colors.muted }}>Rastreador: {capabilities.trackerMode}</Text>
        </Card>
      ) : null}
      <Card>
        {row(
          'map-marker-star-outline',
          'Locais e busca',
          'Casa, trabalho, endereços e POIs',
          '/places'
        )}
        {row(
          'car-cog',
          'Regras do veículo',
          'Horários, velocidade e combustível',
          '/vehicle-controls'
        )}
        {row(
          'shield-key-outline',
          'Segurança da conta',
          'Senha e autenticação em dois fatores',
          '/security'
        )}
        {row(
          'trophy-outline',
          'Condução responsável',
          'Pontuação, conquistas e ranking opcional',
          '/gamification'
        )}
        {row(
          'chart-timeline-variant',
          'Diagnóstico',
          'Telemetria e integridade do veículo',
          '/diagnostics'
        )}
      </Card>
      {user?.role === 'ADMIN' && (
        <Card>
          {row(
            'shield-account-outline',
            'Administração',
            'Moderação e visão operacional',
            '/admin-mobile'
          )}
        </Card>
      )}
      {user?.role === 'DEVELOPER' && (
        <Card>
          {row('code-tags', 'Laboratório', 'Integrações, flags e telemetria', '/developer-mobile')}
        </Card>
      )}
    </Screen>
  );
}
