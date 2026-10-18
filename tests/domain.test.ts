import {test} from 'node:test';
import assert from 'node:assert/strict';
import {products,selectProducts,toggleId,previewTryOn} from '../src/domain.ts';
test('brand selection never leaks another brand',()=>{for(const id of ['violet','nimble','lume']){const found=selectProducts(products,id);assert.equal(found.length,2);assert.ok(found.every(p=>p.brandId===id));}assert.equal(selectProducts(products).length,6);});
test('repeated saves remain unique and toggle off',()=>{let ids:string[]=[];for(let i=0;i<20;i++)ids=toggleId(ids,'p1');assert.deepEqual(ids,[]);assert.deepEqual(toggleId(['p1'],'p2'),['p1','p2']);});
test('search and category intersect with brand scope',()=>{assert.equal(selectProducts(products,'nimble','sneaker','Sneakers')[0].id,'p5');assert.equal(selectProducts(products,'violet','sneaker').length,0);});
test('try-on adapter explicitly reports a simulated still photo',async()=>{const result=await previewTryOn(products[0]);assert.equal(result.simulated,true);assert.equal(result.image,products[0].image);});
