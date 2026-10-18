import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodedDimensions,validateStillPng} from '../src/photoPreparation.ts';

function chunk(kind:string,length=0){const bytes=new Uint8Array(length+12);new DataView(bytes.buffer).setUint32(0,length);bytes.set(new TextEncoder().encode(kind),4);return bytes}
function png(...chunks:Uint8Array[]){return Uint8Array.from([137,80,78,71,13,10,26,10,...chunks.flatMap(c=>[...c])])}
test('PNG animation and malformed chunk framing are rejected before decode',()=>{
 const header=chunk('IHDR',13);new DataView(header.buffer).setUint32(8,100);new DataView(header.buffer).setUint32(12,100);
 const animated=png(header,chunk('acTL',8),chunk('IEND'));
 assert.deepEqual(encodedDimensions('image/png',animated),{width:100,height:100});
 assert.throws(()=>validateStillPng(animated),/still photo/);
 for(const kind of ['fcTL','fdAT'])assert.throws(()=>validateStillPng(png(header,chunk(kind,4),chunk('IEND'))),/still photo/);
 assert.doesNotThrow(()=>validateStillPng(png(header,chunk('IDAT',4),chunk('IEND'))));
 assert.throws(()=>validateStillPng(png(header,chunk('IDAT',4))),/incomplete/);
 const overflow=chunk('IDAT');new DataView(overflow.buffer).setUint32(0,0xffffffff);
 assert.throws(()=>validateStillPng(png(header,overflow,chunk('IEND'))),/incomplete/);
});
test('malformed encoded dimension data never reads beyond its view',()=>{
 for(const type of ['image/png','image/jpeg','image/webp'])for(let size=0;size<80;size++){
   const base=new Uint8Array(size+8).fill(255),slice=base.subarray(4,4+size);
   assert.doesNotThrow(()=>encodedDimensions(type,slice));
 }
});
