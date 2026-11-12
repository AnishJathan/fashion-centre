import assert from 'node:assert/strict';
import test from 'node:test';
import { homeCategories, homePrice, homeRecommendations, homeSuggestions, homeValueCollections, priceMinima } from '../src/commerceHome.ts';
import type { Product } from '../src/core/domain.ts';
const product = (id: string, category: string, prices: [number, string, boolean][] = []): Product => ({
  id, name: `Style ${id}`, category, brandId: 'sample', brandName: 'Sample Store', image: `/images/${id}.jpg`, moreVariants: false,
  variants: prices.map(([amount, currency, available], index) => ({ id: `${id}-${index}`, key: `${id}-${index}`, title: 'S', options: { Size: 'S' }, amount, currency, available })),
});
const products = [product('a', 'Dresses', [[30, 'USD', true], [20, 'USD', true], [1, 'USD', false], [15, 'EUR', true]]), product('b', 'Dresses', [[25, 'USD', true]]), product('c', 'Tops', [[10, 'USD', true]])];

test('categories are based on actual products and preserve catalogue order', () => {
  const categories = homeCategories(products);
  assert.deepEqual(categories.map(c => c.category), ['Dresses', 'Tops']);
  assert.equal(categories[0].products.length, 2);
  assert.equal(categories[0].image, '/images/a.jpg');
  assert.deepEqual(homeCategories([product('x', '')]), []);
});

test('available price minima stay separate by currency and exclude unavailable variants', () => {
  assert.deepEqual(priceMinima(products), [{ currency: 'USD', amount: 10 }, { currency: 'EUR', amount: 15 }]);
  assert.equal(homePrice(products[0]), 'From USD 20.00 · From EUR 15.00');
  assert.equal(homePrice(product('x', 'Tops', [[1, 'USD', false]])), 'See product availability');
  assert.deepEqual(priceMinima([product('x', 'Tops', [[NaN, 'USD', true], [2, 'XYZ', true], [-1, 'EUR', true]])]), []);
  assert.equal(homePrice(product('free', 'Tops', [[0, 'USD', true]])), 'From USD 0.00');
});

test('value collections report only available variants in their currency', () => {
  const groups = homeValueCollections(products);
  assert.deepEqual(groups.map(c => [c.category, c.currency, c.amount, c.count]), [['Dresses', 'USD', 20, 2], ['Dresses', 'EUR', 15, 1], ['Tops', 'USD', 10, 1]]);
});

test('recommendations use generic catalogue order and stay bounded', () => {
  assert.deepEqual(homeRecommendations(products), products);
  const catalogue = Array.from({ length: 20 }, (_, i) => product(String(i), 'Tops'));
  assert.deepEqual(homeRecommendations(catalogue), catalogue.slice(0, 10));
  assert.notEqual(homeRecommendations(products), products);
});

test('search handles whitespace, casing, store and category matches and limits suggestions', () => {
  assert.deepEqual(homeSuggestions(products, '  DRESS '), products.slice(0, 2));
  assert.deepEqual(homeSuggestions(products, 'sample'), products);
  assert.deepEqual(homeSuggestions(products, 'Style B'), [products[1]]);
  assert.deepEqual(homeSuggestions(products, ' '), []);
  assert.deepEqual(homeSuggestions(products, 'no match'), []);
  assert.equal(homeSuggestions(Array.from({ length: 20 }, (_, i) => product(String(i), 'Tops')), 'style').length, 5);
});

test('empty and repeated derivation is stable and does not mutate catalogue data', () => {
  const before = JSON.stringify(products);
  for (let n = 0; n < 3; n++) {
    homeCategories(products); homeRecommendations(products); homeSuggestions(products, 'dresses'); homeValueCollections(products);
  }
  assert.equal(JSON.stringify(products), before);
  assert.deepEqual(homeCategories([]), []);
  assert.deepEqual(homeValueCollections([]), []);
  assert.deepEqual(homeRecommendations([]), []);
});
