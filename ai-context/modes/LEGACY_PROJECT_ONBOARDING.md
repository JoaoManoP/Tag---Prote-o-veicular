# INTEGRAÇÃO DE PROJETOS LEGADOS

## 1. Objetivo

Este módulo orienta a IA quando o projeto foi criado antes da adoção dos arquivos de contexto ou ainda não possui um `PROJECT_CONTEXT.md` validado.

O objetivo inicial não é modernizar ou reorganizar o sistema. A prioridade é compreender o comportamento existente, preservar a compatibilidade, registrar riscos e criar uma base confiável para futuras alterações.

---

## 2. Quando este modo deve ser utilizado

Este modo deve ser ativado quando ocorrer pelo menos uma das situações abaixo:

- o projeto não possui `PROJECT_CONTEXT.md`;
- o contexto existente está incompleto ou desatualizado;
- a stack real não está documentada;
- há divergência entre documentação e código;
- as regras de autenticação, autorização ou negócio não estão claras;
- o sistema possui dependências, padrões ou estruturas antigas;
- a equipe não consegue confirmar com segurança como uma parte crítica funciona.

---

## 3. Regra central

> Em projetos legados, a IA não deve assumir padrões modernos, substituir tecnologias, reorganizar a arquitetura ou realizar migrações automáticas. Primeiro deve mapear o estado atual, apresentar as descobertas, registrar incertezas e aguardar validação humana.

A existência de uma solução mais moderna não autoriza sua adoção automática.

---

## 4. Fluxo obrigatório

A IA deve seguir esta ordem:

1. analisar a estrutura e os arquivos disponíveis;
2. identificar linguagem, runtime, frameworks e dependências;
3. identificar comandos de instalação, execução, testes e build;
4. mapear banco de dados, migrações e integrações;
5. identificar autenticação, autorização e isolamento de dados;
6. localizar testes existentes e avaliar sua abrangência;
7. identificar regras de negócio confirmadas no código ou documentação;
8. registrar riscos, lacunas e contradições;
9. produzir um relatório de descoberta;
10. preparar um rascunho do `PROJECT_CONTEXT.md`;
11. aguardar validação do desenvolvedor ou Tech Lead;
12. somente depois utilizar normalmente os modos de geração, correção e análise de segurança.

---

## 5. Classificação das informações

Cada informação descoberta deve ser marcada como:

- **Confirmada:** comprovada por código, configuração, teste ou documentação confiável;
- **Provável:** sustentada por vários indícios, mas sem confirmação definitiva;
- **Não confirmada:** encontrada parcialmente ou dependente de validação humana;
- **Ausente:** não foi identificada;
- **Contraditória:** existem fontes incompatíveis.

A IA não deve transformar inferências em decisões oficiais sem aprovação.

---

## 6. Inventário mínimo

O levantamento deve contemplar, quando aplicável:

- objetivo aparente do sistema;
- linguagem e versões;
- runtime;
- frameworks e bibliotecas principais;
- estrutura de pastas;
- padrão arquitetural aparente;
- banco de dados e ORM;
- autenticação;
- autorização;
- multi-tenancy;
- integrações externas;
- filas e processos assíncronos;
- armazenamento de arquivos;
- ambientes e configurações;
- comandos disponíveis;
- testes existentes;
- áreas críticas;
- débitos técnicos visíveis;
- vulnerabilidades ou configurações inseguras.

---

## 7. Compatibilidade antes de modernização

A prioridade deve ser:

1. preservar o funcionamento atual;
2. não reduzir a segurança;
3. compreender o comportamento existente;
4. corrigir riscos críticos mediante plano aprovado;
5. criar testes de caracterização;
6. documentar regras e dependências;
7. melhorar gradualmente;
8. modernizar somente com aprovação específica.

A IA não deve migrar automaticamente:

- JavaScript para TypeScript;
- Express para NestJS;
- React para Next.js;
- CommonJS para ES Modules;
- uma biblioteca de autenticação para outra;
- um ORM, banco de dados ou provedor;
- um monólito para microsserviços.

---

## 8. Testes de caracterização

Antes de mudanças relevantes em áreas sem testes, a IA deve propor testes de caracterização.

Esses testes devem registrar o comportamento atual, incluindo entradas, saídas, erros e efeitos colaterais conhecidos.

A IA deve diferenciar:

- comportamento intencional;
- bug conhecido;
- comportamento não confirmado;
- dependência externa;
- efeito colateral histórico.

Os testes não devem validar vulnerabilidades como comportamento desejado. Quando houver risco de segurança, ele deve ser registrado separadamente e tratado por plano aprovado.

---

## 9. Código legado inseguro

Ao identificar código inseguro, a IA deve:

1. registrar o achado;
2. classificar severidade e confiança;
3. explicar impacto e possibilidade de exploração;
4. avaliar compatibilidade da correção;
5. propor uma alteração mínima e segura;
6. apresentar testes necessários;
7. aguardar aprovação antes de modificar o código.

Uma vulnerabilidade crítica diretamente relacionada à tarefa pode bloquear a implementação até que exista uma decisão segura.

---

## 10. Uso de `var` em projetos legados

A IA não deve criar novas declarações com `var`.

Para código novo ou alterado:

- utilizar `const` por padrão;
- utilizar `let` somente quando houver reatribuição necessária;
- nunca utilizar `var` em nova implementação.

Quando encontrar `var` em código legado:

- não substituir em massa automaticamente;
- avaliar escopo, hoisting e possíveis efeitos de compatibilidade;
- substituir apenas dentro do escopo aprovado e quando houver segurança na alteração;
- criar ou atualizar testes quando a mudança puder alterar comportamento;
- registrar ocorrências fora do escopo como débito técnico.

A mera presença de `var` não autoriza uma refatoração ampla durante uma correção pontual.

---

## 11. Resultado da descoberta

O relatório deve conter:

```text
RESUMO DO PROJETO LEGADO

Stack identificada:
Arquitetura aparente:
Comandos identificados:
Autenticação e autorização:
Banco e integrações:
Testes existentes:
Riscos iniciais:
Informações não confirmadas:
Contradições:
Recomendações imediatas:
Próximo passo proposto:
```

---

## 12. Aprovação

O relatório de descoberta pode ser produzido sem aprovação prévia, pois não altera o código.

Qualquer uma das ações abaixo exige plano e aprovação explícita:

- alteração de código;
- atualização de dependências;
- criação de migrações;
- modernização de stack;
- reorganização estrutural;
- substituição ampla de `var`;
- correção de vulnerabilidades;
- preenchimento definitivo do `PROJECT_CONTEXT.md`.
