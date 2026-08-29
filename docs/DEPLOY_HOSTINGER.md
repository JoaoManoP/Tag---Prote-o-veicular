# Deploy da Rastreon na Hostinger

## Arquitetura preparada

- Um único serviço Node.js em `127.0.0.1:3000`.
- Home institucional em `/`.
- Login em `/login.html` e painel autenticado em `/dashboard`.
- API e Socket.IO no mesmo serviço, evitando problemas de origem, cookies e inicialização.
- Nginx/HTTPS como única entrada pública.

A porta 3000 não deve ficar exposta diretamente na internet. Somente 80/443 devem ser públicos.

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
PUBLIC_URL=https://SEU_DOMINIO
DATABASE_PATH=./database/data/rastreon.sqlite
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
```

Em uma VPS, o comando deve ser mantido por systemd ou PM2. Em hospedagem gerenciada, basta uma aplicação Node.js.

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
