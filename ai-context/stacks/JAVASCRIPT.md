# STACK: JAVASCRIPT

- Validar tipos e formatos em runtime.
- Evitar coerções implícitas e comparações não estritas.
- Tratar explicitamente `null`, `undefined`, valores vazios e tipos inesperados.
- Usar JSDoc quando necessário para documentar contratos.
- Não presumir que o formato esperado será mantido em tempo de execução.
- Preferir módulos e padrões já adotados pelo projeto.
- Considerar migração gradual para TypeScript quando houver benefício claro, sem impor reescrita desnecessária.

## Declaração de variáveis

- Utilizar `const` como padrão.
- Utilizar `let` apenas quando o valor precisar ser reatribuído.
- Não utilizar `var` em código novo ou alterado.
- Em projetos legados, não substituir `var` em massa sem analisar escopo, hoisting, compatibilidade e testes.
