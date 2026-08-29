import { router } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Header, Input, Screen } from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';

export default function Privacy() {
  const { theme } = useApp();
  const [exportSummary, setExportSummary] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  return (
    <Screen>
      <Header title="Privacidade e segurança" subtitle="Controle dos dados da mesma conta web" />
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
          Localização sob seu controle
        </Text>
        <Text style={{ color: theme.colors.muted }}>
          O GPS só começa após consentimento explícito. O rastreador do veículo e a localização do
          telefone permanecem identificados separadamente.
        </Text>
      </Card>
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Exportar meus dados</Text>
        <Text style={{ color: theme.colors.muted }}>
          Consulta veículos, viagens, alertas, locais, comunidade e consentimentos armazenados no
          backend.
        </Text>
        <Button
          secondary
          icon="download-outline"
          title="Preparar exportação"
          onPress={async () => {
            const data = await api.get<Record<string, unknown>>('/api/privacy/export');
            const collections = Object.entries(data)
              .filter(([, value]) => Array.isArray(value))
              .map(([key, value]) => `${key}: ${(value as unknown[]).length}`);
            setExportSummary(collections.join(' · ') || 'Dados da conta disponíveis.');
          }}
        />
        {!!exportSummary && (
          <Text selectable style={{ color: theme.colors.success }}>
            {exportSummary}
          </Text>
        )}
      </Card>
      <Card style={{ borderColor: theme.colors.danger + '88' }}>
        <Text style={{ color: theme.colors.danger, fontWeight: '900' }}>
          Excluir conta definitivamente
        </Text>
        <Text style={{ color: theme.colors.muted }}>
          Esta operação remove a mesma conta, veículos, viagens e documento CNH utilizados no site.
        </Text>
        <Input label="Senha atual" value={password} secureTextEntry onChangeText={setPassword} />
        <Input
          label="Digite EXCLUIR MINHA CONTA"
          value={confirmation}
          autoCapitalize="characters"
          onChangeText={setConfirmation}
        />
        <Button
          danger
          icon="delete-forever-outline"
          title="Excluir minha conta"
          disabled={!password || confirmation !== 'EXCLUIR MINHA CONTA'}
          onPress={async () => {
            try {
              await api.secureDelete('/api/privacy/account', { password, confirmation });
              router.replace('/auth');
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Exclusão não concluída.');
            }
          }}
        />
      </Card>
      {!!message && <Text style={{ color: theme.colors.danger }}>{message}</Text>}
    </Screen>
  );
}
