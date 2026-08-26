# RELATÓRIO DE DESCOBERTA — RASTREON

## Resumo

- Projeto analisado em 13/08/2026.
- Objetivo confirmado: demonstração web de rastreamento e planejamento veicular.
- Stack confirmada: JavaScript, Node.js, Express, Socket.IO, HTML/CSS, Leaflet e testes Node/Supertest.
- Arquitetura confirmada: monólito web local com API e tempo real.

## Estado encontrado antes da integração

- Sessões e posições eram mantidas somente em memória.
- Não havia cadastro, login, autorização ou banco de dados.
- O painel, a página móvel, rotas, simulação e fila offline já existiam.
- Integrações externas: Nominatim, OSRM e OpenStreetMap.

## Riscos iniciais identificados

- Ausência de autenticação e isolamento por proprietário.
- Perda de todos os dados ao reiniciar o servidor.
- Perfil do veículo aceito sem validação backend suficiente.
- Ausência de rate limiting em operações futuras de login.

## Decisão validada

Após plano apresentado e aprovação explícita do usuário, foi autorizada a inclusão de SQLite, cadastro/login demo, sessões persistentes, hash bcrypt, rate limiting, headers de segurança e isolamento de recursos por usuário.

## Limitações pendentes

- Política de retenção e exclusão não definida.
- Recuperação de senha, MFA e verificação de e-mail ausentes.
- Estratégia de produção e hospedagem pública ainda não definida.
- SQLite não foi aprovado para escala horizontal; uso atual é local/demonstrativo.
