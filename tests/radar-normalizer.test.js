'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeRadar,areProbableDuplicates}=require('../server/radar/radar-normalizer');
test('normaliza radar mantendo fonte e confiança explícitas',()=>{const radar=normalizeRadar({latitude:-19.52,longitude:-42.62,type:'fixed_speed_camera',road:'BR-381',speedLimit:60,provider:'DNIT',sourceKind:'OFFICIAL',verified:true});assert.equal(radar.provider,'DNIT');assert.equal(radar.verified,true);assert.equal(radar.confidence,.9);assert.equal(radar.fingerprint.length,64)});
test('rejeita coordenadas e limites inválidos',()=>{assert.throws(()=>normalizeRadar({latitude:100,longitude:0,provider:'DER-MG'}));assert.throws(()=>normalizeRadar({latitude:-19,longitude:-43,provider:'DER-MG',speedLimit:500}))});
test('deduplica por proximidade e identidade da via',()=>{const a=normalizeRadar({latitude:-19.5,longitude:-42.6,road:'BR-381',provider:'DNIT'}),b=normalizeRadar({latitude:-19.50005,longitude:-42.60005,road:'BR-381',provider:'ANTT'});assert.equal(areProbableDuplicates(a,b),true);assert.equal(areProbableDuplicates(a,{...b,road:'MG-425'}),false)});
