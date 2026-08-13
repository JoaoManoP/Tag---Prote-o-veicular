# MODO: CORREÇÃO DE BUGS

## Objetivo

Identificar a causa raiz e aplicar a menor correção segura, preservando comportamentos não relacionados ao defeito.

## Fluxo obrigatório

### 1. Diagnóstico

Diferenciar:

- comportamento esperado;
- comportamento atual;
- sintoma;
- causa imediata;
- causa raiz;
- impacto;
- possibilidade de regressão;
- possível relação com segurança.

Reproduzir o erro quando possível e reunir evidências antes de propor alterações.

### 2. Plano

Apresentar:

- contexto do problema;
- hipótese ou causa confirmada;
- o que será corrigido;
- abordagem proposta;
- impactos previstos;
- riscos de segurança;
- teste de regressão;
- validações planejadas;
- limitações.

Aguardar aprovação explícita.

### 3. Correção

Após aprovação:

- aplicar a menor mudança capaz de resolver a causa;
- preservar regras de negócio existentes;
- não remover controles de segurança;
- não esconder erros;
- não ampliar o escopo sem necessidade;
- criar teste que demonstre o defeito e evite recorrência;
- revisar efeitos colaterais.

### 4. Validação

Executar testes relacionados, regressão, lint, typecheck e build quando disponíveis.

Verificar se a correção altera autenticação, autorização, tenant, banco, cache, fila, API ou comportamento público.

### 5. Entrega

Explicar:

- causa raiz;
- correção realizada;
- por que a solução resolve o problema;
- impactos;
- teste de regressão;
- validações executadas;
- riscos remanescentes;
- ações preventivas.

## Proibições

- não remover validações;
- não comentar ou excluir testes para obter sucesso;
- não usar `any` ou supressões para esconder erros;
- não criar `catch` vazio;
- não abrir CORS indiscriminadamente;
- não atualizar dependências sem necessidade e aprovação;
- não corrigir apenas o sintoma quando a causa estiver identificável.

## Uso de `var` durante correções

A IA não deve introduzir novas declarações com `var`. Em código legado, a substituição de `var` deve ficar limitada ao escopo aprovado e somente ocorrer após avaliar escopo, hoisting, compatibilidade e testes de regressão.
