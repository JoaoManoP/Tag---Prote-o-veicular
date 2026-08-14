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
