# SELEÇÃO E LIMPEZA DOS MÓDULOS DE STACK

## 1. Objetivo

Este documento define como os módulos de stack devem ser selecionados e mantidos após a configuração do `PROJECT_CONTEXT.md`.

O objetivo é impedir que a IA consulte instruções de tecnologias que não fazem parte do projeto, reduzindo conflitos, ambiguidades e consumo desnecessário de contexto.

---

## 2. Fonte oficial da stack

A seção de stack definida em:

```text
project/PROJECT_CONTEXT.md
```

é a fonte oficial para determinar quais tecnologias, frameworks, runtimes e ambientes fazem parte do projeto.

A IA não deve considerar uma tecnologia como ativa apenas porque existe um arquivo correspondente dentro da pasta `stacks/`.

---

## 3. Regra obrigatória de seleção

Após o desenvolvedor ou Tech Lead definir a stack do projeto no `PROJECT_CONTEXT.md`, somente os arquivos de instrução correspondentes às tecnologias selecionadas devem permanecer na pasta:

```text
stacks/
```

Os arquivos relacionados a tecnologias não utilizadas pelo projeto devem ser removidos do contexto ativo.

### Exemplo

Caso o `PROJECT_CONTEXT.md` defina:

```text
Linguagem: TypeScript
Runtime: Node.js
Backend: NestJS
Frontend: React
```

A pasta deverá manter:

```text
stacks/
├── TYPESCRIPT.md
├── NODE.md
├── NESTJS.md
└── REACT.md
```

Os demais módulos, como `JAVASCRIPT.md`, `EXPRESS.md`, `FASTIFY.md`, `NEXTJS.md`, `REACT_NATIVE.md` e `SERVERLESS.md`, devem ser removidos caso não sejam utilizados.

---

## 4. Responsabilidade pela remoção

A seleção e a remoção inicial dos módulos devem ser realizadas durante a configuração do contexto do projeto.

Essa ação pode ser executada pelo:

- desenvolvedor responsável;
- Tech Lead;
- processo automatizado aprovado;
- IA, desde que apresente previamente um plano e receba aprovação explícita.

A IA não deve excluir arquivos de stack silenciosamente ou durante uma tarefa comum de geração de código, correção de bug ou análise de segurança.

---

## 5. Comportamento obrigatório da IA

Ao iniciar uma tarefa, a IA deve:

1. Ler o `PROJECT_CONTEXT.md`.
2. Identificar as stacks oficialmente declaradas.
3. Consultar somente os módulos correspondentes.
4. Ignorar módulos de tecnologias não declaradas.
5. Informar quando encontrar arquivos de stack que não correspondam ao projeto.
6. Não aplicar padrões de um framework apenas porque o respectivo arquivo existe.
7. Não remover arquivos sem aprovação explícita.

Caso existam módulos excedentes, a IA deve informar:

```text
MÓDULOS DE STACK NÃO UTILIZADOS

Stacks declaradas no projeto:
- [listar stacks]

Módulos válidos:
- [listar arquivos válidos]

Módulos excedentes:
- [listar arquivos que devem ser removidos]

A remoção exige aprovação explícita antes de ser executada.
```

---

## 6. Inclusão de nova tecnologia

Quando uma nova tecnologia for adicionada ao projeto, devem ser realizadas as seguintes ações:

1. Atualizar o `PROJECT_CONTEXT.md`.
2. Adicionar o módulo correspondente à pasta `stacks/`.
3. Confirmar que o módulo não conflita com as regras centrais.
4. Registrar a justificativa técnica quando a mudança for relevante.
5. Avaliar impactos de segurança, manutenção e compatibilidade.
6. Obter aprovação quando a mudança estiver fora do plano atual.

A presença de um novo módulo na pasta `stacks/` não autoriza automaticamente o seu uso. A tecnologia deve estar declarada no `PROJECT_CONTEXT.md`.

---

## 7. Dependências entre módulos

Algumas stacks dependem de módulos mais gerais.

Exemplos:

```text
NestJS → TypeScript + Node.js
Next.js → JavaScript ou TypeScript + Node.js + React
Express → JavaScript ou TypeScript + Node.js
Fastify → JavaScript ou TypeScript + Node.js
React Native → JavaScript ou TypeScript + React
Serverless com Node.js → JavaScript ou TypeScript + Node.js
```

Ao manter um módulo específico, também devem permanecer os módulos gerais necessários à sua interpretação.

O `PROJECT_CONTEXT.md` deve declarar essas tecnologias de forma explícita sempre que possível.

---

## 8. Conflitos e inconsistências

A IA deve interromper o planejamento quando identificar:

- tecnologia utilizada no código, mas ausente no `PROJECT_CONTEXT.md`;
- tecnologia declarada, mas sem módulo correspondente;
- módulos incompatíveis ou contraditórios;
- mais de uma stack principal declarada sem explicação;
- arquivo de stack ativo que contrarie decisões do projeto;
- dúvida sobre qual framework deve orientar a implementação.

Nesses casos, a IA deve explicar a inconsistência e solicitar que o contexto seja corrigido antes de implementar mudanças relevantes.

---

## 9. Prioridade das regras

Os módulos de stack não podem substituir regras de maior prioridade.

A hierarquia permanece:

```text
1. Segurança e proteção de dados
2. Regras específicas do projeto
3. Compatibilidade com o sistema existente
4. Padrões da software house
5. Módulos de stack
6. Recomendações técnicas
7. Preferências da IA
```

Nenhum módulo de stack pode autorizar a redução de controles de segurança obrigatórios.

---

## 10. Regra resumida

> O `PROJECT_CONTEXT.md` define oficialmente a stack do projeto. Somente os módulos correspondentes devem permanecer ativos. Módulos não utilizados devem ser removidos durante a configuração ou após plano e aprovação explícita. A IA deve ignorar tecnologias não declaradas e nunca excluir arquivos silenciosamente.
