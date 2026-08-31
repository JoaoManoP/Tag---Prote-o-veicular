import React from 'react';
import { Text } from 'react-native';
import { Card, Header, Screen } from '../src/components/ui';
import { useApp } from '../src/state/AppContext';
const questions = [
  [
    'Como funciona o rastreamento?',
    'Um dispositivo autorizado envia GPS ao backend. O mapa só é acessível pela conta proprietária.'
  ],
  [
    'Como conectar meu celular?',
    'Gere um QR Code em Dispositivos, leia no outro aparelho e confirme o veículo.'
  ],
  [
    'O que acontece sem internet?',
    'Pontos autorizados entram em uma fila local e são enviados em ordem após a reconexão.'
  ],
  [
    'Como criar uma área?',
    'Selecione o veículo, abra Áreas de proteção e escolha o raio na localização autorizada.'
  ]
];
export default function Help() {
  const { theme } = useApp();
  return (
    <Screen>
      <Header title="Central de ajuda" subtitle="Respostas rápidas" />
      {questions.map(([q, a]) => (
        <Card key={q}>
          <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{q}</Text>
          <Text style={{ color: theme.colors.muted }}>{a}</Text>
        </Card>
      ))}
    </Screen>
  );
}
