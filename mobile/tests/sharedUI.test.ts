import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as design from "../src/design.ts";

// Execute the actual shared components with inert native boundaries. These
// assertions cover props, state and event handlers, not rendered native pixels.
type Element = { type: any; props: Record<string, any> };
const source = ts.transpileModule(
  fs.readFileSync(new URL("../src/ui.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  },
).outputText;
function harness(
  options: {
    os?: "ios" | "android" | "web";
    bottomOverlay?: number;
    reducedTransparency?: boolean;
    width?: number;
    fontScale?: number;
    theme?: "light" | "dark";
    insets?: { top?: number; bottom?: number; left?: number; right?: number };
  } = {},
) {
  const accessibilityListeners: Record<string, (value: boolean) => void> = {};
  const cleanups: (() => void)[] = [];
  const browserPreference = {
    matches: !!options.reducedTransparency,
    addEventListener: (_: string, listener: () => void) => { accessibilityListeners.browser = listener; },
    removeEventListener: () => { delete accessibilityListeners.browser; },
  };
  const states: any[] = [],
    refs: { current: any }[] = [];
  const effects: { dependencies: any[] | undefined }[] = [];
  let stateIndex = 0,
    refIndex = 0,
    effectIndex = 0;
  let pending: (() => unknown)[] = [];
  const scrolls: any[] = [],
    announcements: string[] = [];
  const react = {
    createContext: (value: any) => ({ value, Provider: "PaletteProvider" }),
    useContext: (context: any) => typeof context.value === "number" ? options.bottomOverlay ?? context.value : context.value,
    createElement: (type: any, props: any, ...children: any[]): Element => {
      if (type === "ScrollView" && props?.ref)
        props.ref.current = { scrollTo: (value: any) => scrolls.push(value) };
      return { type, props: { ...props, children } };
    },
    useState: (initial: any) => {
      const index = stateIndex++;
      if (!(index in states))
        states[index] = typeof initial === "function" ? initial() : initial;
      return [
        states[index],
        (value: any) => {
          states[index] =
            typeof value === "function" ? value(states[index]) : value;
        },
      ];
    },
    useRef: (initial: any) => {
      const index = refIndex++;
      return (refs[index] ||= { current: initial });
    },
    useEffect: (effect: () => unknown, dependencies?: any[]) => {
      const index = effectIndex++,
        previous = effects[index];
      if (
        !previous ||
        !dependencies ||
        !previous.dependencies ||
        dependencies.length !== previous.dependencies.length ||
        dependencies.some(
          (value, i) => !Object.is(value, previous.dependencies![i]),
        )
      )
        pending.push(effect);
      effects[index] = { dependencies };
    },
  };
  const native = Object.fromEntries(
    [
      "ActivityIndicator",
      "KeyboardAvoidingView",
      "View",
      "Text",
      "Pressable",
      "TextInput",
      "ScrollView",
      "Image",
    ].map((name) => [name, name]),
  );
  const modules: Record<string, any> = {
    react: { __esModule: true, default: react, ...react },
    "react-native": {
      ...native,
      Platform: { OS: options.os || "ios" },
      AccessibilityInfo: {
        isReduceTransparencyEnabled: async () => !!options.reducedTransparency,
        addEventListener: (name: string, listener: (value: boolean) => void) => {
          accessibilityListeners[name] = listener;
          return { remove: () => { delete accessibilityListeners[name]; } };
        },
        announceForAccessibility: (message: string) =>
          announcements.push(message),
      },
      useWindowDimensions: () => ({
        width: options.width ?? 390,
        height: 844,
        fontScale: options.fontScale ?? 1,
      }),
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 48, right: 30, ...options.insets }),
    },
    "@react-navigation/elements": { useHeaderHeight: () => 88 },
    "./IconGlyph": { IconGlyph: "IconGlyph" },
    "./state": { useApp: () => ({ theme: options.theme || "light" }) },
    "./core/api": { apiUrl: (path: string) => "https://example.test" + path },
    "./design": design,
  };
  const module = { exports: {} as Record<string, any> };
  new Function("require", "module", "exports", "window", source)(
    (name: string) => {
      assert.ok(
        Object.hasOwn(modules, name),
        `Unexpected native/network dependency: ${name}`,
      );
      return modules[name];
    },
    module,
    module.exports,
    { matchMedia: (query: string) => { assert.equal(query, "(prefers-reduced-transparency: reduce)"); return browserPreference; } },
  );
  return {
    ui: module.exports,
    scrolls,
    announcements,
    accessibilityListeners,
    browserPreference,
    dispose: () => cleanups.forEach(cleanup => cleanup()),
    resize(width: number, fontScale = options.fontScale ?? 1) {
      options.width = width;
      options.fontScale = fontScale;
    },
    render(name: string, props: Record<string, any> = {}): Element | null {
      stateIndex = refIndex = effectIndex = 0;
      pending = [];
      return module.exports[name](props);
    },
    flushEffects() {
      const queued = pending;
      pending = [];
      queued.forEach((effect) => { const cleanup = effect(); if (typeof cleanup === "function") cleanups.push(cleanup as () => void); });
    },
  };
}
function all(tree: any, type: any): Element[] {
  if (Array.isArray(tree)) return tree.flatMap((child) => all(child, type));
  if (!tree || typeof tree !== "object") return [];
  return [
    ...(tree.type === type ? [tree] : []),
    ...all(tree.props?.children, type),
  ];
}
function one(tree: any, type: any): Element {
  const result = all(tree, type)[0];
  assert.ok(
    result,
    `Missing component ${typeof type === "string" ? type : type.name}`,
  );
  return result;
}
const flattenStyle = (style: any): Record<string, any> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flattenStyle))
    : style || {};
const layout = (x: number, width = 280) => ({
  nativeEvent: { layout: { x, width, height: 48, y: 0 } },
});

test("shared Screen retains keyboard handling, safe insets and bounded tablet content", () => {
  for (const os of ["ios", "android"] as const) {
    const h = harness({ os, width: 1440 });
    const tree = h.render("Screen", { children: "Content", testID: "screen" });
    const keyboard = one(tree, "KeyboardAvoidingView"),
      scroll = one(tree, "ScrollView");
    assert.equal(keyboard.props.behavior, os === "ios" ? "padding" : undefined);
    assert.equal(keyboard.props.keyboardVerticalOffset, 88);
    assert.equal(scroll.props.keyboardShouldPersistTaps, "handled");
    assert.equal(
      scroll.props.keyboardDismissMode,
      os === "ios" ? "interactive" : "on-drag",
    );
    assert.equal(scroll.props.automaticallyAdjustKeyboardInsets, false);
    assert.equal(scroll.props.testID, "screen");
    const style = flattenStyle(scroll.props.contentContainerStyle);
    assert.equal(style.maxWidth, design.metrics.maxContentWidth);
    assert.equal(style.alignSelf, "center");
    assert.equal(style.paddingLeft, 48);
    assert.equal(style.paddingRight, 30);
    assert.equal(style.paddingBottom, 54);
  }
});

test("Screen responds to its own changing viewport and preserves safe edges", () => {
  const widths = [320, 344, 360, 390, 430, 540, 720, 768, 884, 1024];
  for (const insets of [{ left: 0, right: 0 }, { left: 48, right: 30 }]) {
    const h = harness({ width: 1024, insets });
    let tree = h.render("Screen", { children: "Content" })!;
    for (const width of [...widths, ...widths.toReversed()]) {
      // The parent can narrow while the OS still reports a large window.
      one(tree, "KeyboardAvoidingView").props.onLayout(layout(0, width));
      tree = h.render("Screen", { children: "Content" })!;
      const scroll = one(tree, "ScrollView");
      const style = flattenStyle(scroll.props.contentContainerStyle);
      const expected = design.pageLayout(width, 1, insets);
      assert.equal(style.width, "100%");
      assert.equal(style.paddingLeft, expected.paddingLeft);
      assert.equal(style.paddingRight, expected.paddingRight);
      assert.equal(flattenStyle(scroll.props.style).minWidth, 0);
      assert.ok(expected.contentWidth > 0);
      assert.equal(expected.contentWidth + style.paddingLeft + style.paddingRight, width);
    }
  }
});

test("wrapped Choices shrink within their actual parent at narrow and large-text sizes", () => {
  for (const dimensions of [
    { width: 320, fontScale: 1 },
    { width: 390, fontScale: 2 },
  ]) {
    const h = harness(dimensions),
      changes: string[] = [];
    const props = {
      label: "Variant",
      value: "5",
      options: Array.from({ length: 6 }, (_, i) => ({
        value: String(i),
        label: `Long variant ${i}`,
      })),
      onChange: (value: string) => changes.push(value),
    };
    const tree = h.render("Choices", props);
    assert.equal(all(tree, "ScrollView").length, 0);
    const group = all(tree, "View").find(
      (node) => node.props.accessibilityRole === "radiogroup",
    )!;
    assert.equal(group.props.accessibilityLabel, "Variant");
    const choices = all(tree, "Pressable");
    for (const choice of choices) {
      const style = choice.props.style({ pressed: false });
      assert.equal(style.maxWidth, "100%");
      assert.equal(style.flexShrink, 1);
      assert.ok(style.minWidth >= 48);
      assert.ok(style.minHeight >= 48);
    }
    assert.equal(choices[5].props.accessibilityState.checked, true);
    choices[1].props.onPress();
    assert.deepEqual(changes, ["1"]);
  }
});

test("horizontal Choices measure parent width and reveal the initial selected chip after layout", () => {
  const h = harness();
  const props = {
    label: "Variant",
    value: "5",
    options: Array.from({ length: 6 }, (_, i) => ({
      value: String(i),
      label: `Variant ${i}`,
    })),
    onChange() {},
  };
  let tree = h.render("Choices", props)!;
  h.flushEffects();
  assert.deepEqual(h.scrolls, [], "No position exists before native layout");
  tree.props.onLayout(layout(0, 366));
  tree = h.render("Choices", props)!;
  const choices = all(tree, "Pressable");
  assert.equal(choices[5].props.style({ pressed: false }).maxWidth, 366);
  choices[5].props.onLayout(layout(820));
  assert.deepEqual(h.scrolls, [{ x: 804, animated: false }]);
  choices[0].props.onLayout(layout(0));
  h.render("Choices", { ...props, value: "0" });
  h.flushEffects();
  assert.deepEqual(h.scrolls.at(-1), { x: 0, animated: false });
});

test("Choices wrap in a narrow pane, expand again and retain the selected choice on resize", () => {
  const h = harness({ width: 884 });
  const props = {
    label: "Size",
    value: "5",
    options: Array.from({ length: 6 }, (_, i) => ({ value: String(i), label: `Size ${i}` })),
    onChange() {},
  };
  let tree = h.render("Choices", props)!;
  tree.props.onLayout(layout(0, 280));
  tree = h.render("Choices", props)!;
  h.flushEffects();
  assert.equal(all(tree, "ScrollView").length, 0);
  assert.equal(all(tree, "Pressable")[5].props.accessibilityState.checked, true);

  tree.props.onLayout(layout(0, 680));
  tree = h.render("Choices", props)!;
  h.flushEffects();
  assert.equal(all(tree, "ScrollView").length, 1);
  all(tree, "Pressable")[5].props.onLayout(layout(820));
  assert.deepEqual(h.scrolls.at(-1), { x: 804, animated: false });
  const previousScrollCount = h.scrolls.length;
  tree.props.onLayout(layout(0, 600));
  tree = h.render("Choices", props)!;
  h.flushEffects();
  assert.equal(h.scrolls.length, previousScrollCount + 1);
  assert.deepEqual(h.scrolls.at(-1), { x: 804, animated: false });

  h.resize(884, 2);
  tree = h.render("Choices", props)!;
  assert.equal(all(tree, "ScrollView").length, 0);
  assert.equal(all(tree, "Pressable")[5].props.accessibilityState.checked, true);
});

test("Photo retry remains available directly and is suppressed inside clickable product tiles", () => {
  for (const allowRetry of [true, false]) {
    const h = harness();
    const props = {
      uri: "/catalogue.jpg",
      label: "Catalogue photo",
      allowRetry,
      contain: true,
    };
    let tree = h.render("Photo", props);
    const image = one(tree, "Image");
    assert.equal(image.props.source.uri, "https://example.test/catalogue.jpg");
    assert.equal(image.props.resizeMode, "contain");
    h.flushEffects();
    image.props.onError();
    tree = h.render("Photo", props);
    assert.equal(all(tree, "Image").length, 0);
    const retry = all(tree, h.ui.Button);
    assert.equal(retry.length, allowRetry ? 1 : 0);
    if (allowRetry) {
      assert.equal(retry[0].props.label, "Retry photo");
      retry[0].props.onPress();
      assert.equal(all(h.render("Photo", props), "Image").length, 1);
    }
    h.render("Photo", { ...props, uri: "/replacement.jpg" });
    h.flushEffects();
    assert.equal(
      all(h.render("Photo", { ...props, uri: "/replacement.jpg" }), "Image")
        .length,
      1,
    );
  }
});

test("Status exposes error alerts and polite updates with platform-appropriate announcements", () => {
  for (const os of ["ios", "android"] as const) {
    const h = harness({ os });
    let tree = h.render("Status", { message: "Storage failed", error: true })!;
    assert.equal(tree.props.accessible, true);
    assert.equal(tree.props.accessibilityRole, "alert");
    assert.equal(tree.props.accessibilityLabel, "Storage failed");
    assert.equal(tree.props.accessibilityLiveRegion, "assertive");
    h.flushEffects();
    h.render("Status", { message: "Storage failed", error: true });
    h.flushEffects();
    assert.deepEqual(h.announcements, os === "ios" ? ["Storage failed"] : []);
    tree = h.render("Status", { message: "Saved" })!;
    assert.equal(tree.props.accessibilityRole, "text");
    assert.equal(tree.props.accessibilityLiveRegion, "polite");
    assert.equal(h.render("Status", { message: "" }), null);
  }
});

test("Field keeps native input behavior, focus callbacks and visible idle/error boundaries", () => {
  for (const theme of ["light", "dark"] as const) {
    const h = harness({ theme }),
      events: string[] = [];
    const props = {
      label: "Phone",
      value: "",
      onChangeText() {},
      keyboardType: "phone-pad",
      autoComplete: "tel-national",
      onFocus: () => events.push("focus"),
      onBlur: () => events.push("blur"),
    };
    let input = one(h.render("Field", props), "TextInput");
    assert.equal(input.props.accessibilityLabel, "Phone");
    assert.equal(input.props.keyboardType, "phone-pad");
    assert.equal(input.props.autoComplete, "tel-national");
    assert.equal(
      flattenStyle(input.props.style).borderColor,
      design.palettes[theme].controlLine,
    );
    input.props.onFocus({});
    input = one(h.render("Field", props), "TextInput");
    assert.equal(
      flattenStyle(input.props.style).borderColor,
      design.palettes[theme].accent,
    );
    input.props.onBlur({});
    input = one(
      h.render("Field", { ...props, error: "Enter a phone number" }),
      "TextInput",
    );
    assert.equal(input.props.accessibilityHint, "Enter a phone number");
    assert.equal(
      flattenStyle(input.props.style).borderColor,
      design.palettes[theme].error,
    );
    assert.deepEqual(events, ["focus", "blur"]);
  }
});


test("compact search fields retain accessible labels and editing without a duplicate heading", () => {
  for (const theme of ["light", "dark"] as const) {
    const h = harness({ theme });
    const changes: string[] = [];
    const tree = h.render("Field", { label: "Search catalogue", compact: true, value: "", onChangeText: (value: string) => changes.push(value) });
    const input = one(tree, "TextInput");
    assert.equal(input.props.accessibilityLabel, "Search catalogue");
    assert.equal(input.props.style[0].minHeight, 44);
    assert.equal(input.props.style[0].fontSize, 12);
    assert.equal(all(tree, "Text").length, 0);
    input.props.onChangeText("denim");
    assert.deepEqual(changes, ["denim"]);
  }
});


test('floating dock clearance is applied to scroll content, never the screen viewport', () => {
  for (const bottomOverlay of [0, 60, 84, 142]) {
    const h = harness({ bottomOverlay });
    const tree = h.render('Screen', { contentContainerStyle: { maxWidth: 680, paddingBottom: 2 }, children: 'Last actionable item' });
    const keyboard = one(tree, 'KeyboardAvoidingView'), scroll = one(tree, 'ScrollView');
    assert.equal(flattenStyle(keyboard.props.style).paddingBottom, undefined);
    assert.equal(flattenStyle(scroll.props.style).paddingBottom, undefined);
    assert.equal(flattenStyle(scroll.props.contentContainerStyle).paddingBottom, bottomOverlay ? Math.max(54, bottomOverlay + 12) : 2);
    assert.equal(flattenStyle(scroll.props.contentContainerStyle).maxWidth, 680);
  }
});

test('native reduced transparency is checked, updated live and unsubscribed', async () => {
  const h = harness({ os: 'ios', reducedTransparency: true });
  assert.equal(h.render('useReducedTransparency'), false);
  h.flushEffects();
  await Promise.resolve();
  assert.equal(h.render('useReducedTransparency'), true);
  h.accessibilityListeners.reduceTransparencyChanged(false);
  assert.equal(h.render('useReducedTransparency'), false);
  h.accessibilityListeners.reduceTransparencyChanged(true);
  assert.equal(h.render('useReducedTransparency'), true);
  h.dispose();
  assert.equal(h.accessibilityListeners.reduceTransparencyChanged, undefined);
});


test('a late initial transparency query cannot overwrite a newer OS preference', async () => {
  const h = harness({ os: 'ios', reducedTransparency: false });
  h.render('useReducedTransparency'); h.flushEffects();
  h.accessibilityListeners.reduceTransparencyChanged(true);
  await Promise.resolve();
  assert.equal(h.render('useReducedTransparency'), true);
  h.dispose();
});


test('web reduced-transparency media preference updates the same solid fallback', () => {
  const h = harness({ os: 'web', reducedTransparency: true });
  h.render('useReducedTransparency'); h.flushEffects();
  assert.equal(h.render('useReducedTransparency'), true);
  h.browserPreference.matches = false;
  h.accessibilityListeners.browser(false);
  assert.equal(h.render('useReducedTransparency'), false);
  h.dispose();
  assert.equal(h.accessibilityListeners.browser, undefined);
});
