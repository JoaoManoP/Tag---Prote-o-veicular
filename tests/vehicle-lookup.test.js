'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../server/database');
const { normalizePlate, isValidPlate, normalizeVehicleModel, FalconVehicleProvider, TrustCarImageProvider, VehicleLookupService } = require('../server/vehicle-lookup');

test('normaliza e valida placas antigas e Mercosul sem chamar provider', () => {
  assert.equal(normalizePlate('abc-1d23'), 'ABC1D23');
  assert.equal(normalizePlate(' ABC-1234 '), 'ABC1234');
  assert.equal(isValidPlate('ABC1234'), true);
  assert.equal(isValidPlate('ABC1D23'), true);
  for (const value of ['123', 'AAAAAAA', 'ABC#123']) assert.equal(isValidPlate(value), false);
});

test('normalizador preserva originais e simplifica fabricante e modelo', () => {
  assert.deepEqual(normalizeVehicleModel('GM', 'ONIX 1.0MT LT'), { makeOriginal: 'GM', makeNormalized: 'Chevrolet', modelOriginal: 'ONIX 1.0MT LT', modelNormalized: 'Onix', version: '1.0MT LT' });
  assert.deepEqual(normalizeVehicleModel('VW', 'GOL 1.0 MI'), { makeOriginal: 'VW', makeNormalized: 'Volkswagen', modelOriginal: 'GOL 1.0 MI', modelNormalized: 'Gol', version: '1.0 MI' });
  assert.deepEqual(normalizeVehicleModel('GM/CHEVROLET', 'ONIX PLUS PREMIER 1.0 TURBO'), { makeOriginal: 'GM/CHEVROLET', makeNormalized: 'Chevrolet', modelOriginal: 'ONIX PLUS PREMIER 1.0 TURBO', modelNormalized: 'Onix Plus', version: 'PREMIER 1.0 TURBO' });
  assert.deepEqual(normalizeVehicleModel('PEUGEOT', '208 ALLURE 1.6'), { makeOriginal: 'PEUGEOT', makeNormalized: 'Peugeot', modelOriginal: '208 ALLURE 1.6', modelNormalized: '208', version: 'ALLURE 1.6' });
});

test('Falcon usa rota fixa, Bearer e resposta veicular normalizada', async () => {
  let captured;
  const provider = new FalconVehicleProvider({ token: 'segredo', baseUrl: 'https://falcon.example/data-hub', fetchImpl: async (url, options) => { captured={url,options};return{ok:true,status:200,json:async()=>({data:{placa:'ABC1D23',marca:'GM',modelo:'ONIX 1.0MT LT',ano:2021,ano_modelo:2022,cor:'BRANCO',combustivel:'FLEX',tipo:'AUTOMOVEL'}})}; } });
  const value=await provider.lookup('abc-1d23');
  assert.equal(captured.url,'https://falcon.example/data-hub/private/v1/vehicles/ABC1D23/search');
  assert.equal(captured.options.headers.Authorization,'Bearer segredo');
  assert.equal(value.modelYear,2022);
  await assert.rejects(()=>provider.lookup('123'),error=>error.code==='INVALID_PLATE');
});

test('TrustCar consulta marca, modelo, ano e versão e preserva a licença', async () => {
  let requestedUrl;
  const valid = new TrustCarImageProvider({ fetchImpl: async url => {
    requestedUrl = new URL(url);
    return { ok: true, json: async () => ({
      found: true,
      make: 'Chevrolet',
      model: 'Onix',
      year: 2022,
      title: 'Chevrolet Onix',
      image_url: 'https://cdn.trustcar.info/carphotos/onix.jpg',
      source: 'wikimedia',
      license: 'CC BY-SA 4.0',
      author: 'Autor',
      attribution: 'Chevrolet Onix — © Autor (CC BY-SA 4.0), via Wikimedia Commons',
      reference: 'Q1'
    }) };
  } });
  const image = await valid.search({ make: 'GM', model: 'Onix', year: 2022, version: '1.0 LT' });
  assert.equal(requestedUrl.searchParams.get('make'), 'Chevrolet');
  assert.equal(requestedUrl.searchParams.get('model'), 'Onix');
  assert.equal(requestedUrl.searchParams.get('year'), '2022');
  assert.equal(requestedUrl.searchParams.get('version'), '1.0 LT');
  assert.equal(image.license, 'CC BY-SA 4.0');
  assert.match(image.attribution, /Autor/);
});

test('TrustCar rejeita imagem sem correspondência exata ou licença reutilizável', async t => {
  const base = {
    found: true,
    make: 'Chevrolet',
    model: 'Onix Plus',
    year: 2022,
    title: 'Chevrolet Onix Plus',
    image_url: 'https://cdn.trustcar.info/carphotos/onix-plus.jpg',
    source: 'wikimedia',
    license: 'CC BY-SA 4.0',
    attribution: 'Chevrolet Onix Plus — © Autor (CC BY-SA 4.0), via Wikimedia Commons'
  };
  const search = async (overrides, query = { make: 'Chevrolet', model: 'Onix Plus', year: 2022 }) => {
    const provider = new TrustCarImageProvider({ fetchImpl: async () => ({ ok: true, json: async () => ({ ...base, ...overrides }) }) });
    return provider.search(query);
  };

  await t.test('modelo parcial', async () => {
    assert.equal(await search({ model: 'Onix', title: 'Chevrolet Onix' }), null);
  });
  await t.test('título de outra fabricante', async () => {
    assert.equal(await search({ make: 'Chevrolet', model: 'Vectra', title: 'Opel Vectra', attribution: 'Opel Vectra — © Autor (CC BY-SA 4.0)' }, { make: 'Chevrolet', model: 'Vectra', year: 2022 }), null);
  });
  await t.test('ano divergente', async () => {
    assert.equal(await search({ year: 2021 }), null);
  });
  await t.test('versão divergente quando informada pelo provedor', async () => {
    assert.equal(await search({ version: 'Premier' }, { make: 'Chevrolet', model: 'Onix Plus', year: 2022, version: 'LT' }), null);
  });
  await t.test('host não autorizado', async () => {
    assert.equal(await search({ image_url: 'https://example.invalid/car.jpg' }), null);
  });
  await t.test('licença incompatível', async () => {
    assert.equal(await search({ license: 'All rights reserved' }), null);
  });
});

test('serviço deduplica consulta e reutiliza caches persistentes', async () => {
  const database=createDatabase(':memory:');let vehicleCalls=0,imageCalls=0;
  const service=new VehicleLookupService({database,logger:{info(){},warn(){}},vehicleProvider:{lookup:async()=>{vehicleCalls++;return{make:'GM',model:'ONIX 1.0MT LT',manufactureYear:2021,modelYear:2022,color:'Branco',fuel:'Flex',type:'AUTOMOVEL',provider:'mock'}}},imageProvider:{search:async()=>{imageCalls++;return{found:true,url:'https://cdn.trustcar.info/onix.jpg',source:'wikimedia',license:'CC',author:null,attribution:null,reference:null}}}});
  const [first,same]=await Promise.all([service.lookup('ABC1D23'),service.lookup('ABC1D23')]);
  assert.equal(first.vehicle.make,'Chevrolet');assert.equal(same.vehicle.model,'Onix');assert.equal(vehicleCalls,1);assert.equal(imageCalls,1);
  database.prepare("UPDATE vehicle_lookup_cache SET image_json = ? WHERE plate = 'ABC1D23'").run(JSON.stringify({ found: true, url: 'https://example.invalid/wrong-model.jpg' }));
  const cached=await service.lookup('ABC1D23');assert.equal(cached.cached,true);assert.equal(cached.vehicle.image.url,'https://cdn.trustcar.info/onix.jpg');assert.equal(vehicleCalls,1);assert.equal(imageCalls,1);database.close();
});

test('serviço não degrada para modelo abreviado nem remove o ano', async () => {
  const database = createDatabase(':memory:');
  const attempts = [];
  const service = new VehicleLookupService({
    database,
    logger: { info() {}, warn() {} },
    imageProvider: { search: async query => { attempts.push(query); return null; } }
  });
  const image = await service.resolveImage({ make: 'GM/CHEVROLET', model: 'ONIX PLUS PREMIER 1.0 TURBO', modelYear: 2022 });
  assert.equal(image.found, false);
  assert.deepEqual(attempts, [
    { make: 'Chevrolet', model: 'Onix Plus', version: 'PREMIER 1.0 TURBO', year: 2022 }
  ]);
  assert.ok(attempts.every(attempt => attempt.model === 'Onix Plus' && attempt.year === 2022 && attempt.version === 'PREMIER 1.0 TURBO'));
  database.close();
});

test('cache de imagem separa versões do mesmo modelo e ano', async () => {
  const database = createDatabase(':memory:');
  let calls = 0;
  const service = new VehicleLookupService({
    database,
    logger: { info() {}, warn() {} },
    imageProvider: { search: async () => ({ found: true, url: `https://cdn.trustcar.info/${++calls}.jpg`, source: 'wikimedia', license: 'CC BY 4.0', author: 'Autor', attribution: 'Crédito', reference: null }) }
  });
  const lt = await service.resolveImage({ make: 'Chevrolet', model: 'Onix', version: 'LT', modelYear: 2022 });
  const premier = await service.resolveImage({ make: 'Chevrolet', model: 'Onix', version: 'Premier', modelYear: 2022 });
  assert.notEqual(lt.url, premier.url);
  assert.equal(calls, 2);
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM vehicle_image_cache').get().total, 2);
  database.close();
});
