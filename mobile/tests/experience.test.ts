import assert from 'node:assert/strict';
import test from 'node:test';
import { moodProducts, studioProducts, moods, storyCopy } from '../src/experience.ts';
import type { Product } from '../src/core/domain.ts';

function product(id: string, name: string, category: string): Product {
  return { id, name, category, brandId: 'demo', brandName: 'Demo', image: '', variants: [], moreVariants: false };
}
const catalogue = [
  product('tee', 'Cotton TEE', 'Tops'),
  product('dress', 'Satin slip', 'Dress'),
  product('bag', 'Small bag', 'Accessories'),
  product('denim', 'Wide-leg denim', 'Trousers'),
  product('plain', 'Plain knit', 'Knitwear'),
];
const ids = (items: Product[]) => items.map(item => item.id);

test('moods filter name and category case-insensitively in catalogue order', () => {
  assert.deepEqual(ids(moodProducts(catalogue, 'everyday')), ['tee', 'denim']);
  assert.deepEqual(ids(moodProducts(catalogue, 'evening')), ['dress']);
  assert.deepEqual(ids(moodProducts(catalogue, 'finishing')), ['bag']);
  assert.deepEqual(ids(moodProducts(catalogue, 'all')), ids(catalogue));
  assert.deepEqual(ids(moodProducts(catalogue, 'unknown')), ids(catalogue));
});

test('studio intersects mood with exact category and handles no matches', () => {
  assert.deepEqual(ids(studioProducts(catalogue, 'everyday', 'Trousers')), ['denim']);
  assert.deepEqual(ids(studioProducts(catalogue, 'everyday', 'All')), ['tee', 'denim']);
  assert.deepEqual(ids(studioProducts(catalogue, 'unknown', 'Dress')), ['dress']);
  assert.deepEqual(studioProducts(catalogue, 'evening', 'Tops'), []);
  assert.deepEqual(studioProducts(catalogue, 'all', 'dress'), []);
  assert.deepEqual(studioProducts(catalogue, 'all', 'Missing'), []);
});

test('empty catalogues and repeated filters do not mutate inputs', () => {
  const input = catalogue.map(item => Object.freeze({ ...item, variants: Object.freeze([]) })) as unknown as Product[];
  Object.freeze(input);
  const before = JSON.stringify(input);
  for (const mood of [...moods.map(item => item.id), 'unknown']) {
    assert.deepEqual(moodProducts([], mood), []);
    assert.deepEqual(studioProducts([], mood, 'All'), []);
    assert.deepEqual(moodProducts(input, mood), moodProducts(input, mood));
    studioProducts(input, mood, 'All');
  }
  assert.equal(JSON.stringify(input), before);
  assert.equal(moodProducts(input, 'everyday')[0], input[0]);
});

test('three editorial chapters point to supported discovery moods', () => {
  assert.equal(storyCopy.length, 3);
  assert.equal(new Set(storyCopy.map(item => item.kicker)).size, 3);
  for (const chapter of storyCopy) {
    assert.ok(moods.some(mood => mood.id === chapter.mood));
    assert.ok(chapter.title && chapter.description);
  }
});
