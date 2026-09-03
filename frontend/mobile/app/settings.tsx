import React from 'react';
import { Text } from 'react-native';
import { Button, Card, Header, Screen } from '../src/components/ui';
import { useApp, type GraphicsPreference } from '../src/state/AppContext';
import type { ThemePreference } from '../src/theme/tokens';
export default function Settings() {
  const { themePreference, setThemePreference, graphicsPreference, setGraphicsPreference, theme } =
    useApp();
  const option = (value: ThemePreference, label: string) => (
    <Button
      secondary={themePreference !== value}
      title={`${themePreference === value ? '✓ ' : ''}${label}`}
      onPress={() => setThemePreference(value)}
    />
  );
  const graphics = (value: GraphicsPreference, label: string) => (
    <Button
      secondary={graphicsPreference !== value}
      title={`${graphicsPreference === value ? '✓ ' : ''}${label}`}
      onPress={() => setGraphicsPreference(value)}
    />
  );
  return (
    <Screen>
      <Header title="Configurações" subtitle="Preferências deste aparelho" />
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Tema</Text>
        {option('light', 'Claro')}
        {option('dark', 'Escuro')}
        {option('system', 'Sistema')}
      </Card>
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Desempenho do mapa</Text>
        <Text style={{ color: theme.colors.muted }}>
          No modo leve o mapa abre em 2D, sem rótulos nos pinos e com menos locais, o que deixa a
          navegação mais fluida em aparelhos mais simples.
        </Text>
        {graphics('auto', 'Automático')}
        {graphics('high', 'Alta qualidade (3D e rótulos)')}
        {graphics('lite', 'Leve (2D, menos marcadores)')}
      </Card>
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Unidades</Text>
        <Text style={{ color: theme.colors.muted }}>Métrico · km, km/h e litros</Text>
      </Card>
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Notificações</Text>
        <Text style={{ color: theme.colors.muted }}>
          Push será registrado quando as credenciais Expo do projeto forem configuradas.
        </Text>
      </Card>
    </Screen>
  );
}
