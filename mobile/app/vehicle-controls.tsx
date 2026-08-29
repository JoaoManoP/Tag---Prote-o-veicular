import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, EmptyState, Header, Input, Screen, StatusBadge } from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';

type Schedule = { enabled: boolean; days: number[]; from: string; to: string; timezone: string };
type SpeedRule = { enabled: boolean; maximumKmh: number };

export default function VehicleControls() {
  const { selectedVehicle, theme } = useApp();
  const [schedule, setSchedule] = useState<Schedule>({
    enabled: true,
    days: [1, 2, 3, 4, 5],
    from: '07:00',
    to: '19:00',
    timezone: 'America/Sao_Paulo'
  });
  const [rule, setRule] = useState<SpeedRule>({ enabled: false, maximumKmh: 110 });
  const [fuelType, setFuelType] = useState('gasoline');
  const [fuelPrice, setFuelPrice] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!selectedVehicle) return;
    Promise.all([
      api.get<{ schedule: Schedule | null }>(`/api/vehicles/${selectedVehicle.id}/schedule`),
      api.get<{ rule: SpeedRule | null }>(`/api/vehicles/${selectedVehicle.id}/speed-rule`)
    ])
      .then(([scheduleData, ruleData]) => {
        if (scheduleData.schedule) setSchedule(scheduleData.schedule);
        if (ruleData.rule) setRule(ruleData.rule);
      })
      .catch(() => setMessage('Não foi possível carregar todas as regras.'));
  }, [selectedVehicle?.id]);
  if (!selectedVehicle)
    return (
      <Screen>
        <EmptyState
          title="Selecione um veículo"
          message="As regras pertencem ao mesmo veículo usado no site."
        />
      </Screen>
    );
  return (
    <Screen>
      <Header
        title="Regras do veículo"
        subtitle={selectedVehicle.nickname}
        action={<StatusBadge status="SINCRONIZADO" />}
      />
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 17 }}>
          Horário autorizado
        </Text>
        <Input
          label="Início (HH:mm)"
          value={schedule.from}
          onChangeText={value => setSchedule(current => ({ ...current, from: value }))}
        />
        <Input
          label="Fim (HH:mm)"
          value={schedule.to}
          onChangeText={value => setSchedule(current => ({ ...current, to: value }))}
        />
        <Button
          secondary={schedule.enabled}
          title={schedule.enabled ? 'Regra ativa' : 'Regra pausada'}
          onPress={() => setSchedule(current => ({ ...current, enabled: !current.enabled }))}
        />
        <Button
          title="Salvar horário"
          onPress={async () => {
            await api.put(`/api/vehicles/${selectedVehicle.id}/schedule`, schedule);
            setMessage('Horário sincronizado.');
          }}
        />
      </Card>
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 17 }}>
          Limite de velocidade
        </Text>
        <Input
          label="Máximo em km/h"
          value={String(rule.maximumKmh)}
          keyboardType="number-pad"
          onChangeText={value =>
            setRule(current => ({ ...current, maximumKmh: Number(value) || 0 }))
          }
        />
        <Button
          secondary={rule.enabled}
          title={rule.enabled ? 'Alerta ativo' : 'Alerta pausado'}
          onPress={() => setRule(current => ({ ...current, enabled: !current.enabled }))}
        />
        <Button
          title="Salvar limite"
          onPress={async () => {
            await api.securePut(`/api/vehicles/${selectedVehicle.id}/speed-rule`, rule);
            setMessage('Limite sincronizado.');
          }}
        />
      </Card>
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 17 }}>
          Preço de combustível
        </Text>
        <Input label="Tipo" value={fuelType} onChangeText={setFuelType} />
        <Input
          label="Preço por litro"
          value={fuelPrice}
          keyboardType="decimal-pad"
          onChangeText={setFuelPrice}
        />
        <Button
          title="Salvar preço"
          disabled={!Number(fuelPrice.replace(',', '.'))}
          onPress={async () => {
            await api.put('/api/fuel-price', {
              fuelType,
              pricePerLiter: Number(fuelPrice.replace(',', '.'))
            });
            setMessage('Preço sincronizado.');
          }}
        />
      </Card>
      {!!message && <Text style={{ color: theme.colors.success }}>{message}</Text>}
    </Screen>
  );
}
