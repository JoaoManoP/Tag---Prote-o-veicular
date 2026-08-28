import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Header, Input, Screen, StatusBadge } from '../src/components/ui';
import { api } from '../src/services/api';
import { useApp } from '../src/state/AppContext';

type TwoFactorStatus = { enabled: boolean; required: boolean };
type Setup = { secret: string; uri: string; recoveryCodes: string[] };

export default function Security() {
  const { theme } = useApp();
  const [status, setStatus] = useState<TwoFactorStatus>({ enabled: false, required: false });
  const [setup, setSetup] = useState<Setup>();
  const [code, setCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const load = () => api.get<{ twoFactor: TwoFactorStatus }>('/api/security/2fa/status').then(data => setStatus(data.twoFactor));
  useEffect(() => { void load(); }, []);
  return (
    <Screen>
      <Header title="Segurança da conta" subtitle="As mesmas proteções usadas no site" action={<StatusBadge status={status.enabled ? '2FA ATIVO' : '2FA DESATIVADO'} />} />
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 17 }}>Autenticação em dois fatores</Text>
        {status.required && <Text style={{ color: theme.colors.warning }}>Obrigatória para este perfil.</Text>}
        {!status.enabled && !setup && <Button icon="shield-key-outline" title="Configurar 2FA" onPress={async () => { const data = await api.securePost<{ setup: Setup }>('/api/security/2fa/setup'); setSetup(data.setup); }} />}
        {setup && <>
          <Text style={{ color: theme.colors.muted }}>Cadastre no seu autenticador usando esta chave:</Text>
          <Text selectable style={{ color: theme.colors.accent, fontWeight: '900', letterSpacing: 1 }}>{setup.secret}</Text>
          <Text style={{ color: theme.colors.muted }}>Códigos de recuperação — guarde em local seguro:</Text>
          <Text selectable style={{ color: theme.colors.text }}>{setup.recoveryCodes.join('\n')}</Text>
        </>}
        {(setup || status.enabled) && <Input label="Código do autenticador ou recuperação" value={code} keyboardType="number-pad" onChangeText={setCode} />}
        {setup && <Button title="Confirmar e ativar" disabled={code.length < 6} onPress={async () => { await api.securePost('/api/security/2fa/enable', { code }); setSetup(undefined); setCode(''); setMessage('2FA ativado.'); await load(); }} />}
        {status.enabled && <Button danger title="Desativar 2FA" disabled={code.length < 6} onPress={async () => { await api.securePost('/api/security/2fa/disable', { code }); setCode(''); setMessage('2FA desativado.'); await load(); }} />}
      </Card>
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 17 }}>Alterar senha</Text>
        <Input label="Senha atual" value={currentPassword} secureTextEntry onChangeText={setCurrentPassword} />
        <Input label="Nova senha" value={newPassword} secureTextEntry onChangeText={setNewPassword} />
        <Button title="Atualizar senha" disabled={!currentPassword || newPassword.length < 8} onPress={async () => { await api.securePut('/api/auth/password', { currentPassword, newPassword }); setCurrentPassword(''); setNewPassword(''); setMessage('Senha atualizada e outras sessões encerradas.'); }} />
      </Card>
      {!!message && <Text style={{ color: theme.colors.success }}>{message}</Text>}
    </Screen>
  );
}
