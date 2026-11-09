import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseNavigation,scopeHref} from '../src/navigationScope.ts';
test('URL context preserves shop routes but explicit exits clear it',()=>{
  assert.equal(scopeHref('#/cart','mock'),'#/cart?brand=mock');
  assert.equal(scopeHref('#/','mock'),'#/brand/mock');
  assert.equal(scopeHref('#/','mock',true),'#/');
  assert.equal(scopeHref('#/brands','mock'),'#/brands');
  assert.deepEqual(parseNavigation('#/cart?brand=mock'),{route:'/cart',brandId:'mock'});
  assert.equal(parseNavigation('#/').brandId,'');
  assert.equal(scopeHref('https://example.com','mock'),'https://example.com');
});
test('owning product and checkout identity override conflicting query context',()=>{
  for(const type of ['product','try','photos']) assert.equal(parseNavigation('#/'+type+'/'+encodeURIComponent('apparel:gid://shopify/Product/1')+'?brand=mock').brandId,'apparel');
  assert.equal(parseNavigation('#/checkout/apparel?brand=mock').brandId,'apparel');
  assert.equal(parseNavigation('#/brand/apparel?brand=mock').brandId,'apparel');
  assert.equal(parseNavigation('#/cart?brand=%3Cscript%3E').brandId,'');
  assert.doesNotThrow(()=>parseNavigation('#/product/%'));
});
