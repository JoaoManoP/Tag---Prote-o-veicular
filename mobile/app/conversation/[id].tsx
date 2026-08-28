import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from 'react-native';
import { Header, Icon, Screen, styles } from '../../src/components/ui';
import { api } from '../../src/services/api';
import { useApp } from '../../src/state/AppContext';
type Message = { id: string; body: string; mine: boolean; createdAt: number };
export default function Conversation() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { theme } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const load = () =>
    api
      .get<{ messages: Message[] }>(`/api/platform/conversations/${id}/messages`)
      .then(data => setMessages(data.messages));
  useEffect(() => {
    void load();
  }, [id]);
  const send = async () => {
    const value = body.trim();
    if (!value) return;
    setBody('');
    await api.securePost(`/api/platform/conversations/${id}/messages`, { body: value });
    await load();
  };
  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, gap: 12 }}
      >
        <Header
          eyebrow="CONVERSA PRIVADA"
          title={name || 'Motorista'}
          subtitle="Comunicação protegida pelo RASTREON"
        />
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
          renderItem={({ item }) => (
            <View
              style={{
                maxWidth: '82%',
                alignSelf: item.mine ? 'flex-end' : 'flex-start',
                padding: 12,
                borderRadius: 16,
                borderBottomRightRadius: item.mine ? 4 : 16,
                borderBottomLeftRadius: item.mine ? 16 : 4,
                backgroundColor: item.mine ? theme.colors.primary : theme.colors.card
              }}
            >
              <Text style={{ color: '#fff', lineHeight: 20 }}>{item.body}</Text>
              <Text
                style={[
                  styles.caption,
                  { color: item.mine ? '#DDE8F2' : theme.colors.muted, textAlign: 'right' }
                ]}
              >
                {new Date(item.createdAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </View>
          )}
        />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Digite uma mensagem…"
            placeholderTextColor={theme.colors.muted}
            style={{
              flex: 1,
              minHeight: 50,
              maxHeight: 110,
              borderRadius: 16,
              paddingHorizontal: 16,
              color: theme.colors.text,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border
            }}
            multiline
          />
          <Pressable
            onPress={() => void send()}
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: theme.colors.primary,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Icon name="send" color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
