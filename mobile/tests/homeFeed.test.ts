import assert from 'node:assert/strict';
import test from 'node:test';
import { HOME_FEED_BATCH, homeFeedRows, homeProductKey, uniqueHomeProducts } from '../src/homeFeed.ts';
import type { Product } from '../src/core/domain.ts';
const product = (id: string, brandId = 'store'): Product => ({ id, brandId, name: id, brandName: brandId, category: 'Tops', image: '', moreVariants: false, variants: [] });

test('home feed removes repeated identities without losing distinct stores or mutating input', () => {
  const p = product('a');
  const products = [p, product('b'), { ...p, name: 'Repeated' }, product('a', 'other')];
  const before = JSON.stringify(products);
  assert.deepEqual(uniqueHomeProducts(products), [products[0], products[1], products[3]]);
  assert.notEqual(homeProductKey(product('a:b', 'c')), homeProductKey(product('b', 'c:a')));
  assert.equal(JSON.stringify(products), before);
  assert.deepEqual(uniqueHomeProducts([]), []);
});

test('bounded row batches preserve exact order and every product through responsive column changes', () => {
  const products = Array.from({ length: 19 }, (_, i) => product(String(i)));
  for (const columns of [1, 2, 3, 4]) for (const count of [HOME_FEED_BATCH, 12, 18, 24]) {
    const rows = homeFeedRows(products, count, columns);
    assert.deepEqual(rows.flatMap(row => row.products), products.slice(0, count));
    assert.ok(rows.every(row => row.products.length <= columns && row.products.length > 0));
    assert.equal(new Set(rows.map(row => row.key)).size, rows.length);
  }
  assert.deepEqual(homeFeedRows([], 6, 2), []);
  assert.deepEqual(homeFeedRows(products, NaN, 2), []);
  assert.deepEqual(homeFeedRows(products, -1, 2), []);
  assert.equal(homeFeedRows(products, 3, NaN).length, 3);
});
