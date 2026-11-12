import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import {
  merchantReadinessBlockers,
  shopifyDomain,
} from "../src/settingsPresentation.ts";

// Exercise the screen's real event handlers with native and storage boundaries
// injected. This does not replace native layout or assistive-technology testing.
type Element = { type: any; props: Record<string, any>; children: any[] };
const code = ts.transpileModule(
  fs.readFileSync(
    new URL("../src/SettingsScreens.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
    },
  },
).outputText;
function harness(
  name: "profile" | "settings" | "owner",
  overrides: Record<string, any> = {},
  readiness: unknown = { ready: false, connected: false, blockers: [] },
) {
  const state: unknown[] = [];
  const refs: { current: any }[] = [];
  let stateIndex = 0,
    refIndex = 0;
  const effects: (() => unknown)[] = [];
  const routes: unknown[] = [];
  const follows: string[] = [];
  const themes: string[] = [];
  const writes: unknown[] = [];
  const reads: string[] = [];
  let exports = 0;
  const app = {
    products: [
      { id: "a:one", brandId: "a" },
      { id: "b:two", brandId: "b" },
    ],
    saved: ["a:one", "b:two", "a:missing"],
    commerce: {
      cart: [
        { productId: "a:one", brandId: "a", quantity: 2 },
        { productId: "a:missing", brandId: "a", quantity: 3 },
        { productId: "b:two", brandId: "b", quantity: 4 },
      ],
      orders: [{}, {}],
      preferences: { style: "", fit: "" },
    },
    brands: [{ id: "a", name: "Brand A" }],
    followed: ["a", "unavailable"],
    themePreference: "system",
    catalogueLoading: false,
    toggleFollowed: async (id: string) => {
      follows.push(id);
    },
    setTheme: async (theme: string) => {
      themes.push(theme);
    },
    dispatch: async (action: unknown) => {
      writes.push(action);
      return true;
    },
    exportBackup: async () => {
      exports++;
    },
    ...overrides,
  };
  const react = {
    Fragment: "Fragment",
    createElement: (type: any, props: any, ...children: any[]): Element => ({
      type,
      props: props || {},
      children: children.flat(Infinity),
    }),
    useState: (initial: unknown) => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initial;
      return [
        state[index],
        (value: unknown) => {
          state[index] =
            typeof value === "function" ? value(state[index]) : value;
        },
      ];
    },
    useRef: (value: unknown) => {
      const index = refIndex++;
      if (!refs[index]) refs[index] = { current: value };
      return refs[index];
    },
    useEffect: (effect: () => unknown) => {
      effects.push(effect);
    },
  };
  const components = (names: string[]) =>
    Object.fromEntries(names.map((key) => [key, key]));
  const modules: Record<string, unknown> = {
    react: { ...react, default: react },
    "react-native": components(["ActivityIndicator", "Text", "View"]),
    "./state": { useApp: () => app },
    "./PersonalProfile": { PersonalProfile: (props: any) => ({ type: "PersonalProfile", props, children: [] }) },
    "./core/api": {
      apiFetch: async (path: string) => {
        reads.push(path);
        return { ok: true, json: async () => readiness };
      },
    },
    "./ui": {
      ...components([
        "Screen",
        "Title",
        "Body",
        "Button",
        "Field",
        "Badge",
        "Status",
      ]),
      usePalette: () => ({}),
    },
    "./SettingsUI": components([
      "FollowedStoreRow",
      "SettingsChoice",
      "SettingsContent",
      "SettingsDivider",
      "SettingsGroup",
      "SettingsRow",
    ]),
    "./settingsPresentation": { merchantReadinessBlockers, shopifyDomain },
  };
  const module = { exports: {} as Record<string, any> };
  new Function("require", "exports", code)((key: string) => {
    assert.ok(key in modules, `Unexpected native/network dependency: ${key}`);
    return modules[key];
  }, module.exports);
  const render = () => {
    stateIndex = 0;
    refIndex = 0;
    effects.length = 0;
    const component = module.exports.SettingsScreen({
      route: { name, brandId: "a" },
      navigate: (route: unknown) => routes.push(route),
    });
    return component.type(component.props) as Element;
  };
  return {
    render,
    effects,
    routes,
    follows,
    themes,
    writes,
    reads,
    exports: () => exports,
  };
}
function find(tree: Element, type: string, label?: string): Element {
  if (tree.type === type && (label === undefined || tree.props.label === label))
    return tree;
  for (const child of tree.children) {
    if (typeof child !== "object" || !child) continue;
    try {
      return find(child, type, label);
    } catch {
      /* Try the next sibling. */
    }
  }
  throw Error(`Missing ${type}: ${label}`);
}
function all(tree: Element, type: string): Element[] {
  return [
    tree.type === type ? tree : null,
    ...tree.children.flatMap((child) =>
      typeof child === "object" && child ? all(child, type) : [],
    ),
  ].filter(Boolean) as Element[];
}
const flush = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
};

test("settings removes the saved-pieces row, retains saved data, and keeps bag counts scoped", () => {
  const retained = ["a:one", "b:two", "a:missing"];
  const h = harness("settings", { saved: retained });
  const screen = h.render();
  const orders = find(screen, "SettingsRow", "Demo orders");
  assert.equal(orders.props.count, 2);
  assert.ok(!all(screen, "SettingsRow").some(row => row.props.label === "Saved pieces"));
  assert.equal(find(screen, "SettingsRow", "Your bag").props.count, 5);
  orders.props.onPress();
  find(screen, "SettingsRow", "Your bag").props.onPress();
  assert.deepEqual(h.routes, [
    { name: "orders" },
    { name: "cart" },
  ]);
  assert.deepEqual(retained, ["a:one", "b:two", "a:missing"]);
  assert.deepEqual(h.writes, []);
});

test("settings preserves unavailable followed IDs and prevents repeated unfollow writes", async () => {
  const h = harness("settings");
  const rows = all(h.render(), "FollowedStoreRow");
  assert.equal(rows[0].props.name, "Brand A");
  rows[0].props.onExplore();
  assert.deepEqual(h.routes, [{ name: "brand", brandId: "a" }]);
  assert.equal(rows[1].props.name, "Unavailable store");
  assert.equal(rows[1].props.detail, "unavailable");
  assert.equal(rows[1].props.onExplore, undefined);
  rows[1].props.onUnfollow();
  rows[1].props.onUnfollow();
  assert.deepEqual(h.follows, ["unavailable"]);
  assert.equal(all(h.render(), "FollowedStoreRow")[1].props.busy, true);
  await flush();
  assert.equal(all(h.render(), "FollowedStoreRow")[1].props.busy, false);
  const loading = harness("settings", { catalogueLoading: true });
  assert.equal(
    all(loading.render(), "FollowedStoreRow")[1].props.name,
    "Loading store…",
  );
});

test("settings preference choices save locally once and theme choices remain immediate", async () => {
  const h = harness("settings");
  find(h.render(), "SettingsChoice", "Theme").props.onChange("dark");
  assert.deepEqual(h.themes, ["dark"]);
  find(h.render(), "SettingsChoice", "Favourite style").props.onChange(
    "Minimal",
  );
  find(h.render(), "SettingsChoice", "Preferred fit").props.onChange("Regular");
  const save = find(h.render(), "Button", "Save preferences");
  save.props.onPress();
  save.props.onPress();
  assert.deepEqual(h.writes, [
    { type: "preferences", value: { style: "Minimal", fit: "Regular" } },
  ]);
  await flush();
  assert.equal(
    find(h.render(), "Status").props.message,
    "Preferences saved on this device.",
  );
});

test("backup sharing and account destinations remain separate and explicit", async () => {
  const h = harness("settings");
  const screen = h.render();
  const backup = find(screen, "SettingsRow", "Export local backup");
  backup.props.onPress();
  backup.props.onPress();
  assert.equal(h.exports(), 1);
  find(screen, "SettingsRow", "Sign in or manage account").props.onPress();
  find(screen, "SettingsRow", "Preview WhatsApp OTP login").props.onPress();
  find(screen, "SettingsRow", "Brand-owner dashboard").props.onPress();
  assert.deepEqual(h.routes, [
    { name: "login" },
    { name: "login-demo" },
    { name: "owner" },
  ]);
  await flush();
  assert.equal(
    find(h.render(), "SettingsRow", "Export local backup").props.busy,
    false,
  );
});

test("merchant domain validation never enables connection or starts authorization", async () => {
  const h = harness("owner");
  let screen = h.render();
  const cleanUp = h.effects[0]() as () => void;
  await flush();
  screen = h.render();
  find(screen, "Field", "Store domain").props.onChangeText(
    " MY-STORE.myshopify.com ",
  );
  find(h.render(), "Button", "Check domain format").props.onPress();
  screen = h.render();
  assert.equal(
    find(screen, "Button", "Connect Shopify · Setup required").props.disabled,
    true,
  );
  assert.equal(all(screen, "Status")[0].props.error, false);
  assert.match(
    all(screen, "Status")[0].props.message,
    /Ownership has not been verified/,
  );
  assert.deepEqual(h.reads, ["/api/merchant/shopify/readiness"]);
  assert.equal(
    find(screen, "SettingsRow", "Refresh readiness").props.busy,
    false,
  );
  cleanUp();
});

test("merchant rejects an unexpected ready response and ignores an aborted response", async () => {
  const h = harness(
    "owner",
    {},
    { ready: true, connected: true, blockers: [] },
  );
  h.render();
  const cleanUp = h.effects[0]() as () => void;
  await flush();
  assert.match(
    find(h.render(), "Status").props.message,
    /Installation remains blocked/,
  );
  assert.equal(
    find(h.render(), "Button", "Connect Shopify · Setup required").props
      .disabled,
    true,
  );
  assert.ok(find(h.render(), "SettingsRow", "Retry readiness check"));
  cleanUp();
  const cancelled = harness("owner");
  cancelled.render();
  (cancelled.effects[0]() as () => void)();
  await flush();
  assert.equal(
    find(cancelled.render(), "SettingsRow", "Checking readiness…").props.busy,
    true,
  );
});

test("settings stays compact and personal profile is a separate destination", () => {
  const h = harness("settings");
  const screen = h.render();
  assert.equal(all(screen, "Title").length, 0);
  assert.ok(find(screen, "SettingsChoice", "Theme"));
  assert.ok(find(screen, "SettingsRow", "Sign in or manage account"));
  const profile = harness("profile").render();
  assert.equal(profile.type, "PersonalProfile");
  assert.equal(all(profile, "SettingsRow").length, 0);
});

test("Instagram-inspired settings keep account and merchant entry points prominent", () => {
  const h = harness("settings");
  const screen = h.render();
  const groups = all(screen, "SettingsGroup");
  assert.deepEqual(groups.slice(0, 3).map(group => group.props.title), [
    "Account", "For brand owners", "Your shopping",
  ]);
  const merchant = find(screen, "SettingsRow", "Brand-owner dashboard");
  assert.equal(merchant.props.detail, "Shopify setup · not connected");
  assert.equal(merchant.props.icon, "grid");
  merchant.props.onPress();
  assert.deepEqual(h.routes, [{ name: "owner" }]);
  assert.deepEqual(h.reads, []);
  assert.deepEqual(h.writes, []);
  for (const label of ["Sign in or manage account", "Demo orders", "Your bag", "Manage demo stores", "Export local backup"]) {
    assert.ok(find(screen, "SettingsRow", label).props.icon);
  }
});

test("settings rows use compact readable type and flexible touch targets", () => {
  const ui = fs.readFileSync(new URL("../src/SettingsUI.tsx", import.meta.url), "utf8");
  assert.match(ui, /minHeight: 52/);
  assert.match(ui, /rowLabel: \{ fontSize: 14, lineHeight: 20/);
  assert.doesNotMatch(ui, /textTransform: "uppercase"/);
  assert.match(ui, /icon && <View style=\{styles.leadingIcon\}>/);
  assert.match(ui, /accessibilityState=\{\{ expanded: open, disabled \}\}/);
});
