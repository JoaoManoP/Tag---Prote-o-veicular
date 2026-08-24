# Auditoria inicial do RASTREON

Data: 17/08/2026

## Stack

- Frontend: HTML, CSS e JavaScript sem framework, servido pelo Express.
- Backend: Node.js 22, Express 4 e Socket.IO 4.
- Banco: SQLite por `node:sqlite`, migrations próprias.
- Autenticação: sessão persistida no SQLite, cookie HttpOnly/SameSite e bcrypt.
- Autorização: propriedade por `user_id` e papéis USER/ADMIN/DEVELOPER.
- Mapa: MapLibre/OpenFreeMap por padrão; facade Google opcional; Leaflet como fallback.
- Geocodificação direta e reversa: Photon; Google opcional; Nominatim somente em instância própria/contratada.
- Rotas: OSRM por padrão; Google Routes opcional.
- POIs: OpenStreetMap/Overpass.
- WebSocket: Socket.IO com sessão web ou token móvel escopado.
- Mobile: página web responsiva demonstrativa; aplicativo nativo ainda ausente.
- Build: validação sintática; não há bundling da aplicação principal.
- Deploy versionado: Nginx + Node em `127.0.0.1:3000`; process manager real da VPS não validado.

## Funcional

- Cadastro, login, logout e sessão persistente.
- CRUD e isolamento de veículos, viagens, cercos e locais salvos.
- Rotas alternativas, instruções, HUD e navegação web em primeiro plano.
- Tracking consentido por QR/código, fila offline e WebSocket protegido.
- Histórico, reconstrução explícita de lacunas e alertas internos.
- Consulta de POIs, catálogo viário e consulta de placa por provider.
- CI, lint, testes unitários, integração e segurança de Socket/API.

## Parcial

- Navegação diária: primeiro plano web com voz, paradas e rerouting; sem background nativo ou teste físico concluído.
- Google Maps/Routes/Places: adapters existentes, credencial/billing não configurados.
- Consulta de placa: adapter existente, credencial externa ausente.
- Eventos viários: catálogo/importador existente, cobertura depende de fonte importada.
- Administração e laboratório: backend protegido implementado nesta fase; falta teste visual autenticado.
- Deploy: configuração versionada, VPS real não inspecionada.

## Simulado

- Diagnósticos de veículo e cenários de falha.
- Tag física e telemetria ECU/OBD/CAN.
- Alguns cenários de deslocamento usados nos testes do painel.

## Não implementado

- Aplicativo Android/iOS nativo e Navigation SDK.
- GPS em background/tela bloqueada.
- Google Login, identidade, CNH e documentos.
- Push externo, cobrança e integrações com hardware veicular.
- Map matching real, mapa offline e 3D veicular completo.
- Mapa offline e aplicativo de navegação nativa.

## Segurança

- Não foram localizadas chaves Google ou segredos reais versionados pelo scan inicial.
- `npm audit --omit=dev`: zero vulnerabilidades conhecidas em 17/08/2026.
- Tokens móveis são armazenados somente como SHA-256 no banco.
- Corrigido nesta fase: token do QR migrou da query para o fragmento da URL.
- Corrigido nesta fase: consentimento ativo passou a ser persistido e exigido antes da telemetria.
- Corrigido nesta fase: Admin/Lab passaram a ter autorização real no servidor.
- Pendente: rotação independente de credenciais de dispositivo e auditoria dos ambientes externos.

## Riscos

- Crítico: nenhum confirmado no código versionado após as correções desta fase.
- Alto: credenciais externas sem validação real e VPS não auditada.
- Médio: dependência de instâncias públicas OSRM/Overpass; navegação web interrompida em background; prazos jurídicos de retenção ainda não aprovados.
- Baixo: documentação incompleta, arquivos de runtime locais e artefato legado `client/dist` sem fonte associada.

## Ordem de correção

1. Segurança crítica, consentimento, autorização e segredos.
2. Infraestrutura, readiness, logs e backup.
3. Rotas, rerouting, paradas, voz e POIs.
4. GPS/devices/WebSocket e histórico.
5. Cerco, eventos viários, placa e FIPE.
6. Identidade/documentos e LGPD.
7. Mobile nativo/background.
8. Staging, VPS, smoke tests e auditoria final.
