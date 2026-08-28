import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Card, EmptyState, Header, Screen, StatusBadge } from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';

export default function AdminMobile() {
  const { user, theme } = useApp();
  const [overview, setOverview] = useState<Record<string, unknown>>();
  const [moderation, setModeration] = useState<Record<string, unknown>>();
  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    Promise.all([
      api.get<Record<string, unknown>>('/api/admin/overview'),
      api.get<Record<string, unknown>>('/api/platform/admin/moderation')
    ]).then(([first, second]) => { setOverview(first); setModeration(second); });
  }, [user?.role]);
  if (user?.role !== 'ADMIN') return <Screen><EmptyState icon="shield-lock-outline" title="Acesso restrito" message="Este módulo respeita a mesma função ADMIN do sistema." /></Screen>;
  return <Screen><Header title="Administração" subtitle="Visão operacional do mesmo backend" action={<StatusBadge status="ADMIN" />} />
    <Card><Text style={{ color: theme.colors.text, fontWeight: '900' }}>Visão geral</Text><Text selectable style={{ color: theme.colors.muted }}>{overview ? JSON.stringify(overview, null, 2) : 'Carregando…'}</Text></Card>
    <Card><Text style={{ color: theme.colors.text, fontWeight: '900' }}>Fila de moderação</Text><Text selectable style={{ color: theme.colors.muted }}>{moderation ? JSON.stringify(moderation, null, 2) : 'Carregando…'}</Text></Card>
  </Screen>;
}
