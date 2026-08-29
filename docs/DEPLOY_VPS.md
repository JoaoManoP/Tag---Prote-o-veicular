# Deploy VPS

O modelo Nginx versionado está em `deploy/protec.nexobg.com.br.nginx.conf`.

## Fluxo obrigatório

1. Executar o preflight de colaboração descrito abaixo e identificar o commit da última publicação bem-sucedida.
2. Executar `npm run db:backup` e copiar também o `.env` por um canal seguro. O comando usa `VACUUM INTO` e valida a cópia SQLite.
3. `npm ci --omit=dev` em release versionada.
4. Executar `npm run predeploy` antes da publicação.
5. Conferir migrations sem apagar dados.
6. Reiniciar por PM2/systemd/painel, nunca por processo manual permanente.
7. Validar `/api/health` e `/api/ready`.
8. Executar smoke test autenticado e WebSocket.
9. Conferir logs e manter release anterior para rollback.

O deploy permanece bloqueado até existir acesso autorizado ao ambiente real.

### Preflight de colaboração e publicação

Antes de empacotar ou sincronizar uma release:

- atualizar as referências remotas com `git fetch --prune`;
- conferir `git status`, branches locais/remotas e divergências com `origin/main`;
- revisar commits recentes, autores e arquivos modificados por outros usuários ou por outras sessões do mesmo usuário;
- consultar os workflows anteriores de CI e deploy, incluindo falhas e execuções pendentes;
- identificar o SHA efetivamente publicado e comparar `SHA publicado...SHA candidato`;
- comparar a estrutura ativa na VPS com a árvore da release, sem presumir que `main` representa o servidor;
- confirmar que layouts, mapa, localização, modelo 3D, banco e arquivos operacionais preexistentes serão preservados;
- interromper o deploy quando houver arquivos exclusivos do servidor, branches divergentes ou mudanças concorrentes cuja origem não esteja clara.

`rsync --delete`, remoção de diretórios, troca de estrutura (`backend/frontend`, monólito ou equivalente) e substituição de configuração do PM2 exigem comparação prévia e aprovação específica. Uma autorização genérica de deploy não autoriza apagar ou reverter trabalho existente.

### Fase separada para banco de dados

O manifesto da release compara a candidata com o último deploy bem-sucedido. Alterações em migrations, inicialização, acesso, backup ou estrutura versionada do banco são classificadas como críticas.

- O deploy automático é bloqueado quando houver impacto crítico de banco.
- A publicação deve ser iniciada manualmente com `approve_database_changes=true` após revisão específica.
- O backup validado é criado com a release ainda ativa, antes da sincronização de código.
- `db:init` roda em uma fase separada somente quando o manifesto indicar mudança crítica aprovada.
- Contas administrativas não são mais reprovisionadas em todo deploy; essa mutação exige execução manual com `provision_staff=true`.
- O manifesto anterior verifica alterações feitas diretamente na VPS e bloqueia a sobreposição. Na primeira execução, a comparação usa o manifesto reconstruído do último deploy bem-sucedido.
- A sincronização normal não usa `--delete`; arquivos desconhecidos não são removidos silenciosamente.

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
