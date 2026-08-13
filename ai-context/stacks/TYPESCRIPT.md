# STACK: TYPESCRIPT

- Preferir `strict: true`.
- Evitar `any`; usar `unknown` para dados externos e realizar narrowing.
- Não usar `@ts-ignore` ou assertions para esconder problemas sem justificativa.
- Tipagem não substitui validação de runtime.
- Definir contratos explícitos de entrada e saída.
- Evitar tipos excessivamente amplos.
- Manter compatibilidade com a configuração existente do projeto.
- Não reduzir rigor do compilador para corrigir erros localizados.

## Declaração de variáveis

- Utilizar `const` como padrão.
- Utilizar `let` apenas quando o valor precisar ser reatribuído.
- Não utilizar `var` em código novo ou alterado.
- Em projetos legados, não substituir `var` em massa sem analisar escopo, hoisting, compatibilidade e testes.
