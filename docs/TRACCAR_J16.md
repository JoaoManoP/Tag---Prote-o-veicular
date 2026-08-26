# Traccar e rastreador J16

## Fluxo suportado

```text
J16/GT06 -> Traccar homologado -> webhook HTTPS autenticado -> RASTREON -> SQLite + Socket.IO
```

O RASTREON não recebe comandos GT06 diretamente. O Traccar traduz o protocolo do aparelho e envia posição normalizada. O identificador externo/IMEI nunca é devolvido ao frontend: é associado por HMAC com `TRACCAR_DEVICE_HASH_SECRET`.

## Configuração

1. Instale e proteja uma instância Traccar compatível com o protocolo exato do J16.
2. Defina segredos aleatórios e distintos, com pelo menos 24 caracteres: `TRACCAR_WEBHOOK_SECRET` e `TRACCAR_DEVICE_HASH_SECRET`.
3. Mantenha `TRACCAR_ENABLED=false` até concluir teste de campo.
4. Como `DEVELOPER` com 2FA, crie o vínculo no Laboratório usando o identificador externo uma única vez.
5. Configure o Traccar para enviar JSON a `POST /api/v1/platform/integrations/traccar/positions` com `Authorization: Bearer <segredo>`.
6. Ative `TRACCAR_ENABLED=true`, reinicie e valide posição, velocidade, ignição, bateria, rede, duplicidade e perda de conexão.

## Segurança e limites

- Webhook com comparação constante, limite de 100 KB e payload validado.
- Evento idempotente; velocidade em nós é convertida para m/s.
- A posição só entra em sessão ativa pertencente ao veículo vinculado.
- Bloqueio físico remoto não está implementado e uma configuração que tente ativá-lo é rejeitada em produção.
- A homologação final depende do firmware, APN, chip, protocolo e aparelho físico; testes unitários não substituem teste de campo.
