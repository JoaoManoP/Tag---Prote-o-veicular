# STACK: NEXT.JS

- Diferenciar claramente código de servidor e cliente.
- Não mover segredos ou operações privilegiadas para Client Components.
- Variáveis públicas devem ser tratadas como expostas.
- Route Handlers e Server Actions devem validar entrada, autenticação e autorização.
- Middleware não deve ser a única barreira de segurança.
- Avaliar cache, revalidação e risco de vazamento entre usuários ou tenants.
- Não serializar dados sensíveis para o cliente.
- Proteger redirects, URLs externas e ações mutáveis.
