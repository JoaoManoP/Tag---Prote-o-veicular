import React from 'react';
import { Text } from 'react-native';
import { Card, EmptyState, Header, Icon, Screen } from '../src/components/ui';
import { useApp } from '../src/state/AppContext';
export default function Fines() {
  const { theme } = useApp();
  return (
    <Screen>
      <Header
        eyebrow="DOCUMENTAÇÃO VEICULAR"
        title="Multas e infrações"
        subtitle="Consulta por integração oficial"
      />
      <EmptyState
        icon="file-document-alert-outline"
        title="Integração oficial necessária"
        message="O RASTREON não simula multas. A consulta ficará disponível quando o contrato e as credenciais Senatran/SERPRO estiverem configurados no backend."
      />
      <Card>
        <Icon name="shield-check-outline" color={theme.colors.success} />
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Dados confiáveis</Text>
        <Text style={{ color: theme.colors.muted }}>
          Nenhum dado fictício é exibido como se viesse de uma fonte governamental. O app e o site
          usarão o mesmo provedor quando habilitado.
        </Text>
      </Card>
    </Screen>
  );
}
