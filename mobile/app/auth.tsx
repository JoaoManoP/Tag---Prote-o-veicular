import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Button, Input, Screen, styles } from '../src/components/ui';
import { useApp } from '../src/state/AppContext';
export default function Auth() {
  const { login, register, theme } = useApp(),
    [mode, setMode] = useState<'login' | 'register'>('login'),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [phone, setPhone] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') await login(email, password);
      else await register({ name, email, phone, password, plan: 'inteligente' });
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 8, marginVertical: 32 }}>
        <Image
          source={require('../assets/rastreon-logo.png')}
          style={{ width: 180, height: 70 }}
          resizeMode="contain"
        />
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Proteção que acompanha você
        </Text>
        <Text style={[styles.caption, { color: theme.colors.muted, textAlign: 'center' }]}>
          Rastreamento, viagens e controle de localização com consentimento.
        </Text>
      </View>
      {mode === 'register' && (
        <>
          <Input label="Nome" value={name} onChangeText={setName} />
          <Input label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        </>
      )}
      <Input
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Input label="Senha" value={password} onChangeText={setPassword} secureTextEntry />
      {!!error && <Text style={{ color: theme.colors.danger }}>{error}</Text>}
      <Button
        title={loading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        disabled={loading}
        onPress={submit}
      />
      <Button
        secondary
        title={mode === 'login' ? 'Criar minha conta' : 'Já tenho uma conta'}
        onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
      />
      <Text style={[styles.caption, { color: theme.colors.muted, textAlign: 'center' }]}>
        Esqueci minha senha: recuperação por e-mail ficará disponível quando o provider for
        configurado.
      </Text>
    </Screen>
  );
}
