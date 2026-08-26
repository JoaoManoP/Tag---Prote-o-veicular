# Pesquisa técnica — Google Maps Platform no Rastreon

Pesquisa revisada em 25/08/2026 usando somente documentação oficial.

## Decisão de arquitetura atual

O mapa web continua em MapLibre + OpenFreeMap, a busca usa Photon e as rotas
usam OSRM. Essa composição mantém uma cadeia cartográfica coerente e permite
prédios vetoriais 3D sem misturar resultados licenciados do Google em um mapa de
outro provedor.

As políticas de [Routes](https://developers.google.com/maps/documentation/routes/policies),
[Places](https://developers.google.com/maps/documentation/places/web-service/policies),
[Geocoding](https://developers.google.com/maps/documentation/geocoding/policies) e
[Roads](https://developers.google.com/maps/documentation/roads/policies) exigem
cuidados de exibição, atribuição e armazenamento. Para habilitar a cadeia Google,
o sistema deve mudar de forma coerente para `MAP_PROVIDER=google`, com chaves
separadas e restritas por superfície.

## Busca de endereço

Em modo Google, a opção correta para sugestões durante digitação é
[Places API (New) — Autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete),
com `languageCode=pt-BR`, `regionCode=br`, viés de localização no GPS autorizado,
debounce, cancelamento e token UUID por sessão. A seleção deve terminar em
[Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details)
com máscara mínima de campos.

Geocoding serve para endereço completo e geocodificação reversa, não para uma
requisição a cada tecla. A geração atual usa Photon; o defeito de busca era o
parâmetro `lang=pt`, não aceito pelo endpoint público. Ele foi trocado por
`lang=default`, com proximidade e fallback em resultado vazio.

## Distância, duração e ETA

Em modo Google, usar
[Routes API v2 — Compute Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions)
com origem no GPS atual, `DRIVE`, `TRAFFIC_AWARE` e `departureTime` atual. A
resposta deve pedir apenas distância, duração, duração estática e polilinha. A
duração retornada com trânsito alimenta o ETA.

No modo atual, OSRM calcula distância e duração rodoviárias sem trânsito ao vivo.
O painel deixa essa indisponibilidade explícita e nunca inventa trânsito.

## Veículo sobre a rua e quilometragem

[Roads API — Snap to Roads](https://developers.google.com/maps/documentation/roads/snap)
aceita até 100 pontos por chamada e funciona melhor com amostras de 1 a 10
segundos e menos de 300 m entre pontos. Para rastreamento de ativos, a
[política e cobrança de Roads](https://developers.google.com/maps/documentation/roads/usage-and-billing)
devem ser validadas comercialmente antes da ativação.

Por isso o Rastreon não habilita Google Roads sobre MapLibre. Atualmente ele:

- preserva o GPS bruto como evidência;
- filtra baixa precisão, jitter parado, lacunas e saltos incompatíveis;
- calcula quilometragem somente sobre amostras aceitas;
- alinha apenas a representação visual à rota planejada quando a distância até
  ela é compatível com a incerteza do GPS;
- identifica esse alinhamento como visual, sem alterar coordenadas brutas.

Odômetro realmente preciso continua exigindo hardware automotivo/CAN/OBD ou
telemetria dedicada.

## 3D

No ecossistema Google, o recurso web é
[Maps JavaScript API 3D](https://developers.google.com/maps/documentation/javascript/3d/overview),
carregado somente ao ativar o modo 3D. Modelos usam `Model3DElement` e
`CLAMP_TO_GROUND`; recomenda-se GLB pequeno, carregamento sob demanda e fallback
2D por capacidade/rede.

Na implementação atual, MapLibre usa o estilo vetorial Liberty, a camada de
prédios extrudados disponível no estilo e o GLB próprio do carro. O modo padrão
oculta extrusões; o modo 3D inclina a câmera, acompanha o heading e reduz a
resolução máxima em telas muito densas para preservar desempenho móvel.

## Chaves e custos

Google exige billing e APIs habilitadas. Use chaves distintas para web, servidor,
Android e iOS, cada uma restrita à aplicação e APIs necessárias, conforme as
[práticas de segurança](https://developers.google.com/maps/api-security-best-practices).
Defina quotas e alertas antes de produção. Não reutilize uma chave web no backend.

## Avaliações

Places pode retornar um conjunto limitado de avaliações Google, mas não publica
avaliações pela API. O Rastreon usa comentários próprios, identificados como
“Comunidade Rastreon”, com moderação e feature flag. Uma futura integração Google
deve preservar atribuições e usar o link oficial de escrita do local.
