# REGRAS DE SEGURANÇA OBRIGATÓRIAS

Estas regras são bloqueantes. A IA não pode gerar, corrigir ou recomendar código que as viole sem registrar o risco e propor alternativa segura.

## 1. Validar toda entrada externa

Toda entrada externa deve ser tratada como não confiável e validada em runtime no backend.

Isso inclui body, query, parâmetros de rota, headers, cookies, arquivos, webhooks, filas, cache, banco de dados, APIs externas e variáveis de ambiente.

Validar tipo, formato, tamanho, limites, campos obrigatórios, valores permitidos e campos desconhecidos.

TypeScript não substitui validação de runtime.

## 2. Aplicar autenticação e autorização no backend

Toda operação protegida deve validar identidade, permissão, tenant, propriedade do recurso e regras de negócio aplicáveis.

Ocultar elementos no frontend não constitui controle de acesso.

O acesso deve ser negado por padrão.

## 3. Garantir isolamento multi-tenant

O tenant deve ser obtido de contexto autenticado e validado, nunca confiado apenas porque foi enviado pelo cliente.

O isolamento deve existir em consultas, alterações, exclusões, cache, filas, arquivos, logs, relatórios, eventos e integrações.

Quando o modelo de tenant não estiver claro, a implementação deve ser bloqueada até que o risco seja resolvido.

## 4. Proteger segredos e credenciais

É proibido inserir senhas, tokens, chaves de API, segredos JWT, credenciais de banco ou chaves privadas no código ou em arquivos versionados.

Segredos devem vir de variáveis de ambiente protegidas ou de um gerenciador de segredos.

Ao encontrar segredo exposto, não reproduzi-lo. Recomendar revogação e rotação.

## 5. Armazenar senhas com mecanismo apropriado

Senhas nunca devem ser armazenadas em texto puro, criptografia reversível ou hash genérico rápido.

Usar algoritmo próprio para password hashing, com biblioteca consolidada e parâmetros adequados.

Senhas não podem aparecer em logs, respostas ou mensagens.

## 6. Tratar sessões e tokens como credenciais

Validar assinatura, algoritmo esperado, expiração, emissor e audiência conforme a arquitetura.

Considerar rotação, revogação, logout, invalidação após eventos críticos e reautenticação em operações sensíveis.

Cookies de sessão devem usar configurações seguras quando aplicável.

## 7. Prevenir injeções e execução indevida

Não concatenar entrada externa em SQL, comandos do sistema, caminhos de arquivos, templates executáveis ou expressões interpretadas.

Usar queries parametrizadas, APIs seguras e allowlists.

Não usar listas de palavras proibidas como principal proteção.

## 8. Controlar campos de entrada e saída

Definir explicitamente quais campos podem ser recebidos, alterados e retornados.

Evitar mass assignment, espalhamento indiscriminado de objetos e retorno direto de entidades completas do banco.

Nunca expor hashes, tokens, segredos, campos internos ou dados não autorizados.

## 9. Tratar erros e logs com segurança

Respostas ao cliente não devem expor stack trace, SQL, caminhos internos, configurações ou detalhes sensíveis.

Logs não devem conter senhas, tokens completos, cookies, chaves, códigos de recuperação ou dados pessoais desnecessários.

Não usar `catch` vazio nem ignorar falhas silenciosamente.

## 10. Proteger uploads e acessos externos

Uploads devem ter limite de tamanho, allowlist de formatos, validação real, nome gerado pelo servidor, armazenamento seguro e autorização de acesso.

Requisições para URLs externas devem controlar protocolo, domínio, redirecionamentos, endereços privados, timeout e tamanho da resposta.

## 11. Implementar limites contra abuso

Operações sensíveis ou custosas devem avaliar rate limiting, paginação, quotas, timeout, limite de tentativas, concorrência e idempotência.

Isso é obrigatório especialmente para login, recuperação de senha, códigos, uploads, exportações, relatórios, pagamentos, APIs públicas e integrações com IA.

## 12. Criar testes negativos para funções críticas

Funcionalidades de autenticação, autorização, multi-tenancy, pagamentos, dados sensíveis e administração devem possuir testes de sucesso e de negação.

Testar, conforme aplicável:

- ausência de sessão;
- permissão insuficiente;
- outro tenant;
- outro proprietário;
- token inválido ou expirado;
- entrada inválida;
- alteração de campo protegido;
- repetição de operação crítica;
- excesso de requisições.

## 13. Não enfraquecer segurança para corrigir bugs

É proibido corrigir defeitos removendo autenticação, autorização, validação, TLS, testes, verificação de certificado ou controles equivalentes.

Também é proibido usar indiscriminadamente `any`, `@ts-ignore`, CORS aberto, permissões administrativas amplas ou blocos de exceção vazios para esconder problemas.

## 14. Dependências exigem avaliação

Toda nova dependência deve ser informada no plano.

Avaliar necessidade, manutenção, licença, vulnerabilidades, compatibilidade, impacto no bundle e dependências transitivas.

## 15. Bloqueio de segurança

A implementação deve ser interrompida quando houver:

- ausência de definição de autorização em operação sensível;
- tenant determinado apenas por entrada do usuário;
- segredo real no código;
- armazenamento inseguro de senha;
- query ou comando inseguro;
- solicitação para remover controle de segurança;
- upload sem controles mínimos;
- operação crítica sem autorização ou idempotência;
- exposição intencional de dado sensível;
- impossibilidade de determinar quem pode acessar um recurso.

Nesses casos, responder com:

- regra afetada;
- risco identificado;
- impacto possível;
- motivo do bloqueio;
- alternativa segura;
- decisão humana necessária.
