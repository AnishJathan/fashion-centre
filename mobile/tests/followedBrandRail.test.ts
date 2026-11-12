import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as followed from '../src/followedBrands.ts';
import * as brandExperience from '../src/brandExperience.ts';
import { palettes } from '../src/design.ts';
import type { Brand } from '../src/core/domain.ts';

// Execute the real TSX with persistent hooks, deferred accessibility queries,
// inert native/UI leaves and a fake clock. No browser, network or native claims.
type Element = { type: any; props: any };
const source = ts.transpileModule(fs.readFileSync(new URL('../src/FollowedBrandRail.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const store = (id: string, name = `Store ${id}`): Brand => ({ id, name, image: `local-${id}`, products: [], more: false });
const defaults = [store('a'), store('b'), store('c')];
function text(value: any): string {
  if (Array.isArray(value)) return value.map(text).join('');
  if (value == null || typeof value === 'boolean') return '';
  return typeof value === 'object' ? text(value.props?.children) : String(value);
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const style = (value: any, pressed = false): any => typeof value === 'function' ? style(value({ pressed })) : Array.isArray(value) ? Object.assign({}, ...value.map(item => style(item, pressed))) : value || {};
function harness(options: { brands?: Brand[]; followed?: string[]; focused?: boolean; appState?: string; fontScale?: number; theme?: 'light' | 'dark' } = {}) {
  const slots: any[] = [], routes: any[] = [], scrolls: any[] = [], actions: any[] = [];
  const pending: (() => void)[] = [], nativeRefs = new Set<{ current: any }>();
  const listeners = new Map<string, Set<(value: any) => void>>();
  const removals: string[] = [], intervalStarts: number[] = [], intervalClears: number[] = [];
  const timers = new Map<number, { callback: () => void; delay: number; next: number }>();
  const motionQuery = deferred<boolean>(), readerQuery = deferred<boolean>();
  let cursor = 0, tree: Element, focused = options.focused ?? true, mounted = true;
  let now = 0, timerId = 0, writesAfterUnmount = 0;
  const state = {
    brands: options.brands ?? [...defaults], followed: options.followed ?? ['a', 'b', 'c'],
    theme: options.theme ?? 'light',
    toggleFollowed: (...args: any[]) => { actions.push(['follow', ...args]); assert.fail('Banner must not change follows'); },
    reload: () => assert.fail('Banner must not reload the catalogue'),
    dispatch: () => assert.fail('Banner must not create commerce actions'),
  };
  const subscribe = (event: string, listener: (value: any) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(listener);
    return { remove: () => { removals.push(event); listeners.get(event)!.delete(listener); } };
  };
  const react = {
    Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: (initial: any) => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next: any) => {
        if (!mounted) writesAfterUnmount++;
        slots[i] = typeof next === 'function' ? next(slots[i]) : next;
      }];
    },
    useRef: (initial: any) => { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect: (effect: () => void | (() => void), deps?: any[]) => {
      const i = cursor++, previous = slots[i];
      if (!previous || !deps || !previous.deps || deps.length !== previous.deps.length || deps.some((dep, j) => !Object.is(dep, previous.deps[j])))
        pending.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
    },
  };
  const modules: Record<string, any> = {
    react: { __esModule: true, default: react, ...react },
    'react-native': {
      ...Object.fromEntries(['Pressable', 'ScrollView', 'Text', 'View'].map(name => [name, name])),
      AccessibilityInfo: { isReduceMotionEnabled: () => motionQuery.promise, isScreenReaderEnabled: () => readerQuery.promise, addEventListener: subscribe },
      AppState: { currentState: options.appState ?? 'active', addEventListener: subscribe },
      Platform: { select: (values: any) => values.ios },
      useWindowDimensions: () => ({ width: 320, height: 844, fontScale: options.fontScale ?? 1 }),
    },
    '@react-navigation/native': { useIsFocused: () => focused },
    './state': { useApp: () => state }, './followedBrands': followed,
    './BrandRailBadge': { BrandRailBadge: 'BrandRailBadge' },
    './brandExperience': brandExperience,
    './ui': { Icon: 'Icon', Photo: 'Photo', usePalette: () => palettes[state.theme] },
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', 'fetch', 'setInterval', 'clearInterval', source)(
    (name: string) => { assert.ok(name in modules, `Unexpected dependency: ${name}`); return modules[name]; },
    module, module.exports, () => assert.fail('Unexpected banner network request'),
    (callback: () => void, delay: number) => {
      assert.ok(delay > 0, 'Timer must have a positive interval');
      const id = ++timerId; timers.set(id, { callback, delay, next: now + delay }); intervalStarts.push(delay); return id;
    },
    (id: number) => { intervalClears.push(id); timers.delete(id); },
  );
  function expand(value: any): any {
    if (Array.isArray(value)) return value.map(expand);
    if (!value || typeof value !== 'object') return value;
    if (typeof value.type === 'function') return expand(value.type(value.props));
    if (value.props.ref) {
      nativeRefs.add(value.props.ref);
      value.props.ref.current = { scrollTo: (position: any) => scrolls.push(position) };
    }
    return { ...value, props: { ...value.props, children: expand(value.props.children) } };
  }
  function nodes(value: any): Element[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    return value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
  }
  function render() {
    assert.ok(mounted, 'Do not render an unmounted component');
    cursor = 0;
    nativeRefs.forEach(ref => { ref.current = null; });
    tree = expand(module.exports.FollowedBrandRail({ navigate: (route: any) => routes.push(route) }));
    pending.splice(0).forEach(effect => effect());
  }
  const all = () => nodes(tree);
  const controls = (label: string) => all().filter(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
  const control = (label: string) => { const matches = controls(label); assert.equal(matches.length, 1, `Expected one control: ${label}`); return matches[0]; };
  const press = (label: string) => { control(label).props.onPress(); render(); };
  const rail = () => { const node = all().find(node => node.type === 'ScrollView'); assert.ok(node, 'Missing followed brand scroll view'); return node; };
  const event = (name: string, value: any) => { listeners.get(name)?.forEach(listener => listener(value)); render(); };
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); render(); };
  render();
  return {
    all, controls, control, press, rail, render, state, routes, scrolls, actions, motionQuery, readerQuery, settle,
    intervalStarts, intervalClears, removals,
    text: () => text(tree), timerCount: () => timers.size,
    listenerCount: () => [...listeners.values()].reduce((total, group) => total + group.size, 0),
    writesAfterUnmount: () => writesAfterUnmount,
    ready: async (reduceMotion = false, screenReader = false) => { motionQuery.resolve(reduceMotion); readerQuery.resolve(screenReader); await settle(); },
    layout: (width = 200, content = 500) => { rail().props.onLayout({ nativeEvent: { layout: { width } } }); rail().props.onContentSizeChange(content, 100); render(); },
    scroll: (x: number) => { rail().props.onScroll({ nativeEvent: { contentOffset: { x } } }); render(); },
    motion: (value: boolean) => event('reduceMotionChanged', value),
    reader: (value: boolean) => event('screenReaderChanged', value),
    appState: (value: string) => event('change', value),
    focus: (value: boolean) => { focused = value; render(); },
    advance: (milliseconds = 3500) => {
      const target = now + milliseconds;
      while (true) {
        const due = [...timers.entries()].filter(([, timer]) => timer.next <= target).sort((a, b) => a[1].next - b[1].next)[0];
        if (!due) break;
        now = due[1].next; due[1].next += due[1].delay; due[1].callback(); render();
      }
      now = target;
    },
    dispose: () => {
      mounted = false;
      slots.forEach(slot => slot?.cleanup?.());
      nativeRefs.forEach(ref => { ref.current = null; });
    },
  };
}

test('the banner renders actual distinct follows only and opens the exact brand even with equal names', async () => {
  const h = harness({ brands: [store('a', 'Same name'), store('b', 'Same name'), store('c')], followed: ['b', 'missing', 'a', 'b'] });
  await h.ready(); h.layout();
  const stores = h.all().filter(node => node.props.accessibilityLabel === 'Open Same name storefront');
  assert.deepEqual(stores.map(node => node.props.key), ['b', 'a']);
  assert.equal(h.controls('Open Store c storefront').length, 0);
  stores[0].props.onPress(); h.render();
  assert.deepEqual(h.routes, [{ name: 'brand', brandId: 'b' }]);
  assert.equal(h.timerCount(), 0);
  assert.deepEqual(h.state.followed, ['b', 'missing', 'a', 'b']);
  assert.deepEqual(h.actions, []); h.dispose();
});

test('empty and unavailable follows give discovery recovery without automatic following or fetching', async () => {
  for (const ids of [[], ['missing', 'disabled']]) {
    const h = harness({ followed: ids }); await h.ready();
    assert.equal(h.all().filter(node => node.type === 'ScrollView').length, 0);
    assert.match(h.text(), ids.length ? /Followed stores unavailable/ : /Follow your favourite brands/);
    assert.equal(h.timerCount(), 0);
    h.press('Find brands to follow');
    assert.equal(h.controls('Discover brands to follow').length, 0, 'One compact recovery control replaces the duplicate discovery control');
    assert.deepEqual(h.routes, [{ name: 'brands' }]);
    assert.deepEqual(h.state.followed, ids); assert.deepEqual(h.actions, []); h.dispose();
  }
});

test('follow, unfollow, disappearance and reload changes update the real storefront tiles', async () => {
  const h = harness({ followed: ['a', 'missing'] }); await h.ready();
  h.state.followed = ['b', 'missing']; h.render();
  assert.equal(h.controls('Open Store a storefront').length, 0);
  assert.equal(h.controls('Open Store b storefront').length, 1);
  h.state.brands = [store('a')]; h.render();
  assert.match(h.text(), /Followed stores unavailable/);
  assert.deepEqual(h.state.followed, ['b', 'missing']);
  h.state.brands = [store('b', 'Renamed store')]; h.render();
  assert.equal(h.controls('Open Renamed store storefront').length, 1);
  const mark = h.all().find(node => node.type === 'BrandRailBadge')!;
  assert.deepEqual({ id: mark.props.id, name: mark.props.name }, { id: 'b', name: 'Renamed store' });
  h.press('Open Renamed store storefront');
  assert.deepEqual(h.routes, [{ name: 'brand', brandId: 'b' }]);
  assert.deepEqual(h.actions, []); h.dispose();
});

test('automatic motion waits for both accessibility queries and requires overflowing multiple stores', async () => {
  const h = harness(); h.layout();
  assert.equal(h.timerCount(), 0);
  h.motionQuery.resolve(false); await h.settle(); assert.equal(h.timerCount(), 0);
  h.readerQuery.resolve(false); await h.settle(); assert.equal(h.timerCount(), 1);
  assert.deepEqual(h.intervalStarts, [3500]); h.dispose();
  for (const example of [
    { followed: ['a'], width: 100, content: 500 },
    { followed: ['a', 'missing', 'a'], width: 100, content: 500 },
    { followed: ['a', 'b'], width: 500, content: 500 },
    { followed: ['a', 'b'], width: 600, content: 500 },
    { followed: ['a', 'b'], width: 499, content: 500 },
  ]) {
    const h = harness({ followed: example.followed }); await h.ready();
    assert.equal(h.timerCount(), 0, 'No measured overflow yet');
    h.layout(example.width, example.content);
    assert.equal(h.timerCount(), 0);
    assert.equal(h.controls('Next followed brands').length, 0);
    h.dispose();
  }
});

test('automatic banner moves visually left to right and wraps without animating backward', async () => {
  const h = harness(); await h.ready(); h.layout(); h.scrolls.length = 0;
  h.advance(3499); assert.deepEqual(h.scrolls, []);
  h.advance(1); assert.deepEqual(h.scrolls, [{ x: 300, animated: false }]);
  h.advance(3500 * 4);
  assert.deepEqual(h.scrolls, [{ x: 300, animated: false }, { x: 184, animated: true }, { x: 68, animated: true }, { x: 0, animated: true }, { x: 300, animated: false }]);
  assert.match(h.text(), /Moving left to right/);
  assert.deepEqual(h.routes, []); assert.deepEqual(h.actions, []); h.dispose();
});

test('manual arrows pause automatic motion, clamp both ends and resume only on Play', async () => {
  const h = harness(); await h.ready(); h.layout();
  h.press('Next followed brands'); assert.deepEqual(h.scrolls.at(-1), { x: 116, animated: true });
  assert.equal(h.timerCount(), 0); assert.equal(h.controls('Play followed brand banner').length, 1);
  h.press('Next followed brands'); h.press('Next followed brands'); h.press('Next followed brands');
  assert.deepEqual(h.scrolls.at(-1), { x: 300, animated: true });
  h.press('Previous followed brands'); assert.deepEqual(h.scrolls.at(-1), { x: 184, animated: true });
  h.press('Previous followed brands'); h.press('Previous followed brands'); h.press('Previous followed brands');
  assert.deepEqual(h.scrolls.at(-1), { x: 0, animated: true });
  const count = h.scrolls.length; h.advance(35000); assert.equal(h.scrolls.length, count);
  h.press('Play followed brand banner'); assert.equal(h.timerCount(), 1);
  assert.equal(h.scrolls.length, count); h.advance(); assert.deepEqual(h.scrolls.at(-1), { x: 300, animated: false });
  h.press('Pause followed brand banner'); assert.equal(h.timerCount(), 0);
  assert.match(h.text(), /Your followed brands/); h.dispose();
});

test('touch, drag, keyboard focus and store activation pause the timer without accidental actions', async () => {
  for (const interaction of ['touch', 'drag', 'focus', 'press']) {
    const h = harness(); await h.ready(); h.layout();
    if (interaction === 'touch') h.rail().props.onTouchStart();
    if (interaction === 'drag') h.rail().props.onScrollBeginDrag();
    if (interaction === 'focus') h.control('Open Store b storefront').props.onFocus();
    if (interaction === 'press') h.control('Open Store b storefront').props.onPress();
    h.render(); assert.equal(h.timerCount(), 0);
    assert.equal(h.controls('Play followed brand banner').length, 1);
    const count = h.scrolls.length; h.advance(10500); assert.equal(h.scrolls.length, count);
    assert.deepEqual(h.routes, interaction === 'press' ? [{ name: 'brand', brandId: 'b' }] : []);
    assert.deepEqual(h.actions, []); h.dispose();
  }
});

test('dragged scroll positions feed both manual movement and later automatic resumption', async () => {
  const h = harness(); await h.ready(); h.layout();
  h.rail().props.onScrollBeginDrag(); h.render(); h.scroll(150);
  h.press('Next followed brands'); assert.deepEqual(h.scrolls.at(-1), { x: 266, animated: true });
  h.press('Play followed brand banner'); h.advance();
  assert.deepEqual(h.scrolls.at(-1), { x: 150, animated: true }); h.dispose();
});

test('initial and live reduced-motion and screen-reader settings stop the banner', async () => {
  for (const preference of ['motion', 'reader'] as const) {
    const h = harness(); await h.ready(preference === 'motion', preference === 'reader'); h.layout();
    assert.equal(h.timerCount(), 0); assert.equal(h.controls('Pause followed brand banner').length, 0);
    h[preference](false); assert.equal(h.timerCount(), 1);
    h[preference](true); assert.equal(h.timerCount(), 0);
    const count = h.scrolls.length; h.advance(10500); assert.equal(h.scrolls.length, count);
    h.press('Next followed brands');
    assert.deepEqual(h.scrolls.at(-1), { x: 116, animated: preference !== 'motion' });
    h[preference](false); assert.equal(h.timerCount(), 0, 'A manually paused banner stays paused');
    h.press('Play followed brand banner'); assert.equal(h.timerCount(), 1); h.dispose();
  }
});

test('background, inactive and unfocused screens cannot run automatic motion', async () => {
  for (const options of [{ appState: 'background' }, { appState: 'inactive' }, { focused: false }]) {
    const h = harness(options); await h.ready(); h.layout(); assert.equal(h.timerCount(), 0);
    h.appState('active'); h.focus(true); assert.equal(h.timerCount(), 1);
    h.appState('background'); assert.equal(h.timerCount(), 0);
    const count = h.scrolls.length; h.advance(7000); assert.equal(h.scrolls.length, count);
    h.appState('active'); assert.equal(h.timerCount(), 1);
    h.focus(false); assert.equal(h.timerCount(), 0);
    h.focus(true); assert.equal(h.timerCount(), 1);
    h.press('Pause followed brand banner'); h.focus(false); h.focus(true); h.appState('background'); h.appState('active');
    assert.equal(h.timerCount(), 0, 'Lifecycle changes must preserve a manual pause'); h.dispose();
  }
});

test('remeasurement clamps the current offset, replaces one timer and stops after overflow or follows disappear', async () => {
  const h = harness(); await h.ready(); h.layout(); h.advance();
  assert.deepEqual(h.scrolls.at(-1), { x: 300, animated: false });
  h.layout(200, 350);
  assert.deepEqual(h.scrolls.at(-1), { x: 150, animated: false });
  assert.equal(h.timerCount(), 1); assert.equal(h.intervalClears.length, 1);
  h.advance(); assert.deepEqual(h.scrolls.at(-1), { x: 34, animated: true });
  h.render(); h.render(); assert.equal(h.timerCount(), 1); assert.equal(h.intervalStarts.length, 2);
  h.state.followed = ['a']; h.render(); assert.equal(h.timerCount(), 0);
  h.state.followed = ['a', 'b']; h.render(); assert.equal(h.timerCount(), 1);
  h.layout(500, 350); assert.equal(h.timerCount(), 0);
  assert.deepEqual(h.scrolls.at(-1), { x: 0, animated: false });
  h.state.brands = []; h.render(); assert.match(h.text(), /Followed stores unavailable/);
  assert.equal(h.timerCount(), 0); h.dispose();
});

test('unmount cleans the timer and all listeners without resubscribing on rerenders', async () => {
  const h = harness(); await h.ready(); h.layout(); h.render(); h.render();
  assert.equal(h.listenerCount(), 3); assert.equal(h.timerCount(), 1);
  assert.deepEqual(h.removals, []); h.dispose();
  assert.equal(h.listenerCount(), 0); assert.equal(h.timerCount(), 0);
  assert.deepEqual(h.removals.sort(), ['change', 'reduceMotionChanged', 'screenReaderChanged']);
  const count = h.scrolls.length; h.advance(7000); assert.equal(h.scrolls.length, count);
  assert.equal(h.writesAfterUnmount(), 0);
});

test('late accessibility query resolutions after unmount do not update state', async () => {
  const h = harness(); h.layout(); h.dispose();
  h.motionQuery.resolve(false); h.readerQuery.resolve(false);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.writesAfterUnmount(), 0); assert.equal(h.timerCount(), 0); assert.equal(h.listenerCount(), 0);
});

test('failed accessibility queries safely leave automatic motion off', async () => {
  const h = harness(); h.layout();
  h.motionQuery.reject(new Error('Unavailable motion preference')); h.readerQuery.reject(new Error('Unavailable screen reader preference'));
  await h.settle(); assert.equal(h.timerCount(), 0);
  h.press('Next followed brands'); assert.deepEqual(h.scrolls.at(-1), { x: 116, animated: false });
  h.dispose();
});

test('a live accessibility preference wins over an older initial query result', async () => {
  for (const preference of ['motion', 'reader'] as const) {
    const h = harness(); h.layout();
    h[preference](true);
    await h.ready(false, false);
    assert.equal(h.timerCount(), 0, `${preference}: stale initial data must not override the live preference`);
    assert.equal(h.controls('Pause followed brand banner').length, 0);
    h[preference](false); assert.equal(h.timerCount(), 1); h.dispose();
  }
});

test('compact story links put genuine names below local badges with one pinned discovery control', async () => {
  const h = harness(); await h.ready();
  const nodes = h.all();
  const marks = nodes.filter(node => node.type === 'BrandRailBadge');
  assert.deepEqual(marks.map(node => [node.props.id, node.props.name, node.props.theme]), defaults.map(brand => [brand.id, brand.name, 'light']));
  assert.equal(nodes.filter(node => node.type === 'Photo').length, 0);
  assert.equal(nodes.filter(node => node.props.accessibilityRole === 'header').length, 0);
  for (const brand of defaults) {
    const store = h.control(`Open ${brand.name} storefront`);
    assert.equal(style(store.props.style).width, 64);
    assert.equal(style(store.props.style).minHeight, 64);
    assert.equal(style(store.props.style).flexDirection, 'column');
    assert.equal(style(store.props.style).alignItems, 'center');
    assert.equal(style(store.props.style).backgroundColor, 'transparent');
    assert.equal(style(store.props.style).borderColor, 'transparent');
    const [badge, label] = store.props.children;
    assert.equal(badge.type, 'BrandRailBadge');
    assert.equal(label.type, 'Text');
    assert.equal(text(label), brand.name);
    assert.equal(style(label.props.style).textAlign, 'center');
    assert.equal(style(label.props.style).minHeight, 26);
    assert.equal(style(label.props.style).fontSize, 11);
    assert.equal(style(label.props.style).lineHeight, 13);
    assert.equal(style(store.props.style).height, undefined, 'Entries can grow for accessibility text');
    assert.equal(store.props.accessibilityRole, 'button');
    assert.ok(text(store).includes(brand.name));
  }
  assert.equal(h.rail().props.contentContainerStyle.gap, 6);
  assert.equal(text(h.rail()).includes('Discover'), false, 'Discovery must not scroll away');
  assert.equal(h.controls('Discover brands to follow').length, 1);
  h.press('Discover brands to follow');
  assert.deepEqual(h.routes, [{ name: 'brands' }]);
  assert.deepEqual(h.actions, []); assert.deepEqual(h.state.followed, ['a', 'b', 'c']); h.dispose();
});

test('two demo brands and discovery fit a 320px phone without adding a controls row', async () => {
  for (const viewport of [320, 390, 768, 1040]) {
    const h = harness({ brands: [store('atelier', 'Atelier Demo'), store('everyday', 'Everyday Demo')], followed: ['atelier', 'everyday'] });
    await h.ready();
    const available = viewport - 24, discover = style(h.control('Discover brands to follow').props.style);
    const railWidth = Math.min(available - discover.width - 6, style(h.rail().props.style).maxWidth);
    h.layout(railWidth, 0);
    const entries = ['Atelier Demo', 'Everyday Demo'].map(name => style(h.control(`Open ${name} storefront`).props.style));
    const contentWidth = entries.reduce((total, entry) => total + entry.width, 0) + 6;
    h.layout(railWidth, contentWidth);
    assert.ok(contentWidth + discover.width + 6 <= available + .01);
    assert.ok(entries.every(entry => entry.width === 64));
    assert.ok(entries.every(entry => entry.minHeight <= 64));
    assert.equal(h.controls('Next followed brands').length, 0);
    assert.equal(h.timerCount(), 0);
    assert.ok(discover.minHeight >= 48);
    assert.ok(discover.width >= 48);
    h.dispose();
  }
});

test('wide windows keep pinned discovery adjacent to short rails without constraining overflowing rails', async () => {
  for (const count of [1, 2, 8]) {
    const brands = Array.from({ length: count }, (_, index) => store(String(index)));
    const h = harness({ brands, followed: brands.map(brand => brand.id) });
    await h.ready();
    const track = style(h.rail().props.style), discover = style(h.control('Discover brands to follow').props.style);
    const capacity = count * 64 + (count - 1) * 6;
    assert.equal(track.maxWidth, capacity);
    assert.equal(track.flex, 1);
    for (const viewport of [320, 884]) {
      const available = viewport - 24 - discover.width - 6;
      const railWidth = Math.min(available, track.maxWidth);
      h.layout(railWidth, capacity);
      if (count <= 2 && viewport === 884) {
        assert.equal(railWidth, capacity, 'No empty track between the entries and Discover');
        assert.equal(h.controls('Next followed brands').length, 0);
      }
      if (capacity > available) assert.equal(railWidth, available, 'Overflowing rails retain all available width');
      else assert.equal(h.controls('Next followed brands').length, 0, 'Compact links no longer need controls when they all fit');
    }
    h.dispose();
  }
});

test('long brand names retain accessible identity, scale naturally and never clip to fixed heights', async () => {
  const name = 'Atelier Demo International Long Brand Name';
  for (const theme of ['light', 'dark'] as const) {
    for (const fontScale of [1, 1.3, 1.6, 2, 3]) {
      const h = harness({ brands: [store('atelier', name)], followed: ['atelier'], fontScale, theme });
      await h.ready();
      const entry = h.control(`Open ${name} storefront`), entryStyle = style(entry.props.style);
      const label = h.all().find(node => node.type === 'Text' && text(node) === name)!;
      assert.ok(label);
      assert.notEqual(label.props.allowFontScaling, false);
      assert.equal(label.props.numberOfLines, fontScale >= 1.3 ? undefined : 2);
      assert.equal(entryStyle.height, undefined);
      assert.equal(entryStyle.maxHeight, undefined);
      assert.equal(entryStyle.overflow, undefined);
      assert.equal(entryStyle.width, 64 + Math.min(48, (fontScale - 1) * 40));
      assert.equal(style(label.props.style).flex, undefined, 'Column label must grow naturally, not share a constrained row');
      assert.equal(style(label.props.style).color, brandExperience.brandExperience('atelier', theme).palette.text);
      assert.equal(h.all().find(node => node.type === 'BrandRailBadge')!.props.theme, theme);
      h.press(`Open ${name} storefront`);
      assert.deepEqual(h.routes, [{ name: 'brand', brandId: 'atelier' }]);
      h.dispose();
    }
  }
});

test('discovery focus and activation pause motion, while brand focus and presses have visible feedback', async () => {
  for (const interaction of ['focus', 'press']) {
    const h = harness(); await h.ready(); h.layout();
    const discover = h.control('Discover brands to follow');
    discover.props[interaction === 'focus' ? 'onFocus' : 'onPress'](); h.render();
    assert.equal(h.timerCount(), 0);
    assert.deepEqual(h.routes, interaction === 'press' ? [{ name: 'brands' }] : []);
    if (interaction === 'focus') {
      assert.equal(style(h.control('Discover brands to follow').props.style).borderColor, palettes.light.text);
      h.control('Discover brands to follow').props.onBlur(); h.render();
      assert.equal(style(h.control('Discover brands to follow').props.style).borderColor, 'transparent');
    }
    const store = h.control('Open Store a storefront'), rest = style(store.props.style);
    assert.notDeepEqual(style(store.props.style, true), rest);
    store.props.onFocus(); h.render();
    assert.equal(style(h.control('Open Store a storefront').props.style).borderColor, brandExperience.brandExperience('a', 'light').palette.accent);
    h.control('Open Store a storefront').props.onBlur(); h.render();
    assert.equal(style(h.control('Open Store a storefront').props.style).borderColor, rest.borderColor);
    h.dispose();
  }
});


test('three compact links and round discovery fit a 320px phone with no fabricated story status', async () => {
  const h = harness(); await h.ready();
  const discover = h.control('Discover brands to follow'), discoverStyle = style(discover.props.style);
  const capacity = defaults.length * 64 + (defaults.length - 1) * 6;
  assert.ok(capacity + discoverStyle.width + 6 <= 320 - 24);
  h.layout(capacity, capacity);
  assert.equal(h.timerCount(), 0);
  assert.equal(h.controls('Next followed brands').length, 0);
  assert.equal(discoverStyle.minHeight, 64);
  assert.equal(discoverStyle.backgroundColor, 'transparent');
  const [ring, label] = discover.props.children;
  assert.equal(ring.props.accessible, false);
  assert.equal(ring.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(style(ring.props.style).width, 34);
  assert.equal(style(ring.props.style).height, 34);
  assert.equal(style(ring.props.style).borderRadius, 17);
  assert.equal(style(ring.props.style).height + discoverStyle.gap + style(label.props.style).minHeight + discoverStyle.borderWidth * 2, 64);
  assert.equal(text(label), 'Discover');
  assert.doesNotMatch(h.text(), /unread|unseen|new stor(?:y|ies)|live stor(?:y|ies)/i);
  h.dispose();
});
