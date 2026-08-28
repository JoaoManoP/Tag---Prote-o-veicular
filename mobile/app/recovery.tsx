import { router } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Header, Input, Screen } from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';

export default function Recovery() {
  const { theme } = useApp();
  const [email, setEmail] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  return <Screen>
    <Header title="Recuperar senha" subtitle="Mesmo fluxo seguro disponível no site" />
    <Card>
      <Input label="E-mail da conta" value={email} autoCapitalize="none" keyboardType="email-address" onChangeText={setEmail} />
      <Button title="Solicitar código" disabled={!email.includes('@')} onPress={async () => {
        const data = await api.post<{ message: string; challengeId?: string; developmentCode?: string }>('/api/account-security/password-reset/request', { email });
        setMessage(`${data.message}${data.developmentCode ? ` Código de desenvolvimento: ${data.developmentCode}` : ''}`);
        if (data.challengeId) setChallengeId(data.challengeId);
      }} />
    </Card>
    {!!challengeId && <Card>
      <Input label="Código recebido" value={code} keyboardType="number-pad" onChangeText={setCode} />
      <Input label="Nova senha" value={newPassword} secureTextEntry onChangeText={setNewPassword} />
      <Button title="Definir nova senha" disabled={code.length < 6 || newPassword.length < 8} onPress={async () => {
        await api.post('/api/account-security/password-reset/confirm', { challengeId, code, newPassword });
        router.replace('/auth');
      }} />
    </Card>}
    {!!message && <Text style={{ color: theme.colors.muted }}>{message}</Text>}
  </Screen>;
}
