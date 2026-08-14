# CONTEXTO DO PROJETO — RASTROTACK

## 1. Identificação

- Nome: RastroTack — Rastreamento e Proteção Veicular.
- Objetivo: plataforma demonstrativa de planejamento, rastreamento consentido por celular e análise responsável de viagens, preparada por adaptadores para uma futura tag física.
- Público: usuários avaliando uma central de proteção/rastreamento veicular.
- Criticidade: demonstração; localização e credenciais exigem proteção elevada.

## 2. Stack confirmada

- Linguagem: JavaScript moderno (CommonJS no backend; browser JavaScript no frontend).
- Runtime: Node.js 20 ou superior.
- Frontend: HTML5, CSS3, Leaflet, sem framework.
- Backend: Express 4 e Socket.IO 4.
- Banco: SQLite via `better-sqlite3`, migrações idempotentes na inicialização.
- Sessão: `express-session` com store SQLite próprio.
- Testes: Node Test Runner e Supertest.
- Pacotes: npm.

## 3. Arquitetura

- Monólito modular local: páginas estáticas, API REST e canal Socket.IO no mesmo processo.
- `server/database.js`: schema e persistência; `server/migrations.js`: evolução incremental; `server/auth.js`: autenticação; `server/authorization.js`: RBAC; `server/telemetry.js`: contrato e validações; `server/providers/`: adaptadores; `server/server.js`: composição HTTP, API e tempo real.
- Serviços externos: Nominatim para geocodificação, OSRM para roteamento e tiles OpenStreetMap.
- Dados de runtime e presença de sockets têm cache em memória; dados de negócio são persistidos no SQLite.

## 4. Autenticação, autorização e sessão

- Cadastro por nome, e-mail, telefone opcional e senha.
- Hash bcrypt com custo 12.
- Sessão opaca em cookie `HttpOnly`, `SameSite=Lax`, 24 horas, `Secure` em produção.
- Logout destrói a sessão no banco.
- Autorização baseada em propriedade: cada usuário acessa somente suas sessões de rastreamento.
- Painel exige login; página móvel usa identificador aleatório da sessão como convite para publicar GPS consentido.
- Funções `USER`, `ADMIN` e `DEVELOPER` são resolvidas no banco e verificadas no backend. Cadastro público sempre cria `USER`.
- Não há MFA, recuperação de senha ou provedor externo de identidade nesta demonstração.

## 5. Multi-tenancy e privacidade

- O sistema não possui organizações/tenants formais. O usuário autenticado é o limite de isolamento.
- `user_id` vem exclusivamente da sessão autenticada, nunca do body ou query.
- Dados pessoais: nome, e-mail, telefone opcional, placa e coordenadas.
- Senhas, hashes e cookies não são retornados pela API nem registrados em logs.
- Sessões encerradas usam retenção configurável por `DATA_RETENTION_DAYS`; a política definitiva ainda exige validação jurídica e operacional.
- Consentimentos possuem finalidade, dispositivo, concessão e revogação persistidos.

## 6. Regras críticas

- GPS só inicia após clique e consentimento no celular.
- Trecho reconstruído nunca pode ser apresentado como localização real.
- Distância rodoviária vem do OSRM, não de linha reta.
- Não consultar proprietário por placa.
- Planos e consumo são demonstrativos; não há pagamentos.
- Laboratório aceita somente dados fictícios e exige `DEVELOPER`; administração exige `ADMIN` e não expõe coordenadas individuais.
- `physical-tag` permanece desativado até existir autenticação real do dispositivo.

## 7. Comandos

- Instalação: `npm install`
- Banco: `npm run db:init`
- Desenvolvimento: `npm run dev`
- Testes: `npm test`
- Lint: `npm run lint`
- Build de validação estática: `npm run build`
- Execução: `npm start`

## 8. Ambientes e segredos

- Desenvolvimento: localhost ou rede local, banco em `data/rastro-demo.sqlite`.
- Produção: não definida; exige HTTPS, proxy reverso e `SESSION_SECRET` obrigatório.
- Segredos: somente variáveis de ambiente; `.env` ignorado pelo Git.

## 9. Limitações conhecidas

- Sem recuperação de senha, confirmação de e-mail, MFA ou painel administrativo.
- SQLite é adequado à demonstração e uso local, não a uma implantação horizontal.
- Nominatim/OSRM públicos não possuem SLA para este produto.
- Exportação, atendimento completo a titulares, MFA e política LGPD definitiva precisam de definição antes de produção.
- Simulação avançada, identidade fictícia e gamificação segura permanecem incrementos futuros do Laboratório.
- SQLite continua adequado somente à demonstração/local; escala horizontal exigirá decisão arquitetural aprovada.

## 10. Validação

- Data: 13/08/2026.
- Tipo: projeto existente integrado ao contexto.
- Fontes: solicitação do usuário, código, package.json, testes e README.
- Contexto técnico preenchido após plano e aprovação explícita do usuário.
