# Escopo funcional do RastroTack

O mapa deve apresentar veículo, rota e informações relevantes sem transformar a experiência em um painel cheio de caixas. Em desktop ele usa uma moldura compacta; em telas pequenas e no modo automotivo volta a ocupar a área útil disponível.

Estados previstos: `TRACKING`, `ROUTE_PLANNING`, `NAVIGATION`, `GEOFENCE` e `HISTORY`. Cada estado deve mostrar apenas seus controles necessários.

Integrações externas ficam atrás de providers no backend. Consulta veicular, FIPE e eficiência são fontes distintas. Dados de radares e outros eventos devem ser consultados por área ou rota, com agrupamento; nunca se deve renderizar a base nacional inteira de uma vez.

O arquivo de referência visual é inspiração conceitual. Cores, assets e organização de terceiros não devem ser copiados.
