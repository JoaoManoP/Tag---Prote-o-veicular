import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Button, Card, Header, Input, Screen, styles } from '../../src/components/ui';
import { api } from '../../src/services/api';
import { useApp } from '../../src/state/AppContext';
import type { Vehicle, VehicleImage } from '../../src/types';
type Lookup = {
  plate: string;
  make: string;
  model: string;
  version?: string;
  modelYear?: number;
  manufactureYear?: number;
  color?: string;
  fuel?: string;
  type?: string;
  image?: VehicleImage;
};
export default function AddVehicle() {
  const { refresh, theme } = useApp(),
    [plate, setPlate] = useState(''),
    [found, setFound] = useState<Lookup | null>(null),
    [manual, setManual] = useState(false),
    [nickname, setNickname] = useState('Meu veículo'),
    [brand, setBrand] = useState(''),
    [model, setModel] = useState(''),
    [year, setYear] = useState(''),
    [city, setCity] = useState('10'),
    [road, setRoad] = useState('12'),
    [tank, setTank] = useState('50'),
    [message, setMessage] = useState(''),
    [loading, setLoading] = useState(false);
  const lookup = async () => {
    setLoading(true);
    setMessage('');
    try {
      const data = await api.get<{ vehicle: Lookup }>(
        `/api/vehicles/lookup/${plate.toUpperCase().replace(/[^A-Z0-9]/g, '')}`
      );
      setFound(data.vehicle);
      setBrand(data.vehicle.make);
      setModel(data.vehicle.model);
      setYear(String(data.vehicle.modelYear || ''));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Consulta indisponível.');
      setManual(true);
    } finally {
      setLoading(false);
    }
  };
  const save = async () => {
    setLoading(true);
    try {
      await api.post<{ vehicle: Vehicle }>('/api/vehicles', {
        nickname,
        type: /moto/i.test(found?.type || '') ? 'motorcycle' : 'car',
        plate: plate.toUpperCase(),
        brand,
        model,
        year: Number(year) || null,
        manufactureYear: found?.manufactureYear,
        version: found?.version,
        color: found?.color,
        image: found?.image,
        fuel: found?.fuel,
        city: Number(city),
        road: Number(road),
        tank: Number(tank),
        dataSource: found ? 'falcon' : 'manual'
      });
      await refresh();
      router.back();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Screen>
      <Header
        title="Adicionar veículo"
        subtitle="Identificação pela placa, sem dados do proprietário"
      />
      <Input
        label="Placa"
        value={plate}
        maxLength={7}
        autoCapitalize="characters"
        onChangeText={v => setPlate(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
      />
      <Button
        title={loading ? 'Buscando…' : 'Buscar veículo'}
        disabled={loading || plate.length !== 7}
        onPress={lookup}
      />
      {!!message && <Text style={{ color: theme.colors.danger }}>{message}</Text>}
      {found && (
        <Card>
          {found.image?.url && (
            <Image
              source={{ uri: found.image.url }}
              style={{ height: 160, width: '100%' }}
              resizeMode="contain"
            />
          )}
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {found.make} {found.model}
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            {[found.version, found.modelYear, found.color].filter(Boolean).join(' · ')}
          </Text>
          <Text style={[styles.caption, { color: theme.colors.muted }]}>
            Imagem ilustrativa do modelo · {found.image?.source || 'placeholder'}
          </Text>
        </Card>
      )}
      {(found || manual) && (
        <>
          <Input label="Apelido" value={nickname} onChangeText={setNickname} />
          <Input label="Marca" value={brand} onChangeText={setBrand} editable={manual} />
          <Input label="Modelo" value={model} onChangeText={setModel} editable={manual} />
          <Input
            label="Ano modelo"
            value={year}
            onChangeText={setYear}
            keyboardType="number-pad"
            editable={manual}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Consumo cidade"
                value={city}
                onChangeText={setCity}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Consumo estrada"
                value={road}
                onChangeText={setRoad}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <Input
            label="Tanque aproximado (L)"
            value={tank}
            onChangeText={setTank}
            keyboardType="decimal-pad"
          />
          <Button
            title={loading ? 'Salvando…' : 'Salvar veículo'}
            disabled={loading || !brand || !model}
            onPress={save}
          />
        </>
      )}
    </Screen>
  );
}
