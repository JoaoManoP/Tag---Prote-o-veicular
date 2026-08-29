# REGRAS DE GIT, COMMITS, BRANCHES E VERSIONAMENTO

## 1. Objetivo

Este documento define o comportamento obrigatório das IAs ao operar Git e trabalhar com repositórios da software house.

As regras buscam garantir:

- rastreabilidade das alterações;
- revisão humana antes da integração;
- proteção contra perda de código;
- prevenção de commits acidentais ou com segredos;
- branches e commits com escopo claro;
- diferenciação entre a publicação inicial de um projeto e a manutenção de um repositório existente.

Estas regras devem ser aplicadas em conjunto com `AI_CONTEXT.md`, `SECURITY_RULES.md` e `project/PROJECT_CONTEXT.md`.

---

## 2. Princípio geral

A IA pode auxiliar e automatizar operações Git locais quando permitido por estas regras, mas não deve assumir que possui autorização para publicar, sobrescrever ou integrar código remotamente.

A criação de código, a criação de commit e a publicação do código são etapas diferentes e possuem aprovações diferentes.

Fluxo padrão em repositório existente:

```text
Plano
→ aprovação da implementação
→ branch da tarefa
→ implementação
→ testes e validações
→ resumo para commit
→ aprovação do commit
→ commit local
→ push manual pelo desenvolvedor
→ Pull Request
→ revisão humana e CI
→ merge
```

---

## 3. Identificar o estado do repositório antes de operar

Antes de executar operações Git relevantes, a IA deve identificar, conforme necessário:

- se o diretório já é um repositório Git;
- branch atual;
- alterações locais pendentes;
- existência de commits locais;
- existência de remote configurado;
- existência de histórico remoto;
- branch principal do projeto;
- finalidade da branch atual.

Comandos de leitura podem incluir:

```bash
git status
git branch --show-current
git remote -v
git log --oneline -n 10
```

A existência de `.git` local não significa, por si só, que o projeto já foi publicado.

A distinção relevante é:

1. **projeto ainda não publicado em repositório remoto**;
2. **repositório remoto existente ou já publicado**.

### 3.1 Preflight obrigatório antes de qualquer alteração ou deploy

Antes de editar arquivos, integrar commits, criar uma release ou iniciar um deploy, a IA deve conferir o trabalho realizado por outros usuários e pelo mesmo usuário em outras sessões. Essa verificação não pode ser omitida por urgência, por a branch se chamar `main` ou por o diretório local parecer limpo.

O preflight deve, conforme aplicável:

1. executar `git fetch --prune` para atualizar as referências remotas sem modificar o trabalho local;
2. conferir `git status`, branch atual, remotes e relação entre a branch local e a remota;
3. revisar commits recentes, autores, datas e arquivos alterados na branch atual e nas branches ativas relacionadas;
4. identificar o commit da última publicação bem-sucedida e os deploys posteriores com falha, cancelamento ou execução pendente;
5. comparar a versão publicada, a branch remota, a branch local e a alteração pretendida;
6. verificar se o servidor ou ambiente publicado contém estrutura, arquivos ou alterações que não estejam representados no commit candidato;
7. registrar quais mudanças preexistentes serão preservadas e quais arquivos possuem sobreposição com a nova tarefa.

Comandos de leitura recomendados incluem:

```bash
git fetch --prune
git status --short
git branch --show-current
git branch --all
git remote -v
git log --all --oneline --decorate -n 30
git rev-list --left-right --count origin/main...HEAD
git diff --name-status <ultimo-commit-publicado>...HEAD
git log --format='%h %an %ad %s' --date=iso -n 30
gh run list --branch main
```

Se a versão publicada não puder ser identificada, se houver branches divergentes, arquivos alterados diretamente no servidor, commits de origem incerta ou sobreposição funcional não explicada, a IA deve **parar antes de editar ou publicar** e solicitar decisão do responsável.

São proibidos sem análise e autorização específica:

- realizar rebase, merge ou escolha automática de um lado sobre trabalho concorrente;
- tratar `main` como fonte de verdade apenas pelo nome da branch;
- sobrescrever alterações feitas por outro usuário ou pelo mesmo usuário em outra sessão;
- publicar uma árvore diferente da que está ativa sem documentar e aprovar a migração;
- usar sincronização destrutiva, inclusive `rsync --delete`, sem comparar previamente a origem, o destino e a última release.

Uma solicitação de deploy autoriza publicar a mudança aprovada, mas não autoriza remover, reverter ou substituir trabalho concorrente fora desse escopo.

---

## 4. Exceção de bootstrap para projeto novo

Quando um projeto ainda não possuir repositório remoto publicado, a IA pode auxiliar no bootstrap completo do versionamento.

Após aprovação explícita do desenvolvedor, a IA pode:

- executar `git init`;
- definir ou confirmar `main` como branch principal;
- criar ou revisar `.gitignore`;
- revisar arquivos que serão versionados;
- criar o commit inicial;
- criar o repositório no GitHub, quando possuir capacidade e acesso;
- configurar `origin`;
- executar o **primeiro push** da branch principal.

Antes da publicação inicial, a IA deve apresentar:

- nome proposto do repositório;
- conta ou organização de destino;
- visibilidade proposta;
- branch principal;
- arquivos que serão versionados;
- principais arquivos ignorados;
- resultado da verificação de segredos;
- mensagem do commit inicial;
- operação de publicação que será realizada.

Exemplo:

```text
PUBLICAÇÃO INICIAL

Repositório: clinic-management-api
Destino: organização da empresa
Visibilidade: Private
Branch principal: main

Arquivos ignorados:
- node_modules/
- .env
- dist/
- coverage/

Segredos identificados: nenhum identificado na revisão realizada.

Commit proposto:
chore: initialize project

Ação proposta:
Criar o repositório remoto e executar o primeiro push da branch main.

Aguardando aprovação.
```

### 4.1 Limite da exceção

A exceção vale somente para o bootstrap.

> **O primeiro push encerra automaticamente a exceção de publicação inicial.**

Após a primeira publicação, o projeto passa a seguir integralmente as regras de repositório existente.

Mesmo no bootstrap, são proibidos:

```bash
git push --force
git push --mirror
git push --all
```

A IA deve publicar somente a branch explicitamente aprovada.

---

## 5. Repositórios existentes: push pela IA é proibido

Em qualquer repositório já publicado ou com histórico remoto existente, a IA não deve executar `git push`, mesmo que o desenvolvedor solicite.

A IA pode:

- preparar alterações localmente;
- criar branch local;
- criar commits locais após aprovação;
- informar o comando de push que o desenvolvedor deverá executar manualmente;
- preparar título e descrição da Pull Request.

A IA não pode:

- publicar a branch remotamente;
- fazer push direto para `main`;
- executar force push;
- remover branch remota;
- integrar código remotamente sem revisão.

Exemplo de encerramento após commit:

```text
COMMIT CRIADO

Branch: fix/tenant-access
Commit: a91bc42
Mensagem: fix: prevent cross-tenant order access

O commit permanece apenas no repositório local.

Próxima etapa:
O desenvolvedor deve publicar a branch manualmente e abrir uma Pull Request para revisão.
```

---

## 6. Branch principal

A branch principal recomendada é:

```text
main
```

A `main` deve representar código integrado e revisado.

Em repositórios existentes:

- não implementar tarefas diretamente em `main`;
- não criar commits de tarefa diretamente em `main`;
- não fazer push direto para `main`;
- toda alteração deve passar por branch própria e Pull Request.

Se a IA receber uma tarefa estando em `main`, deve criar ou propor uma branch compatível com a tarefa após a aprovação do plano.

---

## 7. Convenção de branches

Utilizar o padrão:

```text
tipo/descricao-curta-em-kebab-case
```

Os nomes devem ser técnicos, objetivos e escritos em inglês.

Prefixos recomendados:

- `feature/` — nova funcionalidade;
- `fix/` — correção de bug;
- `security/` — correção ou endurecimento de segurança;
- `refactor/` — refatoração sem mudança funcional intencional;
- `chore/` — manutenção, configuração ou tarefas operacionais;
- `hotfix/` — correção crítica de produção.

Exemplos:

```text
feature/user-invitations
fix/login-session-expiration
security/prevent-cross-tenant-access
refactor/billing-service
chore/update-eslint
hotfix/payment-duplication
```

Evitar nomes vagos:

```text
dev
test
changes
new
matheus
backend
feature/update
```

---

## 8. Uma branch deve representar um único objetivo

Cada branch deve possuir escopo claro e coerente.

Não misturar tarefas não relacionadas na mesma branch.

Exemplo inadequado:

```text
feature/user-management
```

contendo simultaneamente:

- convite de usuário;
- recuperação de senha;
- MFA;
- auditoria;
- refatoração de pagamentos.

Quando o escopo crescer de forma relevante, a IA deve propor divisão em tarefas e branches menores.

Exemplo:

```text
feature/user-invitations
feature/password-recovery
feature/admin-mfa
feature/user-audit-log
```

Mudança adicional não relacionada deve ser registrada como recomendação ou nova tarefa, e não incluída silenciosamente na branch atual.

---

## 9. Verificar compatibilidade entre a tarefa e a branch atual

Antes de alterar código, a IA deve considerar se a branch atual corresponde ao objetivo da solicitação.

Exemplo:

```text
Branch atual: fix/tenant-order-access
Tarefa solicitada: criar recuperação de senha

Resultado: incompatível.
Recomendação: preservar o trabalho atual e utilizar feature/password-recovery.
```

A IA não deve transformar uma branch existente em depósito de tarefas distintas.

---

## 10. Alterações locais pendentes

Antes de trocar de branch, atualizar a base, executar operações de limpeza ou iniciar outra tarefa, verificar `git status`.

Se existirem alterações locais que possam ser perdidas ou misturadas com a nova tarefa, a IA deve parar e informar o desenvolvedor.

A IA não deve descartar, sobrescrever ou mover silenciosamente trabalho local existente.

Exemplo:

```text
BLOQUEIO DE OPERAÇÃO GIT

Existem alterações locais não commitadas:
- src/auth/auth.service.ts
- src/auth/auth.controller.ts

A troca ou atualização da branch não será executada até que essas alterações sejam tratadas.
```

---

## 11. Commits podem ser automatizados com aprovação específica

IAs que possuam capacidade de operar Git podem criar commits locais, mas o commit nunca deve ser silencioso.

A aprovação do plano de implementação não autoriza automaticamente o commit.

Antes de executar `git commit`, a IA deve apresentar ao desenvolvedor:

- branch atual;
- o que foi alterado;
- onde foi alterado;
- como foi implementado;
- impactos relevantes;
- riscos de segurança identificados;
- arquivos que entrarão no commit;
- validações realmente executadas;
- validações não executadas ou pendentes;
- mensagem de commit proposta.

Exemplo:

```text
RESUMO PARA COMMIT

Branch:
fix/tenant-access

O que foi feito:
- corrigido o isolamento entre tenants;
- adicionada validação de autorização;
- adicionados testes de regressão.

Onde:
- módulo de pedidos;
- camada de autorização;
- testes de integração.

Como:
A consulta passou a utilizar o tenant obtido da sessão autenticada em vez de confiar no tenantId recebido do cliente.

Arquivos:
- src/orders/orders.service.ts
- src/orders/orders.service.spec.ts

Validações:
- lint: executado com sucesso;
- typecheck: executado com sucesso;
- testes: executados com sucesso;
- build: não executado.

Commit proposto:
fix: prevent cross-tenant order access

Aguardando aprovação para criar o commit.
```

Somente após aprovação explícita o commit pode ser criado.

---

## 12. Padrão de mensagens de commit

Utilizar mensagens em inglês e preferencialmente compatíveis com Conventional Commits.

Formatos recomendados:

```text
feat: add user invitation flow
fix: prevent duplicate payment
security: restrict file upload
test: add tenant isolation tests
refactor: simplify authentication service
docs: update project context
chore: update eslint configuration
```

Evitar mensagens vagas:

```text
update
changes
fix
final
test
stuff
```

O commit deve representar uma unidade lógica compreensível.

Não misturar funcionalidade, bug, refatoração e alterações não relacionadas apenas para reduzir a quantidade de commits.

---

## 13. Revisão obrigatória antes do commit

Antes de solicitar aprovação para o commit, a IA deve revisar, quando aplicável:

```bash
git status
git diff
git diff --staged
```

Também deve executar as validações disponíveis e relevantes para a tarefa, como:

- lint;
- typecheck;
- testes unitários;
- testes de integração;
- testes end-to-end;
- build;
- verificações de segurança.

A IA deve seguir a classificação de `AI_CONTEXT.md`:

- Executado;
- Analisado;
- Não executado;
- Pendente.

Nunca declarar que um teste foi aprovado sem tê-lo executado.

---

## 14. Staging controlado

A IA deve verificar quais arquivos serão adicionados ao commit.

Preferir staging explícito para reduzir o risco de incluir arquivos acidentais:

```bash
git add src/auth/auth.service.ts
git add src/auth/auth.service.spec.ts
```

Evitar utilizar `git add .` de forma cega.

O uso de `git add .` somente é aceitável após revisão clara do `git status` e do `git diff`, quando todos os arquivos modificados pertencem comprovadamente ao escopo aprovado.

Arquivos não relacionados à tarefa não devem entrar no commit.

---

## 15. `.gitignore`

Todo projeto deve possuir `.gitignore` compatível com sua stack, ferramentas, sistema operacional e processo de build.

O `.gitignore` deve ser criado ou revisado antes da publicação inicial e sempre que novas ferramentas passarem a gerar arquivos locais que não devam ser versionados.

Para projetos Node.js, JavaScript ou TypeScript, uma base comum pode incluir:

```gitignore
# Dependencies
node_modules/

# Environment
.env
.env.*
!.env.example

# Build
build/
dist/
.next/
out/

# Coverage
coverage/

# Logs
*.log
logs/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Cache
.cache/
.eslintcache
*.tsbuildinfo

# OS
.DS_Store
Thumbs.db

# Temporary
tmp/
temp/
*.tmp
```

O arquivo deve ser adaptado ao projeto. Não adicionar regras desnecessárias apenas por padrão.

Arquivos de configuração compartilháveis de IDE podem ser versionados quando houver decisão da equipe.

---

## 16. Segredos nunca devem ser versionados

É proibido commitar:

- `.env` com valores reais;
- tokens;
- senhas;
- chaves de API;
- chaves privadas;
- certificados privados;
- credenciais de banco;
- arquivos de service account com credenciais;
- dumps de produção;
- backups contendo dados reais;
- logs contendo informações sensíveis.

Versionar somente exemplos seguros, como:

```text
.env.example
```

Exemplo:

```env
DATABASE_URL=
JWT_SECRET=
REDIS_URL=
SMTP_HOST=
SMTP_USER=
SMTP_PASSWORD=
```

Sem valores reais.

### 16.1 Segredo já commitado

Adicionar posteriormente o arquivo ao `.gitignore` não remove o segredo do histórico.

Quando um segredo já tiver sido versionado, a IA deve:

1. não reproduzir o valor do segredo;
2. informar que a credencial deve ser considerada exposta;
3. recomendar revogação e rotação;
4. avaliar a necessidade de limpeza do histórico;
5. interromper publicação adicional relacionada ao segredo até que o risco seja tratado.

---

## 17. Pull Request obrigatória para repositórios existentes

Toda alteração de um repositório já publicado deve passar por Pull Request antes de ser integrada à `main`.

A PR deve permitir que outro responsável compreenda:

- o que foi alterado;
- por que foi alterado;
- como foi implementado;
- impactos;
- riscos de segurança;
- testes realizados;
- validações pendentes;
- limitações conhecidas.

Título recomendado em inglês, coerente com o commit ou objetivo da branch.

A descrição pode ser escrita em português do Brasil para facilitar a revisão pela equipe.

Exemplo:

```text
Título:
fix: prevent cross-tenant order access

Resumo:
Corrige o acesso indevido a pedidos de outra organização.

Como foi corrigido:
A consulta agora combina o identificador do pedido com o tenant obtido da sessão autenticada.

Segurança:
Foi adicionado teste tentando acessar recurso pertencente a outro tenant.

Validações:
- lint: aprovado;
- typecheck: aprovado;
- testes de integração: aprovados;
- build: aprovado.
```

---

## 18. Revisão antes do merge

Nenhuma alteração deve ser integrada à `main` sem revisão.

Recomenda-se configurar a branch principal com:

- Pull Request obrigatória;
- pelo menos uma aprovação humana;
- aprovação adicional em projetos ou áreas críticas, quando definido pelo projeto;
- CI obrigatório;
- resolução de comentários antes do merge;
- bloqueio de force push;
- bloqueio de exclusão da branch principal;
- `CODEOWNERS` para áreas críticas quando aplicável.

Áreas que podem exigir revisão adicional incluem:

- autenticação;
- autorização;
- multi-tenancy;
- pagamentos;
- dados sensíveis;
- infraestrutura;
- segurança.

A política específica do projeto deve ser registrada em `PROJECT_CONTEXT.md`.

---

## 19. Operações destrutivas e reescrita de histórico

A IA não deve executar silenciosamente operações capazes de destruir trabalho, alterar histórico compartilhado ou remover referências.

São bloqueadas sem tratamento específico:

```bash
git reset --hard
git clean -fd
git branch -D
git push --force
git push --force-with-lease
```

Operações como as seguintes exigem explicação do impacto e aprovação específica quando forem realmente necessárias em contexto local seguro:

```bash
git rebase
git reset
git commit --amend
git restore
git checkout -- <arquivo>
```

Em repositório existente, aprovação não torna permitido um `git push`; a proibição de push pela IA continua válida.

---

## 20. Conflitos de merge

A IA não deve resolver conflitos escolhendo automaticamente um dos lados sem compreender o comportamento.

Ao encontrar conflito, deve analisar:

- intenção das duas alterações;
- comportamento que precisa ser preservado;
- regras de negócio envolvidas;
- risco de regressão;
- impacto de segurança.

Quando a decisão depender de regra de negócio não documentada ou intenção humana não inferível com segurança, a IA deve solicitar decisão do desenvolvedor.

---

## 21. Hotfix não elimina revisão

Branches `hotfix/*` devem ser reservadas a correções realmente críticas de produção.

Urgência não autoriza:

- remover testes;
- ignorar segurança;
- fazer push automático pela IA;
- integrar diretamente em `main`;
- eliminar a Pull Request.

O processo pode ser acelerado, mas deve preservar revisão mínima e rastreabilidade.

---

## 22. Regras resumidas e bloqueantes

1. Antes de qualquer alteração ou deploy, executar o preflight local, remoto e da última publicação.
2. Não sobrescrever mudanças de outros usuários ou de outras sessões do mesmo usuário.
3. Não trabalhar diretamente em `main` em repositórios existentes.
4. Cada branch deve possuir objetivo único e nome descritivo em inglês.
5. Commits locais podem ser automatizados somente após resumo e aprovação específica.
6. Antes do commit, revisar status, diff, arquivos incluídos e validações.
7. Não versionar segredos ou arquivos locais sensíveis.
8. `.gitignore` deve ser adequado à stack e revisado antes da publicação inicial.
9. Em projeto ainda não publicado, o primeiro push pode ser executado pela IA somente após aprovação explícita.
10. O primeiro push encerra automaticamente a exceção de bootstrap.
11. Em repositório existente, a IA nunca executa push.
12. Toda integração em repositório existente deve passar por Pull Request e revisão humana.
13. Não executar operações destrutivas ou reescrever histórico silenciosamente.
14. Não misturar alterações não relacionadas na mesma branch ou commit.
