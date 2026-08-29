import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  Input,
  Screen,
  StatusBadge,
  styles
} from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';

type DriverDocument = {
  id: string;
  status: string;
  expiryDate: string;
  verifiedAt?: number;
  updatedAt: number;
  rejectionReason?: string;
};

export default function Cnh() {
  const { theme } = useApp();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [document, setDocument] = useState<DriverDocument | null>();
  const [expiry, setExpiry] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const load = () =>
    api
      .get<{ document: DriverDocument | null }>('/api/documents/cnh')
      .then(data => setDocument(data.document))
      .catch(error => setMessage(error instanceof Error ? error.message : 'CNH indisponível.'));
  useEffect(() => {
    void load();
  }, []);

  const openCamera = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry))
      return setMessage('Informe primeiro a validade no formato AAAA-MM-DD.');
    const result = permission?.granted ? permission : await requestPermission();
    if (!result.granted) return setMessage('Autorize a câmera para fotografar sua CNH.');
    setCameraOpen(true);
  };
  const capture = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.82 });
    if (!photo?.uri) return;
    setLoading(true);
    try {
      const data = await api.secureUpload<{ document: DriverDocument }>(
        '/api/documents/cnh',
        photo.uri,
        'application/octet-stream',
        { 'X-Document-Type': 'image/jpeg', 'X-CNH-Expiry': expiry }
      );
      setDocument(data.document);
      setMessage('Documento enviado para análise com segurança.');
      setCameraOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar a CNH.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Header
        eyebrow="DOCUMENTO DO MOTORISTA"
        title="Minha CNH"
        subtitle="Arquivo privado, criptografado em trânsito e sujeito à análise"
      />
      {cameraOpen && (
        <Card>
          <View style={{ height: 340, borderRadius: 14, overflow: 'hidden' }}>
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
          </View>
          <Text style={{ color: theme.colors.muted, textAlign: 'center' }}>
            Posicione a CNH inteira dentro da imagem, sem reflexos.
          </Text>
          <Button
            icon="camera"
            title={loading ? 'Enviando…' : 'Fotografar e enviar'}
            disabled={loading}
            onPress={() => void capture()}
          />
          <Button secondary title="Cancelar" onPress={() => setCameraOpen(false)} />
        </Card>
      )}
      {document ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 16,
                backgroundColor:
                  (document.status === 'APPROVED' ? theme.colors.success : theme.colors.warning) +
                  '18',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Icon
                name="card-account-details-outline"
                size={30}
                color={document.status === 'APPROVED' ? theme.colors.success : theme.colors.warning}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                Carteira de habilitação
              </Text>
              <Text style={[styles.caption, { color: theme.colors.muted }]}>
                Validade: {new Date(`${document.expiryDate}T12:00:00`).toLocaleDateString('pt-BR')}
              </Text>
            </View>
            <StatusBadge
              status={
                document.status === 'APPROVED'
                  ? 'VERIFICADA'
                  : document.status === 'PENDING'
                    ? 'PENDENTE'
                    : document.status
              }
            />
          </View>
          {!!document.rejectionReason && (
            <Text style={{ color: theme.colors.danger }}>{document.rejectionReason}</Text>
          )}
        </Card>
      ) : document === null ? (
        <EmptyState
          icon="card-account-details-outline"
          title="Nenhuma CNH enviada"
          message="Fotografe sua CNH para enviar uma imagem de até 5 MB para análise."
        />
      ) : null}
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
          Enviar ou atualizar documento
        </Text>
        <Input
          label="Validade da CNH (AAAA-MM-DD)"
          value={expiry}
          onChangeText={setExpiry}
          placeholder="2030-12-31"
          keyboardType="numbers-and-punctuation"
        />
        <Button
          icon="camera-outline"
          title="Fotografar CNH"
          disabled={loading}
          onPress={() => void openCamera()}
        />
        {!!message && <Text style={{ color: theme.colors.muted }}>{message}</Text>}
      </Card>
    </Screen>
  );
}
