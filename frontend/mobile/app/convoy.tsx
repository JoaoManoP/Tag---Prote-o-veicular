import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import { type ConvoyState, updateConvoyPosition } from '../src/services/convoy';
import { requestLocationPermission, watchLocation } from '../src/services/location';
import { socketService } from '../src/services/socket';
import { useApp } from '../src/state/AppContext';
export default function Convoy() {
  const { theme, setConnection } = useApp();
  const [state, setState] = useState<ConvoyState>();
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [clock, setClock] = useState(Date.now());
  const load = () =>
    api
      .get<ConvoyState>('/api/convoy')
      .then(setState)
      .catch(e =>
        setMessage(e instanceof Error ? e.message : 'Comboio indisponível para esta conta.')
      );
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!state?.convoy) return;
    const timer = setInterval(() => setClock(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [state?.convoy?.id]);
  useEffect(() => {
    if (!state?.convoy) return;
    let active = true;
    let locationSubscription: { remove: () => void } | undefined;
    socketService.connect(() => {}, setConnection);
    const removePositionListener = socketService.onConvoyPosition(position => {
      if (active)
        setState(current => (current ? updateConvoyPosition(current, position) : current));
    });
    const removeSignalListener = socketService.onConvoySignal(signal => {
      if (!active) return;
      const labels: Record<string, string> = {
        STOPPED: 'parou',
        HELP: 'precisa de ajuda',
        LEAVING: 'vai sair do comboio'
      };
      setMessage(`${signal.name} ${labels[signal.signal] || 'enviou um aviso'}.`);
    });
    (async () => {
      const joined = await socketService.joinConvoy(state.convoy!.id);
      if (!joined.ok || !active) return;
      if (!(await requestLocationPermission()) || !active) {
        setMessage('Autorize a localização para aparecer ao vivo no comboio.');
        return;
      }
      locationSubscription = await watchLocation(position => {
        socketService.sendConvoyPosition(position).catch(() => {});
      });
    })().catch(error => {
      if (active)
        setMessage(error instanceof Error ? error.message : 'Canal ao vivo indisponível.');
    });
    return () => {
      active = false;
      locationSubscription?.remove();
      removePositionListener();
      removeSignalListener();
    };
  }, [state?.convoy?.id, setConnection]);
  const act = async (path: string, body?: unknown, method: 'post' | 'patch' = 'post') => {
    try {
      method === 'post' ? await api.securePost(path, body) : await api.securePatch(path, body);
      setMessage('');
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Ação indisponível.');
    }
  };
  return (
    <Screen>
      <Header
        eyebrow="VIAGEM EM GRUPO"
        title="Comboio"
        subtitle="Posições compartilhadas somente durante uma sessão ativa"
        action={state?.convoy ? <StatusBadge status="ATIVO" /> : undefined}
      />
      {!!message && (
        <Card>
          <Text style={{ color: theme.colors.warning }}>{message}</Text>
        </Card>
      )}
      {!state ? (
        <EmptyState
          icon="car-multiple"
          title="Carregando comboio"
          message="Verificando conexões autorizadas…"
        />
      ) : (
        <>
          <Card>
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Seu ID RASTREON</Text>
            <Text selectable style={{ color: theme.colors.primaryBright, fontSize: 12 }}>
              {state.profile.contactId}
            </Text>
            <Text style={[styles.caption, { color: theme.colors.muted }]}>
              Compartilhe apenas com motoristas de confiança.
            </Text>
          </Card>
          {!state.convoy ? (
            <>
              <Card>
                <Input
                  label="Conectar com ID RASTREON"
                  value={contact}
                  onChangeText={setContact}
                  autoCapitalize="characters"
                  placeholder="RT-…"
                />
                <Button
                  icon="account-plus-outline"
                  title="Solicitar conexão"
                  onPress={() => void act('/api/convoy/connections', { contactId: contact })}
                />
              </Card>
              {state.invites.map(invite => (
                <Card key={invite.id}>
                  <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                    {invite.ownerName} convidou você
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        secondary
                        title="Recusar"
                        onPress={() =>
                          void act(
                            `/api/convoy/invites/${invite.id}`,
                            { status: 'REJECTED' },
                            'patch'
                          )
                        }
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Entrar"
                        onPress={() =>
                          void act(
                            `/api/convoy/invites/${invite.id}`,
                            { status: 'ACCEPTED' },
                            'patch'
                          )
                        }
                      />
                    </View>
                  </View>
                </Card>
              ))}
              <Button
                icon="car-multiple"
                title="Criar comboio"
                onPress={() => void act('/api/convoy/sessions', {})}
              />
            </>
          ) : (
            <>
              <Card>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Icon name="car-multiple" size={36} color={theme.colors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                      Comboio ativo
                    </Text>
                    <Text style={{ color: theme.colors.muted }}>
                      {state.convoy.members.length} participante(s)
                    </Text>
                  </View>
                </View>
                {state.convoy.members.map((member, index) => (
                  <View
                    key={member.userId}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 7
                    }}
                  >
                    <Text style={{ color: theme.colors.muted, width: 20 }}>{index + 1}</Text>
                    <Icon
                      name="account-circle"
                      color={
                        member.userId === state.convoy?.ownerId
                          ? theme.colors.accent
                          : theme.colors.primaryBright
                      }
                    />
                    <Text style={{ color: theme.colors.text, flex: 1, fontWeight: '800' }}>
                      {member.name}
                    </Text>
                    <StatusBadge
                      status={
                        member.lastSeenAt && clock - member.lastSeenAt < 30000
                          ? 'ONLINE'
                          : 'AGUARDANDO'
                      }
                    />
                  </View>
                ))}
              </Card>
              <Button
                icon="map-marker-multiple"
                title="Ver veículos no mapa"
                onPress={() => router.push('/(tabs)/map')}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    secondary
                    compact
                    title="Parei"
                    onPress={() => void socketService.sendConvoySignal('STOPPED')}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    danger
                    compact
                    title="Preciso de ajuda"
                    onPress={() => void socketService.sendConvoySignal('HELP')}
                  />
                </View>
              </View>
              {state.profile.userId === state.convoy.ownerId && (
                <Card>
                  <Input
                    label="ID RASTREON para convidar"
                    value={contact}
                    onChangeText={setContact}
                    autoCapitalize="characters"
                    placeholder="RT-…"
                  />
                  <Button
                    icon="account-multiple-plus-outline"
                    title="Convidar para o comboio"
                    onPress={() =>
                      void act(`/api/convoy/sessions/${state.convoy!.id}/invites`, {
                        contactId: contact
                      })
                    }
                  />
                </Card>
              )}
              <Button
                danger
                icon="exit-to-app"
                title={
                  state.profile.userId === state.convoy.ownerId
                    ? 'Encerrar comboio'
                    : 'Sair do comboio'
                }
                onPress={() =>
                  void act(
                    `/api/convoy/sessions/${state.convoy!.id}/${state.profile.userId === state.convoy!.ownerId ? 'end' : 'leave'}`,
                    {}
                  )
                }
              />
            </>
          )}
          {!!state.connections.length && (
            <Card>
              <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Conexões</Text>
              {state.connections.map(item => (
                <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: theme.colors.text, flex: 1 }}>{item.name}</Text>
                  <StatusBadge status={item.status} />
                  {item.status === 'PENDING' && item.requesterId !== state.profile.userId && (
                    <Button
                      compact
                      title="Aceitar"
                      onPress={() =>
                        void act(
                          `/api/convoy/connections/${item.id}`,
                          { status: 'ACCEPTED' },
                          'patch'
                        )
                      }
                    />
                  )}
                  {item.status === 'ACCEPTED' &&
                    state.convoy &&
                    state.profile.userId === state.convoy.ownerId &&
                    !state.convoy.members.some(member => member.userId === item.userId) && (
                      <Button
                        compact
                        title="Convidar"
                        onPress={() =>
                          void act(`/api/convoy/sessions/${state.convoy!.id}/invites`, {
                            contactId: item.contactId
                          })
                        }
                      />
                    )}
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
