import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as domain from '../src/core/domain.ts';
import * as home from '../src/commerceHome.ts';
import * as layout from '../src/shoppingLayout.ts';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/ShoppingComponents.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const react = { createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }), useState: (value: any) => [value, () => {}] };
const imports: Record<string, any> = {
  react: { __esModule: true, default: react, ...react },
  'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', useWindowDimensions: () => ({ width: 320, fontScale: 1 }) },
  './ui': { ...Object.fromEntries(['Badge', 'Body', 'Button', 'Card', 'Heading', 'Icon', 'Photo', 'Title'].map(x => [x, x])), usePalette: () => ({}) },
  './core/domain': domain, './commerceHome': home, './shoppingLayout': layout,
};
const module = { exports: {} as any };
new Function('require', 'module', 'exports', source)((name: string) => { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; }, module, module.exports);
const nodes = (tree: any): any[] => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const product: domain.Product = { id: 'a:top', brandId: 'a', brandName: 'A', name: 'Top', category: 'Tops', image: '/images/top.svg', variants: [], moreVariants: false };

test('real ProductGrid keeps separate view and Try On controls without save hearts', () => {
  const actions: any[] = [];
  const tree = module.exports.ProductGrid({ products: [product], onView: (p: any) => actions.push(['view', p]), onTryOn: (p: any) => actions.push(['try', p]) });
  const all = nodes(tree);
  assert.equal(all.some(n => /save|wishlist/i.test(n.props.accessibilityLabel || '')), false);
  assert.equal(all.some(n => n.type === 'Icon' && n.props.name === 'heart'), false);
  all.find(n => n.props.accessibilityLabel === 'View Top').props.onPress();
  const tryOn = all.find(n => n.props.accessibilityLabel === 'Try on Top');
  assert.equal(tryOn.props.disabled, false); assert.ok(tryOn.props.style.minHeight >= 48); assert.equal(tryOn.props.style.alignSelf, 'flex-start'); assert.equal(nodes(tryOn).find(n => n.type === 'View').props.style.minHeight, 28); tryOn.props.onPress();
  assert.deepEqual(actions, [['view', product], ['try', product]]);
});

test('missing photos disable Try On while product browsing remains available', () => {
  const tree = module.exports.ProductGrid({ products: [{ ...product, image: '' }], onView() {}, onTryOn() {} });
  const all = nodes(tree);
  assert.equal(all.find(n => n.props.accessibilityLabel === 'Try on Top').props.disabled, true);
  assert.ok(all.find(n => n.props.accessibilityLabel === 'View Top'));
  assert.equal(all.some(n => /save|wishlist/i.test(n.props.accessibilityLabel || '')), false);
});
