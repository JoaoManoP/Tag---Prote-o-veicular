# Arquitetura

## Componentes

```text
Navegador web / navegador móvel
        |
        | HTTPS + cookie de sessão / token móvel escopado
        v
Express + Socket.IO
        |
        +-- SQLite (fonte persistente)
        +-- Providers de mapa, geocodificação, rota, placa e POIs
        +-- Comunidade, preços, fotos, conversas, PX e notificações
        +-- Adaptadores Mobile GPS / Demo / Traccar
```

O backend é a fonte de verdade persistente. Socket.IO transporta eventos em tempo real. O frontend mantém apenas estado de apresentação, preferências locais não sensíveis e fila GPS offline do dispositivo.

## Contextos do mapa

- `TRACKING`: posição e alertas do veículo.
- `ROUTE_PLANNING`: origem, destino, alternativas e estimativas.
- `NAVIGATION`: localização do aparelho, manobras, ETA e câmera.
- `GEOFENCE`: busca, forma, raio e veículo.
- `HISTORY`: percurso salvo e reconstruções explicitamente prováveis.

## Limites de confiança

- GPS bruto nunca é substituído por reconstrução.
- Simulação nunca é apresentada como ECU/OBD real.
- Placa retorna apenas atributos públicos do veículo.
- POIs e eventos carregam a fonte; ausência de provider não gera dados inventados.
- Trânsito oficial só é ativado com provider licenciado; relatos comunitários são visualmente identificados.
- IMEI/identificador externo do rastreador físico não atravessa a fronteira pública da API.
