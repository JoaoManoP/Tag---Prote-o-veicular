# Imagens de veículos

O Rastreon nunca deduz uma foto a partir da placa nem apresenta a imagem de outro modelo para preencher o card. A consulta por placa pode retornar uma **imagem ilustrativa do modelo**, enquanto uma foto do veículo físico exige uma fonte vinculada ao VIN ou uma imagem fornecida pelo usuário.

## Consulta por placa

1. O provedor da placa identifica marca, modelo, ano/modelo e versão.
2. O servidor normaliza aliases de fabricante e separa o nome do modelo dos dados de acabamento, motor e câmbio.
3. O TrustCar/CarAPI recebe marca, nome completo do modelo, ano/modelo e versão, quando disponíveis.
4. A imagem só é aceita quando a resposta confirma:
   - fabricante e modelo exatos, sem correspondência apenas por uma palavra;
   - título da foto compatível com a mesma fabricante e o mesmo modelo;
   - ano solicitado, quando o ano foi informado;
   - versão, quando o provedor também devolve esse metadado;
   - URL HTTPS em `cdn.trustcar.info` ou `upload.wikimedia.org`;
   - origem Wikimedia, atribuição e licença reutilizável (CC0, CC BY, CC BY-SA ou domínio público).

A busca não reduz mais `Onix Plus` para `Onix`, por exemplo, e não remove o ano para forçar um resultado. Uma resposta como `Chevrolet Vectra` cuja foto esteja identificada como `Opel Vectra` também é rejeitada.

Se o provedor não confirmar esses dados, o servidor devolve `/images/vehicle-placeholder.svg`. Esse arquivo é explicitamente um placeholder genérico e não representa o veículo consultado.

## Cache

- A chave de `vehicle_image_cache` inclui fabricante, modelo, ano e versão. Acabamentos diferentes não compartilham silenciosamente o mesmo resultado de cache.
- O TTL padrão das imagens é de 90 dias.
- Ao ler um resultado antigo da consulta por placa, o servidor revalida a imagem usando a regra estrita atual. Assim, uma URL armazenada pelo algoritmo anterior não continua sendo exibida somente por estar no cache da placa.
- Resultados negativos também são armazenados para evitar consultas repetitivas ao provedor.

## Imagem vinculada ao VIN

Cadastros que possuem VIN de 17 caracteres podem utilizar a Auto.dev por meio da rota autenticada `GET /api/vehicles/:id/image`, quando não existe uma imagem já associada ao cadastro. A chave da Auto.dev permanece no backend. Configure:

```env
AUTO_DEV_API_KEY=
TRUSTCAR_IMAGE_URL=https://carapi.trustcar.info/getImage
```

O VIN é armazenado no servidor, mas a API pública expõe somente `hasVin` e os quatro caracteres finais.

## Limitações

- A foto do TrustCar representa o modelo catalogado; ela não comprova cor, placa, acessórios nem o veículo físico do usuário.
- O TrustCar atualmente pode não confirmar o acabamento/versão na resposta. Nesse caso, a imagem continua sendo apenas de modelo e ano, nunca anunciada como foto exata da versão.
- Se não houver correspondência segura e licenciada, permanecer sem foto específica é o comportamento esperado.

## Testes

Execute:

```powershell
node --test tests/vehicle-lookup.test.js
```

Os testes usam providers simulados. Eles cobrem modelo parcial, outra fabricante no título, ano e versão divergentes, host não autorizado, licença incompatível, separação de cache por versão e atualização de imagem antiga.
