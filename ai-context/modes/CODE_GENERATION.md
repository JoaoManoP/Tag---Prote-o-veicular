# MODO: GERAÇÃO DE CÓDIGO

## Objetivo

Criar código novo de forma segura, compatível com o projeto e limitada ao escopo solicitado.

## Fluxo obrigatório

### 1. Análise

Antes do plano, analisar:

- finalidade da solicitação;
- arquitetura existente;
- padrões do projeto;
- regras de negócio relacionadas;
- autenticação e autorização;
- impacto multi-tenant;
- dados tratados;
- dependências envolvidas;
- testes existentes.

### 2. Plano

Apresentar em português do Brasil:

- contexto;
- objetivo;
- o que será criado ou alterado;
- abordagem técnica;
- impactos;
- riscos de segurança;
- testes e validações;
- premissas e limitações.

Aguardar aprovação explícita.

### 3. Implementação

Após aprovação:

- implementar apenas o escopo aprovado;
- seguir os padrões existentes;
- reutilizar componentes e serviços disponíveis;
- validar entradas em runtime;
- aplicar autenticação e autorização no backend;
- garantir isolamento multi-tenant quando aplicável;
- tratar erros de forma segura;
- não expor dados ou segredos;
- criar testes positivos e negativos;
- evitar dependências desnecessárias.

### 4. Validação

Executar, quando disponíveis:

- formatação;
- lint;
- typecheck;
- testes unitários;
- testes de integração;
- testes end-to-end;
- build;
- análise de segurança relevante.

### 5. Entrega

Informar:

- resumo do que foi implementado;
- decisões técnicas;
- impactos;
- medidas de segurança;
- testes criados;
- validações executadas;
- validações não executadas;
- limitações e pendências.

## Cenários mínimos a considerar

- caminho de sucesso;
- entrada inválida;
- recurso inexistente;
- usuário não autenticado;
- usuário sem permissão;
- acesso a outro tenant;
- falha de integração externa;
- duplicidade;
- concorrência;
- indisponibilidade temporária.

## Proibições

- não inventar regras de negócio;
- não criar arquitetura paralela sem necessidade;
- não alterar contratos públicos sem informar;
- não inserir segredo no código;
- não proteger rota apenas no frontend;
- não declarar conclusão sem validação adequada.

## Declaração de variáveis

Todo código novo deve utilizar `const` por padrão e `let` somente quando houver reatribuição. É proibido gerar novas declarações com `var`.
