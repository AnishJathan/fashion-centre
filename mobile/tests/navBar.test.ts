import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as shell from '../src/shellPresentation.ts';
import * as design from '../src/design.ts';
import { primaryNavigation } from '../src/primaryNavigation.ts';
import type { Route } from '../src/navigation.ts';

// Execute the actual dock, handlers and layout calculations with inert native
// boundaries. These checks cannot certify physical devices or hinge support.
const source = ts.transpileModule(fs.readFileSync(new URL('../src/NavBar.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function nodes(value: any): any[] { return Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : []; }
function content(value: any): string { return Array.isArray(value) ? value.map(content).join('') : value && typeof value === 'object' ? content(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value); }
function harness(route: Route = { name: 'home' }, theme: 'light' | 'dark' = 'light', reduced = false) {
  const calls: string[] = [];
  const p = design.palettes[theme];
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: (fn: () => void) => fn(),
  };
  const imports: Record<string, any> = {
    react: { __esModule: true, default: react, ...react },
    './Typography': { Text: 'Text', TextInput: 'TextInput', displayFont: 'DMSerifText' },
    'expo-blur': { BlurView: 'BlurView', BlurTargetView: 'BlurTargetView' },
    'expo-glass-effect': { GlassView: 'GlassView', isLiquidGlassAvailable: () => true },
    'react-native': { Platform: { OS: 'ios' }, Pressable: 'Pressable', Text: 'Text', View: 'View',
      Animated: { Value: class { setValue() {} interpolate() { return 0; } }, View: 'AnimatedView', spring: () => ({ start() {}, stop() {} }), timing: () => ({ start() {}, stop() {} }) },
      useWindowDimensions: () => ({ width: 390, fontScale: 1 }) },
    'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) },
    './ui': { usePalette: () => p, useReducedTransparency: () => reduced },
    './Motion': { useReducedMotion: () => reduced }, './primaryNavigation': { primaryNavigation },
    './design': design, './shellPresentation': shell,
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', source)((name: string) => {
    assert.ok(name in imports, name);
    return imports[name];
  }, module, module.exports);
  const tree = nodes(module.exports.NavBar({ route, bagQuantity: 103,
    onSelectTab: (name: string) => calls.push(name), onTryOn: () => calls.push('prepare') }));
  return { calls, tree, controls: tree.filter(node => node.type === 'Pressable') };
}

test('all four labelled destinations share one icon grid and each press preserves its action', () => {
  const { controls, calls, tree } = harness();
  assert.deepEqual(controls.map(node => node.props.accessibilityLabel), ['Discover', 'Try on', 'Bag, 103 pieces', 'Profile']);
  assert.deepEqual(controls.map(node => node.props.accessibilityRole), Array(4).fill('tab'));
  for (const [index, control] of controls.entries()) {
    const style = control.props.style({ pressed: false });
    assert.ok(style.minWidth >= 48 && style.minHeight >= 48);
    assert.equal(style.flex, 1);
    assert.equal(nodes(control).find(node => node.type === 'Path').props.d, primaryNavigation[index].path);
    control.props.onPress();
  }
  assert.deepEqual(calls, ['home', 'prepare', 'cart', 'profile']);
  assert.ok(tree.some(node => node.type === 'Text' && content(node) === '99+'));
});

test('capsule remains inside safe areas and reserves its whole height at large font sizes', () => {
  for (const width of [240, 280, 320, 390, 430, 768, 1024, 1536]) {
    for (const bottom of [0, 3, 6, 24, 34]) for (const scale of [1, 1.5, 2]) {
      const f = shell.bottomNavFrame(width, scale, { left: 0, right: 0, bottom });
      assert.ok(f.width <= width - f.left - f.right && f.width <= design.metrics.dockWidth);
      assert.ok((f.width - 16) / 4 >= 48);
      assert.ok(f.height >= 64 && f.height >= 42 + Math.ceil(15 * scale) * f.labelLines);
      assert.equal(f.bottom, Math.max(bottom, design.metrics.dockOffset));
    }
  }
  assert.equal(shell.bottomNavFrame(844, 1, { left: 44, right: 0, bottom: 21 }).left, 44);
});

test('one selected symbol stays legible over imagery in both themes, with reduced effects', () => {
  for (const theme of ['light', 'dark'] as const) for (const reduced of [true, false]) {
    for (const [route, id] of [['brand','home'], ['prepare','prepare'], ['order','cart'], ['settings','profile']] as const) {
      const { tree, controls } = harness({ name: route }, theme, reduced);
      const p = design.palettes[theme];
      const dock = tree.find(node => node.props.accessibilityRole === 'tablist').props.style;
      assert.equal(dock.backgroundColor, reduced ? p.dock : 'transparent');
      assert.equal(dock.borderColor, reduced ? p.dockText : 'transparent');
      assert.equal(tree.some(node => node.type === 'GlassView'), !reduced);
      assert.ok(dock.borderRadius >= dock.height / 2);
      const selected = controls.filter(node => node.props.accessibilityState.selected);
      assert.equal(selected.length, 1);
      assert.equal(selected[0].props.testID, id === 'prepare' ? 'bottom-try-on' : 'bottom-tab-' + id);
      assert.equal(nodes(selected[0]).find(node => node.type === 'Path').props.stroke, reduced ? p.dockSelectedInk : p.dockSelected);
      assert.equal(nodes(selected[0]).find(node => node.props.testID === 'bottom-active-capsule').props.style.backgroundColor, reduced ? p.dockSelected : 'transparent');
      assert.equal(selected[0].props.style({ pressed: true }).transform[0].scale, reduced ? 1 : 0.96);
      assert.equal(tree.find(node => node.props.testID === 'bottom-nav-safe-area').props.pointerEvents, 'box-none');
    }
  }
});

test('preparation destinations validate availability, route context and store ownership', () => {
  const brands = [{ id: 'atelier' }, { id: 'everyday' }];
  assert.deepEqual(shell.tryOnDestination({ name: 'product', productId: 'atelier:top', brandId: 'everyday' }, brands), { name: 'prepare', brandId: 'atelier' });
  assert.deepEqual(shell.tryOnDestination({ name: 'product', productId: 'atelier:top' }, brands), { name: 'prepare', brandId: 'atelier' });
  assert.deepEqual(shell.tryOnDestination({ name: 'brand', brandId: '../bad' }, brands), { name: 'prepare' });
  assert.deepEqual(shell.tryOnDestination({ name: 'product', productId: 'atelier:top' }, []), { name: 'prepare' });
  assert.deepEqual(shell.tryOnDestination({ name: 'cart', brandId: 'everyday' }, brands), { name: 'prepare', brandId: 'everyday' });
  assert.deepEqual(shell.tabDestination('orders', { name: 'brand', brandId: 'atelier' }), { name: 'orders', brandId: 'atelier' });
  assert.equal(shell.isRootTab('orders'), true);
  for (const route of ['cart', 'orders', 'order', 'checkout'] as const) assert.equal(shell.activeTab(route), 'cart');
});
