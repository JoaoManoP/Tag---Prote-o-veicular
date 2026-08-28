import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
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
type Conversation = {
  id: string;
  status: string;
  peer: { displayName: string };
  updatedAt: number;
};
type Request = { id: string; status: string; sender: { displayName: string }; createdAt: number };
export default function Conversations() {
  const { theme } = useApp();
  const [items, setItems] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [contactId, setContactId] = useState('');
  const [message, setMessage] = useState('');
  const load = () =>
    Promise.all([
      api.get<{ conversations: Conversation[] }>('/api/platform/conversations'),
      api.get<{ requests: Request[] }>('/api/platform/conversation-requests')
    ])
      .then(([a, b]) => {
        setItems(a.conversations);
        setRequests(b.requests.filter(item => item.status === 'PENDING'));
      })
      .catch(e => setMessage(e instanceof Error ? e.message : 'Conversas indisponíveis.'));
  useEffect(() => {
    void load();
  }, []);
  const respond = async (id: string, action: 'ACCEPT' | 'REJECT') => {
    await api.securePost(`/api/platform/conversation-requests/${id}/respond`, { action });
    await load();
  };
  return (
    <Screen scroll={false}>
      <Header
        eyebrow="COMUNICAÇÃO SEGURA"
        title="Conversas"
        subtitle="Mensagens privadas somente após consentimento"
      />
      <Card>
        <Input
          label="ID RASTREON do motorista"
          value={contactId}
          onChangeText={setContactId}
          placeholder="RT-…"
          autoCapitalize="characters"
        />
        <Button
          compact
          icon="account-plus-outline"
          title="Solicitar conversa"
          disabled={contactId.trim().length < 10}
          onPress={async () => {
            try {
              await api.securePost('/api/platform/conversation-requests', {
                recipientContactId: contactId.trim(),
                contextType: 'COMMUNITY'
              });
              setContactId('');
              setMessage('Solicitação enviada.');
            } catch (e) {
              setMessage(e instanceof Error ? e.message : 'Não foi possível enviar.');
            }
          }}
        />
        {!!message && <Text style={{ color: theme.colors.muted }}>{message}</Text>}
      </Card>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={{ gap: 10, paddingBottom: 100 }}
        ListHeaderComponent={
          requests.length ? (
            <View style={{ gap: 10, marginBottom: 10 }}>
              {requests.map(item => (
                <Card key={item.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: theme.colors.primary + '22',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Icon name="account-outline" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                        {item.sender.displayName}
                      </Text>
                      <Text style={[styles.caption, { color: theme.colors.muted }]}>
                        Quer iniciar uma conversa
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Button
                        compact
                        secondary
                        title="Recusar"
                        onPress={() => void respond(item.id, 'REJECT')}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        compact
                        title="Aceitar"
                        onPress={() => void respond(item.id, 'ACCEPT')}
                      />
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="message-text-outline"
            title="Nenhuma conversa"
            message="Use um ID RASTREON para solicitar uma conversa segura."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/conversation/[id]',
                params: { id: item.id, name: item.peer.displayName }
              })
            }
          >
            <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: theme.colors.cardElevated,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Icon name="account" color={theme.colors.primaryBright} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                  {item.peer.displayName}
                </Text>
                <Text style={[styles.caption, { color: theme.colors.muted }]}>
                  {new Date(item.updatedAt).toLocaleString('pt-BR')}
                </Text>
              </View>
              <StatusBadge status={item.status} />
              <Icon name="chevron-right" color={theme.colors.muted} />
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
