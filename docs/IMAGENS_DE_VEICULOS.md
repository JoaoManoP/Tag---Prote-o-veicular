# Imagens de veículos

O cadastro por placa usa imagens ilustrativas de marca/modelo fornecidas pelo TrustCar/CarAPI, com metadados do Wikimedia Commons quando disponíveis. Cadastros antigos que possuem VIN ainda podem utilizar a integração Auto.dev. Nenhuma imagem é gerada ou inventada.

## Fluxo

1. A placa identifica marca, modelo, ano e tipo do veículo.
2. Quando o cadastro possui VIN (chassi) de 17 caracteres, o servidor consulta `GET /photos/{vin}` na Auto.dev.
3. O navegador recebe apenas a rota autenticada `/api/vehicles/:id/image`; a chave da Auto.dev nunca é enviada ao cliente.
4. Se a Auto.dev não possuir foto para aquele VIN, o card permanece sem imagem.

Configure `AUTO_DEV_API_KEY` no `.env`. O VIN é armazenado no servidor, mas a API pública do projeto expõe somente `hasVin` e os quatro caracteres finais.

O arquivo `public/js/vehicle-images.js` apenas valida e apresenta a URL fornecida pelo servidor. A consulta de placa não substitui automaticamente o VIN: para imagens exatas, a fonte de cadastro ou o futuro app deve enviar o chassi junto com os demais dados do veículo.
