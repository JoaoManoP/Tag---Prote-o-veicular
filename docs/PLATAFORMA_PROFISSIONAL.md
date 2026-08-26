# Plataforma profissional RASTREON

Estado técnico consolidado em 25/08/2026.

## Funcional de verdade

- Mapa MapLibre vetorial com modos 2D, 3D explorar e 3D navegação, prédios extrudados quando o estilo fornece dados e fallback automático por capacidade do aparelho.
- Modelo 3D do veículo selecionado, posição atual sem trilha no mapa ao vivo e trajetória somente no histórico/reprodução.
- Busca de endereço por Photon, rotas por OSRM, POIs por OpenStreetMap/Overpass e clima pelo backend.
- Postos permanentes, histórico de preços, favoritos, benefícios com validade, comentários, respostas, reações, fotos moderadas e denúncias.
- Ocorrências temporárias com expiração, confirmação, resolução, origem comunitária visível e projeção no mapa.
- Solicitação de conversa com consentimento, bloqueio, chat privado e PX regional sem compartilhar e-mail, telefone, placa ou coordenada pessoal.
- Histórico com mapa, dados GPS brutos preservados, distância filtrada, tempo observado e reconstruções rotuladas como prováveis.
- RBAC, CSRF, rate limit, CSP, auditoria, exportação/exclusão LGPD e TOTP/2FA para ações administrativas.
- Adaptadores `MobileGpsProvider`, `DemoTrackerDeviceProvider` e `TraccarProvider`; ingestão Traccar idempotente e IMEI transformado em HMAC.

## Dependências externas

- Trânsito oficial no mapa requer `MAP_PROVIDER=google`, chave restrita e faturamento do Google Maps. Sem isso, o botão exibe somente relatos comunitários, nunca fluxo oficial inventado.
- J16 físico requer servidor Traccar homologado e dois segredos fortes. A integração fica desligada por padrão.
- Notificações externas/push dependem de credenciais Expo/APNs/FCM. As notificações internas e preferências já funcionam.
- Bloqueio físico remoto permanece indisponível (`FEATURE_REMOTE_BLOCK_HARDWARE=false`) até existir hardware e protocolo homologados.
- Publicação em lojas e validação GPS em background exigem dispositivos e contas Apple/Google reais.

## Fontes e confiança

Cada tela diferencia dados oficiais/licenciados, externos abertos, comunitários, estimados e simulados. POIs indicam OpenStreetMap; trânsito comunitário é marcado como não oficial; reconstrução não substitui GPS bruto; preço enviado fica pendente; foto passa por moderação.

## Operação

Antes de produção execute `npm run predeploy` e `npm --prefix mobile run check`. Faça backup SQLite, valide `/api/health` e `/api/ready`, reinicie o processo e realize smoke de login, mapa, busca, rota, POIs, histórico, comunidade e logout.
