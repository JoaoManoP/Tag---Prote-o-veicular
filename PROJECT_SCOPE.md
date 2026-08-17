# Escopo do RastroTack

O RastroTack oferece rastreamento veicular, planejamento de rotas, histórico, cercos e telemetria consentida. O mapa é o elemento principal, com contextos distintos para rastreamento e navegação.

## Mapa

- Google Maps é o provedor principal quando configurado.
- Leaflet/OpenStreetMap permanece como fallback operacional.
- A chave nunca é versionada e deve ser restrita no Google Cloud.
- O mapa é criado uma vez e seus objetos são atualizados incrementalmente.
- O HUD existente evolui sem copiar interfaces de outros produtos.

## Implementação incremental

1. Carregamento e configuração segura do mapa.
2. Busca e geocodificação.
3. Rotas e instruções.
4. Marcador veicular, interpolação e câmera.
5. Navegação, POIs e eventos viários.
6. 3D com fallback 2D.

Funcionalidade e segurança têm prioridade sobre volume de recursos.
