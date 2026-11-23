import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as experience from '../src/brandExperience.ts';
import * as navigationHelpers from '../src/navigation.ts';
import * as shell from '../src/shellPresentation.ts';
import { primaryNavigation } from '../src/primaryNavigation.ts';
import * as design from '../src/design.ts';
import type { Route } from '../src/navigation.ts';

// Execute the actual shell routing callbacks with inert native boundaries.
const navSource = ts.transpileModule(fs.readFileSync(new URL('../src/NavBar.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const source = ts.transpileModule(fs.readFileSync(new URL('../App.tsx', import.meta.url), 'utf8') + '\nexport { Shell, ShellContent, DockLayout };', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
function nodes(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : []; }
function harness(route: Route, dark = false, canGoBack = false) {
  const { name, ...params } = route;
  const calls: any[] = [], listeners: Record<string, () => void> = {}, cleanups: (() => void)[] = [];
  const states: any[] = []; let index = 0, tree: any;
  const brands = [{ id: 'atelier', name: 'Demo Atelier' }, { id: 'everyday', name: 'Demo Everyday' }];
  const app = { products: [{ id: 'atelier:top', brandId: 'atelier' }, { id: 'everyday:tee', brandId: 'everyday' }], brands, theme: dark ? 'dark' : 'light', ready: true, error: '', notice: '', commerce: { cart: [{ brandId: 'atelier', quantity: 2 }, { brandId: 'everyday', quantity: 5 }] } };
  const p = route.brandId && brands.some(b => b.id === route.brandId) ? experience.brandExperience(route.brandId, dark ? 'dark' : 'light').palette : design.palettes[dark ? 'dark' : 'light'];
  let NavBar: any;
  const react = { Component: class {}, createElement: (type: any, props: any, ...children: any[]) => type === NavBar ? NavBar({ ...props, children }) : ({ type, props: { ...props, children } }),
    useState: (initial: any) => { const i = index++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (value: any) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef: (initial: any) => ({ current: initial }),
    useEffect: (callback: () => any) => { const cleanup = callback(); if (cleanup) cleanups.push(cleanup); },
  };
  const imports: Record<string, any> = {
    react: { __esModule: true, default: react, ...react },
    './Typography': { Text: 'Text', TextInput: 'TextInput', displayFont: 'DMSerifText' },
    './src/Typography': { Text: 'Text', TextInput: 'TextInput', displayFont: 'DMSerifText' },
    'expo-blur': { BlurView: 'BlurView', BlurTargetView: 'BlurTargetView' },
    'expo-glass-effect': { GlassView: 'GlassView', isLiquidGlassAvailable: () => true },
    'react-native': { Animated: { Value: class { setValue() {} }, View: 'AnimatedView' }, ...Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'Text', 'View'].map(n => [n, n])), Platform: { OS: 'ios' }, useWindowDimensions: () => ({ width: 320, height: 640, fontScale: 1 }), Keyboard: { dismiss: () => calls.push(['dismiss']), addListener: (name: string, cb: () => void) => { listeners[name] = cb; return { remove: () => {} }; } } },
    '@react-navigation/native': { NavigationContainer: 'NavigationContainer', createNavigationContainerRef: () => ({}), DarkTheme: {}, DefaultTheme: {} },
    '@react-navigation/native-stack': { createNativeStackNavigator: () => ({ Navigator: 'Stack', Screen: 'StackScreen' }) },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) },
    'expo-font': { useFonts: () => [true, null] }, './src/Motion': { MotionProvider: 'MotionProvider', useReducedMotion: () => false },
    'expo-status-bar': { StatusBar: 'StatusBar' }, 'expo-linking': {},
    './src/state': { AppProvider: 'AppProvider', useApp: () => app }, './src/ShoppingScreens': { ShoppingScreen: 'ShoppingScreen' }, './src/SettingsScreens': { SettingsScreen: 'SettingsScreen' }, './src/StyleAssistant.tsx': { StyleAssistant: 'StyleAssistant' }, './src/AccountScreens': { AccountScreen: 'AccountScreen' },
    './src/ui': { DockInset: { Provider: 'DockInset' }, ...Object.fromEntries(['Body', 'Button', 'Icon', 'IconButton', 'PaletteProvider', 'Screen', 'Title'].map(n => [n, n])), usePalette: () => p, useReducedTransparency: () => false },
    './src/LaunchReveal': { LaunchReveal: 'LaunchReveal' },
    './src/BrandMark': { BrandMark: 'BrandMark', AppMark: 'AppMark' }, './src/design': design, './src/brandExperience': experience, './src/shellPresentation': shell, './src/navigation': navigationHelpers,
  };
  const navModule = { exports: {} as any };
  const navImports: Record<string, any> = { ...imports, './primaryNavigation': { primaryNavigation }, './Motion': { useReducedMotion: () => true }, 'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path' }, './ui': imports['./src/ui'], './design': design, './shellPresentation': shell };
  new Function('require', 'module', 'exports', navSource)((name: string) => { assert.ok(name in navImports, `Unexpected nav import: ${name}`); return navImports[name]; }, navModule, navModule.exports);
  NavBar = navModule.exports.NavBar;
  imports['./src/NavBar'] = { NavBar };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', source)((name: string) => { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; }, module, module.exports);
  const nav = { navigate: (...args: any[]) => calls.push(['navigate', ...args]), popTo: (...args: any[]) => calls.push(['popTo', ...args]), reset: (value: any) => calls.push(['reset', value]), resetRoot: (value: any) => calls.push(['reset', value]), canGoBack: () => canGoBack, goBack: () => calls.push(['goBack']), replace: (...args: any[]) => calls.push(['replace', ...args]), setOptions: (value: any) => calls.push(['options', value]) };
  const props = { route: { name, params }, navigation: nav };
  const render = () => { index = 0; tree = module.exports.DockLayout({ route, navigation: nav, children: module.exports.ShellContent(props) }); };
  render();
  const header = () => calls.filter(c => c[0] === 'options').at(-1)?.[1].header();
  const all = () => [...nodes(tree), ...nodes(header())];
  return { calls, render, header, all, outer: () => module.exports.Shell(props), listeners, palette: p, dispose: () => cleanups.forEach(c => c()), press: (label: string) => { const node = all().find(n => n.props.accessibilityLabel === label || n.props.label === label); assert.ok(node, `Missing ${label}`); node.props.onPress(); }, screen: () => nodes(tree).find(n => n.type === 'ShoppingScreen') };
}

test('brand shell gives storefront, bag and profile the same scoped palette and identity', () => {
  for (const name of ['brand', 'cart', 'orders', 'order', 'profile'] as const) for (const dark of [false, true]) {
    const h = harness({ name, brandId: 'atelier' }, dark);
    assert.equal(h.outer().type, 'PaletteProvider');
    assert.deepEqual(h.outer().props.palette, experience.brandExperience('atelier', dark ? 'dark' : 'light').palette);
    assert.equal(h.calls.find(c => c[0] === 'options')[1].title, 'Demo Atelier');
    assert.equal(h.calls.find(c => c[0] === 'options')[1].headerStyle.backgroundColor, h.palette.surface);
    h.dispose();
  }
  assert.equal(harness({ name: 'home' }).outer().props.palette, undefined);
});

test('three brand destinations and a preparation action form a four-control dock', () => {
  const h = harness({ name: 'product', brandId: 'atelier', productId: 'atelier:top' });
  assert.equal(h.all().filter(n => n.props.accessibilityRole === 'tab').length, 4);
  assert.equal(h.all().some(n => /wishlist|saved pieces/i.test(n.props.accessibilityLabel || n.props.label || '')), false);
  h.press('Bag, 2 pieces'); h.press('Discover, current store collection'); h.press('Profile');
  assert.deepEqual(h.calls.filter(c => c[0] === 'reset').map(c => c[1].routes[0]), [
    { name: 'cart', params: { brandId: 'atelier' } }, { name: 'brand', params: { brandId: 'atelier' } }, { name: 'profile', params: { brandId: 'atelier' } },
  ]);
  for (const tab of h.all().filter(n => n.props.accessibilityRole === 'tab')) assert.ok(tab.props.style({ pressed: false }).minHeight >= 48);
  h.dispose();
});

test('explicit Fashion Centre exit fully clears scope, fallback back is recoverable, keyboard hides tabs', () => {
  const h = harness({ name: 'brand', brandId: 'atelier' });
  h.press('Exit store view and return to Fashion Centre');
  assert.deepEqual(h.calls.find(c => c[0] === 'reset')[1], { index: 0, routes: [{ name: 'home' }] });
  h.screen().props.back(); assert.deepEqual(h.calls.at(-1), ['replace', 'home']);
  h.listeners.keyboardWillShow(); h.render(); assert.equal(h.all().filter(n => n.props.accessibilityRole === 'tablist').length, 0);
  h.listeners.keyboardWillHide(); h.render(); assert.equal(h.all().filter(n => n.props.accessibilityRole === 'tablist').length, 1);
  h.dispose();
});

test('product and photo transitions preserve catalogue owner; unavailable brand still has clear exit', () => {
  const h = harness({ name: 'brand', brandId: 'atelier' });
  h.screen().props.navigate({ name: 'try-on', productId: 'atelier:top' });
  assert.deepEqual(h.calls.at(-1), ['navigate', 'try-on', { brandId: 'atelier', productId: 'atelier:top' }]);
  const missing = harness({ name: 'brand', brandId: 'missing' });
  assert.equal(missing.outer().props.palette, undefined);
  missing.press('Exit store view and return to Fashion Centre');
  assert.deepEqual(missing.calls.at(-1), ['reset', { index: 0, routes: [{ name: 'home' }] }]);
  h.dispose(); missing.dispose();
});


test('one compact header replaces duplicate brand bars and retains reachable exit, switch and back', () => {
  for (const route of [{ name: 'home' }, { name: 'brand', brandId: 'atelier' }, { name: 'product', brandId: 'atelier', productId: 'atelier:top' }] as Route[]) {
    const h = harness(route, false, true);
    const headers = h.all().filter(n => n.props.testID === 'compact-shell-header');
    assert.equal(headers.length, 1);
    assert.equal(nodes(headers[0]).some(n => n.props.name === 'arrow-left'), false);
    const returnRow = h.all().find(n => n.props.testID === 'shell-return-row');
    assert.equal(!!returnRow, route.name !== 'home');
    if (returnRow) assert.ok(nodes(returnRow).some(n => n.props.name === 'arrow-left'));
    assert.equal(headers[0].props.style.minHeight, 48);
    assert.equal(h.all().filter(n => n.props.accessibilityRole === 'header').length, 1);
    const marks = h.all().filter(n => n.type === 'BrandMark' && n.props.size === 24);
    assert.equal(marks.length, route.brandId ? 1 : 0);
    if (route.brandId) {
      assert.equal(h.all().filter(n => n.props.label === 'Exit store view and return to Fashion Centre').length, 1);
      const switchStore = h.all().find(n => n.props.label === 'Switch store, current store Demo Atelier');
      switchStore.props.onPress();
      assert.deepEqual(h.calls.at(-1), ['navigate', 'brands', {}]);
    }
    if (route.name === 'product') {
      h.all().find(n => n.props.label === 'Go back').props.onPress();
      assert.deepEqual(h.calls.at(-1), ['goBack']);
    }
    h.dispose();
  }
});


test('global shell combines Bag and Orders and exposes exactly four dock controls', () => {
  const h = harness({ name: 'home' });
  assert.deepEqual(h.all().filter(n => n.props.accessibilityRole === 'tab').map(n => n.props.accessibilityLabel), ['Discover', 'Try on', 'Bag, 7 pieces', 'Profile']);
  assert.equal(h.all().filter(n => n.type === 'Pressable').length, 4);
  assert.equal(h.all().some(n => n.props.testID === 'bottom-tab-orders'), false);
  h.dispose();
});


test('dock Try On opens the store studio and preserves back history', () => {
  const h = harness({ name: 'product', brandId: 'atelier', productId: 'atelier:top' }, false, true);
  h.press('Try on');
  assert.deepEqual(h.calls.at(-1), ['navigate', 'prepare', { brandId: 'atelier' }]);
  assert.equal(h.calls.filter(c => c[0] === 'reset').length, 0);
  assert.equal(h.calls.filter(c => c[0] === 'dismiss').length, 1);
  h.press('Try on');
  assert.equal(h.calls.filter(c => c[0] === 'navigate').length, 2);
  assert.deepEqual(h.calls.at(-1), ['navigate', 'prepare', { brandId: 'atelier' }]);
  // Navigation uses navigate (not push/reset); the preparation route keeps a back path.
  const prepared = harness({ name: 'prepare', brandId: 'atelier', productId: 'atelier:top' }, false, true);
  prepared.press('Go back');
  assert.deepEqual(prepared.calls.at(-1), ['goBack']);
  h.dispose(); prepared.dispose();
});

test('dock Try On never invents a garment or retains an unavailable store', () => {
  for (const [route, params] of [
    [{ name: 'home' }, {}],
    [{ name: 'brand', brandId: 'atelier' }, { brandId: 'atelier' }],
    [{ name: 'product', productId: 'atelier:missing', brandId: 'atelier' }, { brandId: 'atelier' }],
    [{ name: 'brand', brandId: 'unavailable' }, {}],
    [{ name: 'cart', productId: 'atelier:top', brandId: 'atelier' }, { brandId: 'atelier' }],
  ] as [Route, any][]) {
    const h = harness(route);
    h.press('Try on');
    assert.deepEqual(h.calls.at(-1), ['navigate', 'prepare', params]);
    h.dispose();
  }
});

test('photo, preparation, account, provider and checkout screens retain their hidden dock', () => {
  for (const name of ['photos', 'prepare', 'login', 'login-demo', 'try-on', 'checkout'] as const) {
    const h = harness({ name, brandId: 'atelier', productId: 'atelier:top' });
    assert.equal(h.all().some(n => n.props.testID === 'curved-bottom-nav'), false, name);
    assert.equal(h.all().some(n => n.props.testID === 'bottom-try-on'), false, name);
    h.dispose();
  }
});

test('Bag and Orders switches replace one destination without growing back history', () => {
  for (const brandId of [undefined, 'atelier']) for (const [name, next] of [['cart', 'orders'], ['orders', 'cart']] as const) {
    const h = harness({ name, ...(brandId ? { brandId } : {}) }, false, true);
    h.screen().props.navigate({ name: next });
    assert.deepEqual(h.calls.at(-1), ['replace', next, brandId ? { brandId } : {}]);
    assert.equal(h.calls.some(c => c[0] === 'navigate' || c[0] === 'reset'), false);
    const selected = h.all().filter(n => n.props.accessibilityState?.selected);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].props.testID, 'bottom-tab-cart');
    const before = h.calls.length;
    h.screen().props.navigate({ name });
    assert.equal(h.calls.length, before, 'Pressing the current view does not change history');
    h.dispose();
  }
});

test('You exposes one labelled gear and settings keeps brand scope, Back and You selection', () => {
  for (const brandId of [undefined, 'atelier']) {
    const route = { name: 'profile' as const, ...(brandId ? { brandId } : {}) };
    const h = harness(route, false, true);
    const gear = h.all().filter(n => n.props.label === 'Open settings');
    assert.equal(gear.length, 1); assert.equal(gear[0].props.name, 'settings');
    h.press('Open settings');
    assert.deepEqual(h.calls.at(-1), ['navigate', 'settings', brandId ? { brandId } : {}]);
    const settings = harness({ ...route, name: 'settings' }, false, true);
    assert.ok(settings.all().some(n => n.type === 'SettingsScreen' && n.props.route.name === 'settings'));
    assert.equal(settings.all().some(n => n.props.label === 'Open settings'), false);
    assert.equal(settings.all().find(n => n.props.accessibilityState?.selected).props.testID, 'bottom-tab-profile');
    settings.press('Go back');
    assert.deepEqual(settings.calls.at(-1), ['goBack']);
    h.dispose(); settings.dispose();
  }
});

test('style companion remains outside the four-control tablist and uses scoped navigation', () => {
  const h = harness({ name: 'product', brandId: 'atelier', productId: 'atelier:top' });
  const dock = h.all().find(n => n.props.testID === 'curved-bottom-nav');
  assert.equal(nodes(dock).some(n => n.type === 'StyleAssistant'), false);
  const companion = nodes(h.header()).find(n => n.type === 'StyleAssistant');
  assert.ok(companion); assert.equal(companion.props.launcherMode, 'inline');
  assert.equal(companion.props.brandId, 'atelier');
  assert.equal(companion.props.currentProductId, 'atelier:top');
  companion.props.onNavigate({ name: 'orders' });
  assert.deepEqual(h.calls.at(-1), ['navigate', 'orders', { brandId: 'atelier' }]);
  h.dispose();
});

test('settings opened directly recover Back to You without losing store scope', () => {
  for (const brandId of [undefined, 'atelier']) {
    const h = harness({ name: 'settings', ...(brandId ? { brandId } : {}) });
    h.press('Go back');
    assert.deepEqual(h.calls.at(-1), ['replace', 'profile', brandId ? { brandId } : {}]);
    h.dispose();
  }
});


test('content and navigation have separate layout space, and the keyboard releases the footer', () => {
  for (const name of ['home', 'prepare', 'brand', 'product', 'cart', 'orders', 'order', 'profile', 'settings'] as const) {
    const h = harness({ name, brandId: 'atelier' });
    const nav = () => h.all().find(n => n.props.testID === 'shell-bottom-navigation');
    const viewport = h.all().find(n => n.props.testID === 'screen-viewport');
    assert.equal(viewport.props.style.flex, 1);
    assert.equal(viewport.props.style.overflow, 'hidden');
    assert.equal(nav().props.style.position, 'absolute');
    assert.ok(h.all().find(n => n.type === 'DockInset').props.value >= 64);
    assert.equal(nodes(viewport).some(n => n.props.testID === 'curved-bottom-nav'), false);
    h.listeners.keyboardWillShow(); h.render();
    assert.equal(nav(), undefined);
    h.listeners.keyboardWillHide(); h.render();
    assert.ok(nav());
    h.dispose();
  }
});
