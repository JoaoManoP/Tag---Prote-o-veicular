import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

globalThis.FileReader=class FileReader{
  readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.()})}
  readAsDataURL(blob){blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.()})}
};

const scene=new THREE.Scene();
scene.name='RastreonSedan';
const car=new THREE.Group();car.name='RastreonSedanMarker';scene.add(car);
const material=(name,color,metalness,roughness)=>new THREE.MeshStandardMaterial({name,color,metalness,roughness});
const body=material('Carroceria_Branca',0xf7f7f5,.42,.28);
const glass=material('Vidros_Pretos',0x101418,.08,.18);glass.transparent=true;glass.opacity=.88;
const tire=material('Pneus_Pretos',0x101010,.04,.76);
const wheel=material('Rodas_Grafite',0x353535,.68,.24);
const accent=material('Detalhes_Rastreon_Laranja',0xff6a00,.32,.3);
const light=material('Farois_Brancos',0xfaf3d0,.18,.2);light.emissive.setHex(0x554410);light.emissiveIntensity=.35;
const rearLight=material('Lanternas_Traseiras',0xa71912,.2,.3);

const add=(name,geometry,mat,position,rotation=[0,0,0])=>{const mesh=new THREE.Mesh(geometry,mat);mesh.name=name;mesh.position.set(...position);mesh.rotation.set(...rotation);car.add(mesh);return mesh};
add('Carroceria',new RoundedBoxGeometry(1.58,.48,3.3,5,.14),body,[0,.54,0]);
add('SaiasLaterais',new RoundedBoxGeometry(1.66,.16,2.65,3,.05),accent,[0,.35,-.02]);
add('Cabine',new RoundedBoxGeometry(1.34,.58,1.58,5,.16),body,[0,1.01,-.13]);
add('Teto',new RoundedBoxGeometry(1.2,.13,1.13,4,.07),body,[0,1.34,-.17]);
add('Parabrisa',new RoundedBoxGeometry(1.13,.035,.52,3,.025),glass,[0,1.17,.52],[-.48,0,0]);
add('VidroTraseiro',new RoundedBoxGeometry(1.13,.035,.45,3,.025),glass,[0,1.17,-.77],[.5,0,0]);
add('VidroLateralEsquerdo',new RoundedBoxGeometry(.035,.33,1.12,3,.025),glass,[-.685,1.08,-.13]);
add('VidroLateralDireito',new RoundedBoxGeometry(.035,.33,1.12,3,.025),glass,[.685,1.08,-.13]);
add('FaixaFrontal',new RoundedBoxGeometry(1.25,.12,.08,3,.025),accent,[0,.56,1.67]);
add('GradeFrontal',new RoundedBoxGeometry(.72,.14,.055,3,.02),wheel,[0,.42,1.7]);
add('ParaChoqueTraseiro',new RoundedBoxGeometry(1.28,.12,.08,3,.025),wheel,[0,.43,-1.69]);
for(const x of [-.53,.53]){
  add(`Farol_${x<0?'E':'D'}`,new RoundedBoxGeometry(.34,.12,.055,3,.025),light,[x,.64,1.69]);
  add(`Lanterna_${x<0?'E':'D'}`,new RoundedBoxGeometry(.32,.14,.055,3,.025),rearLight,[x,.64,-1.69]);
}
for(const x of [-.82,.82])for(const z of [-1.08,1.08]){
  add(`Pneu_${x}_${z}`,new THREE.CylinderGeometry(.32,.32,.2,20),tire,[x,.37,z],[0,0,Math.PI/2]);
  add(`Roda_${x}_${z}`,new THREE.CylinderGeometry(.18,.18,.215,16),wheel,[x,.37,z],[0,0,Math.PI/2]);
  add(`Centro_${x}_${z}`,new THREE.CylinderGeometry(.065,.065,.225,12),accent,[x,.37,z],[0,0,Math.PI/2]);
}
add('EmblemaRastreon',new THREE.CylinderGeometry(.1,.1,.035,20),accent,[0,.79,1.68],[Math.PI/2,0,0]);

car.traverse(object=>{if(object.isMesh){object.castShadow=false;object.receiveShadow=false}});
const exporter=new GLTFExporter();
const result=await exporter.parseAsync(scene,{binary:true,onlyVisible:true,trs:false});
await fs.writeFile(new URL('../public/models/vehicles/rastreon-sedan-clean.glb',import.meta.url),Buffer.from(result));
console.log(`GLB criado: ${result.byteLength} bytes, ${car.children.length} meshes.`);
