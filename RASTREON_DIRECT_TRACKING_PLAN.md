# RASTREON — Plano de rastreamento direto

## Escopo

Adicionar ingestão direta de rastreadores físicos ao RASTREON, sem dependência funcional do Traccar. O primeiro equipamento-alvo é o J16 4G, mas o gateway deve permitir adapters futuros (GT06, JT808, Teltonika, Concox, Suntech, Queclink e outros).

Regra de segurança: não implementar decoder, ACK ou comandos do J16 por suposição. A primeira integração deve parar na captura de frames reais e na inspeção HEX até que o firmware/protocolo do equipamento seja confirmado.

## Auditoria da arquitetura atual

- Runtime: Node.js 24, JavaScript CommonJS.
- API: Express em `server/server.js`.
- Tempo real: Socket.IO no mesmo processo HTTP.
- Persistência: SQLite local em `data/rastreon.sqlite`, com migrations próprias.
- Telemetria atual: GPS do navegador/dispositivo móvel e simulações; validação em `server/telemetry.js`.
- Dispositivos atuais: tabelas e fluxos de pareamento de dispositivos móveis, não um registro de IMEI de rastreador físico.
- Integração existente: `server/providers/tracker-device-provider.js` e rotas de plataforma para Traccar, desligadas por padrão.
- Frontend: recebe telemetria normalizada via Socket.IO; não deve conhecer GT06, JT808 ou o protocolo físico.
- Infraestrutura ausente: listener TCP direto, buffer por conexão, registry de protocolos, inspector protegido, Redis, PostgreSQL/PostGIS e serviço separado de gateway.
- Porta web atual: `3000`; não há porta TCP de tracker configurada ou validada.
- VPS/DNS/firewall: não auditados nesta fase; o acesso SSH foi desconectado e não será reativado automaticamente.

## Arquitetura proposta

```text
Rastreador → TCP → rastreon-device-gateway → adapter → NormalizedTelemetry
  → TrackingService → SQLite inicialmente / PostgreSQL+PostGIS posteriormente
  → Socket.IO autorizado → mapa RASTREON
```

O gateway será um processo separado da API web. O contrato entre gateway e aplicação será `NormalizedTelemetry`, independente do protocolo de origem.

## Fases

### Fase 1 — captura segura (atual)

1. Criar `device-gateway/` em JavaScript, usando `node:net`.
2. Implementar `ConnectionBuffer` com limite de bytes e preservação de frames incompletos.
3. Implementar `DeviceConnectionManager` com conexão, desconexão, último pacote, IP remoto e heartbeat.
4. Implementar `TrackerProtocolInspector` protegido para admin/developer, exibindo tamanho e HEX mascarado quando necessário.
5. Implementar simulador de conexão para testes locais.
6. Não decodificar, responder ACK ou enviar comandos antes de receber frames reais do J16.

### Fase 2 — identificação

1. Cadastrar `tracker_devices` com IMEI mascarado na interface e IMEI protegido no backend.
2. Associar dispositivo a `vehicle_id` somente por ação administrativa.
3. Registrar `UNKNOWN_DEVICE` para IMEI desconhecido; nunca criar veículo automaticamente.
4. Identificar protocolo por frames, checksum, login, firmware e documentação do modelo recebido.

### Fase 3 — adapter confirmado

1. Criar `ProtocolRegistry`, `ProtocolDetector` e adapter específico.
2. Implementar extrator de frames, decoder, validação de checksum e ACK somente conforme evidência real.
3. Normalizar localização, velocidade, heading, ignição e demais campos realmente enviados.

### Fase 4 — integração RASTREON

1. Criar `TrackingService` e `TelemetryBus`.
2. Persistir posições com origem `DIRECT_TCP` e idempotência.
3. Emitir eventos Socket.IO somente para usuários autorizados ao veículo.
4. Atualizar status online/offline e alertas sem inventar bateria, combustível ou diagnóstico.

### Fase 5 — produção

1. Definir DNS `tcp.rastreon.com.br` para a VPS.
2. Expor TCP em `0.0.0.0:5023` somente após testes locais e revisão de segurança.
3. Liberar firewall do sistema e do provedor após confirmar portas existentes.
4. Configurar serviço gerenciado, healthcheck, logs, limites e rollback.

## Variáveis previstas

```env
TRACKER_GATEWAY_HOST=0.0.0.0
TRACKER_TCP_PORT=5023
TRACKER_MAX_CONNECTION_BUFFER_BYTES=65536
TRACKER_IDLE_TIMEOUT_MS=180000
TRACKER_INSPECTOR_ENABLED=false
TRACKER_REQUIRE_DEVICE_AUTH=true
```

Nenhuma credencial, IMEI ou segredo deve ser commitado. Segredos de autenticação de dispositivo devem ser armazenados como hash ou em secret manager.

## Banco

As migrations futuras devem incluir, no mínimo:

- `tracker_devices`;
- associação segura com `vehicles`;
- `tracker_connections`/estado operacional;
- `tracker_packets` com retenção limitada para inspeção;
- `vehicle_positions` ou extensão equivalente para `DIRECT_TCP`;
- `tracker_command_logs` somente quando comandos forem comprovadamente suportados.

SQLite continua sendo a opção inicial de desenvolvimento. PostgreSQL/PostGIS fica para a etapa de escala, após contrato de dados e carga serem validados.

## Testes e critérios de aceite

- fragmentação e coalescência de frames TCP;
- limite de buffer e encerramento seguro;
- conexão, reconexão e timeout;
- captura HEX sem logar IMEI completo;
- simulador sem decoder inventado;
- isolamento por dispositivo/veículo;
- autorização do inspector;
- nenhum pacote inválido atualiza posição;
- primeiro teste físico: conexão, bytes, HEX e persistência da sessão.

## Bloqueios atuais

- Não há pacotes reais do J16 para identificar a variante de firmware/protocolo.
- Não há IMEI para cadastro/associação.
- Não há domínio DNS `tcp.rastreon.com.br` validado.
- VPS, firewall e porta TCP ainda não foram auditados.
- Não há autorização para abrir portas ou publicar serviços na VPS.

## Próxima etapa recomendada

Implementar e testar localmente o gateway TCP/inspector em uma porta não pública, por exemplo `5023`, usando o simulador. Depois, conectar o J16 em bancada com fonte DC regulada e SIM ativo, configurar o host/porta conforme o manual da variante e coletar os primeiros frames HEX.

**AGUARDANDO PACOTES REAIS DO RASTREADOR PARA IMPLEMENTAÇÃO SEGURA DO DECODER.**
