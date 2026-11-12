import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as home from '../src/commerceHome.ts';
import * as layout from '../src/shoppingLayout.ts';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/ShoppingComponents.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const nodes = (tree: any): any[] => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
function harness(width = 320, fontScale = 1) {
  const states: any[] = []; let cursor = 0;
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value: any) => { states[index] = value; }]; },
  };
  const imports: Record<string, any> = {
    react: { __esModule: true, default: react, ...react },
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', useWindowDimensions: () => ({ width, fontScale }) },
    './ui': { ...Object.fromEntries(['Badge', 'Body', 'Button', 'Card', 'Heading', 'Icon', 'Photo', 'Title'].map(x => [x, x])), usePalette: () => ({ text: '#111111', accent: '#5500aa' }) },
    './commerceHome': home, './shoppingLayout': layout,
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', source)((name: string) => { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; }, module, module.exports);
  const expand = (node: any): any => {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  };
  return { render: (component: string, props: any) => { cursor = 0; return nodes(expand(module.exports[component](props))); } };
}

test('compact Buy components use the front-page type scale and bounded thumbnail without truncating large text', () => {
  for (const width of [320, 390, 540, 884]) for (const fontScale of [1, 1.6, 2.2]) {
    const h = harness(width, fontScale);
    const heading = h.render('ShoppingHeader', { compact: true, eyebrow: 'Your local selection', title: 'Your bag', description: 'Two pieces' });
    assert.equal(heading[0].props.style.gap, 2);
    const title = heading.find(n => n.props.accessibilityRole === 'header');
    assert.equal(title.props.style.fontSize, 16);
    assert.equal(title.props.style.lineHeight, 22);
    const props = { compact: true, image: 'local-product.png', name: 'A long product name that stays fully readable', children: 'Size M · Quantity 2' };
    let line = h.render('ShoppingLine', props);
    assert.equal(line[0].props.style.flexDirection, fontScale >= 1.3 ? 'column' : 'row');
    assert.equal(line.find(n => n.type === 'Photo').props.height, 72);
    assert.equal(line.find(n => n.props.accessibilityRole === 'header').props.style.fontSize, 14);
    line[0].props.onLayout({ nativeEvent: { layout: { width: 210 } } });
    line = h.render('ShoppingLine', props);
    assert.equal(line[0].props.style.flexDirection, 'column', 'A narrow safe-area pane also stacks details');
    assert.equal(line.find(n => n.type === 'Photo').props.height, 72, 'Stacking does not turn the thumbnail into a hero');
    for (const text of [...heading, ...line].filter(n => n.type === 'Text')) {
      assert.equal(text.props.numberOfLines, undefined);
      assert.equal(text.props.maxFontSizeMultiplier, undefined);
      assert.equal(text.props.style.height, undefined);
    }
  }
});

test('compact cards and empty-state recovery stay dense without changing their action', () => {
  const h = harness();
  const card = h.render('ShoppingCard', { children: 'Totals' });
  assert.equal(card[0].props.style.padding, 10);
  assert.equal(card[0].props.style.gap, 6);
  let presses = 0;
  const empty = h.render('ShoppingEmpty', { compact: true, title: 'Your bag is waiting', description: 'Choose a variant', action: 'Discover pieces', onPress: () => presses++ });
  assert.ok(empty.some(n => n.props.testID === 'shopping-compact-card'));
  const action = empty.find(n => n.type === 'Button');
  assert.equal(action.props.label, 'Discover pieces'); action.props.onPress();
  assert.equal(presses, 1);
  assert.equal(empty.find(n => n.props.accessibilityRole === 'header').props.style.fontSize, 14);
  const notice = h.render('ShoppingNotice', { compact: true, title: 'No payment will be taken', children: 'Only stored on this device.' });
  assert.equal(notice[0].props.style.padding, 8);
  assert.equal(notice.find(n => n.type === 'Text').props.style.fontSize, 13);
});
