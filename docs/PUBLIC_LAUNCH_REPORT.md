# Relatório de preparação para lançamento público

Data da validação: 27 de agosto de 2026.

## Implementado e validado

- Design system responsivo em azul-marinho, azul e neutros, com foco visível, modais adaptáveis e suporte a redução de movimento.
- Navegação simplificada, Garagem separada da operação e pontos de interesse automáticos conforme contexto do mapa.
- Recuperação de senha com resposta anti-enumeração, OTP armazenado somente como hash, expiração, limite de tentativas e revogação de sessões.
- Confirmação de e-mail e telefone disponível no Perfil, condicionada a um provedor de entrega homologado.
- CNH em armazenamento privado, validação de conteúdo real, tamanho e validade, estados de revisão e acesso administrativo protegido por RBAC e 2FA.
- Estruturas de dados e contratos explícitos para multas, combustíveis, Free Flow, comboio, assinaturas, pagamentos e login social.
- Feature flags desligadas por padrão para integrações ainda não homologadas; produção recusa flags inseguras e provedor de OTP simulado.
- Exclusão da conta remove também o arquivo privado da CNH.
- Comboio administrativo com ID RASTREON, conexão consentida, convites temporários e posição efêmera em sala Socket.IO; usuários comuns recebem `403` e não veem a aba.
- Provisionamento idempotente de JOAO e GUILHERME como `ADMIN` por variáveis de ambiente, sem credenciais fixas no repositório.

## Dependências externas pendentes

Estas funções não exibem dados fictícios e permanecem indisponíveis até contratação, credenciais e homologação:

- Entrega transacional de e-mail/SMS para verificação e recuperação de conta.
- Provedor oficial ou autorizado de multas e pontos da CNH.
- Sincronização de preços de combustível com fonte ANP/licenciada.
- Tarifas oficiais de Free Flow.
- Processamento Mercado Pago e seus webhooks assinados.
- OAuth Google e Apple.
- Serviço de localização em tempo real para o modo Comboio.

Variáveis e flags estão documentadas em `.env.example` e `.env.production.example`. Segredos nunca devem ser versionados.

As contas internas exigem os GitHub Secrets `STAFF_JOAO_EMAIL`, `STAFF_JOAO_PASSWORD`, `STAFF_GUILHERME_EMAIL` e `STAFF_GUILHERME_PASSWORD`. O workflow transfere um arquivo efêmero com permissão restrita, provisiona somente os hashes e remove o arquivo da VPS ao terminar.

## Validação executada

- `npm run predeploy`: aprovado.
- 151 testes do backend e contratos de interface: aprovados.
- Lint/sintaxe dos módulos novos: aprovado.
- Build do bundle 3D: aprovado.
- `npm run mobile:check`: 3 testes em 2 suítes aprovados.
- `npm audit --omit=dev`: nenhuma vulnerabilidade encontrada.
- Inspeção visual pública da home e recuperação de senha; correção aplicada para largura mobile, contraste e cor do CTA.

## Deploy automatizado

O repositório já possui CI em `.github/workflows/ci.yml` e deploy em `.github/workflows/deploy-vps.yml`. O deploy de produção ocorre somente quando a CI da branch `main` termina com sucesso, ou por acionamento manual autorizado. O workflow empacota exatamente a revisão testada, cria backup do SQLite, instala dependências, aplica migrações, reinicia pelo PM2 e valida health, readiness, mapa e endpoint público.

Para preservar revisão humana e rastreabilidade, esta entrega deve ser integrada em `main` por pull request. Nenhuma integração externa pendente deve ser habilitada antes da respectiva homologação.
