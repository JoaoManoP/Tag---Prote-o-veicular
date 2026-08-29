# Comunidade de locais

O módulo `backend/server/community.js` fornece comentários e avaliações de locais sem
acoplar a funcionalidade ao servidor principal. Ele usa o mesmo SQLite e a mesma
sessão autenticada da aplicação.

## Ativação

Defina a variável abaixo no ambiente e reinicie o servidor:

```env
COMMUNITY_PLACES_ENABLED=true
```

O valor padrão é `false`. Mesmo desativado, `GET /api/community/status` responde
`{ "enabled": false, "version": 1 }`, permitindo que a interface esconda todos
os controles comunitários. Os demais endpoints respondem `404` com o código
`COMMUNITY_FEATURE_DISABLED` e as tabelas não são criadas.

## Integração no servidor

Monte o router depois de `express.json()` e do middleware de sessão, mas antes do
fallback `app.use('/api', ...)`:

```js
const { createCommunityRouter } = require('./community');

app.use('/api/community', createCommunityRouter({
  database,
  enabled: process.env.COMMUNITY_PLACES_ENABLED
}));
```

Também inclua `community: parseFeatureFlag(process.env.COMMUNITY_PLACES_ENABLED)`
em `features` no endpoint `/api/capabilities`, para que clientes antigos façam
degradação progressiva.

As escritas exigem o cabeçalho `X-CSRF-Token`. O token é obtido no endpoint já
existente `GET /api/auth/csrf`. O limitador padrão aceita dez contribuições por
usuário por minuto. Ele pode ser substituído ao criar o router:

```js
const { createCommunityRouter, createCommunityWriteLimiter } = require('./community');

createCommunityRouter({
  database,
  writeLimiter: createCommunityWriteLimiter({ windowMs: 60_000, limit: 6 })
});
```

## Endpoints

Todos os endpoints abaixo, exceto `/status`, exigem sessão autenticada.

| Método | Caminho | Uso |
| --- | --- | --- |
| `GET` | `/api/community/status` | Consulta a feature flag. |
| `GET` | `/api/community/places/:placeId/reviews` | Lista avaliações publicadas, resumo e distribuição das notas. Aceita `limit` e `offset`. |
| `POST` | `/api/community/places/:placeId/reviews` | Cria uma avaliação. |
| `PATCH` | `/api/community/reviews/:reviewId` | Altera a própria avaliação. |
| `DELETE` | `/api/community/reviews/:reviewId` | Remove logicamente a própria avaliação. |
| `POST` | `/api/community/reviews/:reviewId/reports` | Denuncia conteúdo publicado. |
| `GET` | `/api/community/moderation/reviews` | Fila de avaliações para administrador. |
| `PATCH` | `/api/community/moderation/reviews/:reviewId` | Oculta ou restaura uma avaliação. |
| `GET` | `/api/community/moderation/reports` | Lista denúncias para administrador. |
| `PATCH` | `/api/community/moderation/reports/:reportId` | Resolve ou descarta uma denúncia. |

Exemplo de criação:

```json
{
  "place": {
    "provider": "google",
    "name": "Praça Primeiro de Maio",
    "address": "Centro, Timóteo - MG",
    "latitude": -19.581,
    "longitude": -42.647
  },
  "rating": 5,
  "comment": "Lugar agradável e bem cuidado."
}
```

Use um identificador estável e com namespace no `placeId`, por exemplo
`google:ChIJ...`, `mapbox:...` ou `osm:node:123`. A API aceita uma avaliação por
usuário em cada local. A nota deve ser um inteiro de 1 a 5 e o comentário deve
ter de 3 a 1.200 caracteres.

## Privacidade e segurança

- Coordenadas no registro `community_places` identificam o local avaliado, não o
  autor.
- GPS, IP, e-mail e identificador interno do autor não são persistidos na
  avaliação nem retornados pela API.
- O limitador funciona em memória e usa somente o ID da sessão como chave.
- O nome público é reduzido para primeiro nome e inicial do último sobrenome.
- Exclusões são lógicas, removem o texto original e preservam somente o registro
  mínimo necessário para auditoria.
- Todas as consultas usam parâmetros SQLite; notas, tamanhos e estados possuem
  validação também no schema.
- No frontend, renderize comentários com `textContent`, nunca com `innerHTML`.

Ao integrar ao fluxo de privacidade, inclua as avaliações e denúncias do titular
na exportação. A exclusão da conta já remove esses registros por `ON DELETE
CASCADE`.
