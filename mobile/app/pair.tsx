import { CameraView, useCameraPermissions } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Header, Input, Screen, styles } from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';
export default function Pair() {
  const { theme } = useApp(),
    [permission, requestPermission] = useCameraPermissions(),
    [code, setCode] = useState(''),
    [token, setToken] = useState(''),
    [pairing, setPairing] = useState<any>(null),
    [message, setMessage] = useState(''),
    [scanned, setScanned] = useState(false);
  const resolve = async (value?: string) => {
    try {
      const raw = value || token;
      const query = raw ? `token=${encodeURIComponent(raw)}` : `code=${encodeURIComponent(code)}`;
      const data = await api.get<any>(`/api/pairings/resolve?${query}`);
      setPairing(data.pairing);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'QR Code inválido.');
    }
  };
  const confirm = async () => {
    try {
      const data = await api.post<any>(`/api/pairings/${pairing.id}/confirm`, {
        name: 'RASTREON App'
      });
      await SecureStore.setItemAsync('rastreon:tracker', JSON.stringify(data));
      setMessage('Celular vinculado. Agora você pode autorizar o GPS.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível vincular.');
    }
  };
  return (
    <Screen>
      <Header title="Escanear QR Code" subtitle="A câmera só é ativada nesta tela" />
      {permission?.granted && !scanned ? (
        <CameraView
          style={{ height: 340, borderRadius: 18 }}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            setScanned(true);
            try {
              const url = new URL(data),
                value = url.hash.match(/token=([^&]+)/)?.[1];
              if (value) {
                setToken(decodeURIComponent(value));
                resolve(decodeURIComponent(value));
              } else setMessage('QR Code não pertence ao RASTREON.');
            } catch {
              setMessage('QR Code inválido.');
            }
          }}
        />
      ) : (
        <Button
          title={permission?.granted ? 'Ler novamente' : 'Permitir câmera'}
          onPress={() => (permission?.granted ? setScanned(false) : requestPermission())}
        />
      )}
      <Input
        label="Ou informe o código"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
      />
      <Button secondary title="Verificar código" onPress={() => resolve()} />
      {pairing && (
        <Card>
          <Text style={[styles.subtitle, { color: theme.colors.text }]}>
            {pairing.vehicle.brand} {pairing.vehicle.model}
          </Text>
          <Text style={{ color: theme.colors.text }}>
            {pairing.vehicle.nickname} · {pairing.vehicle.plate}
          </Text>
          <Button title="Confirmar este veículo" onPress={confirm} />
        </Card>
      )}
      {!!message && <Text style={{ color: theme.colors.text }}>{message}</Text>}
    </Screen>
  );
}
