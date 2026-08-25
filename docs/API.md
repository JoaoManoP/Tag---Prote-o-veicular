# API da Rastreon

Todas as APIs de domínio exigem a sessão `rastro.sid`. Credenciais e chaves de provedores permanecem no backend.

## Conta e perfil

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/auth/me`, `GET /api/profile`

## Veículos e proteção

- `GET|POST /api/vehicles`
- `GET|PUT|DELETE /api/vehicles/:id`
- `POST /api/vehicles/:id/select`
- `GET|PUT /api/vehicles/:id/schedule`
- `GET|POST /api/vehicles/:id/geofences`
- `PUT|DELETE /api/geofences/:id`
- `GET /api/alerts`, `PATCH /api/alerts/:id/read`

## Viagens e telemetria

- `POST /api/sessions`, `GET /api/sessions/:id`
- `GET|POST /api/trips`, `GET /api/trips/:id`
- `PATCH /api/trips/:id/finish`
- `POST /api/trips/:id/reconstruct`
- `POST /api/simulations/offline`

Socket.IO transporta posições ao vivo e lotes offline. Cada ponto móvel deve possuir `sequence` e `timestamp`; o servidor confirma sequências e ignora duplicatas.

## Providers

- `GET /api/geocode`
- `GET /api/route`
- `POST /api/consumption/estimate`

O formato interno separa distância, duração estática, duração com trânsito, geometria, pedágios e campos indisponíveis. `ROUTE_PROVIDER` seleciona `osrm` ou `google`.

## Plataforma e comunidade v1

As rotas novas estão disponíveis em `/api/v1/platform` e, por compatibilidade, `/api/platform`.

- `GET /status`, `GET /search`
- `GET /stations`, `POST /stations/:id/prices`, `POST|DELETE /stations/:id/favorite`
- `GET|POST /road-reports`, `PUT /road-reports/:id/vote`
- `GET|POST /comments/:entityType/:entityId`, `PUT /comments/:id/reaction`
- `POST /photos`, `GET /photos/:id/content`
- `GET|PATCH /chat/settings`, solicitações, conversas e mensagens
- canais/mensagens `/px`
- `GET /notifications`, preferências e marcação de leitura
- filas administrativas e auditoria em `/admin`
- vínculos Traccar e feature flags em `/developer`
- webhook `POST /integrations/traccar/positions`

Escritas exigem `X-CSRF-Token`. Escritas administrativas/developer exigem também `X-Two-Factor-Code`. Fotos aceitam somente JPEG, PNG ou WebP válido de até 5 MB.

Avaliações de locais continuam versionadas em `/api/v1/community` e `/api/community`.

## Segurança 2FA

- `GET /api/security/2fa/status`
- `POST /api/security/2fa/setup`
- `POST /api/security/2fa/enable`
- `POST /api/security/2fa/disable`

O segredo é cifrado em AES-256-GCM e códigos de recuperação são armazenados somente como HMAC.
