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

## Atualização automática pelo GitHub Actions

O workflow `.github/workflows/deploy-vps.yml` publica automaticamente a branch
`main` somente depois que o workflow `CI` termina com sucesso. Também pode ser
executado manualmente pela aba Actions.

Cadastre um ambiente protegido chamado `production` no GitHub e adicione estes
segredos ao ambiente:

- `VPS_HOST`: host ou IP da VPS.
- `VPS_USER`: usuário SSH sem senha interativa.
- `VPS_SSH_PRIVATE_KEY`: chave privada exclusiva para deploy.
- `VPS_KNOWN_HOSTS`: linha verificada da chave de host da VPS.
- `VPS_APP_PATH`: caminho absoluto do repositório na VPS.

Adicione também as variáveis `VPS_PORT` (opcional, padrão `22`) e
`PUBLIC_HEALTH_URL` (por exemplo,
`https://protec.nexobg.com.br/api/health`). A chave SSH de deploy deve ter apenas
as permissões necessárias para atualizar essa aplicação e recarregar seu
processo PM2.

Cada publicação empacota exatamente o commit aprovado pelo CI, faz backup
validado do SQLite, sincroniza a release preservando `.env`, banco, backups e
metadados Git, instala dependências, aplica migrations, recarrega o PM2 e
confirma os healthchecks interno e público.

## Release preparada para `protec.nexobg.com.br`

1. Copiar `.env.production.example` para `.env` somente na VPS e preencher `SESSION_SECRET`. Restrinja o `MAPBOX_WEB_PUBLIC_TOKEN` aos domínios autorizados no painel da Mapbox.
2. Manter `HOST=127.0.0.1`; somente o Nginx deve acessar a porta 3000.
3. Instalar a release com `npm ci --omit=dev`.
4. Aplicar as migrations com `npm run db:init`.
5. Iniciar ou recarregar com `pm2 startOrReload deploy/ecosystem.config.cjs --update-env`.
6. Instalar e validar `deploy/protec.nexobg.com.br.nginx.conf` com `nginx -t` antes do reload.
7. Confirmar `https://protec.nexobg.com.br/api/health`, `/api/ready` e conexão Socket.IO.

Não executar `demo:seed` em produção, salvo autorização explícita e temporária com `ALLOW_DEMO_ACCOUNTS=true`.

Antes de trocar a release, manter uma cópia do banco, do `.env` e da versão anterior para rollback.
