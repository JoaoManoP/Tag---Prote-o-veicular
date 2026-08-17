# Segurança

## Controles presentes

- Senhas com bcrypt custo 12.
- Sessões persistidas, cookie HttpOnly, SameSite Lax e Secure em produção.
- Helmet/CSP, limites de corpo e rate limiting.
- Isolamento por proprietário nas consultas e mutações principais.
- Papéis administrativos validados no backend.
- Token móvel aleatório, hash no banco, convite por fragmento e código de uso único.
- Consentimento explícito persistido antes de aceitar telemetria.
- Validação, rate limit e idempotência de posições.
- Token CSRF explícito para exclusão da conta, além da validação de origem.
- Validação fail-fast de segredo, HTTPS público e credenciais Google em produção.
- Logs estruturados com identificador de requisição, sem query string.
- Troca de senha autenticada, protegida por CSRF e com revogação das outras sessões.

## Operação obrigatória

- Configurar `SESSION_SECRET` longo e exclusivo em produção.
- Restringir chaves Google por API, plataforma e domínio/aplicativo.
- Nunca registrar tokens, senhas, documentos ou coordenadas desnecessárias.
- Executar backup antes de migrations ou deploy.
- Manter Node atrás de HTTPS/WSS e proxy reverso.

## Pendências

- Rotação/revogação independente de credenciais de dispositivo.
- Ampliar o token CSRF para futuros módulos financeiros e uploads.
- Aprovar e configurar a política de retenção automática.
- Ampliar a trilha administrativa conforme novos atos privilegiados forem criados.
- Testes de upload/documentos quando esse módulo existir.
