import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Card, EmptyState, Header, Screen, StatusBadge } from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';

export default function DeveloperMobile() {
  const { user, theme } = useApp();
  const [info, setInfo] = useState<Record<string, unknown>>();
  const [flags, setFlags] = useState<Record<string, unknown>>();
  const [bindings, setBindings] = useState<Record<string, unknown>>();
  useEffect(() => {
    if (user?.role !== 'DEVELOPER') return;
    Promise.all([
      api.get<Record<string, unknown>>('/api/lab/info'),
      api.get<Record<string, unknown>>('/api/platform/developer/feature-flags'),
      api.get<Record<string, unknown>>('/api/platform/developer/tracker-bindings')
    ]).then(([a, b, c]) => { setInfo(a); setFlags(b); setBindings(c); });
  }, [user?.role]);
  if (user?.role !== 'DEVELOPER') return <Screen><EmptyState icon="code-tags" title="Acesso restrito" message="Este módulo respeita a mesma função DEVELOPER do sistema." /></Screen>;
  return <Screen><Header title="Laboratório" subtitle="Integrações e telemetria" action={<StatusBadge status="DEVELOPER" />} />
    {[['Ambiente', info], ['Feature flags', flags], ['Rastreadores', bindings]].map(([label, value]) => <Card key={label as string}><Text style={{ color: theme.colors.text, fontWeight: '900' }}>{label as string}</Text><Text selectable style={{ color: theme.colors.muted }}>{value ? JSON.stringify(value, null, 2) : 'Carregando…'}</Text></Card>)}
  </Screen>;
}
