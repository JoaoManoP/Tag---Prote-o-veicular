# Deploy VPS

O modelo Nginx versionado está em `deploy/protec.nexobg.com.br.nginx.conf`.

## Fluxo obrigatório

1. Executar `npm run db:backup` e copiar também o `.env` por um canal seguro. O comando usa `VACUUM INTO` e valida a cópia SQLite.
2. `npm ci --omit=dev` em release versionada.
3. Executar `npm run predeploy` antes da publicação.
4. Conferir migrations sem apagar dados.
5. Reiniciar por PM2/systemd/painel, nunca por processo manual permanente.
6. Validar `/api/health` e `/api/ready`.
7. Executar smoke test autenticado e WebSocket.
8. Conferir logs e manter release anterior para rollback.

O deploy permanece bloqueado até existir acesso autorizado ao ambiente real.

## Release preparada para `protec.nexobg.com.br`

1. Copiar `.env.production.example` para `.env` somente na VPS e preencher `SESSION_SECRET` e `MAPBOX_ACCESS_TOKEN`.
2. Manter `HOST=127.0.0.1`; somente o Nginx deve acessar a porta 3000.
3. Instalar a release com `npm ci --omit=dev`.
4. Aplicar as migrations com `npm run db:init`.
5. Iniciar ou recarregar com `pm2 startOrReload deploy/ecosystem.config.cjs --update-env`.
6. Instalar e validar `deploy/protec.nexobg.com.br.nginx.conf` com `nginx -t` antes do reload.
7. Confirmar `https://protec.nexobg.com.br/api/health`, `/api/ready` e conexão Socket.IO.

Não executar `demo:seed` em produção, salvo autorização explícita e temporária com `ALLOW_DEMO_ACCOUNTS=true`.

Antes de trocar a release, manter uma cópia do banco, do `.env` e da versão anterior para rollback.
