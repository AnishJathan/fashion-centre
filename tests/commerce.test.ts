import {test} from 'node:test';
import assert from 'node:assert/strict';
import {products} from '../src/domain.ts';
import {commerceReducer,initialCommerce,parseCommerce,cartTotal,sizesFor,validQuantity} from '../src/commerce.ts';
test('cart merges repeated adds by product and size, keeps variants separate, caps quantity',()=>{
 let state=initialCommerce();for(let i=0;i<12;i++)state=commerceReducer(state,{type:'add',product:products[0],size:'M'});
 assert.equal(state.cart.length,1);assert.equal(state.cart[0].quantity,9);
 state=commerceReducer(state,{type:'add',product:products[0],size:'L'});assert.equal(state.cart.length,2);assert.equal(cartTotal(state.cart,products),1190);
 assert.equal(commerceReducer(state,{type:'add',product:products[0],size:'not-a-size'}),state);
 assert.deepEqual(sizesFor(products[4]),['EU 38','EU 39','EU 40','EU 41','EU 42']);
});
test('invalid quantities do not mutate the cart; removing twice is safe',()=>{
 let state=commerceReducer(initialCommerce(),{type:'add',product:products[0],size:'M'});
 for(const quantity of [0,-1,10,1.5,NaN,Infinity]){assert.equal(validQuantity(quantity),false);assert.equal(commerceReducer(state,{type:'quantity',productId:'p1',size:'M',quantity}),state);}
 state=commerceReducer(state,{type:'quantity',productId:'p1',size:'M',quantity:3});assert.equal(state.cart[0].quantity,3);
 for(let i=0;i<2;i++)state=commerceReducer(state,{type:'remove',productId:'p1',size:'M'});assert.equal(state.cart.length,0);
});
test('demo checkout isolates brands, snapshots prices and cannot duplicate repeated completions',()=>{
 let state=initialCommerce();for(const product of [products[0],products[1]])state=commerceReducer(state,{type:'add',product,size:'M'});
 const action={type:'checkout' as const,brandId:'violet',catalogue:products,id:'DEMO-test-1',date:'2026-10-18'};
 state=commerceReducer(state,action);assert.equal(state.cart.length,1);assert.equal(state.cart[0].productId,'p2');assert.equal(state.orders.length,4);assert.equal(state.orders[0].lines[0].price,119);assert.equal(state.orders[0].sample,true);
 assert.equal(commerceReducer(state,{...action,id:'DEMO-test-2'}),state);assert.equal(commerceReducer(state,action),state);
});
test('storage round trip preserves cart, sample orders and preferences; invalid storage is safe',()=>{
 let state=commerceReducer(initialCommerce(),{type:'add',product:products[0],size:'S'});
 state=commerceReducer(state,{type:'preferences',value:{style:'Minimal',fit:'Relaxed',updates:true}});
 assert.deepEqual(parseCommerce(JSON.stringify(state)),state);assert.deepEqual(parseCommerce('{broken'),initialCommerce());
 const corrupt={...state,cart:[{productId:'p1',size:'S',quantity:0},{productId:'missing',size:'M',quantity:1},{productId:'p1',size:'M',quantity:2},{productId:'p1',size:'M',quantity:3}]};
 assert.deepEqual(parseCommerce(JSON.stringify(corrupt)).cart,[{productId:'p1',size:'M',quantity:2}]);
});
