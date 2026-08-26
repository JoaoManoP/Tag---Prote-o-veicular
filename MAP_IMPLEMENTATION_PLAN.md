# Plano de evolução do mapa RASTREON

## Estado auditado em 25/08/2026

### Stack atual

- Backend: Node.js 24, Express 4, Socket.IO 4 e SQLite.
- Web: HTML, CSS e JavaScript sem framework, servidos pelo Express.
- Mobile: Expo 54, React Native 0.81, Expo Router e `react-native-maps`.
- Mapa web principal: MapLibre GL JS 6.4, encapsulado por uma facade compatível com a API usada pelo dashboard.
- Fallbacks: Google Maps quando configurado e Leaflet/OpenStreetMap como contingência operacional.
- Rotas: OSRM por padrão; Google Routes opcional no backend.
- Geocodificação: Photon por padrão; Mapbox, Google e Nominatim próprio/contratado disponíveis por adapter.
- POIs: OpenStreetMap/Overpass consultado pelo backend, com cache em memória, limites e corredor de rota.
- Persistência geográfica atual: SQLite com índices por latitude/longitude. PostGIS não está instalado.

### Funcionalidades que devem ser preservadas

- Login, sessão, autorização por proprietário e proteção CSRF.
- Rastreamento GPS consentido, fila offline e Socket.IO.
- Cadastro de veículos e adaptação Traccar.
- Viagens, rotas alternativas, histórico, replay e reconstrução de lacunas.
- Cercas virtuais, horários autorizados e alertas internos.
- Modo 3D, veículo 3D/2D, heading, interpolação e acompanhamento de câmera.
- Comunidade, postos, preços, avaliações e relatos temporários já presentes.

## Problemas e lacunas encontrados

1. O catálogo `road_events` é genérico e ainda não guarda todos os metadados de confiabilidade exigidos para radares oficiais.
2. O importador existente aceita CSV local, mas não possui adapters oficiais separados por órgão nem relatório estruturado de sincronização de Minas Gerais.
3. A consulta atual é radial. Falta um contrato de viewport explícito e estável para todas as camadas.
4. Ainda não existe correspondência radar–LineString reutilizável que considere distância, heading e sentido.
5. O tráfego oficial só existe no provider Google. MapLibre expõe corretamente apenas relatos comunitários, sem inventar fluxo.
6. SQLite não oferece PostGIS/GIST. Para o volume atual, bounding box + cálculo exato é aceitável; uma migração futura deve ser aditiva e medida.
7. Preferências de camadas estão distribuídas entre controles e `localStorage`; precisam convergir para um único estado.
8. O mapa mobile usa outra implementação e deve receber a evolução depois da estabilização dos contratos web/backend.

## Arquitetura proposta

```text
Map UI / Mobile UI
       |
       +-- /api/map/radars (viewport)
       +-- /api/map/radars/nearby (raio)
       +-- /api/map/poi e /nearby
       +-- /api/map/reports
       +-- /api/map/traffic
       +-- /api/navigation/route/radars
       |
Map services
       +-- RadarService
       +-- RadarRouteMatcher
       +-- PoiProvider
       +-- TrafficProvider
       +-- MapReportService
       |
Adapters de dados
       +-- DER-MG
       +-- DNIT/ANTT
       +-- BHTrans
       +-- TransCon
       +-- Nova 381
```

Todo registro geográfico terá fonte (`OFFICIAL`, `COMMUNITY`, `PARTNER` ou `SIMULATION`), nome do provedor, data de verificação e confiança. Providers externos não serão chamados diretamente pela interface.

## Arquivos desta primeira etapa

### Novos

- `MAP_IMPLEMENTATION_PLAN.md`
- `server/radar/radar-normalizer.js`
- `server/radar/radar-route-matcher.js`
- `tests/radar-route-matcher.test.js`
- `tests/radar-normalizer.test.js`

### Alterados

- `server/road-events.js`: contrato profissional de radares e consulta por viewport.
- `server/server.js`: endpoints aditivos em `/api/map/radars` e `/api/navigation/route/radars`.
- `server/migrations.js`: metadados aditivos de fonte, verificação, confiança, via, km, cidade e estado.
- `package.json`: scripts de validação dos novos módulos.
- `docs/API.md`, `docs/MAPA_E_NAVEGACAO.md` e exemplos de ambiente conforme cada provider for habilitado.

## Migrações

- Manter SQLite na etapa inicial e adicionar colunas sem apagar ou recriar registros.
- Índices de latitude/longitude continuam atendendo consultas limitadas por viewport.
- Avaliar PostgreSQL/PostGIS somente após medir volume, latência e operação. Uma migração futura deverá usar `GEOGRAPHY(Point,4326)` e GIST, com execução paralela e rollback documentado.

## APIs e variáveis externas

- OSM/OpenFreeMap/Overpass/Photon/OSRM permanecem os defaults sem chave, sujeitos às políticas e limites dos serviços públicos.
- `MAP_STYLE_URL`, `OVERPASS_API_URLS`, `PHOTON_API_URL` e `ROUTE_PROVIDER` já existem.
- Tráfego oficial exige provider licenciado. Nenhuma variável nova é obrigatória nesta etapa.
- Providers de radares só serão habilitados quando URL, formato, licença e frequência de atualização forem confirmados. Credenciais nunca irão ao navegador.

## Riscos

- Licença, formato e estabilidade das fontes oficiais de radares.
- Alertas falsos se heading/sentido forem ignorados.
- Limites de Overpass e serviços comunitários em produção.
- Diferenças de capacidade entre MapLibre, Google e Leaflet fallback.
- Regressão de desempenho se marcadores DOM forem carregados sem viewport/clustering.
- Divergência entre web e mobile se contratos não forem estabilizados primeiro.

## Fases de entrega

1. Consolidar contratos de mapa, viewport, POIs, controles de camada e temas.
2. Enriquecer radares, criar adapters oficiais, sincronização MG, deduplicação e auditoria.
3. Integrar tráfego licenciado e RadarRouteMatcher às rotas e alertas de aproximação.
4. Unificar relatos, expiração, confirmação, moderação e tempo real.
5. Adicionar reações veiculares SVG próprias e avaliações contextuais.
6. Completar terreno/edifícios/câmera 3D com fallback por capacidade.
7. Evoluir HUD, Pulso da Via, paradas e timeline de viagem usando dados reais.
8. Aplicar clustering/tiles, cache, mobile bottom sheets e estratégia offline.

Cada fase só será marcada como concluída após testes, lint, build, documentação de fonte e validação de que dados de demonstração não aparecem em produção.
