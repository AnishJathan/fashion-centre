import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as home from '../src/commerceHome.ts';
import * as domain from '../src/core/domain.ts';
import { palettes } from '../src/design.ts';
import * as design from '../src/design.ts';
import * as shoppingLayout from '../src/shoppingLayout.ts';
import * as feed from '../src/homeFeed.ts';

// Runs actual TSX callbacks with persistent hooks and inert native/UI leaves.
// This is not device, layout, image-network, animation or accessibility QA.
type Element = { type: any; props: any };
const source = ts.transpileModule(fs.readFileSync(new URL('../src/CommerceHome.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const products: domain.Product[] = ['Tops', 'Dresses', 'Layers'].map((category, index) => ({
  id: `piece-${index}`, name: `Demo ${category}`, category, brandId: `store-${index}`, brandName: `Demo store ${index}`,
  image: '', moreVariants: false,
  variants: [{ key: 'm', id: 'm', title: 'Medium', amount: 10 + index * 10, currency: 'USD', available: true, options: { Size: 'M' } }],
}));
function content(value: any): string {
  if (Array.isArray(value)) return value.map(content).join('');
  if (value == null || typeof value === 'boolean') return '';
  return typeof value === 'object' ? content(value.props?.children) : String(value);
}
function harness(catalogue = products, dimensions = { width: 390, height: 844, fontScale: 1 }, platform = 'ios', palette: typeof palettes[keyof typeof palettes] = palettes.light) {
  const slots: any[] = [], routes: any[] = [], browses: any[] = [], actions: any[] = [], scrolls: any[] = [], focusEvents: string[] = [], a11yFocus: any[] = [];
  let focused = true, keyboardDismissals = 0;
  const backListeners = new Set<() => boolean>();
  let cursor = 0, tree: Element;
  const pendingEffects: (() => void)[] = [];
  const motionListeners = new Set<(value: boolean) => void>();
  const frames = new Map<number, () => void>(); let nextFrame = 0;
  const state = {
    catalogueLoading: false, catalogueError: '', theme: palette === palettes.dark ? 'dark' : 'light',
    products: catalogue, saved: [] as string[], followed: [] as string[],
    brands: catalogue.map(p => ({ id: p.brandId, name: p.brandName, image: '', products: [p], more: false })),
    commerce: { cart: [{ productId: 'retained', quantity: 2 }] },
    toggleSaved: () => assert.fail('Home must not change retained saved data'),
    toggleFollowed: (id: string) => { actions.push(['follow', id]); state.followed = state.followed.includes(id) ? state.followed.filter(x => x !== id) : [...state.followed, id]; },
    dispatch: () => assert.fail('Home must not generate cart actions'),
    reload: () => { actions.push(['reload']); return Promise.resolve(); },
  };
  const React = {
    Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next: any) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef: (initial: any) => { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback: (callback: any, deps: any[]) => {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((dep, j) => !Object.is(dep, previous.deps[j]))) slots[i] = { deps, callback };
      return slots[i].callback;
    },
    useEffect: (effect: () => void | (() => void), deps?: any[]) => {
      const i = cursor++, previous = slots[i];
      if (!previous || !deps || deps.some((dep, j) => !Object.is(dep, previous.deps[j]))) {
        pendingEffects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
      }
    },
  };
  const imports: Record<string, any> = {
    react: { __esModule: true, default: React, ...React },
    'react-native': { ...Object.fromEntries(['Pressable', 'ScrollView', 'Text', 'TextInput', 'View', 'FlatList', 'KeyboardAvoidingView', 'ActivityIndicator'].map(n => [n, n])),
      Platform: { OS: platform },
      Keyboard: { dismiss: () => { keyboardDismissals++; } },
      BackHandler: { addEventListener: (_event: string, callback: () => boolean) => { backListeners.add(callback); return { remove: () => backListeners.delete(callback) }; } },
      findNodeHandle: (node: any) => node?.id,
      AccessibilityInfo: { setAccessibilityFocus: (node: any) => a11yFocus.push(node), isReduceMotionEnabled: async () => true, addEventListener: (_event: string, listener: (value: boolean) => void) => { motionListeners.add(listener); return { remove: () => motionListeners.delete(listener) }; } },
      StyleSheet: { create: (value: any) => value }, useWindowDimensions: () => dimensions },
    '@react-navigation/native': { useFocusEffect: (callback: any) => React.useEffect(() => focused ? callback() : undefined, [callback, focused]) },
    'react-native-svg': { __esModule: true, default: 'Svg', Defs: 'Defs', LinearGradient: 'LinearGradient', Rect: 'Rect', Stop: 'Stop' },
    '@react-navigation/elements': { useHeaderHeight: () => 52 },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 8, right: 8 }) },
    './homeFeed': feed, './design': design, './shoppingLayout': shoppingLayout,
    './state': { useApp: () => state }, './commerceHome': home, './core/domain': domain,
    './FollowedBrandRail': { FollowedBrandRail: 'FollowedBrandRail' },
    './BrandMark': { BrandMark: 'BrandMark' },
    './ui': { Button: 'Button', Icon: 'Icon', Photo: 'Photo', useBottomOverlay: () => 64, usePalette: () => palette },
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', 'fetch', 'requestAnimationFrame', 'cancelAnimationFrame', source)((name: string) => {
    assert.ok(name in imports, `Unexpected dependency: ${name}`); return imports[name];
  }, module, module.exports, () => assert.fail('Unexpected component network request'), (callback: () => void) => { const id = ++nextFrame; frames.set(id, callback); return id; }, (id: number) => frames.delete(id));
  function expand(value: any): any {
    if (Array.isArray(value)) return value.map(expand);
    if (!value || typeof value !== 'object') return value;
    if (typeof value.type === 'function') return expand(value.type(value.props));
    if (value.type === 'FlatList') return { ...value, props: { ...value.props, children: expand([value.props.ListHeaderComponent, value.props.data.length ? value.props.data.map((item: any, index: number) => value.props.renderItem({ item, index })) : value.props.ListEmptyComponent, value.props.ListFooterComponent]) } };
    if (value.props.ref) value.props.ref.current = { id: value.props.testID || value.type, scrollTo: (options: any) => scrolls.push(options), focus: () => focusEvents.push(value.props.testID || value.type) };
    return { ...value, props: { ...value.props, children: expand(value.props.children) } };
  }
  const render = () => { cursor = 0; tree = expand(module.exports.CommerceHome({ navigate: (r: any) => routes.push(r), onBrowse: (s: any) => browses.push(s) })); pendingEffects.splice(0).forEach(effect => effect()); };
  function nodes(value: any): Element[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    return value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
  }
  const all = () => nodes(tree);
  const controls = (label: string) => all().filter(n => typeof n.props.onPress === 'function' && (n.props.accessibilityLabel === label || n.props.label === label || content(n) === label));
  const press = (label: string, occurrence = 0) => { const matches = controls(label); assert.ok(matches[occurrence], `Missing control: ${label}`); matches[occurrence].props.onPress(); render(); };
  const input = () => all().find(n => n.type === 'TextInput')!;
  const type = (value: string) => { input().props.onChangeText(value); render(); };
  render();
  return { frames, flushFrames: () => { const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback()); render(); }, all, render, controls, press, input, type, routes, browses, actions, scrolls, state, focusEvents, a11yFocus,
    focus: (value: boolean) => { focused = value; render(); },
    hardwareBack: () => { const handled = [...backListeners].reverse().some(listener => listener()); render(); return handled; },
    backListenerCount: () => backListeners.size, keyboardDismissals: () => keyboardDismissals,
    motion: (value: boolean) => motionListeners.forEach(listener => listener(value)),
    dispose: () => slots.forEach(slot => slot?.cleanup?.()), listenerCount: () => motionListeners.size, text: () => content(tree) };
}

test('home search types, clears, trims submission and opens the exact suggestion', () => {
  const h = harness(); h.press('Search catalogue'); h.type('  dresses  ');
  assert.equal(h.input().props.value, '  dresses  ');
  h.input().props.onSubmitEditing();
  h.press('Search for “dresses”');
  assert.deepEqual(h.browses, [{ query: 'dresses' }, { query: 'dresses' }]);
  const suggestion = h.all().find(n => n.type === 'Pressable' && content(n) === 'Demo DressesDemo store 1 · Dresses')!;
  assert.ok(suggestion); suggestion.props.onPress();
  assert.deepEqual(h.routes, [{ name: 'product', productId: 'piece-1', brandId: 'store-1' }]);
  h.press('Clear search'); assert.equal(h.input().props.value, '');
  assert.equal(h.controls('Clear search').length, 0);
  h.type('no such item'); assert.match(h.text(), /No matching items/);
  assert.deepEqual(h.actions, []);
});

test('category, value collection and section CTAs pass exact browse selections', () => {
  const h = harness(); h.press('Shop all'); h.press('Dresses');
  h.press(`Shop Tops in USD, from ${domain.money(10, 'USD')}`);
  h.press('See all', 1); h.press('See all', 0);
  assert.deepEqual(h.browses, [undefined, { category: 'Dresses' },
    { category: 'Tops', currency: 'USD', sort: 'price' }, { sort: 'price' }, undefined]);
  assert.deepEqual(h.actions, []);
});

test('Shop all follows each theme and energetic Home colours retain readable text and icons', () => {
  const luminance = (hex: string) => {
    const rgb = hex.slice(1).match(/../g)!.map(channel => parseInt(channel, 16) / 255)
      .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const contrast = (a: string, b: string) => {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  };
  const descendants = (value: any): any[] => Array.isArray(value) ? value.flatMap(descendants)
    : value && typeof value === 'object' ? [value, ...descendants(value.props?.children)] : [];
  const style = (node: any) => Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
  const catalogue = [...products, { ...products[0], id: 'piece-3', name: 'Demo Accessories', category: 'Accessories' }]
    .map(product => ({ ...product, image: `local-${product.id}` }));
  for (const palette of Object.values(palettes)) {
    const h = harness(catalogue, undefined, 'ios', palette);
    const shop = descendants(h.controls('Shop all')[0]);
    const tile = shop.find(node => style(node).backgroundColor === palette.accent);
    const icon = shop.find(node => node.type === 'Icon' && node.props.name === 'grid');
    assert.ok(tile);
    assert.equal(icon.props.color, palette.onAccent);
    assert.ok(contrast(icon.props.color, style(tile).backgroundColor) >= 4.5);
    const cards = h.all().filter(node => /^Shop .* in USD, from /.test(node.props.accessibilityLabel || ''));
    assert.equal(cards.length, 4);
    cards.forEach((card, index) => {
      assert.equal(style(card).backgroundColor, ['#FFEA52', '#83D6FF', '#FF998A', '#A5F0D1'][index]);
      for (const label of descendants(card).filter(node => node.type === 'Text')) {
        assert.ok(contrast(style(label).color, style(card).backgroundColor) >= 4.5);
      }
    });
    const chip = h.all().find(node => style(node).backgroundColor === '#FFEA52' && style(node).flexDirection === 'row');
    assert.ok(chip);
    for (const label of descendants(chip).filter(node => node.type === 'Text')) {
      assert.ok(contrast(style(label).color, style(chip).backgroundColor) >= 4.5);
    }
    for (const icon of descendants(chip).filter(node => node.type === 'Icon')) {
      assert.ok(contrast(icon.props.color, style(chip).backgroundColor) >= 3);
    }
    const photoLabels = h.all().filter(node => node.props.testID === 'home-product-category');
    assert.ok(photoLabels.length, 'product category labels stay separated from garment imagery');
    for (const label of photoLabels) {
      assert.equal(style(label).backgroundColor, '#FFFFFF', 'opaque photo badge prevents clothing-dependent contrast');
      for (const text of descendants(label).filter(node => node.type === 'Text')) {
        assert.ok(contrast(style(text).color, style(label).backgroundColor) >= 4.5);
      }
    }
    h.dispose();
  }
});

test('removed promotional carousel and search-row Try On stay absent', () => {
  const h = harness();
  assert.equal(h.controls('Previous collection').length, 0);
  assert.equal(h.controls('Next collection').length, 0);
  assert.equal(h.controls('Prepare your try-on photo').length, 0);
  assert.equal(h.all().some(n => n.props.pagingEnabled), false);
  assert.doesNotMatch(h.text(), /your way|Shop edit/);
  assert.equal(h.listenerCount(), 0);
  assert.deepEqual(h.routes, []); h.dispose();
});

test('follow and product/store navigation preserve exact identities without wishlist controls', () => {
  const h = harness();
  for (const product of products) {
    assert.equal(h.controls(`Save ${product.name}`).length, 0);
    assert.equal(h.controls(`Unsave ${product.name}`).length, 0);
  }
  h.press('Follow Demo store 1'); assert.deepEqual(h.state.followed, ['store-1']);
  h.press('Unfollow Demo store 1'); assert.deepEqual(h.state.followed, []);
  h.press('View Demo Dresses'); h.press('Browse Demo store 1');
  h.press('All stores');
  assert.equal(h.controls('Open your wishlist').length, 0);
  assert.equal(h.controls('Open your bag').length, 0);
  assert.deepEqual(h.routes, [{ name: 'product', productId: 'piece-1', brandId: 'store-1' }, { name: 'brand', brandId: 'store-1' }, { name: 'brands' }]);
  assert.deepEqual(h.actions, [['follow', 'store-1'], ['follow', 'store-1']]);
  assert.deepEqual(h.state.commerce.cart, [{ productId: 'retained', quantity: 2 }]);
  assert.match(h.text(), /Fictional demo catalogue/); assert.match(h.text(), /Checkout stays on this device/);
});

test('empty home has a store recovery action without carousel or unsolicited state changes', () => {
  const h = harness([]); assert.equal(h.controls('Next collection').length, 0);
  h.press('Manage demo stores'); assert.deepEqual(h.routes, [{ name: 'stores' }]);
  assert.deepEqual(h.actions, []); assert.deepEqual(h.browses, []);
});

test('product rails retain a separate Try On route with the exact selected product and brand', () => {
  const catalogue = products.map(product => ({ ...product, image: `local-${product.id}` }));
  const h = harness(catalogue);
  for (const product of catalogue) {
    const matches = h.controls(`Try on ${product.name}`);
    assert.ok(matches.length, `Missing separate Try On action for ${product.name}`);
    for (const button of matches) {
      assert.equal(button.props.accessibilityRole, 'button');
      assert.equal(button.props.disabled, false);
      assert.equal(button.props.accessibilityState.disabled, false);
      button.props.onPress();
      assert.deepEqual(h.routes.at(-1), { name: 'try-on', productId: product.id, brandId: product.brandId });
    }
  }
  h.press('View Demo Dresses');
  assert.deepEqual(h.routes.at(-1), { name: 'product', productId: 'piece-1', brandId: 'store-1' });
  assert.deepEqual(h.actions, []);
  assert.deepEqual(h.state.commerce.cart, [{ productId: 'retained', quantity: 2 }]);
  h.dispose();
});

test('followed-brand discovery remains first without a duplicate search-row Try On', () => {
  const h = harness();
  const all = h.all();
  const rail = all.find(node => node.type === 'FollowedBrandRail')!;
  assert.ok(all.indexOf(rail) < all.findIndex(node => node.props.testID === 'home-discovery-controls'));
  assert.equal(typeof rail.props.navigate, 'function');
  assert.equal(h.controls('Prepare your try-on photo').length, 0);
  assert.deepEqual(h.routes, []);
  assert.deepEqual(h.actions, []); h.dispose();
});

test('product Try On controls disclose disabled state when the product has no image', () => {
  const h = harness();
  for (const product of products) {
    const matches = h.controls(`Try on ${product.name}`);
    assert.ok(matches.length);
    for (const button of matches) {
      assert.equal(button.props.disabled, true);
      assert.equal(button.props.accessibilityState.disabled, true);
    }
  }
  assert.deepEqual(h.routes, []); assert.deepEqual(h.actions, []); h.dispose();
});


const style = (value: any): Record<string, any> => Array.isArray(value)
  ? Object.assign({}, ...value.map(style)) : (value || {});

test('home configures compact collections, categories, brand marks and product cards at narrow and wide widths', () => {
  for (const width of [320, 390, 1024]) {
    for (const fontScale of [1, 1.6]) {
      const h = harness(products, { width, height: 844, fontScale });
      const categoryPhoto = h.all().find(n => n.type === 'Photo' && n.props.label === 'Tops')!;
      assert.ok(categoryPhoto.props.height <= 32);
      const marks = h.all().filter(n => n.type === 'BrandMark');
      assert.deepEqual(marks.map(n => [n.props.id, n.props.name, n.props.size]), products.map(p => [p.brandId, p.brandName, 26]));
      const cards = h.all().filter(n => n.props.testID === 'home-product-card');
      assert.ok(cards.length >= products.length);
      const expected = shoppingLayout.shoppingGridLayout(Math.min(width - 40, 984), fontScale).cardWidth;
      assert.ok(cards.every(n => style(n.props.style).width === expected));
      const productPhotos = h.all().filter(n => n.type === 'Photo' && products.some(p => p.name === n.props.label));
      assert.ok(productPhotos.every(n => n.props.height <= 220));
      assert.equal(h.controls('Prepare your try-on photo').length, 0);
      assert.deepEqual(h.actions, []); assert.deepEqual(h.routes, []); h.dispose();
    }
  }
});

test('home reaches actual products before value promotions and its compact brand directory', () => {
  const h = harness();
  const nodes = h.all();
  const firstProduct = nodes.findIndex(n => n.props.accessibilityLabel === 'View Demo Tops');
  const valueHeader = nodes.findIndex(n => n.type === 'Text' && content(n) === 'Value picks');
  const directoryHeader = nodes.findIndex(n => n.type === 'Text' && content(n) === 'Discover brands');
  assert.ok(nodes.findIndex(n => n.type === 'FollowedBrandRail') < firstProduct);
  assert.ok(firstProduct > 0 && firstProduct < valueHeader && valueHeader < directoryHeader);
  assert.equal(h.controls('Explore the full catalogue').length, 0, 'No oversized duplicate footer CTA');
  for (const product of products) {
    const browse = h.controls(`Browse ${product.brandName}`)[0];
    assert.ok(style(browse.props.style).minHeight <= 48);
    assert.ok(!content(browse).includes('Follow'));
  }
  h.dispose();
});

test('legacy saved data does not change recommendations or product Try On', () => {
  const h = harness(products.map(p => ({ ...p, image: `local-${p.id}` })));
  const initialText = h.text();
  const initialProductLabels = h.all().filter(n => n.props.accessibilityLabel?.startsWith('View ')).map(n => n.props.accessibilityLabel);
  h.state.saved = ['piece-1', 'unavailable-piece']; h.render();
  assert.equal(h.text(), initialText);
  assert.match(h.text(), /Keep exploring/);
  assert.doesNotMatch(h.text(), /saved finds|categories you’ve saved/i);
  assert.deepEqual(h.all().filter(n => n.props.accessibilityLabel?.startsWith('View ')).map(n => n.props.accessibilityLabel), initialProductLabels);
  assert.equal(h.controls('Save Demo Dresses').length, 0);
  assert.equal(h.controls('Unsave Demo Dresses').length, 0);
  h.press('Try on Demo Dresses');
  assert.deepEqual(h.routes, [{ name: 'try-on', productId: 'piece-1', brandId: 'store-1' }]);
  assert.deepEqual(h.state.saved, ['piece-1', 'unavailable-piece']);
  assert.deepEqual(h.actions, []); h.dispose();
});


test('compact search and small Try On pills retain touch areas in a narrow safe-area pane', () => {
  const h = harness(products, { width: 320, height: 700, fontScale: 1 });
  const root = h.all().find(n => n.type === 'View' && n.props.onLayout);
  root.props.onLayout({ nativeEvent: { layout: { width: 242 } } }); h.render();
  assert.equal(h.all().some(n => n.props.pagingEnabled), false);
  h.press('Search catalogue');
  assert.ok(style(h.input().props.style).minHeight >= 44);
  assert.equal(style(h.input().props.style).fontSize, 13);
  for (const button of h.all().filter(n => n.props.accessibilityLabel?.startsWith('Try on Demo'))) {
    assert.ok(style(button.props.style).minHeight >= 48);
    assert.equal(style(button.props.style).alignSelf, 'flex-start');
  }
  h.dispose();
});


test('one compact discovery row contains a pinned search icon and all category shortcuts by default', () => {
  const h = harness();
  const row = h.all().find(n => n.props.testID === 'home-discovery-row')!;
  const children = row.props.children.flat().filter(Boolean);
  assert.deepEqual(children.map(n => n.props.testID), ['home-search-toggle', 'home-category-shortcuts', 'home-filter-toggle']);
  assert.equal(h.input(), undefined, 'No always-visible search field');
  const toggle = h.controls('Search catalogue')[0];
  assert.deepEqual(toggle.props.accessibilityState, { expanded: false });
  assert.equal(style(toggle.props.style).minWidth, 48);
  assert.equal(style(toggle.props.style).minHeight, 48);
  const rail = children[1];
  assert.equal(rail.props.horizontal, true);
  assert.equal(rail.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(style(rail.props.style).minWidth, 0);
  assert.equal(style(rail.props.style).flex, 1);
  assert.ok(h.controls('Shop all').length);
  for (const product of products) assert.ok(h.controls(product.category).length);
  assert.deepEqual(h.routes, []); assert.deepEqual(h.browses, []);
  assert.equal(h.backListenerCount(), 0); h.dispose();
});

test('search opens inline, keeps the query visible when closed, and restores focus on repeated reopen and clear', () => {
  const h = harness();
  for (let count = 0; count < 3; count++) {
    h.press(count ? 'Edit search: dresses' : 'Search catalogue');
    assert.equal(h.controls('Close search')[0].props.accessibilityState.expanded, true);
    assert.equal(h.input().props.testID, 'home-search-input');
    assert.equal(h.focusEvents.at(-1), 'home-search-input');
    assert.equal(h.a11yFocus.at(-1), 'home-search-input');
    assert.equal(h.controls('Shop all').length, 0, 'The input uses the same row instead of adding permanent chrome');
    assert.equal(h.backListenerCount(), 1);
    h.type(' dresses ');
    assert.ok(h.controls('Search for “dresses”').length);
    h.press('Close search');
    assert.equal(h.input(), undefined);
    assert.equal(h.controls('Search for “dresses”').length, 0);
    assert.ok(h.controls('Shop all').length);
    const retained = h.controls('Edit search: dresses')[0];
    assert.equal(content(retained), 'dresses');
    assert.equal(h.focusEvents.at(-1), 'home-search-toggle');
    assert.equal(h.a11yFocus.at(-1), 'home-search-toggle');
    assert.equal(h.backListenerCount(), 0);
  }
  h.press('Edit search: dresses');
  assert.equal(h.input().props.value, ' dresses ');
  h.press('Clear search');
  assert.equal(h.input().props.value, '');
  assert.equal(h.focusEvents.at(-1), 'home-search-input');
  assert.equal(h.controls('Clear search').length, 0);
  assert.ok(h.controls('Close search').length);
  h.press('Close search'); assert.ok(h.controls('Search catalogue').length);
  assert.deepEqual(h.browses, []); assert.deepEqual(h.routes, []); assert.deepEqual(h.actions, []);
  assert.equal(h.keyboardDismissals(), 4); h.dispose();
});

test('search back handling only intercepts while focused; keyboard and accessibility dismissal retain text', () => {
  const h = harness(); h.press('Search catalogue'); h.type('layers');
  h.focus(false); assert.equal(h.backListenerCount(), 0);
  assert.equal(h.hardwareBack(), false);
  assert.equal(h.input().props.value, 'layers');
  h.focus(true); assert.equal(h.backListenerCount(), 1);
  assert.equal(h.hardwareBack(), true); assert.equal(h.input(), undefined);
  assert.equal(h.hardwareBack(), false);
  h.press('Edit search: layers');
  h.input().props.onKeyPress({ nativeEvent: { key: 'Escape' } }); h.render();
  assert.equal(h.input(), undefined);
  h.press('Edit search: layers');
  h.input().props.onAccessibilityEscape(); h.render();
  assert.equal(h.input(), undefined);
  assert.equal(content(h.controls('Edit search: layers')[0]), 'layers');
  h.press('Edit search: layers'); h.dispose(); assert.equal(h.backListenerCount(), 0);
  assert.deepEqual(h.routes, []); assert.deepEqual(h.actions, []);
});

test('search submission and suggestion navigation dismiss the keyboard without changing exact destinations', () => {
  const h = harness(); h.press('Search catalogue'); h.type('  dresses  ');
  h.input().props.onSubmitEditing();
  assert.deepEqual(h.browses, [{ query: 'dresses' }]);
  assert.equal(h.keyboardDismissals(), 1);
  h.press('View Demo Dresses, Demo store 1, Dresses');
  assert.deepEqual(h.routes, [{ name: 'product', productId: 'piece-1', brandId: 'store-1' }]);
  assert.equal(h.keyboardDismissals(), 2);
  h.focus(false); h.focus(true);
  assert.equal(h.input().props.value, '  dresses  ', 'Returning from a suggestion keeps the search context');
  h.press('Close search'); h.press('Layers');
  assert.deepEqual(h.browses.at(-1), { category: 'Layers' }, 'Category navigation does not inherit a stale search query');
  assert.deepEqual(h.actions, []); h.dispose();
});

test('merged controls keep touch targets and uncapped long labels in narrow panes and large text without motion', () => {
  const label = 'Very long special occasion dresses and matching accessories';
  for (const width of [320, 390, 884]) for (const fontScale of [1, 1.6, 2.5]) {
    const h = harness([{ ...products[0], category: label }], { width, height: 844, fontScale });
    const pageWidth = width === 320 ? 242 : width - 32;
    h.all().find(n => n.type === 'View' && n.props.onLayout)!.props.onLayout({ nativeEvent: { layout: { width: pageWidth } } }); h.render();
    for (const query of ['', label]) {
      if (query) { h.press('Search catalogue'); h.type(query); h.press('Close search'); }
      const toggle = h.all().find(n => n.props.testID === 'home-search-toggle')!;
      const category = h.all().find(n => n.type === 'Pressable' && n.props.accessibilityLabel === label)!, categoryStyle = style(category.props.style);
      assert.ok(categoryStyle.minHeight >= 48 && categoryStyle.minWidth >= 48);
      assert.ok(categoryStyle.width <= pageWidth - style(toggle.props.style).maxWidth - 48 - 12 + .001, JSON.stringify({ width, fontScale, query, pageWidth, categoryStyle, toggle: style(toggle.props.style) }));
      const text = category.props.children.flat().find(n => n.type === 'Text');
      assert.equal(text.props.numberOfLines, undefined);
      assert.equal(text.props.maxFontSizeMultiplier, undefined);
      assert.equal(style(category.props.style).height, undefined, 'Long labels may expand instead of clipping');
      assert.equal(category.props.accessibilityLabel, label);
      assert.equal(h.listenerCount(), 0, 'Search expansion is immediate and has no motion');
      h.motion(true); h.render();
    }
    h.press(`Edit search: ${label}`);
    const field = h.all().find(n => n.props.testID === 'home-search-field')!;
    assert.equal(style(field.props.style).flex, 1); assert.equal(style(field.props.style).minWidth, 0);
    assert.ok(style(h.input().props.style).minHeight >= 44);
    const clear = h.controls('Clear search')[0];
    assert.ok(style(clear.props.style).width >= 44 && style(clear.props.style).minHeight >= 44);
    assert.equal(h.input().props.maxFontSizeMultiplier, undefined);
    h.dispose();
  }
});


test('home filters open the real catalogue filter controls and preserve a typed query', () => {
  const h = harness();
  h.press('Filters & sort');
  assert.deepEqual(h.browses, [{ showFilters: true }]);
  h.press('Search catalogue'); h.type('  dresses  '); h.press('Close search');
  h.press('Filters & sort');
  assert.deepEqual(h.browses.at(-1), { showFilters: true, query: 'dresses' });
  const filter = h.controls('Filters & sort')[0];
  assert.equal(style(filter.props.style).width, 48);
  assert.equal(style(filter.props.style).minHeight, 48);
  assert.deepEqual(h.routes, []); assert.deepEqual(h.actions, []); h.dispose();
});


test('web search uses normal input and launcher focus without native accessibility handles', () => {
  const h = harness(products, { width: 390, height: 844, fontScale: 1 }, 'web');
  h.press('Search catalogue');
  assert.equal(h.focusEvents.at(-1), 'home-search-input');
  h.type('dresses'); h.press('Close search');
  assert.equal(h.focusEvents.at(-1), 'home-search-toggle');
  h.press('Edit search: dresses');
  assert.equal(h.focusEvents.at(-1), 'home-search-input');
  assert.deepEqual(h.a11yFocus, []); h.dispose();
});


const manyProducts = (total = 20) => Array.from({ length: total }, (_, index) => ({ ...products[index % products.length], id: `feed-${index}`, name: `Feed ${index}`, image: `local-${index}` }));
const listIn = (h: ReturnType<typeof harness>) => h.all().find(node => node.props.testID === 'home-product-feed')!;
const shown = (h: ReturnType<typeof harness>) => listIn(h).props.data.flatMap((row: any) => row.products);

test('home automatically appends one unique batch per frame and stops honestly at the end', () => {
  const catalogue = manyProducts();
  const h = harness([...catalogue, catalogue[2], catalogue[0]]);
  assert.equal(shown(h).length, 6);
  assert.equal(h.controls('Follow Demo store 1').length, 0, 'Discovery modules cannot push the paging threshold below the product feed');
  listIn(h).props.onEndReached(); listIn(h).props.onEndReached(); h.render();
  assert.equal(h.frames.size, 1);
  assert.equal(h.controls('Showing more pieces…')[0].props.disabled, true);
  h.flushFrames(); assert.equal(shown(h).length, 12);
  h.press('Show more pieces'); h.flushFrames(); assert.equal(shown(h).length, 18);
  listIn(h).props.onEndReached(); h.flushFrames();
  assert.deepEqual(shown(h), catalogue);
  assert.equal(new Set(shown(h).map(feed.homeProductKey)).size, 20);
  assert.equal(h.controls('Show more pieces').length, 0);
  assert.match(h.text(), /all caught up/);
  listIn(h).props.onEndReached(); assert.equal(h.frames.size, 0);
  assert.equal(listIn(h).props.windowSize, 7);
  assert.equal(listIn(h).props.initialNumToRender, 4);
  assert.deepEqual(h.actions, []); h.dispose();
});

test('catalogue changes and blur cancel pending appends without showing old products', () => {
  const h = harness(manyProducts());
  listIn(h).props.onEndReached(); assert.equal(h.frames.size, 1);
  h.state.products = manyProducts(8).map(p => ({ ...p, id: `new-${p.id}` })); h.render();
  assert.equal(h.frames.size, 0); assert.equal(shown(h).length, 6);
  assert.ok(shown(h).every((p: domain.Product) => p.id.startsWith('new-')));
  listIn(h).props.onEndReached(); h.focus(false);
  assert.equal(h.frames.size, 0); listIn(h).props.onEndReached(); assert.equal(h.frames.size, 0);
  h.focus(true); listIn(h).props.onEndReached(); h.flushFrames(); assert.equal(shown(h).length, 8);
  h.state.products = manyProducts(20); h.render(); listIn(h).props.onEndReached(); h.dispose();
  assert.equal(h.frames.size, 0);
});

test('loading, empty, partial failure, retry and bounded API end states stay truthful', () => {
  const h = harness([]);
  h.state.catalogueLoading = true; h.render();
  assert.match(h.text(), /Loading your catalogues/);
  assert.equal(h.controls('Manage demo stores').length, 0);
  assert.equal(listIn(h).props.refreshing, true);
  listIn(h).props.onEndReached(); assert.equal(h.frames.size, 0);
  listIn(h).props.onRefresh(); assert.deepEqual(h.actions, []);
  h.state.catalogueLoading = false; h.state.catalogueError = 'One catalogue is unavailable'; h.render();
  assert.equal(h.controls('Manage demo stores').length, 0);
  h.press('Retry catalogues'); assert.deepEqual(h.actions, [['reload']]);
  h.state.products = products; h.render();
  assert.equal(shown(h).length, 3); assert.match(h.text(), /Retry to recover missing catalogues/);
  h.state.catalogueError = ''; h.state.brands = [{ id: 'bounded', name: 'Bounded store', image: '', products, more: true }]; h.render();
  assert.match(h.text(), /does not provide further pages/);
  assert.doesNotMatch(h.text(), /all caught up/);
  listIn(h).props.onRefresh(); assert.deepEqual(h.actions, [['reload'], ['reload']]);
  h.state.products = []; h.render(); h.press('Manage demo stores');
  assert.deepEqual(h.routes, [{ name: 'stores' }]); h.dispose();
});

test('search and filter controls are compact fixed siblings of the scrollable feed', () => {
  for (const width of [320, 390, 720, 884]) for (const fontScale of [1, 1.6]) {
    const h = harness(manyProducts(), { width, height: 844, fontScale });
    const root = h.all()[0], children = root.props.children.flat().filter(Boolean);
    assert.deepEqual(children.map((node: any) => node.props.testID), ['home-pinned-controls', 'home-product-feed']);
    const list = listIn(h);
    assert.equal(style(list.props.style).flex, 1);
    assert.ok(style(list.props.contentContainerStyle).paddingBottom >= 76);
    assert.ok(style(list.props.contentContainerStyle).paddingLeft >= 8);
    assert.equal(h.all().filter(node => node.type === 'FlatList').length, 1);
    for (const id of ['home-search-toggle', 'home-filter-toggle']) {
      const control = h.all().find(node => node.props.testID === id)!;
      assert.ok(style(control.props.style).minHeight >= 48);
      const disc = control.props.children.flat().find((node: any) => node?.type === 'View');
      assert.equal(style(disc.props.style).width, 32);
      assert.equal(style(disc.props.style).height, 32);
    }
    h.press('Filters & sort'); assert.deepEqual(h.browses, [{ showFilters: true }]);
    h.press('Search catalogue'); h.type('Feed');
    const suggestions = h.all().find(node => node.props.testID === 'home-search-suggestions')!;
    assert.ok(style(suggestions.props.style).maxHeight <= 220);
    h.dispose();
  }
});


test('reference-inspired cards are image-led and retain real details without ratings or discounts', () => {
  const h = harness(products.map(product => ({ ...product, image: `local-${product.id}` })));
  const card = h.all().find(node => node.props.testID === 'home-product-card')!;
  assert.equal(style(card.props.style).borderWidth, undefined);
  const photo = h.all().find(node => node.type === 'Photo' && node.props.label === products[0].name)!;
  assert.ok(photo.props.height > 144 && photo.props.height <= 220);
  const tryOn = h.controls(`Try on ${products[0].name}`)[0];
  assert.equal(style(tryOn.props.style).position, 'absolute');
  assert.ok(style(tryOn.props.style).minHeight >= 48);
  assert.ok(h.all().find(node => node.props.testID === 'home-category-indicator'));
  assert.doesNotMatch(h.text(), /lowest price|bank offer|% off|reviews|\d\.\d ★/i);
  assert.equal(h.all().filter(node => node.type === 'LinearGradient').length, 1);
  assert.equal(h.all().find(node => node.type === 'Stop').props.stopColor, '#C5E8FF');
  h.dispose();
});
