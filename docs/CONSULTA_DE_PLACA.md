# Consulta de placa no Rastreon

O Rastreon consulta dados públicos do veículo pelo Falcon Data Hub e busca uma imagem ilustrativa do modelo no TrustCar/CarAPI. Tokens ficam exclusivamente no backend.

## Configuração

```env
FALCON_API_TOKEN=
FALCON_API_BASE_URL=https://beta.falcon-server.com.br/data-hub
TRUSTCAR_IMAGE_URL=https://carapi.trustcar.info/getImage
```

A rota Falcon efetivamente disponível é `GET /private/v1/vehicles/{placa}/search`. Reinicie o servidor depois de alterar o `.env`.

## Endpoint interno

```text
GET /api/vehicles/lookup/ABC1D23
```

A rota exige uma sessão autenticada, normaliza placas antigas e Mercosul e limita cada usuário a cinco consultas por minuto. O frontend recebe somente o contrato normalizado; credenciais, resposta bruta, dados pessoais, chassi e proprietário não são retornados.

## Cache e fallback

- `vehicle_lookup_cache`: uma entrada por placa, TTL de 30 dias.
- `vehicle_image_cache`: uma entrada por marca, modelo e ano, TTL de 90 dias.
- Consultas simultâneas da mesma placa são deduplicadas.
- Se Falcon falhar e existir cache, o resultado persistido é utilizado.
- Se a imagem falhar, os dados veiculares continuam disponíveis e o Rastreon mostra `/images/vehicle-placeholder.svg`.
- O cadastro manual continua disponível quando a consulta externa falha.

As imagens do TrustCar são ilustrativas. Fonte, licença, autoria, atribuição e referência são preservadas quando fornecidas.

## Testes

Execute `npm test`. A suíte usa providers simulados e não consome a Falcon ou o TrustCar reais.
