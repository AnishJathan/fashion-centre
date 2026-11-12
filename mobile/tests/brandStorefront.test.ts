import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as experience from '../src/brandExperience.ts';
import type { Product } from '../src/core/domain.ts';

// Invoke real TSX callbacks with persistent state and inert native leaves.
// This is behavioral coverage, not a native layout/animation/device certification.
const compile = (file: string) => ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const source = compile('../src/BrandStorefront.tsx');
const piece = (brandId: string, category: string, image = '/images/demo.svg'): Product => ({ id: `${brandId}:${category}`, brandId, brandName: brandId, name: `${brandId} ${category}`, category, image, variants: [], moreVariants: false });
const catalogue = [piece('atelier', 'Tops'), piece('atelier', 'Dresses'), piece('atelier', 'Layers', ''), piece('everyday', 'Tops')];
const nodes = (tree: any): any[] => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const content = (tree: any): string => Array.isArray(tree) ? tree.map(content).join('') : tree == null || typeof tree === 'boolean' ? '' : typeof tree === 'object' ? content(tree.props?.children) : String(tree);
function harness(products = catalogue, brandId = 'atelier', width = 390, fontScale = 1) {
  let index = 0, tree: any;
  const states: any[] = [], routes: any[] = [], actions: any[] = [], scrolls: number[] = [];
  const brand = { id: brandId, name: brandId, image: '', products: products.filter(p => p.brandId === brandId), more: false };
  const app = { products, followed: [] as string[], saved: ['atelier:Tops', 'atelier:unavailable'] as string[], theme: 'light', catalogueLoading: false,
    toggleSaved: () => assert.fail('Storefront must not change existing saved records'),
    toggleFollowed: (id: string) => { actions.push(['follow', id]); app.followed = app.followed.includes(id) ? app.followed.filter(x => x !== id) : [...app.followed, id]; },
    dispatch: () => assert.fail('Storefront must not generate commerce, upload or network actions'),
  };
  const react = { createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }), useState: (initial: any) => { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], (value: any) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; } };
  const imports: Record<string, any> = {
    react: { __esModule: true, default: react, ...react },
    'react-native': { ...Object.fromEntries(['Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(x => [x, x])), Platform: { OS: 'ios' }, useWindowDimensions: () => ({ width, height: 844, fontScale }) },
    './state': { useApp: () => app }, './brandExperience': experience,
    './ui': { Button: 'Button', Icon: 'Icon', Photo: 'Photo', usePalette: () => experience.brandExperience(brandId, 'light').palette },
    './ShoppingComponents': { ProductGrid: 'ProductGrid', ShoppingEmpty: 'ShoppingEmpty' },
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', source)((name: string) => { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; }, module, module.exports);
  const render = () => { index = 0; tree = module.exports.BrandStorefront({ brand, navigate: (route: any) => routes.push(route), scrollTo: (y: number) => scrolls.push(y) }); };
  const all = () => nodes(tree);
  const find = (label: string) => all().find(n => n.props.accessibilityLabel === label || n.props.label === label || n.type === 'Pressable' && content(n) === label);
  const press = (label: string) => { const item = find(label); assert.ok(item, `Missing ${label}`); item.props.onPress(); render(); };
  const type = (value: string) => { all().find(n => n.type === 'TextInput').props.onChangeText(value); render(); };
  render();
  return { all, find, press, type, render, app, actions, routes, scrolls, grid: () => all().find(n => n.type === 'ProductGrid'), text: () => content(tree), input: () => all().find(n => n.type === 'TextInput') };
}

test('brand page search/category/reset show only the selected store and empty filters recover', () => {
  const h = harness();
  assert.deepEqual(h.grid().props.products.map((p: Product) => p.id), ['atelier:Tops', 'atelier:Dresses', 'atelier:Layers']);
  h.type(' tops '); assert.deepEqual(h.grid().props.products.map((p: Product) => p.id), ['atelier:Tops']);
  h.input().props.onSubmitEditing(); h.render(); assert.equal(h.input().props.value, 'tops');
  h.press('Clear store search'); h.press('Shop Dresses');
  assert.deepEqual(h.grid().props.products.map((p: Product) => p.id), ['atelier:Dresses']);
  h.type('not here'); assert.equal(h.grid().props.products.length, 0);
  assert.equal(h.all().find(n => n.type === 'ShoppingEmpty').props.title, 'No matching pieces');
  h.press('Reset store filters'); assert.equal(h.grid().props.products.length, 3);
  assert.deepEqual(h.actions, []); assert.deepEqual(h.routes, []);
});

test('follow/unfollow stays inside the same brand and never alters saved pieces or cart', () => {
  const h = harness(); h.type('Tops'); h.press('Follow atelier');
  assert.deepEqual(h.app.followed, ['atelier']); assert.equal(h.find('Unfollow atelier').props.accessibilityState.selected, true);
  h.press('Unfollow atelier'); assert.deepEqual(h.app.followed, []);
  assert.equal(h.input().props.value, 'Tops'); assert.deepEqual(h.routes, []); assert.deepEqual(h.app.saved, ['atelier:Tops', 'atelier:unavailable']);
  assert.deepEqual(h.actions, [['follow', 'atelier'], ['follow', 'atelier']]);
});

test('try-on and product actions retain brand ownership with no wishlist controls', () => {
  const h = harness(); h.press('Try on pieces from atelier');
  assert.match(h.text(), /Choose a piece to try on/); assert.match(h.text(), /confirmation are required/);
  assert.deepEqual(h.grid().props.products.map((p: Product) => p.id), ['atelier:Tops', 'atelier:Dresses']);
  assert.deepEqual(h.actions, []); assert.deepEqual(h.routes, []);
  h.grid().props.onTryOn(catalogue[1]); h.grid().props.onView(catalogue[0]);
  assert.equal(h.find('Open atelier wishlist'), undefined);
  assert.equal(h.grid().props.onSave, undefined); assert.equal(h.grid().props.saved, undefined);
  assert.equal(h.all().some(n => n.type === 'Icon' && n.props.name === 'heart'), false);
  assert.deepEqual(h.app.saved, ['atelier:Tops', 'atelier:unavailable']);
  assert.deepEqual(h.routes, [{ name: 'try-on', productId: 'atelier:Dresses', brandId: 'atelier' }, { name: 'product', productId: 'atelier:Tops', brandId: 'atelier' }]);
  h.press('Collection'); assert.equal(h.grid().props.products.length, 3);
});

test('store sort and compact category row use actual catalogue; a new store starts unfiltered', () => {
  const h = harness(); h.press('Sort store collection'); h.press('Name A–Z');
  assert.deepEqual(h.grid().props.products.map((p: Product) => p.id), ['atelier:Dresses', 'atelier:Layers', 'atelier:Tops']);
  h.press('Shop Tops'); assert.equal(h.grid().props.products.length, 1); assert.deepEqual(h.scrolls, [0]);
  const other = harness(catalogue, 'everyday');
  assert.deepEqual(other.grid().props.products.map((p: Product) => p.id), ['everyday:Tops']);
  assert.equal(other.input().props.accessibilityLabel, 'Search everyday');
});

test('empty store, narrow layout and large text retain accessible controls and recovery', () => {
  const empty = harness([]); const state = empty.all().find(n => n.type === 'ShoppingEmpty');
  assert.equal(state.props.title, 'This collection is empty'); state.props.onPress();
  assert.deepEqual(empty.routes, [{ name: 'stores' }]);
  for (const [width, fontScale] of [[320, 1], [390, 2]]) {
    const h = harness(catalogue, 'atelier', width, fontScale);
    for (const n of h.all().filter(n => n.type === 'Pressable' && !n.props.accessibilityLabel?.startsWith('View featured'))) {
      const style = typeof n.props.style === 'function' ? n.props.style({ pressed: false }) : n.props.style;
      assert.ok(style.minHeight >= 48, n.props.accessibilityLabel || content(n));
    }
    if (fontScale >= 1.4) assert.equal(h.all().filter(n => n.type === 'Photo').length, 0);
  }
});


test('storefront starts with shopping controls, not a duplicate heading or photo hero', () => {
  const h = harness();
  assert.equal(h.all().filter(n => n.type === 'Photo').length, 0);
  assert.equal(h.all().filter(n => n.props.accessibilityRole === 'header').length, 1);
  assert.equal(h.all().find(n => n.props.accessibilityRole === 'header').props.style.fontSize, 16);
  assert.equal(h.input().props.style.minHeight, 44);
  assert.equal(h.find('Follow atelier').props.children.some((n: any) => n?.type === 'Text'), false);
  assert.doesNotMatch(h.text(), /Your brand space|A closer look|Following/);
  assert.ok(h.all().findIndex(n => n.type === 'ProductGrid') > h.all().findIndex(n => n.type === 'TextInput'));
});
