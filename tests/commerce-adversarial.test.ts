import { test } from 'node:test';
import assert from 'node:assert/strict';
import { product } from './fixtures.ts';
import { checkoutReady, commerceReducer, initialCommerce, parseCommerce } from '../src/commerce.ts';
import { readStored, writeStored } from '../src/browserStorage.ts';

function storage() {
    const data = new Map<string, string>();
    const failures = { read: false, write: false };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem(key: string) { if (failures.read) throw Error('Read denied'); return data.get(key) ?? null; },
        setItem(key: string, value: string) { if (failures.write) throw Error('Quota exceeded'); data.set(key, value); }
    } });
    return { data, failures };
}

test('transient unreadable storage cannot later overwrite previously unseen records', () => {
    const { data, failures } = storage(), key = 'failed-read';
    data.set(key, '{"orders":["retained"]}');
    failures.read = true;
    assert.deepEqual(readStored(key, JSON.parse, {}), {});
    failures.read = false;
    assert.throws(() => writeStored(key, {}), /could not be read/);
    assert.equal(data.get(key), '{"orders":["retained"]}');
    assert.deepEqual(readStored(key, raw => JSON.parse(raw!), {}), { orders: ['retained'] });
    writeStored(key, { orders: ['retained'], cart: [] });
    assert.match(data.get(key)!, /retained/);
});

test('parser failure preserves original bytes before fallback can be saved', () => {
    const { data } = storage(), key = 'parser-failure', raw = '{"valuable":"original"}';
    data.set(key, raw);
    readStored(key, () => { throw Error('Unexpected parser failure'); }, {});
    writeStored(key, {});
    assert.ok([...data].some(([k, v]) => k.startsWith(key + '.recovery.') && v === raw));
});

test('failed legacy migration cannot create a fallback record that shadows legacy data', () => {
    const { data } = storage(), key = 'migration-failure';
    data.set('legacy-record', '{"orders":["retained"]}');
    readStored(key, () => { throw Error('Legacy storage unavailable'); }, {});
    assert.throws(() => writeStored(key, {}), /could not be read/);
    assert.equal(data.has(key), false);
    assert.equal(data.get('legacy-record'), '{"orders":["retained"]}');
});

test('failed writes do not advance the baseline or destroy saved orders', () => {
    const { data, failures } = storage(), key = 'write-failure';
    data.set(key, '{"orders":["old"]}');
    readStored(key, raw => JSON.parse(raw!), {});
    failures.write = true;
    assert.throws(() => writeStored(key, { orders: ['old', 'new'] }), /Quota/);
    assert.equal(data.get(key), '{"orders":["old"]}');
    failures.write = false;
    writeStored(key, { orders: ['old', 'new'] });
    data.set(key, '{"orders":["another-tab"]}');
    assert.throws(() => writeStored(key, { orders: [] }), /Newer browser data/);
    assert.equal(data.get(key), '{"orders":["another-tab"]}');
});

test('a failed recovery backup leaves the malformed source untouched', () => {
    const { data, failures } = storage(), key = 'backup-failure';
    data.set(key, 'broken data with recoverable content');
    readStored(key, () => ({}), {});
    failures.write = true;
    assert.throws(() => writeStored(key, {}), /Quota/);
    assert.equal(data.get(key), 'broken data with recoverable content');
    failures.write = false;
    writeStored(key, {});
    assert.ok([...data].some(([k, v]) => k.startsWith(key + '.recovery.') && v.includes('recoverable')));
});

function placedOrder() {
    const p = product();
    const cart = commerceReducer(initialCommerce(), { type: 'add', product: p, variantKey: p.variants[0].key });
    return commerceReducer(cart, { type: 'checkout', brandId: p.brandId, catalogue: [p], id: 'DEMO-retained', date: '2026-10-18' });
}

test('malformed explicit currencies and conflicting historical tenants are not relabelled', () => {
    const state = placedOrder(), order = state.orders[0];
    for (const mutation of [{ currency: null }, { currency: 123 }, { currency: {} }, { brandId: 'other-store' }]) {
        const bad = { ...order, id: 'DEMO-corrupt', lines: [{ ...order.lines[0], ...mutation }] };
        const restored = parseCommerce(JSON.stringify({ ...state, orders: [bad, order] }));
        assert.deepEqual(restored.orders, [order]);
    }
});

test('checkout snapshots current variant data and retains history without any enabled catalogue', () => {
    const p = product();
    const cart = commerceReducer(initialCommerce(), { type: 'add', product: p, variantKey: p.variants[0].key });
    const changed = { ...p, brandName: 'Updated shop', variants: p.variants.map(v => ({ ...v, title: 'Updated title', amount: 42.125, currency: 'KWD' })) };
    assert.equal(checkoutReady(cart.cart, [changed]), true);
    const state = commerceReducer(cart, { type: 'checkout', brandId: p.brandId, catalogue: [changed], id: 'DEMO-updated', date: '2026-10-18' });
    assert.equal(state.orders[0].lines[0].size, 'Updated title');
    assert.equal(state.orders[0].brandName, 'Updated shop');
    assert.equal(state.orders[0].lines[0].price, 42.125);
    assert.equal(state.orders[0].lines[0].currency, 'KWD');
    assert.deepEqual(parseCommerce(JSON.stringify(state)), state);
    assert.equal(checkoutReady(cart.cart, []), false);
    assert.deepEqual(commerceReducer(state, { type: 'checkout', brandId: p.brandId, catalogue: [], id: 'DEMO-disabled', date: '2026-10-18' }), state);
});
