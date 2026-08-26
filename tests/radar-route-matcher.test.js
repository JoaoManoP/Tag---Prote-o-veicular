'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {matchRadarsToRoute}=require('../server/radar/radar-route-matcher');
const route=[{latitude:-19.5,longitude:-42.6},{latitude:-19.5,longitude:-42.58}];
test('seleciona radar perto da LineString e ordena pelo progresso',()=>{const result=matchRadarsToRoute(route,[{id:'later',latitude:-19.5001,longitude:-42.585},{id:'first',latitude:-19.5001,longitude:-42.595}],{maxDistanceMeters:80});assert.deepEqual(result.map(item=>item.id),['first','later']);assert.ok(result.every(item=>item.distanceFromRouteMeters<80))});
test('ignora rua paralela e sentido oposto',()=>{const result=matchRadarsToRoute(route,[{id:'parallel',latitude:-19.502,longitude:-42.59},{id:'opposite',latitude:-19.5,longitude:-42.59,direction:270}],{maxDistanceMeters:80});assert.deepEqual(result,[])});
