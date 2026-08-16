# Deploy da Rastreon na Hostinger

## Arquitetura preparada

- Home institucional: `127.0.0.1:3001`
- Aplicativo, autenticação, API e Socket.IO: `127.0.0.1:3000`
- Nginx/HTTPS: única entrada pública, encaminhando `/` e `/home-assets/` para a home e as demais rotas para o aplicativo.

As portas 3000 e 3001 não devem ficar expostas diretamente na internet. Somente 80/443 devem ser públicos.

## Acessos necessários

Para publicar é necessário pelo menos um destes acessos:

1. hPanel da conta Hostinger, com o site e o domínio disponíveis; ou
2. SSH/SFTP da hospedagem com usuário, host e porta; ou
3. Painel administrativo válido do servidor (por exemplo, aaPanel) com credenciais; ou
4. Integração de deploy por Git configurada no painel.

Um endereço de painel que retorna `404`, sem usuário e senha, não permite enviar arquivos, configurar Node.js, criar processos, alterar Nginx, instalar certificado ou definir variáveis de ambiente.

## Variáveis de produção

```env
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
HOME_PORT=3001
HOME_HOST=127.0.0.1
HOME_URL=https://SEU_DOMINIO
APP_URL=https://SEU_DOMINIO
PUBLIC_URL=https://SEU_DOMINIO
DATABASE_PATH=./data/rastreon.sqlite
SESSION_SECRET=SEGREDO_LONGO_ALEATORIO
ROUTE_PROVIDER=osrm
```

Não publique o arquivo `.env` no Git e não reutilize senhas reais.

## Inicialização dos serviços

Depois de enviar o repositório e instalar as dependências:

```bash
npm ci --omit=dev
npm run db:init
npm start
npm run start:home
```

Em uma VPS, os dois comandos devem ser mantidos por systemd ou PM2. Em hospedagem gerenciada, devem ser criadas duas aplicações/processos Node.js, uma para cada script.

## Proxy reverso

O modelo está em `deploy/protec.nexobg.com.br.nginx.conf`. Antes de instalar, substitua `protec.nexobg.com.br` pelo domínio definitivo e ajuste os caminhos do certificado e dos logs.

## Informações a solicitar ao responsável pela hospedagem

- URL atualizada do hPanel ou painel do servidor;
- usuário autorizado e método de redefinição da senha;
- domínio/subdomínio definitivo;
- confirmação de que o plano aceita Node.js persistente e WebSocket;
- acesso SSH ou recurso de deploy por Git;
- permissão para configurar proxy reverso e certificado SSL;
- localização do banco SQLite anterior, caso os cadastros devam ser preservados.
