import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  Header,
  Input,
  Screen,
  StatusBadge,
  styles
} from '../../src/components/ui';
import { api } from '../../src/services/api';
import { currentLocation, requestLocationPermission } from '../../src/services/location';
import { useApp } from '../../src/state/AppContext';
type Station = {
  id: string;
  name: string;
  address: string;
  distanceMeters?: number;
  confidence: string;
  prices: { fuelType: string; price: number; status: string }[];
  partnerBenefit?: { description: string };
  favorite?: boolean;
};
type Report = {
  id: string;
  category: string;
  severity: string;
  description: string;
  sourceLabel: string;
  expiresAt: number;
  confirmations: number;
};
type PxMessage = { id: string; body: string; author: { displayName: string }; createdAt: number };
export default function Community() {
  const { theme } = useApp(),
    [tab, setTab] = useState<'stations' | 'reports' | 'px'>('stations'),
    [stations, setStations] = useState<Station[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [px, setPx] = useState<PxMessage[]>([]),
    [description, setDescription] = useState(''),
    [pxBody, setPxBody] = useState(''),
    [message, setMessage] = useState('');
  const load = async () => {
    try {
      let query = '';
      if (await requestLocationPermission()) {
        const location = await currentLocation();
        query = `?latitude=${location.latitude}&longitude=${location.longitude}&radiusMeters=20000`;
      }
      const [stationData, reportData, pxData] = await Promise.all([
        api.get<{ stations: Station[] }>(`/api/platform/stations${query}`),
        api.get<{ reports: Report[] }>(`/api/platform/road-reports${query}`),
        api.get<{ messages: PxMessage[] }>('/api/platform/px/channels/px-geral/messages')
      ]);
      setStations(stationData.stations);
      setReports(reportData.reports);
      setPx(pxData.messages);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Comunidade indisponível.');
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const report = async () => {
    try {
      if (!(await requestLocationPermission()))
        return setMessage('Autorize a localização para informar o ponto do evento.');
      const location = await currentLocation();
      await api.securePost('/api/platform/road-reports', {
        category: 'HAZARD',
        severity: 'LOW',
        description,
        latitude: location.latitude,
        longitude: location.longitude
      });
      setDescription('');
      setMessage('Ocorrência publicada como informação comunitária.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível publicar.');
    }
  };
  const sendPx = async () => {
    try {
      await api.securePost('/api/platform/px/channels/px-geral/messages', { body: pxBody });
      setPxBody('');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar.');
    }
  };
  return (
    <Screen>
      <Header
        title="Comunidade"
        subtitle="Informações colaborativas, nunca oficiais"
        action={<StatusBadge status="PRIVACIDADE" />}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            title="Postos"
            secondary={tab !== 'stations'}
            onPress={() => setTab('stations')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Ocorrências"
            secondary={tab !== 'reports'}
            onPress={() => setTab('reports')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="PX" secondary={tab !== 'px'} onPress={() => setTab('px')} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            secondary
            icon="message-text-outline"
            title="Conversas"
            onPress={() => router.push('/conversations')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            secondary
            icon="car-multiple"
            title="Comboio"
            onPress={() => router.push('/convoy')}
          />
        </View>
      </View>
      {!!message && <Text style={{ color: theme.colors.muted }}>{message}</Text>}
      {tab === 'stations' &&
        (stations.length ? (
          stations.map(station => (
            <Card key={station.id}>
              <Text style={[styles.subtitle, { color: theme.colors.text, textAlign: 'left' }]}>
                {station.name}
              </Text>
              <Text style={{ color: theme.colors.muted }}>
                {station.address}
                {station.distanceMeters != null
                  ? ` · ${(station.distanceMeters / 1000).toFixed(1)} km`
                  : ''}
              </Text>
              <Text style={{ color: theme.colors.text }}>
                {station.prices
                  .map(price => `${price.fuelType}: R$ ${price.price.toFixed(2)}`)
                  .join(' · ') || 'Sem preço validado'}
              </Text>
              {station.partnerBenefit && (
                <Text style={{ color: theme.colors.success }}>
                  Parceiro: {station.partnerBenefit.description}
                </Text>
              )}
              <Button
                compact
                secondary
                icon={station.favorite ? 'heart' : 'heart-outline'}
                title={station.favorite ? 'Remover favorito' : 'Favoritar posto'}
                onPress={async () => {
                  if (station.favorite)
                    await api.secureDelete(`/api/platform/stations/${station.id}/favorite`);
                  else await api.securePost(`/api/platform/stations/${station.id}/favorite`);
                  await load();
                }}
              />
            </Card>
          ))
        ) : (
          <EmptyState
            title="Nenhum posto cadastrado"
            message="A busca de POIs do mapa continua disponível."
          />
        ))}
      {tab === 'reports' && (
        <>
          <Card>
            <Input
              label="Condição da via"
              value={description}
              maxLength={500}
              onChangeText={setDescription}
              placeholder="Descreva sem dados pessoais"
            />
            <Button
              title="Publicar alerta leve"
              disabled={description.trim().length < 3}
              onPress={report}
            />
          </Card>
          {reports.length ? (
            reports.map(item => (
              <Card key={item.id}>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                  {item.category} · {item.severity}
                </Text>
                <Text style={{ color: theme.colors.muted }}>{item.description}</Text>
                <Text style={[styles.caption, { color: theme.colors.muted }]}>
                  {item.sourceLabel} · {item.confirmations} confirmação(ões)
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      compact
                      secondary
                      title="Confirmar"
                      onPress={async () => {
                        await api.securePut(`/api/platform/road-reports/${item.id}/vote`, {
                          vote: 'CONFIRM'
                        });
                        await load();
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      compact
                      secondary
                      title="Não está mais lá"
                      onPress={async () => {
                        await api.securePut(`/api/platform/road-reports/${item.id}/vote`, {
                          vote: 'RESOLVED'
                        });
                        await load();
                      }}
                    />
                  </View>
                </View>
              </Card>
            ))
          ) : (
            <EmptyState
              title="Sem ocorrências ativas"
              message="Informações temporárias expiram automaticamente."
            />
          )}
        </>
      )}
      {tab === 'px' && (
        <>
          <Card>
            <Input
              label="Mensagem curta"
              value={pxBody}
              maxLength={300}
              onChangeText={setPxBody}
              placeholder="Sem telefone, e-mail ou localização de terceiros"
            />
            <Button
              title="Enviar ao PX Geral"
              disabled={pxBody.trim().length < 2}
              onPress={sendPx}
            />
          </Card>
          {px.map(item => (
            <Card key={item.id}>
              <Text style={{ color: theme.colors.text, fontWeight: '800' }}>
                {item.author.displayName}
              </Text>
              <Text style={{ color: theme.colors.muted }}>{item.body}</Text>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
