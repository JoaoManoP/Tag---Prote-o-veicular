import React, { useState } from 'react';
import { Image, Text } from 'react-native';
import { Button, Card, EmptyState, Header, Screen, styles } from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';
import type { TrackingSession } from '../src/types';
export default function Devices() {
  const { selectedVehicle, session, setSession, theme } = useApp(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const create = async () => {
    if (!selectedVehicle) return;
    setLoading(true);
    try {
      const data = await api.post<TrackingSession>('/api/sessions', {
        vehicleId: selectedVehicle.id
      });
      setSession(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gerar o QR Code.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Screen>
      <Header title="Dispositivos" subtitle="Celular ou rastreador vinculado" />
      {!selectedVehicle ? (
        <EmptyState
          title="Selecione um veículo"
          message="O dispositivo sempre pertence a um veículo da sua conta."
        />
      ) : (
        <>
          <Card>
            <Text style={[styles.subtitle, { color: theme.colors.text, textAlign: 'left' }]}>
              {selectedVehicle.nickname}
            </Text>
            <Text style={{ color: theme.colors.muted }}>PHONE · GPS_TRACKER · DEMO · OTHER</Text>
          </Card>
          {session?.qrCode ? (
            <Card>
              <Text style={[styles.subtitle, { color: theme.colors.text }]}>Conectar celular</Text>
              <Image
                source={{ uri: session.qrCode }}
                style={{ width: 260, height: 260, alignSelf: 'center' }}
              />
              <Text
                style={{
                  textAlign: 'center',
                  fontWeight: '900',
                  fontSize: 22,
                  color: theme.colors.text
                }}
              >
                {session.pairingCode}
              </Text>
              <Text style={[styles.caption, { color: theme.colors.muted, textAlign: 'center' }]}>
                Token temporário, imprevisível, revogável e de uso único. Expira em cinco minutos.
              </Text>
            </Card>
          ) : (
            <EmptyState
              title="Nenhum pareamento ativo"
              message="Gere um QR Code para autorizar outro celular como rastreador. O uso do celular é opcional."
              action={
                <Button
                  title={loading ? 'Gerando…' : 'Gerar QR Code'}
                  disabled={loading}
                  onPress={create}
                />
              }
            />
          )}{' '}
          {!!error && <Text style={{ color: theme.colors.danger }}>{error}</Text>}
        </>
      )}
    </Screen>
  );
}
