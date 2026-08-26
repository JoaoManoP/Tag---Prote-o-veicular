import React from 'react';
import { Text } from 'react-native';
import { Card, Header, Screen } from '../src/components/ui';
import { useApp } from '../src/state/AppContext';
export default function Privacy() {
  const { theme } = useApp();
  return (
    <Screen>
      <Header title="Privacidade e segurança" />
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
          Localização sob seu controle
        </Text>
        <Text style={{ color: theme.colors.muted }}>
          O GPS só começa após consentimento explícito. Parar compartilhamento interrompe a coleta e
          revoga o consentimento da sessão.
        </Text>
      </Card>
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Dados protegidos</Text>
        <Text style={{ color: theme.colors.muted }}>
          Senhas, tokens dos providers e respostas privadas não são enviados ao aplicativo. A
          autorização e ownership são verificados no servidor.
        </Text>
      </Card>
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Armazenamento local</Text>
        <Text style={{ color: theme.colors.muted }}>
          Credenciais de rastreador ficam no SecureStore. O AsyncStorage contém somente preferências
          e fila GPS offline.
        </Text>
      </Card>
    </Screen>
  );
}
