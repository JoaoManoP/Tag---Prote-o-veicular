# Mapa e navegação

## Configuração

```env
MAP_PROVIDER=maplibre
MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
GEOCODING_PROVIDER=photon
ROUTE_PROVIDER=osrm

# Fallback opcional
GOOGLE_MAPS_API_KEY=
GOOGLE_MAPS_MAP_ID=
```

MapLibre, OpenFreeMap, Photon e OSRM não exigem chave. Se `MAP_PROVIDER=google` for escolhido, a chave web é entregue ao navegador somente para carregar o Maps JavaScript API e precisa de restrição por domínio e por API.

## Arquitetura atual

`map-service.js` seleciona o provedor e oferece uma interface compatível às camadas existentes. O padrão é MapLibre com o estilo vetorial Liberty do OpenFreeMap. A geocodificação usa Photon com Nominatim como fallback. Rotas continuam isoladas no backend e usam OSRM por padrão; Google permanece opcional.

## Próximas etapas

- Visão 3D carregada sob demanda com fallback 2D.

## Recursos implementados

- Instruções de manobra normalizadas de Google Routes ou OSRM.
- HUD de navegação com próxima manobra, ETA, distância e velocidade.
- Veículo 2D próprio com heading, interpolação e câmera de acompanhamento.
- Suspensão do acompanhamento quando o usuário arrasta o mapa.
- Perspectiva inclinada e retorno explícito ao modo 2D, sem trânsito ao vivo.
- Catálogo espacial de radares, lombadas e pedágios consultado por proximidade.

O importador do catálogo é executado com `npm run road-events:import -- caminho/maparadar.csv`. A API limita o raio e a quantidade devolvida para não renderizar a base nacional inteira.

Não testar mudanças diretamente na VPS: validar localmente, depois staging, deploy e healthcheck.
