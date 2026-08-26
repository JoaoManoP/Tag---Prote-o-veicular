# RASTREON Device Gateway (Fase 1)

Este processo captura conexões TCP de rastreadores para inspeção local. Ele ainda não interpreta J16, GT06 ou JT808, não envia ACK e não envia comandos.

## Execução local

```powershell
$env:TRACKER_GATEWAY_HOST='127.0.0.1'
$env:TRACKER_TCP_PORT='5023'
node device-gateway/index.js
```

Em outro terminal, use o simulador:

```powershell
node device-gateway/simulator.js
```

O gateway registra conexão, endereço remoto mascarado, tamanho e HEX do chunk recebido. O buffer é mantido por conexão e possui limite para impedir crescimento infinito.

Para produção, `TRACKER_GATEWAY_HOST=0.0.0.0` só deve ser usado após revisão de firewall, autenticação de dispositivos e configuração do DNS. Não abra essa porta na VPS nesta fase.
