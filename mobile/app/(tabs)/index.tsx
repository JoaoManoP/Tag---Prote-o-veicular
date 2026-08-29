import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Card,
  EmptyState,
  Header,
  Icon,
  Metric,
  QuickAction,
  Screen,
  SectionTitle,
  StatusBadge,
  VehicleCard,
  styles
} from '../../src/components/ui';
import { useApp } from '../../src/state/AppContext';

const alertTone = (type: string) =>
  /OFFLINE|EXIT|MOVEMENT|DEVIATION/.test(type)
    ? 'alert-octagon-outline'
    : /BATTERY/.test(type)
      ? 'battery-alert-variant-outline'
      : 'shield-check-outline';

export default function Home() {
  const { user, selectedVehicle, alerts, trips, connection, theme } = useApp();
  const recentAlert = [...alerts].sort((a, b) => b.occurredAt - a.occurredAt)[0];
  const latestTrip = [...trips].sort((a, b) => b.startedAt - a.startedAt)[0];
  const unread = alerts.filter(a => !a.readAt).length;
  return (
    <Screen>
      <Header
        eyebrow="RASTREON MOBILE"
        title={`Olá, ${user?.name?.split(' ')[0] || 'motorista'}!`}
        subtitle="Tudo sob controle."
        action={
          <Pressable onPress={() => router.push('/notifications')} style={{ padding: 8 }}>
            <Icon
              name={unread ? 'bell-badge-outline' : 'bell-outline'}
              color={unread ? theme.colors.accent : theme.colors.text}
            />
          </Pressable>
        }
      />
      {!selectedVehicle ? (
        <EmptyState
          icon="car-cog"
          title="Bem-vindo ao RASTREON"
          message="Cadastre seu primeiro veículo para ativar rastreamento, viagens e proteção."
          action={
            <QuickAction
              icon="plus"
              label="Adicionar"
              onPress={() => router.push('/vehicle/add')}
            />
          }
        />
      ) : (
        <>
          <VehicleCard
            vehicle={selectedVehicle}
            onPress={() => router.push(`/vehicle/${selectedVehicle.id}`)}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <QuickAction
              icon="crosshairs-gps"
              label="Localizar"
              onPress={() => router.push('/(tabs)/map')}
            />
            <QuickAction
              icon="map-marker-path"
              label="Nova viagem"
              color={theme.colors.accent}
              onPress={() => router.push('/trip/new')}
            />
            <QuickAction
              icon="bell-outline"
              label="Alertas"
              color={theme.colors.warning}
              onPress={() => router.push('/notifications')}
            />
            <QuickAction
              icon="access-point"
              label="Dispositivos"
              color={theme.colors.success}
              onPress={() => router.push('/devices')}
            />
          </View>
          <SectionTitle eyebrow="TELEMETRIA" title="Resumo do veículo" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Metric
              icon="radar"
              label="Rastreador"
              value={connection === 'ONLINE' ? 'Online' : 'Aguardando'}
              tone={connection === 'ONLINE' ? 'success' : 'warning'}
            />
            <Metric icon="battery-high" label="Bateria" value="—" />
            <Metric
              icon="signal"
              label="Sinal GPS"
              value={connection === 'ONLINE' ? 'Ótimo' : '—'}
              tone={connection === 'ONLINE' ? 'success' : 'primary'}
            />
            <Metric icon="shield-home-outline" label="Proteção" value="Ativa" tone="success" />
          </View>
          {!!recentAlert && (
            <>
              <SectionTitle
                eyebrow="ATIVIDADE"
                title="Alerta recente"
                action={
                  <Text
                    onPress={() => router.push('/notifications')}
                    style={{ color: theme.colors.primaryBright, fontWeight: '800', fontSize: 12 }}
                  >
                    Ver todos
                  </Text>
                }
              />
              <Pressable onPress={() => router.push('/notifications')}>
                <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      backgroundColor: theme.colors.danger + '18',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Icon name={alertTone(recentAlert.type)} color={theme.colors.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                      {recentAlert.title}
                    </Text>
                    <Text style={[styles.caption, { color: theme.colors.muted }]}>
                      {new Date(recentAlert.occurredAt).toLocaleString('pt-BR')}
                    </Text>
                  </View>
                  <Icon name="chevron-right" color={theme.colors.muted} />
                </Card>
              </Pressable>
            </>
          )}
          <SectionTitle
            eyebrow="ROTA"
            title={
              latestTrip?.endedAt
                ? 'Última viagem'
                : latestTrip
                  ? 'Viagem em andamento'
                  : 'Próxima viagem'
            }
          />
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ gap: 7, alignItems: 'center' }}>
                <Icon name="map-marker" color={theme.colors.success} size={20} />
                <View style={{ width: 2, height: 26, backgroundColor: theme.colors.border }} />
                <Icon name="map-marker" color={theme.colors.danger} size={20} />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                  {latestTrip
                    ? `Viagem de ${new Date(latestTrip.startedAt).toLocaleDateString('pt-BR')}`
                    : 'Planeje seu próximo destino'}
                </Text>
                <Text style={{ color: theme.colors.muted }}>
                  {latestTrip?.endedAt
                    ? 'Percurso concluído e disponível no histórico'
                    : latestTrip
                      ? 'Rastreamento em andamento'
                      : 'Rotas, estimativa e acompanhamento ao vivo'}
                </Text>
              </View>
              <StatusBadge status={latestTrip && !latestTrip.endedAt ? 'EM VIAGEM' : 'PRONTO'} />
            </View>
            <Pressable
              onPress={() => router.push(latestTrip ? '/(tabs)/trips' : '/trip/new')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingTop: 8
              }}
            >
              <Icon name="navigation-variant" color={theme.colors.accent} />
              <Text style={{ color: theme.colors.accent, fontWeight: '900' }}>
                {latestTrip ? 'Abrir histórico' : 'Planejar viagem'}
              </Text>
            </Pressable>
          </Card>
        </>
      )}
    </Screen>
  );
}
