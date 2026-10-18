import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalShop} from '../src/merchant.ts';
test('merchant domains normalize only canonical Shopify hosts',()=>{assert.equal(canonicalShop(' My-Brand.myshopify.com '),'my-brand.myshopify.com');for(const s of ['https://brand.myshopify.com','brand.myshopify.com/path','brand.myshopify.com:443','brand.myshopify.com.evil.test','evil@brand.myshopify.com','-brand.myshopify.com','localhost','brand..myshopify.com'])assert.equal(canonicalShop(s),null,s)});
