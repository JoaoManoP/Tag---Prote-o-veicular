# Rastreon — QR Pairing e celular como rastreador

## Resultado automatizado

- Node: PASS
- Banco e migração: PASS
- Autenticação e autorização: PASS
- Pairing persistido: PASS
- Token criptográfico, hash, expiração e uso único: PASS
- QR quadrado com área silenciosa: PASS
- Scanner: PASS estático (BarcodeDetector + fallback ZXing)
- Código manual: PASS
- Credencial própria do dispositivo: PASS
- Revogação: PASS
- WebSocket autorizado: PASS
- GPS em primeiro plano: PASS automatizado
- Fila offline e reconexão: PASS automatizado
- Segurança entre proprietários: PASS
- Gestão de dispositivos no dashboard: PASS
- Estados Online / Sem atualização / Offline: PASS
- Gate `npm run predeploy`: PASS — 86 testes

## Validação física pendente

- HTTPS público em `protec.nexobg.com.br`: não comprovado neste ambiente.
- Android Chrome: NÃO TESTADO em aparelho físico.
- iPhone Safari: NÃO TESTADO em aparelho físico.
- Permissão real da câmera: NÃO TESTADO em aparelho físico.
- GPS real → backend → WebSocket → marcador: NÃO TESTADO em aparelho físico.
- Background: NÃO SUPORTADO; o rastreador web é temporário e funciona em primeiro plano.

## Conclusão

Pronto para publicar na VPS: SIM, após backup e configuração das variáveis de produção.

Pronto para teste físico de rua: NÃO até o smoke test HTTPS com celular confirmar câmera, GPS e movimento do marcador. Primeiro validar parado; depois caminhar de 50 a 200 metros. Não operar computador ou celular enquanto dirige.
