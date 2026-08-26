# Mapa e navegação

## Configuração

```env
MAP_PROVIDER=maplibre
MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
MAPBOX_WEB_PUBLIC_TOKEN=
GEOCODING_PROVIDER=mapbox
PHOTON_API_URL=https://photon.komoot.io
NOMINATIM_BASE_URL=
ROUTE_PROVIDER=osrm
OVERPASS_API_URL=https://overpass-api.de/api/interpreter

# Fallback opcional
GOOGLE_MAPS_API_KEY=
GOOGLE_MAPS_MAP_ID=
```

MapLibre, OpenFreeMap, Photon e OSRM não exigem chave. Se `MAP_PROVIDER=google` for escolhido, a chave web é entregue ao navegador somente para carregar o Maps JavaScript API e precisa de restrição por domínio e por API.

## Arquitetura atual

`map-service.js` seleciona o provedor e oferece uma interface compatível às camadas existentes. O padrão é MapLibre com o estilo vetorial Liberty do OpenFreeMap. A geocodificação direta e reversa usa Photon; Google permanece opcional. Nominatim só é habilitado quando `NOMINATIM_BASE_URL` aponta para uma instância própria ou contratada, pois o serviço público proíbe autocomplete e aplicações cuja função principal seja rastreamento. Rotas continuam isoladas no backend e usam OSRM por padrão.

## Modo 3D e pesquisa Google

O modo 3D usa o estilo vetorial Liberty, prédios extrudados disponíveis na fonte,
câmera inclinada e o modelo GLB próprio do veículo. Em economia de dados,
conexão 2G ou dispositivo com pouca memória, o mapa retorna ao modo padrão.

A avaliação completa da alternativa Google, incluindo Places Autocomplete,
Routes, Roads, licenciamento de rastreamento e segurança de chaves, está em
`docs/GOOGLE_MAPS_RESEARCH.md`. Resultados Google não são desenhados sobre
MapLibre; uma habilitação futura deve trocar a cadeia inteira para Google Maps.

## Recursos implementados

- Localização atual sob demanda com a Geolocation API do navegador.
- Navegação diária em primeiro plano, sem exigir sessão de rastreamento e sem enviar a posição ao backend.
- Origem da rota preenchida pela localização atual mediante consentimento.
- POIs próximos da localização autorizada: postos, restaurantes, hotéis, hospitais, farmácias, mercados, oficinas, carregadores, estacionamentos e postos policiais.
- POIs ao longo da rota em um corredor aproximado de 1,2 km, com amostragem limitada para proteger o serviço externo.
- Instruções de manobra normalizadas de Google Routes ou OSRM.
- HUD de navegação com próxima manobra, ETA, distância e velocidade.
- Veículo 2D próprio com heading, interpolação e câmera de acompanhamento.
- Suspensão do acompanhamento quando o usuário arrasta o mapa.
- Perspectiva inclinada e retorno explícito ao modo 2D, sem trânsito ao vivo.
- Catálogo espacial de radares, lombadas e pedágios consultado por proximidade.

O importador do catálogo é executado com `npm run road-events:import -- caminho/maparadar.csv`. A API limita o raio e a quantidade devolvida para não renderizar a base nacional inteira.

Não testar mudanças diretamente na VPS: validar localmente, depois staging, deploy e healthcheck.
