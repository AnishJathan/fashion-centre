import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as experience from '../src/experience.ts';
import type { Product } from '../src/core/domain.ts';

// Execute the real component and its callbacks with persistent hook slots.
// Native/UI leaves are inert: these tests do not establish device rendering,
// screen-reader behavior, animation smoothness, or visual quality.
type Element = { type: any; props: any };
const source = ts.transpileModule(fs.readFileSync(new URL('../src/Experience.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const products: Product[] = [
  { id: 'tee', name: 'Cotton tee', category: 'Tops', brandId: 'demo', brandName: 'Demo', image: '', variants: [], moreVariants: false },
  { id: 'jacket', name: 'Denim jacket', category: 'Layers', brandId: 'demo', brandName: 'Demo', image: '', variants: [], moreVariants: false },
  { id: 'dress', name: 'Silk dress', category: 'Dresses', brandId: 'other', brandName: 'Other', image: '', variants: [], moreVariants: false },
];
function nodes(value: any): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  if (value.type === 'Modal' && !value.props.visible) return [];
  return [value, ...nodes(value.props?.children)];
}
function content(value: any): string {
  if (Array.isArray(value)) return value.map(content).join('');
  if (value == null || typeof value === 'boolean') return '';
  if (typeof value === 'object') return content(value.props?.children);
  return String(value);
}
function harness(initialMood = 'all', catalogue = products) {
  const slots: any[] = [], cleanups: (() => void)[] = [], routes: any[] = [];
  let cursor = 0, tree: Element, mood = initialMood, browses = 0;
  const state = { products: catalogue, saved: ['legacy-piece'] as string[], toggleSaved: () => assert.fail('Discovery must not change retained saved data') };
  const React = {
    Fragment: 'Fragment',
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next: any) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef: (initial: any) => {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useEffect: (effect: () => void | (() => void)) => {
      const index = cursor++;
      if (!(index in slots)) { slots[index] = true; const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
    },
  };
  const imports: Record<string, any> = {
    react: { __esModule: true, default: React, ...React },
    'react-native': {
      ...Object.fromEntries(['Image', 'Modal', 'Pressable', 'ScrollView', 'Text', 'View'].map(name => [name, name])),
      Platform: { OS: 'ios' }, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
      AccessibilityInfo: { isReduceMotionEnabled: async () => true, addEventListener: () => ({ remove() {} }) },
      Animated: { View: 'Animated.View', Value: class { stopAnimation() {} setValue(_value: number) {} }, timing: () => ({ start() {} }) },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    './state': { useApp: () => state }, './experience': experience,
    './ui': { ...Object.fromEntries(['Body', 'Button', 'Heading', 'Icon', 'IconButton'].map(name => [name, name])), usePalette: () => ({}) },
    './ShoppingComponents': { ProductGrid: 'ProductGrid' },
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', source)((name: string) => {
    if (name.startsWith('../assets/editorial/')) return name;
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, module, module.exports);
  const render = () => {
    cursor = 0;
    tree = module.exports.ExperienceIntro({ mood, onMood: (next: string) => { mood = next; }, onBrowse: () => { browses++; }, navigate: (route: any) => routes.push(route) });
  };
  const all = () => nodes(tree);
  const find = (label: string) => {
    const matches = all().filter(node => typeof node.props.onPress === 'function' && (node.props.accessibilityLabel === label || node.props.label === label || content(node) === label));
    assert.equal(matches.length, 1, `Expected exactly one active control: ${label}`);
    return matches[0];
  };
  const press = (label: string) => { const node = find(label); assert.ok(!node.props.disabled, `${label} disabled`); node.props.onPress(); render(); };
  const modal = () => { const result = all().filter(node => node.type === 'Modal'); assert.equal(result.length, 1); return result[0]; };
  render();
  return { render, all, find, press, modal, routes, state, mood: () => mood, browses: () => browses,
    text: () => all().filter(node => node.type === 'Text' || node.type === 'Body').map(content).join('\n'),
    grid: () => { const grid = all().find(node => node.type === 'ProductGrid'); assert.ok(grid); return grid; },
    dispose: () => cleanups.forEach(cleanup => cleanup()),
  };
}
const enter = 'Enter the edit, a three chapter style story';
const studio = 'Open the style studio, build a local edit in two steps';
function reveal(h: ReturnType<typeof harness>) { h.press('Choose your pieces →'); h.press('Reveal my edit →'); }

test('story previous/next/finish, close, system dismissal and reopen reset chapter', () => {
  const h = harness();
  h.press(enter);
  assert.equal(h.find('Previous story chapter').props.disabled, true);
  assert.match(h.text(), /Chapter 1 of 3/);
  h.press('Next story chapter'); assert.match(h.text(), /Chapter 2 of 3/);
  h.press('Previous story chapter'); assert.match(h.text(), /Chapter 1 of 3/);
  h.press('Next story chapter'); h.press('Next story chapter'); assert.match(h.text(), /Chapter 3 of 3/);
  h.press('Finish story'); assert.equal(h.all().filter(n => n.type === 'Modal').length, 0);
  h.press(enter); assert.match(h.text(), /Chapter 1 of 3/);
  h.press('Close editorial story'); h.press(enter);
  h.modal().props.onRequestClose(); h.render();
  assert.equal(h.all().filter(n => n.type === 'Modal').length, 0);
  h.press(enter); assert.match(h.text(), /Chapter 1 of 3/);
  h.dispose();
});

test('story actions select a mood and browse the collection without saved navigation', () => {
  const h = harness();
  h.press(enter); h.press('Next story chapter'); h.press('Explore this mood');
  assert.equal(h.mood(), 'evening'); assert.equal(h.browses(), 1);
  assert.equal(h.all().filter(n => n.type === 'Modal').length, 0);
  h.press(enter); h.press('Next story chapter'); h.press('Next story chapter');
  assert.doesNotMatch(h.text(), /saved edit|saved pieces|Your edit is taking shape/i);
  assert.match(h.text(), /Discover a new silhouette/);
  h.press('Explore the collection');
  assert.deepEqual(h.routes, []); assert.equal(h.browses(), 2); assert.equal(h.mood(), 'all');
  assert.deepEqual(h.state.saved, ['legacy-piece']);
  assert.doesNotMatch(h.text(), /saved edit|saved pieces|Your edit is taking shape/i);
  h.dispose();
});

test('studio derives categories, resets category on mood change, preserves back flow and resets new edit', () => {
  const h = harness('everyday'); h.press(studio);
  h.press('Choose your pieces →'); h.press('Tops'); h.press('Back to mood');
  // Mood labels also appear outside the modal; scope the studio choice explicitly.
  const evening = nodes(h.modal()).find(n => n.type === 'Pressable' && content(n).includes('After hours'))!;
  evening.props.onPress(); h.render(); h.press('Choose your pieces →');
  assert.equal(h.find('Show me everything').props.accessibilityState.selected, true);
  assert.ok(!nodes(h.modal()).some(n => n.type === 'Pressable' && content(n) === 'Tops'));
  h.press('Dresses'); h.press('Reveal my edit →');
  assert.deepEqual(h.grid().props.products.map((p: Product) => p.id), ['dress']);
  h.press('Start another edit'); h.press('Choose your pieces →');
  assert.equal(h.find('Show me everything').props.accessibilityState.selected, true);
  h.press('Close style studio'); h.press(studio); reveal(h);
  assert.deepEqual(h.grid().props.products.map((p: Product) => p.id), ['tee', 'jacket']);
  h.dispose();
});

test('studio results offer product details and Try On without wishlist props or data changes', () => {
  const h = harness('evening'); h.press(studio); reveal(h);
  assert.equal(h.grid().props.onSave, undefined);
  assert.equal(h.grid().props.saved, undefined);
  assert.doesNotMatch(h.text(), /save your favourites/i);
  h.grid().props.onView(products[2]); h.render();
  assert.deepEqual(h.routes, [{ name: 'product', productId: 'dress', brandId: 'other' }]);
  assert.equal(h.all().filter(n => n.type === 'Modal').length, 0);
  h.press(studio); reveal(h); h.grid().props.onTryOn(products[2]); h.render();
  assert.deepEqual(h.routes.at(-1), { name: 'try-on', productId: 'dress', brandId: 'other' });
  assert.equal(h.all().filter(n => n.type === 'Modal').length, 0);
  assert.deepEqual(h.state.saved, ['legacy-piece']);
  h.dispose();
});

test('empty studio results remain recoverable; full collection clears mood and dismisses', () => {
  const h = harness('evening', []); h.press(studio); reveal(h);
  assert.deepEqual(h.grid().props.products, []); assert.match(h.text(), /No matching pieces/);
  h.press('Start another edit'); reveal(h); h.press('Browse the full collection');
  assert.equal(h.mood(), 'all'); assert.equal(h.browses(), 1);
  assert.equal(h.all().filter(n => n.type === 'Modal').length, 0);
  h.press(studio); h.modal().props.onRequestClose(); h.render();
  assert.equal(h.all().filter(n => n.type === 'Modal').length, 0);
  h.dispose();
});
