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

Estado em 25/08/2026: 129 testes aprovados, 0 falhas. Também foram validados de ponta a ponta Photon, OSRM, Overpass, clima, consulta de placa e os endpoints versionados locais. Lint, `git diff --check`, build, mobile e auditoria continuam no gate final.

A auditoria das dependências web/backend retornou 0 vulnerabilidades. O toolchain mobile Expo 54 ainda reporta 22 vulnerabilidades transitivas em Metro (`image-size`, `postcss` e `uuid`); o npm só oferece correção automática por migração quebradora para Expo 57. O pacote mobile não deve ser submetido às lojas antes de migrar e repetir testes em aparelhos reais. Isso não afeta o backend/web publicado.

## Validação humana pendente

- Android e iPhone reais.
- Permissão GPS, precisão, bateria, background e tela bloqueada.
- QR e código em rede local e HTTPS público.
- Layout nas resoluções previstas.
- Inspeção visual pelo navegador conectado (indisponível na sessão de auditoria).
- Staging/VPS: login, mapa, rota, WebSocket, cerco e logout.
