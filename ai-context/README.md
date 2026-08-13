# AI Context — Software House

## Estrutura

- `AI_CONTEXT.md`: regras gerais e ordem de leitura.
- `SECURITY_RULES.md`: regras de segurança obrigatórias e bloqueantes.
- `GIT_RULES.md`: regras de branches, commits, `.gitignore`, publicação inicial, Pull Requests e operações Git.
- `modes/`: comportamento por tipo de tarefa.
- `stacks/`: adaptações por tecnologia.
- `project/PROJECT_CONTEXT.md`: template preenchido pela equipe de cada projeto.

## Ordem de leitura

Para qualquer tarefa:

1. `AI_CONTEXT.md`
2. `SECURITY_RULES.md`
3. `GIT_RULES.md`, quando houver Git/versionamento
4. modo aplicável
5. módulos de stack aplicáveis
6. `project/PROJECT_CONTEXT.md`
7. solicitação atual

## Exemplos

### Geração em Next.js e NestJS

- `AI_CONTEXT.md`
- `SECURITY_RULES.md`
- `modes/CODE_GENERATION.md`
- `stacks/TYPESCRIPT.md`
- `stacks/NODE.md`
- `stacks/NEXTJS.md`
- `stacks/NESTJS.md`
- `project/PROJECT_CONTEXT.md`

### Correção em Express

- `AI_CONTEXT.md`
- `SECURITY_RULES.md`
- `modes/BUG_FIXING.md`
- `stacks/JAVASCRIPT.md` ou `stacks/TYPESCRIPT.md`
- `stacks/NODE.md`
- `stacks/EXPRESS.md`
- `project/PROJECT_CONTEXT.md`

### Análise de segurança

- `AI_CONTEXT.md`
- `SECURITY_RULES.md`
- `modes/SECURITY_REVIEW.md`
- módulos da stack utilizada
- `project/PROJECT_CONTEXT.md`

## Governança

- Manter os arquivos versionados.
- Alterações em regras bloqueantes devem ser revisadas por responsável técnico.
- O contexto do projeto deve ser atualizado quando arquitetura, autenticação, autorização, tenant, integrações ou regras críticas mudarem.
- A IA pode sugerir alterações, mas a validação final é humana.

## Projetos legados

Quando um projeto existente não possuir contexto validado, utilize `modes/LEGACY_PROJECT_ONBOARDING.md`. Primeiro produza `project/LEGACY_DISCOVERY_REPORT.md`, valide as descobertas com a equipe e somente então preencha o `PROJECT_CONTEXT.md`.

## Regra de variáveis

Em código novo ou alterado, use `const` por padrão, `let` apenas quando houver reatribuição e nunca crie novas declarações com `var`. Em projetos legados, não realize substituição em massa sem análise e aprovação.


## Git e Pull Requests

Para repositórios existentes, toda tarefa deve ocorrer em branch própria e resultar em commit local aprovado. A IA não executa push; o desenvolvedor publica a branch e a alteração segue por Pull Request e revisão humana.

A única exceção é o bootstrap de um projeto ainda não publicado: após revisão de `.gitignore`, arquivos e segredos, e com aprovação explícita, a IA pode criar o repositório remoto e executar o primeiro push. Esse primeiro push encerra automaticamente a exceção.
