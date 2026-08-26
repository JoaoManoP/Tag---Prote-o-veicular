import React, { useEffect, useState } from 'react';
import { FlatList, Switch, Text, View } from 'react-native';
import { Card, EmptyState, Header, Screen, styles } from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';
type CommunityNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: number;
  readAt?: number;
};
type Preference = { type: string; enabled: boolean };
export default function Notifications() {
  const { alerts, refresh, theme } = useApp(),
    [community, setCommunity] = useState<CommunityNotification[]>([]),
    [preferences, setPreferences] = useState<Preference[]>([]);
  const load = () =>
    Promise.all([
      api
        .get<{ notifications: CommunityNotification[] }>('/api/platform/notifications')
        .then(data => setCommunity(data.notifications)),
      api
        .get<{ preferences: Preference[] }>('/api/platform/notification-preferences')
        .then(data => setPreferences(data.preferences))
    ]).catch(() => {});
  useEffect(() => {
    void load();
  }, []);
  const items = [
    ...alerts.map(item => ({ ...item, body: '', createdAt: item.occurredAt, source: 'vehicle' })),
    ...community.map(item => ({
      ...item,
      severity: 'info',
      occurredAt: item.createdAt,
      source: 'community'
    }))
  ].sort((a, b) => b.occurredAt - a.occurredAt);
  return (
    <Screen scroll={false}>
      <Header title="Notificações" subtitle="Segurança, rastreamento, viagem e comunidade" />
      <FlatList
        data={items}
        keyExtractor={i => `${i.source}:${i.id}`}
        contentContainerStyle={{ gap: 10 }}
        ListHeaderComponent={
          <Card>
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Preferências</Text>
            <Text style={{ color: theme.colors.muted }}>
              Controle os alertas internos por categoria.
            </Text>
            {preferences.map(preference => (
              <View
                key={preference.type}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                <Text style={{ color: theme.colors.text, flex: 1 }}>
                  {preference.type.replaceAll('_', ' ')}
                </Text>
                <Switch
                  value={preference.enabled}
                  onValueChange={async enabled => {
                    setPreferences(current =>
                      current.map(item =>
                        item.type === preference.type ? { ...item, enabled } : item
                      )
                    );
                    try {
                      await api.securePatch(
                        `/api/platform/notification-preferences/${preference.type}`,
                        { enabled }
                      );
                    } catch {
                      setPreferences(current =>
                        current.map(item =>
                          item.type === preference.type ? { ...item, enabled: !enabled } : item
                        )
                      );
                    }
                  }}
                />
              </View>
            ))}
          </Card>
        }
        ListEmptyComponent={
          <EmptyState title="Tudo tranquilo" message="Nenhum alerta foi recebido." />
        }
        renderItem={({ item }) => (
          <Card>
            <Text
              style={{
                color: item.severity === 'critical' ? theme.colors.danger : theme.colors.text,
                fontWeight: '900'
              }}
              onPress={async () => {
                if (!item.readAt) {
                  if (item.source === 'vehicle') await api.patch(`/api/alerts/${item.id}/read`, {});
                  else await api.securePatch(`/api/platform/notifications/${item.id}/read`, {});
                  await refresh();
                  void load();
                }
              }}
            >
              {item.title}
            </Text>
            {item.body ? <Text style={{ color: theme.colors.muted }}>{item.body}</Text> : null}
            <Text style={[styles.caption, { color: theme.colors.muted }]}>
              {new Date(item.occurredAt).toLocaleString('pt-BR')} · {item.type}
            </Text>
          </Card>
        )}
      />
    </Screen>
  );
}
