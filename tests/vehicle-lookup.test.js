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

test('TrustCar preserva licença e rejeita host inesperado', async () => {
  const valid=new TrustCarImageProvider({fetchImpl:async()=>({ok:true,json:async()=>({found:true,image_url:'https://cdn.trustcar.info/carphotos/onix.jpg',source:'wikimedia',license:'CC BY-SA 4.0',author:'Autor',attribution:'Crédito',reference:'Q1'})})});
  assert.equal((await valid.search({make:'Chevrolet',model:'Onix',year:2022})).license,'CC BY-SA 4.0');
  const unsafe=new TrustCarImageProvider({fetchImpl:async()=>({ok:true,json:async()=>({found:true,image_url:'https://example.invalid/car.jpg'})})});
  assert.equal(await unsafe.search({make:'Chevrolet',model:'Onix'}),null);
});

test('serviço deduplica consulta e reutiliza caches persistentes', async () => {
  const database=createDatabase(':memory:');let vehicleCalls=0,imageCalls=0;
  const service=new VehicleLookupService({database,logger:{info(){},warn(){}},vehicleProvider:{lookup:async()=>{vehicleCalls++;return{make:'GM',model:'ONIX 1.0MT LT',manufactureYear:2021,modelYear:2022,color:'Branco',fuel:'Flex',type:'AUTOMOVEL',provider:'mock'}}},imageProvider:{search:async()=>{imageCalls++;return{found:true,url:'https://cdn.trustcar.info/onix.jpg',source:'wikimedia',license:'CC',author:null,attribution:null,reference:null}}}});
  const [first,same]=await Promise.all([service.lookup('ABC1D23'),service.lookup('ABC1D23')]);
  assert.equal(first.vehicle.make,'Chevrolet');assert.equal(same.vehicle.model,'Onix');assert.equal(vehicleCalls,1);assert.equal(imageCalls,1);
  const cached=await service.lookup('ABC1D23');assert.equal(cached.cached,true);assert.equal(vehicleCalls,1);database.close();
});
