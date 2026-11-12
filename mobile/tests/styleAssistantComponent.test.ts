import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as helper from '../src/styleAssistant.ts';
import { palettes } from '../src/design.ts';
import type { Product } from '../src/core/domain.ts';

const file = fs.readFileSync(new URL('../src/StyleAssistant.tsx', import.meta.url), 'utf8');
const source = ts.transpileModule(file, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const dress: Product = { id: 'atelier:dress', name: 'Linen Dress', category: 'Dresses', brandId: 'atelier', brandName: 'Atelier', image: '', moreVariants: false, variants: [{ id: 'm', key: 'm', title: 'M', available: true, amount: 45, currency: 'USD', options: {} }] };
function nodes(value: any): any[] { return Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : []; }
function content(value: any): string { return Array.isArray(value) ? value.map(content).join('') : value && typeof value === 'object' ? content(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value); }

// Execute actual handlers/hooks with inert native boundaries. Native keyboard,
// screen reader focus and pixel rendering still require device/browser QA.
let instanceId = 0;
function harness(initial: any = {}, os = 'ios', palette: typeof palettes[keyof typeof palettes] = palettes.light) {
  const hooks: any[] = [];
  const effects: (() => void)[] = [];
  const calls: any[] = [];
  const announcements: string[] = [];
  const focused: string[] = [], scrolls: any[] = [];
  const listeners = new Map<string, (event: any) => void>();
  const timers = new Map<number, () => void>();
  let cursor = 0, tree: any, dirty = false, timerSerial = 0, keyboardDismissals = 0;
  let dimensions = { width: 390, height: 800, fontScale: 1 };
  let props = { products: [dress], onNavigate: (route: any) => calls.push(route), launcherMode: 'inline', ...initial };
  const React = {
    createElement: (type: any, props: any, ...children: any[]) => {
      if (props?.ref) props.ref.current = {
        id: props.testID || type,
        focus: () => focused.push(props.testID || type),
        scrollToEnd: (options: any) => scrolls.push(options),
      };
      return { type, props: { ...props, children } };
    },
    Fragment: 'Fragment',
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (value: any) => { const next = typeof value === 'function' ? value(hooks[index]) : value; if (!Object.is(next, hooks[index])) { hooks[index] = next; dirty = true; } }];
    },
    useRef: (initial: any) => { const index = cursor++; return hooks[index] ||= { current: initial }; },
    useId: () => { const index = cursor++; return hooks[index] ||= `:r${++instanceId}:`; },
    useEffect: (effect: () => void | (() => void), deps: any[]) => {
      const index = cursor++, old = hooks[index];
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
        hooks[index] = { deps };
        effects.push(() => { old?.cleanup?.(); hooks[index].cleanup = effect(); });
      }
    },
  };
  const native = Object.fromEntries(['KeyboardAvoidingView', 'Modal', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(name => [name, name]));
  const imports: Record<string, any> = {
    react: { __esModule: true, default: React, ...React },
    'react-native': { ...native, useWindowDimensions: () => dimensions, Platform: { OS: os }, Keyboard: { dismiss() { keyboardDismissals++; } }, AccessibilityInfo: { announceForAccessibility: (value: string) => announcements.push(value), setAccessibilityFocus: (id: string) => focused.push(id) }, findNodeHandle: (element: any) => element?.id },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 0 }) },
    'react-native-svg': { __esModule: true, default: 'Svg', ...Object.fromEntries(['Circle', 'Defs', 'Path', 'RadialGradient', 'Stop'].map(name => [name, name])) },
    './ui': { Icon: 'Icon', usePalette: () => palette }, './styleAssistant': helper,
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', 'document', source)(
    (name: string) => { assert.ok(name in imports, `Unexpected dependency ${name}`); return imports[name]; }, module, module.exports,
    (callback: () => void) => { const id = ++timerSerial; timers.set(id, callback); return id; }, (id: number) => timers.delete(id),
    { addEventListener: (name: string, listener: any) => listeners.set(name, listener), removeEventListener: (name: string, listener: any) => { if (listeners.get(name) === listener) listeners.delete(name); } },
  );
  const render = () => { let passes = 0; do { dirty = false; cursor = 0; tree = module.exports.StyleAssistant(props); while (effects.length) effects.shift()!(); assert.ok(++passes < 5, 'render settled'); } while (dirty); };
  const all = () => nodes(tree);
  const byId = (id: string) => { const node = all().find(item => item.props.testID === id); assert.ok(node, id); return node; };
  const press = (node: any) => { node.props.onPress(); render(); };
  const open = () => press(byId('style-assistant-launcher'));
  const send = (message: string, keyboard = false) => { byId('style-assistant-input').props.onChangeText(message); render(); if (keyboard) byId('style-assistant-input').props.onSubmitEditing(); else byId('style-assistant-send').props.onPress(); render(); };
  render();
  return { all, byId, calls, announcements, timers, focused, scrolls, listeners, press, open, send,
    keyboardDismissals: () => keyboardDismissals,
    key: (key: string) => { listeners.get('keydown')?.({ key, preventDefault() {} }); render(); },
    flushTimers: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); render(); },
    text: () => content(tree), modal: () => all().find(node => node.type === 'Modal'), update: (next: any) => { props = { ...props, ...next }; render(); }, resize: (width: number, height: number, fontScale: number) => { dimensions = { width, height, fontScale }; render(); } };
}

test('compact inline orb retains a separate 48px button, not a fifth navigation tab', () => {
  const h = harness();
  const button = h.byId('style-assistant-launcher');
  assert.equal(button.props.accessibilityRole, 'button');
  assert.match(button.props.accessibilityLabel, /local style helper/);
  const style = button.props.style({ pressed: false });
  assert.equal(style.width, 48); assert.equal(style.height, 48);
  const orb = h.byId('style-assistant-orb');
  assert.equal(orb.props.style.width, 40); assert.equal(orb.props.style.height, 40);
  assert.equal(orb.props.pointerEvents, 'none');
  assert.equal(style.backgroundColor, undefined, 'the smaller orb paints independently of its touch area');
  assert.ok(style.minWidth >= 48 && style.minHeight >= 48);
  assert.equal(style.position, undefined);
  assert.equal(h.modal().props.visible, false);
  h.open(); assert.equal(h.modal().props.visible, true);
  assert.equal(h.byId('style-assistant-panel').props.accessibilityViewIsModal, true);
  assert.match(h.text(), /Local demo · Not live AI/);
  assert.match(h.text(), /No chat messages or photos are sent anywhere/);
});

test('separately mounted helpers retain unique SVG gradient references across navigation renders', () => {
  const home = harness(), brand = harness({ brandId: 'atelier' });
  const mark = (h: ReturnType<typeof harness>) => {
    const component = h.all().find(node => typeof node.type === 'function' && node.type.name === 'AssistantMark');
    assert.ok(component);
    const svg = nodes(component.type(component.props));
    const id = svg.find(node => node.type === 'RadialGradient').props.id;
    assert.match(id, /^[a-zA-Z][a-zA-Z0-9_-]*$/);
    assert.equal(svg.find(node => node.type === 'Circle').props.fill, `url(#${id})`);
    return id;
  };
  const homeId = mark(home), brandId = mark(brand);
  assert.notEqual(homeId, brandId);
  home.open(); home.send('dresses'); brand.open(); brand.resize(1024, 800, 1.5);
  assert.equal(mark(home), homeId);
  assert.equal(mark(brand), brandId);
});

test('helper orb uses ocean blue and teal with readable white marks across the full gradient in both themes', () => {
  for (const palette of Object.values(palettes)) {
    const h = harness({}, 'ios', palette);
    const component = h.all().find(node => typeof node.type === 'function' && node.type.name === 'AssistantMark');
    const svg = nodes(component.type(component.props));
    const stops = svg.filter(node => node.type === 'Stop');
    assert.deepEqual(stops.map(node => node.props.stopColor), ['#0083BF', '#006ADF', '#0057D9', '#007B91', '#0A8A83']);
    const channels = (hex: string) => hex.slice(1).match(/../g)!.map(channel => parseInt(channel, 16) / 255);
    for (let index = 1; index < stops.length; index++) {
      const from = channels(stops[index - 1].props.stopColor), to = channels(stops[index].props.stopColor);
      for (let step = 0; step <= 100; step++) {
        const rgb = from.map((channel, i) => channel + (to[i] - channel) * step / 100)
          .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
        const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        assert.ok(1.05 / (luminance + .05) >= 3, 'white symbols retain non-text contrast between every gradient stop');
      }
    }
    assert.equal(svg.find(node => node.type === 'Path').props.fill, '#FFFFFF');
    assert.equal(svg.filter(node => node.type === 'Circle')[1].props.fill, '#FFFFFF');
    assert.equal(h.byId('style-assistant-orb').props.style.backgroundColor, palette.surface);
    assert.equal(h.byId('style-assistant-orb').props.style.shadowColor, '#101B2D');
    h.open();
    assert.equal(h.byId('style-assistant-panel').props.style.backgroundColor, palette.surface);
    assert.equal(h.byId('style-assistant-input').props.style.color, palette.text);
    assert.equal(h.byId('style-assistant-input').props.placeholderTextColor, palette.muted);
    assert.equal(h.byId('style-assistant-input').props.style.backgroundColor, palette.background);
  }
});

test('typed and keyboard-submitted messages produce clickable actual product matches', () => {
  const h = harness(); h.open(); h.send('Show dresses under USD 50', true);
  assert.match(h.text(), /Linen Dress/);
  assert.equal(h.byId('style-assistant-input').props.value, '');
  assert.equal(h.byId('style-assistant-send').props.disabled, true);
  assert.equal(h.announcements.length, 1);
  h.press(h.byId(`style-product-${dress.id}`));
  assert.deepEqual(h.calls, [{ name: 'product', productId: dress.id, brandId: dress.brandId }]);
  assert.equal(h.modal().props.visible, false);
  assert.equal(h.timers.size, 0, 'navigation must not restore focus to an old dock');
});

test('starter chips operate locally and a closed chat is cleared on reopen', () => {
  const h = harness(); h.open();
  const starter = h.all().find(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Show Dresses');
  h.press(starter); assert.match(h.text(), /Linen Dress/);
  h.press(h.byId('style-assistant-close')); h.open();
  assert.equal(h.all().some(node => node.props.testID === `style-product-${dress.id}`), false);
  assert.ok(h.byId('style-assistant-starters'));
  assert.equal(h.byId('style-assistant-input').props.value, '');
});

test('Android back, outside dismissal and repeated open/close all clear the transcript', () => {
  const h = harness({}, 'android');
  for (let index = 0; index < 3; index++) {
    h.open(); h.send('dresses');
    if (index === 0) { h.modal().props.onRequestClose(); h.update({}); }
    else h.press(h.byId('style-assistant-backdrop'));
    assert.equal(h.modal().props.visible, false);
    h.flushTimers();
    assert.equal(h.focused.at(-1), 'style-assistant-launcher');
    h.open(); assert.equal(h.all().some(node => node.props.testID === `style-product-${dress.id}`), false);
  }
  assert.equal(h.keyboardDismissals(), 3);
  assert.equal(h.all().find(node => node.type === 'KeyboardAvoidingView').props.behavior, 'height');
});

test('Escape clears chat, dismisses the keyboard and restores focus without retaining listeners', () => {
  const h = harness({}, 'web'); h.open(); h.send('dresses');
  h.key('Enter'); assert.equal(h.modal().props.visible, true);
  h.key('Escape'); assert.equal(h.modal().props.visible, false);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.keyboardDismissals(), 1);
  h.flushTimers(); assert.equal(h.focused.at(-1), 'style-assistant-launcher');
  h.open(); assert.equal(h.listeners.size, 1);
  assert.equal(h.all().some(node => node.props.testID === `style-product-${dress.id}`), false);
  h.press(h.byId('style-assistant-close')); h.open();
  assert.equal(h.timers.size, 0, 'reopening cancels a pending focus return');
});

test('changed catalogues remove stale recommendations and revalidate Try On selection', () => {
  const h = harness({ currentProductId: dress.id }); h.open(); h.send('dresses');
  h.update({ products: [] });
  assert.equal(h.all().some(node => node.props.testID === `style-product-${dress.id}`), false);
  assert.match(h.text(), /no longer in the loaded catalogue/);
  h.update({ products: [dress] }); h.send('Try On help'); h.update({ products: [] });
  h.press(h.all().find(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Prepare this garment'));
  assert.deepEqual(h.calls, [{ name: 'prepare' }]);
});

test('changing store or garment closes the panel instead of retaining another context', () => {
  const h = harness(); h.open(); h.send('dresses'); h.update({ brandId: 'everyday' });
  assert.equal(h.modal().props.visible, false);
  h.open(); assert.equal(h.all().some(node => node.props.testID === `style-product-${dress.id}`), false);
  h.press(h.byId('style-assistant-close')); h.update({ brandId: 'atelier' });
  assert.equal(h.timers.size, 0, 'a changed route must not focus its old launcher');
});

test('history and input stay bounded, blank sends do nothing, and all actions are touch-safe', () => {
  const h = harness(); h.open();
  assert.equal(h.byId('style-assistant-input').props.maxLength, helper.STYLE_CHAT_LIMIT);
  h.send('   '); assert.equal(h.announcements.length, 0);
  for (let n = 0; n < 20; n++) h.send('Try On help');
  assert.equal(h.all().filter(node => node.props.testID === 'style-helper-reply').length, helper.STYLE_CHAT_HISTORY_LIMIT / 2 + 1);
  for (const button of h.all().filter(node => node.type === 'Pressable' && node.props.accessibilityRole === 'button')) {
    const style = button.props.style({ pressed: false });
    assert.ok(style.minWidth >= 48 && style.minHeight >= 48, button.props.accessibilityLabel);
  }
});

test('panel resizes without clipping to narrow widths and preserves scrolling and keyboard handling', () => {
  const h = harness(); h.open();
  for (const width of [320, 360, 390, 520, 720, 1024]) for (const height of [280, 568, 800]) for (const fontScale of [1, 1.5, 2]) {
    h.resize(width, height, fontScale);
    const panel = h.byId('style-assistant-panel').props.style;
    assert.ok(panel.width <= width - 24 && panel.width <= 440);
    assert.equal(panel.height, helper.styleAssistantLayout(width, height - 58, fontScale).panelHeight);
    assert.ok(panel.height <= 480);
    assert.equal(panel.maxHeight, '100%');
    assert.equal(panel.flexShrink, 1, 'sheet may contract above the keyboard');
    assert.equal(h.byId('style-assistant-header').props.style.flexShrink, 0);
    assert.equal(h.byId('style-assistant-composer').props.style.flexShrink, 0);
    assert.equal(h.byId('style-assistant-transcript').props.style.minHeight, 0);
    assert.equal(h.byId('style-assistant-transcript').props.keyboardShouldPersistTaps, 'handled');
    assert.equal(h.byId('style-assistant-input').props.style.minHeight, 48);
    assert.equal(h.all().find(node => node.type === 'KeyboardAvoidingView').props.behavior, 'padding');
  }
  assert.equal(/\b(?:fetch|AsyncStorage|apiFetch|upload|FileSystem)\s*\(/.test(file), false);
});

test('compact starter strip scrolls sideways and the opening disclosure stays at the top', () => {
  const h = harness(); h.open();
  const starters = h.byId('style-assistant-starters');
  assert.equal(starters.type, 'ScrollView');
  assert.equal(starters.props.horizontal, true);
  assert.equal(starters.props.keyboardShouldPersistTaps, 'handled');
  h.byId('style-assistant-transcript').props.onContentSizeChange();
  assert.equal(h.scrolls.length, 0, 'initial privacy and demo disclosure should not scroll offscreen');
  h.send('dresses'); h.byId('style-assistant-transcript').props.onContentSizeChange();
  assert.deepEqual(h.scrolls, [{ animated: false }]);
  for (const text of h.all().filter(node => node.type === 'Text')) {
    assert.equal(text.props.numberOfLines, undefined, 'large text must wrap without truncation');
    assert.equal(text.props.allowFontScaling, undefined, 'system text scaling remains enabled');
  }
});
