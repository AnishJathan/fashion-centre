import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as shell from '../src/shellPresentation.ts';
import * as design from '../src/design.ts';
import { brandExperience } from '../src/brandExperience.ts';
import type { Route } from '../src/navigation.ts';

// Execute the actual dock, handlers and layout calculations with inert native
// boundaries. These checks cannot certify physical devices or hinge support.
const source = ts.transpileModule(fs.readFileSync(new URL('../src/NavBar.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function nodes(value: any): any[] { return Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : []; }
function content(value: any): string { return Array.isArray(value) ? value.map(content).join('') : value && typeof value === 'object' ? content(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value); }
function harness({ width = 390, fontScale = 1, left = 0, right = 0, bottom = 34, palette = design.palettes.light as { [K in keyof typeof design.palettes.light]: string }, route = { name: 'home' } as Route, quantity = 103, accessory = false, os = 'ios', reducedTransparency = false } = {}) {
  let dimensions = { width, fontScale }, tree: any;
  const calls: any[] = [];
  const React = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
  };
  const imports: Record<string, any> = {
    react: { __esModule: true, default: React, ...React },
    'react-native': { Platform: { OS: os }, Pressable: 'Pressable', Text: 'Text', View: 'View', useWindowDimensions: () => dimensions },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom, left, right }) },
    './ui': { Icon: 'Icon', usePalette: () => palette, useReducedTransparency: () => reducedTransparency }, './design': design, './shellPresentation': shell,
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', source)((name: string) => { assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name]; }, module, module.exports);
  const render = () => { tree = module.exports.NavBar({ route, bagQuantity: quantity, onSelectTab: (name: string) => calls.push(name), onTryOn: () => calls.push('prepare'), accessory: accessory ? { type: 'Companion', props: {} } : undefined }); };
  const all = () => nodes(tree);
  const byId = (id: string) => { const item = all().find(node => node.props.testID === id); assert.ok(item, id); return item; };
  render();
  return { all, calls, byId, resize: (width: number, fontScale = 1) => {
    dimensions = { width, fontScale };
    render();
  } };
}

test('dock has exactly four controls with a modest preparation action', () => {
  const h = harness();
  const controls = h.all().filter(node => node.type === 'Pressable');
  assert.deepEqual(controls.map(node => node.props.accessibilityLabel), ['Home', 'Try On', 'Bag, 103 pieces', 'You']);
  assert.deepEqual(controls.map(node => node.props.accessibilityRole), ['tab', 'button', 'tab', 'tab']);
  for (const control of controls) {
    const style = control.props.style({ pressed: false });
    assert.ok(style.minWidth >= 48); assert.ok(style.minHeight >= 48);
    assert.equal(style.flex, 1);
    control.props.onPress();
  }
  assert.deepEqual(h.calls, ['home', 'prepare', 'cart', 'profile']);
  const disc = h.byId('bottom-try-on-disc').props.style;
  assert.equal(disc.width, 28); assert.equal(disc.height, 28);
  assert.match(h.byId('bottom-try-on').props.accessibilityHint, /Nothing is uploaded or generated/);
  assert.ok(h.all().some(node => node.type === 'Text' && content(node) === '99+'));
  assert.equal(h.all().some(node => /Stores|Wishlist/.test(node.props.accessibilityLabel || '')), false);
});

test('four-slot pill adapts to narrow covers, tablet widths, safe areas and text scale', () => {
  for (const width of [240, 280, 320, 360, 390, 540, 673, 720, 768, 884, 1024, 1536]) for (const fontScale of [1, 1.25, 1.5, 2]) for (const accessory of [false, true]) {
    const h = harness({ width, fontScale, accessory });
    const safe = h.byId('bottom-nav-safe-area').props.style;
    const row = h.byId('bottom-nav-row').props.style;
    const available = Math.min(row.maxWidth, width - safe.paddingLeft - safe.paddingRight);
    const stacked = accessory && available < 260;
    const geometry = shell.bottomNavLayout(available - (accessory && !stacked ? 56 : 0), fontScale);
    const frame = h.byId('curved-bottom-nav').props.style;
    assert.ok(geometry.targetWidth >= 48);
    assert.equal(row.maxWidth, 720);
    assert.equal(row.flexDirection, stacked ? 'column-reverse' : 'row');
    assert.equal(frame.height, geometry.targetHeight);
    assert.ok(frame.height >= 48 && frame.height <= 50);
    const surface = h.byId('bottom-nav-surface').props.style;
    assert.equal(surface.height, geometry.height);
    assert.ok(surface.height >= 42 && surface.height <= 48);
    assert.equal(surface.borderRadius, surface.height / 2);
    assert.equal(surface.top, (frame.height - surface.height) / 2);
    assert.equal(h.byId('bottom-nav-surface').props.pointerEvents, 'none');
    const scaledLabelHeight = Math.ceil(12 * Math.min(fontScale, 1.5));
    assert.ok(28 + scaledLabelHeight <= surface.height - 2, 'Try On and its scaled label fit within the capsule');
    const dock = nodes(h.byId('curved-bottom-nav'));
    assert.equal(dock.filter(node => node.type === 'Pressable').length, 4);
    assert.equal(dock.some(node => node.type === 'Companion'), false);
    if (accessory) {
      assert.equal(h.byId('bottom-nav-accessory').props.style.width, 48);
      assert.equal(row.gap, 8);
      assert.ok(geometry.width + (stacked ? 0 : 56) <= available);
    }
    for (const label of h.all().filter(node => node.type === 'Text' && content(node) !== '99+')) {
      assert.equal(label.props.maxFontSizeMultiplier, 1.5);
      assert.equal(label.props.style.fontSize, 10);
    }
  }
  const landscape = harness({ width: 844, left: 44, right: 12, bottom: 21 });
  assert.equal(landscape.byId('bottom-nav-safe-area').props.style.paddingLeft, 44);
  assert.equal(landscape.byId('bottom-nav-safe-area').props.style.paddingRight, 12);
  assert.equal(landscape.byId('bottom-nav-safe-area').props.style.paddingBottom, 21);
  const noInset = harness({ bottom: 0 });
  assert.equal(noInset.byId('bottom-nav-safe-area').props.style.paddingBottom, 8);
});

test('repeated width changes retain four functional controls and lightweight selection', () => {
  const h = harness({ width: 280, accessory: true });
  for (const width of [720, 240, 540, 390, 280, 1536, 320]) {
    h.resize(width);
    const layout = shell.bottomNavLayout(width);
    assert.equal(h.byId('curved-bottom-nav').props.style.height, layout.targetHeight);
    const selected = h.byId('bottom-tab-home').props.style({ pressed: false });
    assert.equal(selected.backgroundColor, 'transparent');
    assert.equal(selected.borderRadius, layout.radius);
    assert.equal(h.all().filter(node => node.type === 'Pressable').length, 4);
    h.byId('bottom-try-on').props.onPress();
  }
  assert.deepEqual(h.calls, Array(7).fill('prepare'));
});

test('brand/global light and dark palettes own every dock surface and action colour', () => {
  for (const theme of ['light', 'dark'] as const) for (const brand of ['', 'atelier', 'everyday', 'studio', 'terra']) {
    const p = brand ? brandExperience(brand, theme).palette : design.palettes[theme];
    const h = harness({ palette: p, route: { name: 'order', ...(brand ? { brandId: brand } : {}) } });
    assert.equal(h.byId('bottom-nav-safe-area').props.style.backgroundColor, undefined);
    assert.equal(h.byId('bottom-nav-surface').props.style.backgroundColor, `${p.surface}C7`);
    assert.equal(h.byId('bottom-tab-cart').props.style({ pressed: false }).backgroundColor, 'transparent');
    const cart = nodes(h.byId('bottom-tab-cart'));
    assert.equal(cart.find(node => node.type === 'Icon').props.color, p.accent);
    assert.equal(cart.find(node => node.type === 'Text' && content(node) === 'Bag').props.style.color, p.accent);
    assert.equal(h.byId('bottom-try-on-disc').props.style.backgroundColor, p.accent);
    assert.equal(nodes(h.byId('bottom-try-on-disc')).find(node => node.type === 'Icon').props.color, p.onAccent);
    const selected = h.all().filter(node => node.props.accessibilityState?.selected);
    assert.equal(selected.length, 1); assert.equal(selected[0].props.testID, 'bottom-tab-cart');
  }
});

test('preparation destinations validate availability, route context and store ownership', () => {
  const products = [{ id: 'atelier:top', brandId: 'atelier' }, { id: 'everyday:tee', brandId: 'everyday' }];
  const brands = [{ id: 'atelier' }, { id: 'everyday' }];
  assert.deepEqual(shell.tryOnDestination({ name: 'product', productId: 'atelier:top', brandId: 'everyday' }, products, brands), { name: 'prepare', brandId: 'atelier', productId: 'atelier:top' });
  assert.deepEqual(shell.tryOnDestination({ name: 'product', productId: 'atelier:top' }, [], brands), { name: 'prepare', brandId: 'atelier' });
  assert.deepEqual(shell.tryOnDestination({ name: 'brand', brandId: '../bad' }, products, brands), { name: 'prepare' });
  assert.deepEqual(shell.tryOnDestination({ name: 'product', productId: 'atelier:top' }, products, []), { name: 'prepare' });
  assert.deepEqual(shell.tryOnDestination({ name: 'cart', brandId: 'everyday' }, products, brands), { name: 'prepare', brandId: 'everyday' });
  assert.deepEqual(shell.tabDestination('orders', { name: 'brand', brandId: 'atelier' }), { name: 'orders', brandId: 'atelier' });
  assert.equal(shell.isRootTab('orders'), true);
  for (const route of ['cart', 'orders', 'order', 'checkout'] as const) assert.equal(shell.activeTab(route), 'cart');
});


test('glass paints only the capsule and leaves every empty overlay region touch-through', () => {
  for (const os of ['ios', 'android', 'web']) for (const reducedTransparency of [false, true]) {
    const h = harness({ os, reducedTransparency, accessory: true });
    for (const id of ['bottom-nav-safe-area', 'bottom-nav-row', 'curved-bottom-nav', 'bottom-nav-controls', 'bottom-nav-accessory']) {
      const wrapper = h.byId(id);
      assert.equal(wrapper.props.pointerEvents, 'box-none', id);
      assert.equal(wrapper.props.style.backgroundColor, undefined, id);
    }
    const paint = h.byId('bottom-nav-surface');
    assert.equal(paint.props.pointerEvents, 'none');
    const style = paint.props.style;
    assert.equal(style.backgroundColor, reducedTransparency ? design.palettes.light.surface : `${design.palettes.light.surface}${os === 'web' ? 'B3' : 'C7'}`);
    assert.equal(style.backdropFilter, os === 'web' && !reducedTransparency ? 'blur(18px) saturate(150%)' : undefined);
    assert.equal(style.WebkitBackdropFilter, style.backdropFilter);
    assert.equal(h.byId('bottom-tab-profile').props.style({ pressed: false }).backgroundColor, 'transparent');
    assert.equal(nodes(h.byId('bottom-tab-profile')).find(node => node.type === 'Icon').props.color, design.palettes.light.text);
  }
});

test('shared overlay footprint exactly reserves touch row, stacked helper and safe bottom', () => {
  for (const width of [240, 280, 320, 390, 884]) for (const fontScale of [1, 1.5, 2]) for (const bottom of [0, 21, 34]) {
    const h = harness({ width, fontScale, bottom, accessory: true });
    const safe = h.byId('bottom-nav-safe-area').props.style;
    const frame = shell.bottomNavFrame(width, fontScale, { left: 0, right: 0, bottom });
    const stacked = h.byId('bottom-nav-row').props.style.flexDirection === 'column-reverse';
    assert.equal(frame.footprint, safe.paddingTop + h.byId('curved-bottom-nav').props.style.height + (stacked ? 56 : 0) + safe.paddingBottom);
    assert.equal(frame.stackedAccessory, stacked);
  }
});


test('glass dock uses a subtle selected capsule without enlarging its painted height', () => {
  const h = harness();
  const active = h.byId('bottom-active-capsule');
  assert.equal(active.props.pointerEvents, 'none');
  assert.equal(active.props.style.backgroundColor, `${design.palettes.light.tint}D9`);
  assert.equal(h.byId('bottom-nav-surface').props.style.height, 42);
  assert.equal(h.all().filter(node => node.props.testID === 'bottom-active-capsule').length, 1);
});
