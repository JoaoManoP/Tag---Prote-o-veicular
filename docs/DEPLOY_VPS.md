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
