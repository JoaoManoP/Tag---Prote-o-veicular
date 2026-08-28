import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, EmptyState, Header, Input, Metric, Screen } from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';

type Progress = { score: number; breakdown: Record<string, number>; achievements: string[] };
type Profile = { enabled: boolean; displayName: string };
type Ranking = { position: number; displayName: string; score: number };
const labels: Record<string, string> = { completedTrips: 'Viagens', continuity: 'Continuidade', scheduleCompliance: 'Horários', geofenceCompliance: 'Proteção', dataQuality: 'GPS' };

export default function Gamification() {
  const { user, theme } = useApp();
  const [progress, setProgress] = useState<Progress>();
  const [profile, setProfile] = useState<Profile>({ enabled: false, displayName: '' });
  const [ranking, setRanking] = useState<Ranking[]>([]);
  const load = () => Promise.all([
    api.get<{ progress: Progress; profile: Profile }>('/api/gamification/me'),
    api.get<{ ranking: Ranking[] }>('/api/gamification/ranking')
  ]).then(([mine, board]) => { setProgress(mine.progress); setProfile(mine.profile); setRanking(board.ranking); });
  useEffect(() => { void load(); }, []);
  return (
    <Screen>
      <Header eyebrow="PRIVACIDADE POR PADRÃO" title="Condução responsável" subtitle="Ranking somente com consentimento" />
      {progress ? <>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Metric icon="shield-star-outline" label="Pontuação" value={String(progress.score)} tone="success" />
          <Metric icon="trophy-outline" label="Conquistas" value={String(progress.achievements.length)} tone="warning" />
        </View>
        <Card>{Object.entries(progress.breakdown).map(([key, value]) => <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: theme.colors.muted }}>{labels[key] || key}</Text><Text style={{ color: theme.colors.text, fontWeight: '900' }}>+{value}</Text></View>)}</Card>
        <Card>
          <Input label="Nome público" value={profile.displayName || user?.name || ''} onChangeText={value => setProfile(current => ({ ...current, displayName: value }))} />
          <Button secondary={profile.enabled} title={profile.enabled ? 'Participando do ranking' : 'Ranking desativado'} onPress={() => setProfile(current => ({ ...current, enabled: !current.enabled }))} />
          <Button title="Salvar preferência" onPress={async () => { await api.put('/api/gamification/me', profile); await load(); }} />
        </Card>
        {ranking.length ? ranking.map(item => <Card key={`${item.position}-${item.displayName}`}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: theme.colors.text, fontWeight: '900' }}>{item.position}º · {item.displayName}</Text><Text style={{ color: theme.colors.accent, fontWeight: '900' }}>{item.score}</Text></View></Card>) : <EmptyState icon="trophy-outline" title="Ranking vazio" message="A participação é opcional e não publica rotas ou localização." />}
      </> : <EmptyState icon="progress-clock" title="Calculando pontuação" message="Usando viagens e telemetria do mesmo sistema." />}
    </Screen>
  );
}
