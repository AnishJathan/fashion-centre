import assert from 'node:assert/strict';
import test from 'node:test';
import { followedBrands, nextBrandOffset } from '../src/followedBrands.ts';
import type { Brand } from '../src/core/domain.ts';

const store = (id: string, name = id): Brand => ({ id, name, image: '', products: [], more: false });

test('followed brands contain only loaded stores in distinct follow order, without mutating inputs', () => {
  const brands = [store('a'), store('b'), store('c')];
  const followed = ['c', 'missing', 'a', 'c', 'disabled'];
  const snapshot = structuredClone({ brands, followed });
  const result = followedBrands(brands, followed);
  assert.deepEqual(result.map(brand => brand.id), ['c', 'a']);
  assert.strictEqual(result[0], brands[2]);
  assert.strictEqual(result[1], brands[0]);
  assert.deepEqual({ brands, followed }, snapshot);
});

test('no follows or unavailable references remain empty instead of substituting loaded stores', () => {
  const brands = [store('available')], followed = ['missing', 'disabled'];
  assert.deepEqual(followedBrands(brands, []), []);
  assert.deepEqual(followedBrands(brands, followed), []);
  assert.deepEqual(followedBrands([], followed), []);
  assert.deepEqual(followed, ['missing', 'disabled']);
});

test('follow changes and reloaded metadata take effect while equal names keep their own identities', () => {
  const a = store('a', 'Same name'), b = store('b', 'Same name');
  assert.deepEqual(followedBrands([a, b], ['b']).map(brand => brand.id), ['b']);
  assert.deepEqual(followedBrands([a, b], ['a']).map(brand => brand.id), ['a']);
  assert.deepEqual(followedBrands([a], ['b']), []);
  const updated = { ...b, name: 'Updated storefront', image: 'local-image' };
  assert.strictEqual(followedBrands([a, updated], ['b'])[0], updated);
});

test('automatic offsets move rightward visually by reducing scroll offset and wrapping at the start', () => {
  let offset = 0;
  const positions = Array.from({ length: 6 }, () => (offset = nextBrandOffset(offset, 300)));
  assert.deepEqual(positions, [300, 184, 68, 0, 300, 184]);
  assert.equal(nextBrandOffset(500, 300), 184);
  assert.equal(nextBrandOffset(10, 300), 0);
  assert.equal(nextBrandOffset(.5, 300), 300);
  assert.equal(nextBrandOffset(100, 300, 40), 60);
});

test('no overflow or non-finite bounds cannot create an automatic scroll offset', () => {
  for (const maximum of [0, -10, Number.NaN, Infinity, -Infinity]) {
    assert.equal(nextBrandOffset(100, maximum), 0);
  }
});
