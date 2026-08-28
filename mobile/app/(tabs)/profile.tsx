import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Button,
  Card,
  Header,
  Icon,
  Screen,
  StatusBadge,
  styles,
  type IconName
} from '../../src/components/ui';
import { useApp } from '../../src/state/AppContext';
export default function Profile() {
  const { user, vehicles, alerts, logout, theme } = useApp();
  const row = (
    icon: IconName,
    title: string,
    subtitle: string,
    path: string,
    tone: string = theme.colors.primaryBright
  ) => (
    <Pressable
      onPress={() => router.push(path as never)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 58,
        opacity: pressed ? 0.65 : 1
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 13,
          backgroundColor: tone + '16',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Icon name={icon} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{title}</Text>
        <Text style={[styles.caption, { color: theme.colors.muted }]}>{subtitle}</Text>
      </View>
      <Icon name="chevron-right" color={theme.colors.muted} />
    </Pressable>
  );
  return (
    <Screen>
      <Header
        eyebrow="CONTA RASTREON"
        title="Perfil"
        subtitle="Conta, veículo, documentos e segurança"
      />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 66,
              height: 66,
              borderRadius: 33,
              backgroundColor: theme.colors.primary,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>
              {user?.name
                ?.split(' ')
                .map(value => value[0])
                .slice(0, 2)
                .join('') || 'R'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                {user?.name}
              </Text>
              <Icon name="check-decagram" size={18} color={theme.colors.primaryBright} />
            </View>
            <Text style={{ color: theme.colors.muted }}>{user?.email}</Text>
            <StatusBadge status="CONTA VERIFICADA" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 19, fontWeight: '900' }}>
              {vehicles.length}
            </Text>
            <Text style={[styles.caption, { color: theme.colors.muted }]}>veículo(s)</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.text, fontSize: 19, fontWeight: '900' }}>
              {alerts.filter(a => !a.readAt).length}
            </Text>
            <Text style={[styles.caption, { color: theme.colors.muted }]}>alerta(s)</Text>
          </View>
        </View>
      </Card>
      <Card>
        {row('server-network', 'Central do sistema', 'APIs, provedores e módulos sincronizados', '/system')}
        {row('account-edit-outline', 'Minha conta', 'Dados pessoais e avatar', '/settings')}
        {row('car-multiple', 'Meus veículos', 'Garagem e detalhes técnicos', '/vehicles')}
        {row(
          'card-account-details-outline',
          'Minha CNH',
          'Documento e situação da análise',
          '/cnh',
          theme.colors.success
        )}
        {row(
          'file-document-alert-outline',
          'Multas e infrações',
          'Consulta por integração oficial',
          '/fines',
          theme.colors.warning
        )}
        {row('access-point', 'Dispositivos', 'Rastreadores e QR Code', '/devices')}
        {row(
          'shield-home-outline',
          'Áreas de proteção',
          'Cercas e horários autorizados',
          '/geofences',
          theme.colors.success
        )}
      </Card>
      <Card>
        {row('bell-outline', 'Notificações', 'Alertas e preferências', '/notifications')}
        {row('cog-outline', 'Configurações', 'Aparência e comportamento', '/settings')}
        {row(
          'shield-lock-outline',
          'Privacidade e segurança',
          'Sessão, exportação e conta',
          '/privacy'
        )}
        {row('shield-key-outline', 'Segurança da conta', 'Senha e autenticação em dois fatores', '/security')}
        {row('lifebuoy', 'Central de ajuda', 'Suporte e orientações', '/help')}
      </Card>
      <Button danger icon="logout" title="Sair da conta" onPress={logout} />
    </Screen>
  );
}
