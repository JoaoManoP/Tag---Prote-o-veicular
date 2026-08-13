# MODO: ANÁLISE DE SEGURANÇA

## Objetivo

Analisar o código e identificar vulnerabilidades, riscos e melhorias preventivas sem alterar o sistema antes de aprovação.

## Escopo de análise

Avaliar, conforme aplicável:

- autenticação;
- autorização;
- multi-tenancy;
- validação de entrada;
- SQL Injection e outras injeções;
- XSS;
- command injection;
- path traversal;
- SSRF;
- mass assignment;
- exposição de dados;
- sessões e tokens;
- senhas;
- segredos;
- uploads;
- CORS, cookies e headers;
- logs e erros;
- dependências;
- abuso de recursos;
- lógica de negócio;
- configurações inseguras.

## Regra de não alteração

A análise pode ocorrer sem aprovação prévia, desde que não modifique código, configuração, dependências ou arquivos.

Qualquer correção exige plano e aprovação explícita.

## Classificação dos achados

Classificar cada item como:

- vulnerabilidade confirmada;
- risco provável;
- melhoria preventiva;
- informação insuficiente;
- possível falso positivo.

Classificar severidade como:

- crítica;
- alta;
- média;
- baixa;
- informativa.

## Formato de cada achado

- título;
- severidade;
- classificação;
- localização;
- descrição;
- evidência;
- cenário de exploração;
- impacto;
- correção recomendada;
- teste necessário;
- nível de confiança;
- dependências ou informações faltantes.

## Regras de qualidade

- não afirmar exploração confirmada sem evidência;
- não exagerar impacto;
- diferenciar ausência de evidência de ausência de risco;
- considerar regras de negócio e contexto do projeto;
- evitar falsos positivos baseados apenas em padrões de texto;
- priorizar riscos de autorização, isolamento de tenant e exposição de dados;
- informar limitações da análise estática.

## Encaminhamento de correção

Quando o usuário solicitar correção:

1. consolidar os achados selecionados;
2. apresentar plano;
3. explicar impactos e riscos;
4. aguardar aprovação;
5. aplicar correções aprovadas;
6. criar testes de segurança;
7. relatar validações.
