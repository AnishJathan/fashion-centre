import { test } from 'node:test';
import assert from 'node:assert/strict';
import { product } from './fixtures.ts';
import { initialCommerce, commerceReducer, parseCommerce, checkoutReady, totals } from '../src/commerce.ts';
import { parseCatalogue, parseSources, decodeRoute, money, validMoney } from '../src/domain.ts';
import { readStored, writeStored } from '../src/browserStorage.ts';
import { encodedDimensions, validateDimensions } from '../src/photoPreparation.ts';
test('cart edits use stable variant keys even when titles match', () => { const p = product(); p.variants[1] = { ...p.variants[1], title: 'M', available: true }; let s = initialCommerce(); for (const v of p.variants)
    s = commerceReducer(s, { type: 'add', product: p, variantKey: v.key }); s = commerceReducer(s, { type: 'quantity', productId: p.id, size: 'M', variantKey: p.variants[0].key, quantity: 3 }); assert.deepEqual(s.cart.map(l => l.quantity), [3, 1]); s = commerceReducer(s, { type: 'remove', productId: p.id, size: 'M', variantKey: p.variants[0].key }); assert.equal(s.cart.length, 1); assert.equal(s.cart[0].variantKey, p.variants[1].key); });
test('one malformed order never resets good cart or valid historical order', () => { const p = product(); let s = commerceReducer(initialCommerce(), { type: 'add', product: p, variantKey: p.variants[0].key }); s = commerceReducer(s, { type: 'checkout', brandId: p.brandId, catalogue: [p], id: 'DEMO-good', date: '2026-10-18' }); s = commerceReducer(s, { type: 'add', product: p, variantKey: p.variants[0].key }); const raw = { ...s, orders: [null, { id: 3 }, { id: 'DEMO-bad', brandId: 'mock', date: '2026-10-18', lines: [null] }, ...s.orders] }; const result = parseCommerce(JSON.stringify(raw)); assert.deepEqual(result.cart, s.cart); assert.deepEqual(result.orders, s.orders); });
test('invalid money and cross-store records cannot check out', () => { const p = product(), s = commerceReducer(initialCommerce(), { type: 'add', product: p, variantKey: p.variants[0].key }); assert.equal(checkoutReady([{ ...s.cart[0], brandId: 'other' }], [p]), false); for (const amount of [NaN, Infinity, -1, 1e100, 1.234])
    assert.equal(checkoutReady(s.cart, [{ ...p, variants: [{ ...p.variants[0], amount }] }]), false); });
test('money formatting and totals honor currency minor units', () => { assert.equal(money(123, 'JPY'), 'JPY 123'); assert.equal(money(1.234, 'KWD'), 'KWD 1.234'); assert.deepEqual(totals([{ price: 1.234, currency: 'KWD', quantity: 3 }, { price: 100, currency: 'JPY', quantity: 2 }]), [{ currency: 'KWD', amount: 3.702 }, { currency: 'JPY', amount: 200 }]); assert.equal(validMoney(1, 'XYZ'), false); });
test('catalogue shape and scoped identity validation fails closed', () => { const p = product(); const base = { shopKey: 'mock', shopName: 'Mock', hasNextPage: false, products: [{ key: p.id, title: p.name, category: 'Shirts', image: 'https://evil.test/track', moreVariants: false, variants: p.variants }] }; assert.equal(parseCatalogue('mock', base).products[0].image, ''); for (const products of [[{ ...base.products[0], variants: null }], [{ ...base.products[0], key: 'other:gid://shopify/Product/1' }], [base.products[0], base.products[0]]])
    assert.throws(() => parseCatalogue('mock', { ...base, products })); assert.throws(() => parseSources({ shops: [{ key: 'mock', name: 'Mock' }, { key: 'mock', name: 'Again' }] })); assert.throws(() => parseSources({ shops: null })); assert.equal(decodeRoute('%'), null); });

test('combined listings accept identical shared variants but reject conflicting definitions', () => {
    const p = product(), item = {key:p.id,title:p.name,category:'Shirts',image:'',moreVariants:false,variants:p.variants};
    const combined = {...item,key:'mock:gid://shopify/Product/2',variants:p.variants.map(v=>({...v,amount:String(v.amount)}))};
    const base = {shopKey:'mock',shopName:'Mock',hasNextPage:false,products:[item,combined]};
    assert.equal(parseCatalogue('mock',base).products.length,2);
    for(const change of [{amount:99},{available:false},{title:'Conflicting title'},{options:{Size:'XXL'}},{currency:'USD'}]) {
        const conflict={...combined,variants:[{...combined.variants[0],...change},...combined.variants.slice(1)]};
        assert.throws(()=>parseCatalogue('mock',{...base,products:[item,conflict]}));
    }
    assert.throws(()=>parseCatalogue('mock',{...base,products:[{...item,variants:[p.variants[0],p.variants[0]]}]}));
});
test('storage guards stale writes and backs up malformed original bytes', () => { const map = new Map<string, string>(); Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => map.set(k, v) }, configurable: true }); map.set('test-recovery', 'broken raw'); const value = readStored('test-recovery', () => ({ cart: [] }), {}); writeStored('test-recovery', value); assert.ok([...map.entries()].some(([k, v]) => k.startsWith('test-recovery.recovery.') && v === 'broken raw')); readStored('test-conflict', raw => raw, null); map.set('test-conflict', 'newer'); assert.throws(() => writeStored('test-conflict', 'old'), /Newer browser data/); assert.equal(map.get('test-conflict'), 'newer'); });
test('encoded image dimensions can reject decompression bombs before decode', () => { const b = new Uint8Array(24); b.set([73, 72, 68, 82], 12); const v = new DataView(b.buffer); v.setUint32(16, 50000); v.setUint32(20, 50000); assert.deepEqual(encodedDimensions('image/png', b), { width: 50000, height: 50000 }); assert.throws(() => validateDimensions(50000, 50000), /dimensions exceed/); assert.equal(encodedDimensions('image/jpeg', new Uint8Array([255, 216, 255])), null); });
test('aggregate totals reject unsafe integer overflow instead of completing checkout', () => { const variants = Array.from({ length: 21 }, (_, i) => ({ ...product().variants[0], key: 'v' + i, amount: 500399958596.72 })); const p = { ...product(), variants }; let s = initialCommerce(); for (const v of variants) {
    s = commerceReducer(s, { type: 'add', product: p, variantKey: v.key });
    s = commerceReducer(s, { type: 'quantity', productId: p.id, size: v.title, variantKey: v.key, quantity: 9 });
} assert.equal(s.cart.length, 21); assert.equal(checkoutReady(s.cart, [p]), false); });

test('queued quantity deltas operate on current state and stay bounded',()=>{const p=product();let s=commerceReducer(initialCommerce(),{type:'add',product:p,variantKey:p.variants[0].key});const action={type:'adjust' as const,productId:p.id,size:p.variants[0].title,variantKey:p.variants[0].key,delta:1};s=commerceReducer(commerceReducer(s,action),action);assert.equal(s.cart[0].quantity,3);for(let i=0;i<20;i++)s=commerceReducer(s,action);assert.equal(s.cart[0].quantity,9)});
