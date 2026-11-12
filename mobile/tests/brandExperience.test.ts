import assert from 'node:assert/strict';
import test from 'node:test';
import { brandIdentity, brandExperience, brandProducts } from '../src/brandExperience.ts';
import type { Product } from '../src/core/domain.ts';

const luminance = (hex: string) => {
  const [r, g, b] = hex.slice(1).match(/../g)!.map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
};
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test('store identities are deterministic, distinctly styled and independent of theme', () => {
  assert.equal(brandIdentity('demo-atelier'), 'atelier');
  assert.equal(brandIdentity('everyday-demo'), 'everyday');
  assert.equal(brandIdentity('some-store'), brandIdentity('some-store'));
  assert.notEqual(brandExperience('atelier', 'light').palette.accent, brandExperience('everyday', 'light').palette.accent);
  assert.notEqual(brandExperience('atelier', 'light').radius, brandExperience('everyday', 'light').radius);
  assert.equal(brandExperience('atelier', 'dark').serif, true);
  assert.equal(brandExperience('everyday', 'dark').serif, false);
});

test('all store palettes preserve text/control contrast in light and dark', () => {
  const identities = new Set();
  for (const id of ['atelier', 'everyday', 'a', 'b', 'c', 'd']) for (const theme of ['light', 'dark'] as const) {
    const { identity, palette: p } = brandExperience(id, theme); identities.add(identity);
    for (const bg of [p.background, p.surface, p.tint]) for (const colour of [p.text, p.muted, p.accent])
      assert.ok(contrast(colour, bg) >= 4.5, `${identity} ${theme} ${colour} on ${bg}: ${contrast(colour, bg)}`);
    assert.ok(contrast(p.onAccent, p.accent) >= 4.5);
    assert.ok(contrast(p.controlLine, p.surface) >= 3);
  }
  assert.equal(identities.size, 4);
});

const piece = (brandId: string, name: string, category: string, currency = 'USD', amount = 10): Product => ({ id: `${brandId}:${name}`, brandId, brandName: brandId, name, category, image: '/images/piece.svg', moreVariants: false, variants: [{ id: 'm', key: 'm', title: 'Medium', available: true, amount, currency, options: {} }] });
test('store search/category/try-on/sorting never leak another store or mutate catalogue order', () => {
  const items = [piece('a', 'Zebra', 'Tops', 'USD', 30), piece('b', 'Zebra', 'Tops', 'USD', 1), piece('a', 'Amber', 'Tops', 'EUR', 50), { ...piece('a', 'Coat', 'Layers'), image: '' }];
  const original = [...items];
  assert.deepEqual(brandProducts(items, 'a', ' zebra ').map(p => p.id), ['a:Zebra']);
  assert.deepEqual(brandProducts(items, 'a', '', 'Layers').map(p => p.id), ['a:Coat']);
  assert.deepEqual(brandProducts(items, 'a', '', 'All', 'name').map(p => p.name), ['Amber', 'Coat', 'Zebra']);
  assert.deepEqual(brandProducts(items, 'a', '', 'All', 'price', true).map(p => p.id), ['a:Amber', 'a:Zebra']);
  assert.deepEqual(items, original);
});
