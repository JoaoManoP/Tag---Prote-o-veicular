# Testes

## Comandos

```bash
npm run lint
npm test
npm run build
npm audit --omit=dev
```

## Cobertura atual

- Auth, sessão, isolamento e CRUD.
- Providers de geocodificação, rotas, placa e eficiência.
- Viagens, reconstrução, offline, horários e cerco.
- Socket.IO, token móvel, consentimento e telemetria inválida.
- Contratos básicos de HUD e responsividade.
- Exportação/exclusão LGPD, CSRF, troca de senha e retenção.
- FIPE, preço de combustível separado, corredor de POIs, configuração de produção e backup SQLite íntegro.
- Reprodução histórica rotulada e encerramento quando chega GPS ao vivo.

Estado em 17/08/2026: a contagem deve ser confirmada pelo último `npm test`; lint, `git diff --check` e auditoria de dependências fazem parte do gate `npm run predeploy`.

## Validação humana pendente

- Android e iPhone reais.
- Permissão GPS, precisão, bateria, background e tela bloqueada.
- QR e código em rede local e HTTPS público.
- Layout nas resoluções previstas.
- Inspeção visual pelo navegador conectado (indisponível na sessão de auditoria).
- Staging/VPS: login, mapa, rota, WebSocket, cerco e logout.
