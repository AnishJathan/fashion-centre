import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as shopper from "../src/core/shopper.ts";
import * as commerce from "../src/core/commerce.ts";
import * as domain from "../src/core/domain.ts";
import * as experience from "../src/experience.ts";
import type { Route } from "../src/navigation.ts";

// Render the real screen coordinator with inert native components and in-memory
// app state. This checks callbacks and route scope, not pixel/device behavior.
type Element = {
  type: string | symbol | ((props: any) => Element);
  props: any;
};
const source = ts.transpileModule(
  fs.readFileSync(
    new URL("../src/ShoppingScreens.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;
const product = (brandId: string, available = true): domain.Product => ({
  id: `${brandId}:piece`,
  brandId,
  brandName: `Store ${brandId}`,
  name: `Piece ${brandId}`,
  category: "Dress",
  image: "https://cdn.shopify.com/piece.jpg",
  moreVariants: false,
  variants: [
    {
      key: "medium",
      id: "medium",
      title: "Medium",
      amount: 25,
      currency: "USD",
      available,
      options: { Size: "M" },
    },
  ],
});
const line = (p: domain.Product, quantity = 1) => ({
  productId: p.id,
  brandId: p.brandId,
  brandName: p.brandName,
  variantKey: "medium",
  size: "M",
  quantity,
});
function harness(
  route: Route,
  overrides: Record<string, any> = {},
  insets = { top: 0, bottom: 0, left: 0, right: 0 },
  dimensions = { width: 390, height: 844, fontScale: 1 },
) {
  const products = [product("a"), product("b")];
  const actions: any[] = [],
    navigation: Route[] = [],
    updates: { index: number; value: any }[] = [],
    states: any[] = [],
    focusCallbacks: (() => () => void)[] = [],
    effectCleanups: (() => void)[] = [],
    cleanups: (() => void)[] = [];
  const a = {
    products,
    brands: products.map((p) => ({
      id: p.brandId,
      name: p.brandName,
      products: [p],
    })),
    sources: [],
    registrations: [{ id: "a", enabled: true }],
    saved: [],
    followed: [],
    catalogueLoading: false,
    catalogueError: "",
    commerce: { cart: [], orders: [], legacySamples: [] },
    dispatch: async (action: any) => {
      actions.push(action);
      return true;
    },
    toggleSaved: async (id: string) => {
      actions.push({ type: "save", id });
    },
    toggleFollowed: async (id: string) => {
      actions.push({ type: "follow", id });
      a.followed = a.followed.includes(id) ? a.followed.filter((value: string) => value !== id) : [...a.followed, id];
    },
    reload: async () => {},
    ...overrides,
  };
  let stateCursor = 0, refCursor = 0, effectCursor = 0, focusCursor = 0;
  const refs: any[] = [], effects: boolean[] = [];
  const React = {
    Fragment: Symbol("Fragment"),
    createElement: (type: Element["type"], props: any, ...children: any[]) => ({
      type,
      props: { ...props, children },
    }),
    useState: (value: any) => {
      const index = stateCursor++;
      if (!(index in states)) states[index] = typeof value === "function" ? value() : value;
      return [
        states[index],
        (v: any) => {
          states[index] = typeof v === "function" ? v(states[index]) : v;
          updates.push({ index, value: states[index] });
        },
      ];
    },
    useRef: (value: any) => { const index = refCursor++; return refs[index] ??= { current: value }; },
    useEffect: (callback: () => void | (() => void)) => {
      const index = effectCursor++;
      if (!effects[index]) { effects[index] = true; const cleanup = callback(); if (cleanup) effectCleanups.push(cleanup); }
    },
    useCallback: (callback: any) => callback,
  };
  const ui = Object.fromEntries(
    [
      "Screen",
      "Title",
      "Heading",
      "Body",
      "Button",
      "Card",
      "Field",
      "Badge",
      "Row",
      "Choices",
      "Photo",
      "Status",
      "Icon",
    ].map((name) => [name, name]),
  );
  const imports: Record<string, any> = {
    react: { __esModule: true, default: React, ...React },
    "react-native": {
      ActivityIndicator: "ActivityIndicator",
      FlatList: "FlatList",
      Pressable: "Pressable",
      ScrollView: "ScrollView",
      Text: "Text",
      View: "View",
      useWindowDimensions: () => dimensions,
    },
    "@react-navigation/native": {
      useFocusEffect: (callback: () => () => void) => {
        const index = focusCursor++;
        if (!focusCallbacks[index]) { focusCallbacks[index] = callback; cleanups.push(callback()); }
      },
    },
    "react-native-safe-area-context": {
      useSafeAreaInsets: () => insets,
    },
    "./Experience": { ExperienceIntro: "ExperienceIntro" },
    "./CommerceHome": { CommerceHome: "CommerceHome" },
    "./BrandStorefront": { BrandStorefront: "BrandStorefront" },
    "./BrandMark": { BrandMark: "BrandMark" },
    "./experience": experience,
    "./core/shopper": shopper,
    "./core/commerce": commerce,
    "./core/domain": domain,
    "./state": { useApp: () => a },
    "./ui": { ...ui, usePalette: () => ({}) },
    "./ShoppingComponents": Object.fromEntries(
      [
        "ProductGrid",
        "ShoppingEmpty",
        "ShoppingCard",
        "ShoppingHeader",
        "ShoppingLine",
        "ShoppingNotice",
      ].map((name) => [name, name]),
    ),
  };
  const module = { exports: {} as any };
  new Function(
    "require",
    "module",
    "exports",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "fetch",
    source,
  )(
    (name: string) => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
    module,
    module.exports,
    (callback: () => void) => {
      callback();
      return 1;
    },
    () => {},
    () => assert.fail("Screen must not issue its own network requests"),
  );
  const nodes: Element[] = [];
  function visit(node: any): void {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "function") {
      visit(node.type(node.props));
      return;
    }
    nodes.push(node);
    visit(node.props?.children);
  }
  const render = () => {
    stateCursor = refCursor = effectCursor = focusCursor = 0;
    nodes.length = 0;
    visit(
    module.exports.ShoppingScreen({
      route,
      navigate: (next: Route) => navigation.push(next),
      back: () => navigation.push({ name: "home" }),
    }),
    );
  };
  render();
  return {
    render,
    a,
    nodes,
    actions,
    navigation,
    updates,
    states,
    blur: () => cleanups.splice(0).forEach((fn) => fn()),
    refocus: () =>
      focusCallbacks.forEach((callback) => cleanups.push(callback())),
    unmount: () => {
      cleanups.splice(0).forEach((fn) => fn());
      effectCleanups.splice(0).forEach((fn) => fn());
    },
    find: (type: string, label?: string) =>
      nodes.find(
        (n) => n.type === type && (!label || n.props.label === label),
      )!,
  };
}

test("shopping grids preserve brand scope without exposing or changing existing saved records", () => {
  const h = harness(
    { name: "home", brandId: "a" },
    { saved: ["a:piece", "b:piece", "a:missing"] },
  );
  h.find("CommerceHome").props.onBrowse(); h.render();
  const grid = h.find("ProductGrid");
  assert.deepEqual(
    grid.props.products.map((p: domain.Product) => p.id),
    ["a:piece"],
  );
  grid.props.onView(grid.props.products[0]);
  assert.deepEqual(h.navigation, [
    { name: "product", productId: "a:piece", brandId: "a" },
  ]);
  assert.equal(h.find("Button", "Remove saved reference"), undefined);
  assert.equal(grid.props.onSave, undefined); assert.equal(grid.props.saved, undefined);
  assert.deepEqual(h.a.saved, ["a:piece", "b:piece", "a:missing"]);
  assert.deepEqual(h.actions, []);
});
test("product actions keep gallery, try-on and cart attached to the product owner", () => {
  const h = harness({ name: "product", productId: "a:piece", brandId: "a" });
  h.find("Button", "View catalogue photos").props.onPress();
  h.find("Button", "Try on with my saved photo").props.onPress();
  h.find("Button", "View cart").props.onPress();
  assert.deepEqual(h.navigation, [
    { name: "photos", productId: "a:piece", brandId: "a" },
    { name: "try-on", productId: "a:piece", brandId: "a" },
    { name: "cart", brandId: "a" },
  ]);
});
test("cart renders retained unavailable lines with quantity limits and explicit removal", () => {
  const p = product("a", false);
  const h = harness(
    { name: "cart", brandId: "a" },
    {
      products: [p],
      commerce: {
        cart: [
          line(p, 1),
          { ...line(p, 99), variantKey: "missing" },
          line(product("b")),
        ],
        orders: [],
        legacySamples: [],
      },
    },
  );
  assert.equal(h.nodes.filter((n) => n.type === "ShoppingLine").length, 2);
  assert.equal(h.find("Button", "−").props.disabled, true);
  assert.equal(
    h.nodes.filter((n) => n.type === "Button" && n.props.label === "+")[1].props
      .disabled,
    true,
  );
  assert.equal(h.find("Button", "Review demo checkout").props.disabled, true);
  assert.equal(h.actions.length, 0);
  h.find("Button", "Remove").props.onPress();
  assert.equal(h.actions[0].type, "remove");
});
test("duplicate checkout taps submit once and leaving blocks late completion navigation", async () => {
  let complete!: (value: boolean) => void;
  const pending = new Promise<boolean>((resolve) => {
    complete = resolve;
  });
  let calls = 0;
  const p = product("a");
  const h = harness(
    { name: "checkout", brandId: "a" },
    {
      commerce: {
        cart: [line(p), line(product("b"))],
        orders: [],
        legacySamples: [],
      },
      dispatch: () => {
        calls++;
        return pending;
      },
    },
  );
  assert.equal(h.nodes.filter((n) => n.type === "ShoppingLine").length, 1);
  const button = h.find("Button", "Place demo order");
  assert.equal(button.props.disabled, false);
  button.props.onPress();
  button.props.onPress();
  assert.equal(calls, 1);
  h.blur();
  complete(true);
  await pending;
  await Promise.resolve();
  assert.deepEqual(h.navigation, []);
});
test("unavailable store and empty order states are explicit and recoverable", () => {
  const store = harness({ name: "brand", brandId: "missing" });
  assert.equal(store.find("ShoppingEmpty").props.title, "Store unavailable");
  store.find("ShoppingEmpty").props.onPress();
  assert.deepEqual(store.navigation, [{ name: "stores" }]);
  const order = harness({ name: "order", orderId: "missing" });
  assert.equal(
    order.find("ShoppingEmpty").props.title,
    "This record is unavailable",
  );
  assert.ok(order.find("Button", "View demo orders"));
});

test("empty photo viewer respects landscape and home-indicator safe areas", () => {
  for (const catalogueLoading of [false, true]) {
    const h = harness(
      { name: "photos", productId: "a:piece", brandId: "a" },
      { products: [], catalogueLoading },
      { top: 0, bottom: 34, left: 48, right: 48 },
    );
    const padding = h.find("ScrollView").props.contentContainerStyle;
    assert.ok(padding.paddingLeft >= 48);
    assert.ok(padding.paddingRight >= 48);
    assert.ok(padding.paddingBottom >= 34);
    h.find("Button", "Close").props.onPress();
    assert.deepEqual(h.navigation, [
      { name: "product", productId: "a:piece", brandId: "a" },
    ]);
  }
});

for (const flow of ["product", "checkout"] as const) {
  test(`${flow} unlocks after returning before storage completion without stale feedback`, async () => {
    for (const outcome of [true, false, "reject"] as const) {
      let complete!: (value: boolean) => void;
      let fail!: (error: Error) => void;
      const pending = new Promise<boolean>((resolve, reject) => {
        complete = resolve;
        fail = reject;
      });
      let calls = 0;
      const h = harness(
        { name: flow, productId: "a:piece", brandId: "a" },
        {
          commerce: {
            cart: flow === "checkout" ? [line(product("a"))] : [],
            orders: [],
            legacySamples: [],
          },
          dispatch: () => {
            calls++;
            return pending;
          },
        },
      );
      const busyState = h.updates[0].index; // The focus callback updates busy first.
      const button = h.find(
        "Button",
        flow === "product" ? "Add to demo cart" : "Place demo order",
      );
      button.props.onPress();
      assert.equal(h.states[busyState], true);
      h.blur();
      h.refocus();
      assert.equal(h.states[busyState], true);
      const beforeCompletion = h.updates.length;
      if (outcome === "reject") fail(Error("Simulated storage failure"));
      else complete(outcome);
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(h.states[busyState], false, String(outcome));
      assert.deepEqual(
        h.updates.slice(beforeCompletion),
        [{ index: busyState, value: false }],
        "No stale message is published into the new focus session",
      );
      assert.deepEqual(h.navigation, [], "No stale order navigation");
      button.props.onPress();
      assert.equal(calls, 2, "The same mounted screen can submit again");
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });
  test(`${flow} does not update state after the screen unmounts`, async () => {
    let complete!: (value: boolean) => void;
    const pending = new Promise<boolean>((resolve) => {
      complete = resolve;
    });
    const h = harness(
      { name: flow, productId: "a:piece", brandId: "a" },
      {
        commerce: {
          cart: flow === "checkout" ? [line(product("a"))] : [],
          orders: [],
          legacySamples: [],
        },
        dispatch: () => pending,
      },
    );
    h.find(
      "Button",
      flow === "product" ? "Add to demo cart" : "Place demo order",
    ).props.onPress();
    h.unmount();
    const beforeCompletion = h.updates.length;
    complete(false);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(h.updates.length, beforeCompletion);
    assert.deepEqual(h.navigation, []);
  });
}

function homeCatalogue() {
  const priced = (id: string, currency: string, amount: number, available = true) => {
    const p = product(id, available);
    p.variants[0] = { ...p.variants[0], currency, amount };
    return p;
  };
  return [priced('usd-high', 'USD', 80), priced('eur-low', 'EUR', 5), priced('usd-low', 'USD', 10), priced('usd-boundary', 'USD', 25), priced('usd-unavailable', 'USD', 1, false)];
}
const gridIds = (h: ReturnType<typeof harness>) => h.find('ProductGrid').props.products.map((p: domain.Product) => p.id);
const content = (value: any): string => Array.isArray(value) ? value.map(content).join('') : value && typeof value === 'object' ? content(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value);
const catalogueTitle = (h: ReturnType<typeof harness>) => content(h.nodes.find(n => n.props.testID === 'catalogue-title'));
const catalogueDescription = (h: ReturnType<typeof harness>) => h.nodes.find(n => n.type === 'View' && n.props.accessible && n.props.accessibilityLabel?.includes('demo piece'))!.props.accessibilityLabel;


test('home currency-only collection retains its currency without inventing a price cap, then returns home', () => {
  const h = harness({ name: 'home' }, { products: homeCatalogue() });
  assert.ok(h.find('CommerceHome')); assert.equal(h.find('ProductGrid'), undefined);
  h.find('CommerceHome').props.onBrowse({ currency: 'USD', sort: 'price' }); h.render();
  assert.equal(h.find('CommerceHome'), undefined);
  assert.deepEqual(gridIds(h), ['usd-low:piece', 'usd-boundary:piece', 'usd-high:piece']);
  assert.match(catalogueDescription(h), /USD/);
  assert.equal(catalogueTitle(h), 'Explore all styles');
  compactControl(h, 'Back to home').props.onPress(); h.render();
  assert.ok(h.find('CommerceHome')); assert.equal(h.find('ProductGrid'), undefined);
  h.find('CommerceHome').props.onBrowse(); h.render();
  assert.deepEqual(gridIds(h), homeCatalogue().map(p => p.id));
  assert.deepEqual(h.actions, []); assert.deepEqual(h.navigation, []);
});

test('home price cap is inclusive and applies only to available variants in the selected currency', () => {
  const catalogue = homeCatalogue();
  // An inexpensive EUR variant must not admit a USD item over its USD bound.
  catalogue[0].variants.push({ ...catalogue[0].variants[0], key: 'eur', id: 'eur', currency: 'EUR', amount: 1 });
  const h = harness({ name: 'home' }, { products: catalogue });
  h.find('CommerceHome').props.onBrowse({ currency: 'USD', maxPrice: 25, sort: 'price' }); h.render();
  assert.deepEqual(gridIds(h), ['usd-low:piece', 'usd-boundary:piece']);
  assert.match(catalogueTitle(h), /Picks up to/);
  compactControl(h, 'Clear filters').props.onPress(); h.render();
  assert.deepEqual(gridIds(h), catalogue.map(p => p.id));
  assert.equal(h.nodes.some(n => n.props.accessibilityLabel === 'Clear filters'), false);
  assert.deepEqual(h.actions, []);
});

test('home selection applies query, category, store and price sort, and reset removes stale selection', () => {
  const h = harness({ name: 'home' }, { products: homeCatalogue() });
  h.find('CommerceHome').props.onBrowse({ query: 'usd', category: 'Dress', store: 'usd-low', currency: 'USD', sort: 'price' }); h.render();
  assert.deepEqual(gridIds(h), ['usd-low:piece']);
  compactControl(h, 'Back to home').props.onPress(); h.render();
  h.find('CommerceHome').props.onBrowse({ category: 'Dress', sort: 'price' }); h.render();
  assert.deepEqual(gridIds(h), ['eur-low:piece', 'usd-low:piece', 'usd-boundary:piece', 'usd-high:piece', 'usd-unavailable:piece']);
  assert.doesNotMatch(catalogueDescription(h), /matching|USD/);
  assert.deepEqual(h.actions, []);
});

test('brand routes render the dedicated storefront without the generic catalogue UI', () => {
  const h = harness({ name: 'brand', brandId: 'a' });
  const store = h.find('BrandStorefront');
  assert.equal(store.props.brand.id, 'a');
  assert.equal(h.find('ProductGrid'), undefined);
  assert.equal(h.find('Field'), undefined);
  store.props.navigate({ name: 'try-on', productId: 'a:piece', brandId: 'a' });
  assert.deepEqual(h.navigation, [{ name: 'try-on', productId: 'a:piece', brandId: 'a' }]);
});

test('product Try On stays primary before description with wishlist controls removed', () => {
  const h = harness({ name: 'product', productId: 'a:piece', brandId: 'a' }, { products: [{ ...product('a'), description: 'Description' }] });
  const buttons = h.nodes.filter(n => n.type === 'Button').map(n => n.props.label);
  assert.ok(buttons.indexOf('Try on with my saved photo') > buttons.indexOf('Add to demo cart'));
  assert.equal(buttons.includes('Save piece'), false);
  assert.equal(buttons.includes('Saved · Remove'), false);
  const tryOn = h.find('Button', 'Try on with my saved photo');
  assert.equal(tryOn.props.secondary, undefined);
  assert.ok(h.nodes.indexOf(tryOn) < h.nodes.findIndex(n => n.type === 'Heading' && n.props.children.includes('About this piece')));
  h.find('Button', 'Prepare a try-on photo').props.onPress();
  assert.deepEqual(h.navigation, [{ name: 'prepare', productId: 'a:piece', brandId: 'a' }]);
  assert.deepEqual(h.actions, []);
});

const compactControl = (h: ReturnType<typeof harness>, label: string, occurrence = 0) => {
  const node = h.nodes.filter(n => n.type === 'Pressable' && n.props.accessibilityLabel === label)[occurrence];
  assert.ok(node, `Missing compact control: ${label}`);
  return node;
};

test('compact brand directory opens each exact storefront without silently following', () => {
  const h = harness({ name: 'brands' });
  assert.deepEqual(h.a.followed, []); assert.deepEqual(h.actions, []);
  compactControl(h, 'Open Store b storefront').props.onPress();
  assert.deepEqual(h.navigation, [{ name: 'brand', brandId: 'b' }]);
  assert.deepEqual(h.a.followed, []); assert.deepEqual(h.actions, []);
  assert.equal(h.find('Button', 'Explore store'), undefined);
  compactControl(h, 'Manage demo stores').props.onPress();
  assert.deepEqual(h.navigation.at(-1), { name: 'stores' });
});

test('directory follows remain separate from navigation and update the exact brand', () => {
  const h = harness({ name: 'brands' }, { followed: ['a', 'unavailable'] });
  compactControl(h, 'Follow Store b').props.onPress(); h.render();
  assert.deepEqual(h.a.followed, ['a', 'unavailable', 'b']);
  assert.equal(compactControl(h, 'Unfollow Store b').props.accessibilityState.selected, true);
  assert.deepEqual(h.navigation, []);
  compactControl(h, 'Unfollow Store b').props.onPress(); h.render();
  assert.deepEqual(h.a.followed, ['a', 'unavailable']);
  assert.equal(compactControl(h, 'Follow Store b').props.accessibilityState.selected, false);
  assert.deepEqual(h.actions, [{ type: 'follow', id: 'b' }, { type: 'follow', id: 'b' }]);
  assert.deepEqual(h.navigation, []);
  h.a.brands = h.a.brands.filter((brand: domain.Brand) => brand.id !== 'a'); h.render();
  assert.ok(!h.nodes.some(n => n.props.accessibilityLabel === 'Open Store a storefront'));
  assert.deepEqual(h.a.followed, ['a', 'unavailable'], 'A missing store must not erase follow identities');
});

test('equal brand names do not merge compact directory routes or follow identities', () => {
  const h = harness({ name: 'brands' }, {
    brands: ['a', 'b'].map(id => ({ id, name: 'Same name', products: [product(id)] })),
  });
  compactControl(h, 'Follow Same name', 1).props.onPress(); h.render();
  assert.deepEqual(h.a.followed, ['b']);
  compactControl(h, 'Open Same name storefront', 1).props.onPress();
  assert.deepEqual(h.navigation, [{ name: 'brand', brandId: 'b' }]);
  assert.deepEqual(h.actions, [{ type: 'follow', id: 'b' }]);
});

test('directory configures 28px marks and 60px rows, followed by functional product recommendations', () => {
  const h = harness({ name: 'brands' });
  const marks = h.nodes.filter(n => n.type === 'BrandMark');
  assert.deepEqual(marks.map(n => [n.props.id, n.props.size]), [['a', 28], ['b', 28]]);
  assert.equal(h.find('Photo'), undefined, 'Directory rows do not use large fashion photos as brand logos');
  for (const id of ['a', 'b']) {
    const row = h.nodes.find(n => n.type === 'View' && n.props.key === id)!;
    assert.ok(row); assert.ok(row.props.style.minHeight <= 60);
    assert.ok(compactControl(h, `Open Store ${id} storefront`).props.style.minHeight <= 56);
    assert.ok(h.nodes.indexOf(row) < h.nodes.indexOf(h.find('ProductGrid')));
  }
  const grid = h.find('ProductGrid');
  assert.deepEqual(grid.props.products.map((p: domain.Product) => p.id), ['a:piece', 'b:piece']);
  assert.equal(grid.props.onSave, undefined);
  assert.equal(grid.props.saved, undefined);
  assert.deepEqual(h.actions, []);
  assert.deepEqual(h.navigation, []);
  grid.props.onTryOn(grid.props.products[1]);
  grid.props.onView(grid.props.products[0]);
  assert.deepEqual(h.navigation, [{ name: 'try-on', productId: 'b:piece', brandId: 'b' }, { name: 'product', productId: 'a:piece', brandId: 'a' }]);
  assert.deepEqual(h.actions, []);
});

test('empty compact directory has explicit recovery without fabricated follows or products', () => {
  const h = harness({ name: 'brands' }, { products: [], brands: [], followed: ['retained'] });
  assert.equal(h.find('BrandMark'), undefined); assert.equal(h.find('ProductGrid'), undefined);
  const empty = h.find('ShoppingEmpty');
  assert.equal(empty.props.title, 'Find your first store');
  empty.props.onPress();
  assert.deepEqual(h.navigation, [{ name: 'stores' }]);
  assert.deepEqual(h.a.followed, ['retained']); assert.deepEqual(h.actions, []);
});


test('product screens never expose a saved-state action or mutate retained records', () => {
  for (const saved of [[], ['a:piece', 'a:unavailable']]) {
    const h = harness({ name: 'product', productId: 'a:piece', brandId: 'a' }, { saved, toggleSaved: () => assert.fail('Wishlist records must not be changed') });
    assert.equal(h.nodes.some(n => n.type === 'Button' && /save piece|saved · remove|wishlist/i.test(n.props.label || '')), false);
    assert.equal(h.nodes.some(n => n.props.icon === 'heart'), false);
    h.find('Button', 'Try on with my saved photo').props.onPress();
    h.find('Button', 'View cart').props.onPress();
    assert.deepEqual(h.a.saved, saved);
    assert.deepEqual(h.actions, []);
    assert.deepEqual(h.navigation, [{ name: 'try-on', productId: 'a:piece', brandId: 'a' }, { name: 'cart', brandId: 'a' }]);
  }
});

test('Bag and Orders switches are real, scoped views even when both are empty', () => {
  for (const brandId of [undefined, 'a']) for (const name of ['cart', 'orders'] as const) {
    const h = harness({ name, ...(brandId ? { brandId } : {}) });
    const sections = h.nodes.filter(n => n.props.testID?.startsWith('bag-section-'));
    assert.deepEqual(sections.map(n => n.props.accessibilityLabel), ['Bag', 'Orders']);
    assert.equal(sections.filter(n => n.props.accessibilityState.selected).length, 1);
    const active = sections.find(n => n.props.accessibilityState.selected)!;
    active.props.onPress(); assert.deepEqual(h.navigation, []);
    const inactive = sections.find(n => !n.props.accessibilityState.selected)!;
    assert.ok(inactive.props.style({ pressed: false }).minHeight >= 48);
    inactive.props.onPress();
    assert.deepEqual(h.navigation, [{ name: name === 'cart' ? 'orders' : 'cart', brandId }]);
    assert.deepEqual(h.actions, [], 'Switching views never changes the bag or order data');
  }
});

test('Bag order history starts in the current store and explicitly exposes all retained records', () => {
  const order = (id: string): commerce.DemoOrder => ({
    id: `order-${id}`, brandId: id, brandName: `Store ${id}`, date: '2026-01-20T10:00:00.000Z', status: 'Demo order', sample: true,
    lines: [{ ...line(product(id), 2), name: `Recorded ${id}`, image: '', price: 25, currency: 'USD', color: '' }],
  });
  const records = [order('a'), order('disabled')];
  const h = harness({ name: 'orders', brandId: 'a' }, { commerce: { cart: [], orders: records, legacySamples: ['archived'] } });
  assert.equal(compactControl(h, 'Store a').props.accessibilityState.checked, true);
  assert.ok(compactControl(h, 'Store disabled'));
  assert.equal(h.nodes.filter(n => n.type === 'Button' && n.props.label === 'View order').length, 1);
  h.find('Button', 'View order').props.onPress();
  assert.deepEqual(h.navigation, [{ name: 'order', orderId: 'order-a', brandId: 'a' }]);
  compactControl(h, 'All stores').props.onPress(); h.render();
  const orderButtons = h.nodes.filter(n => n.type === 'Button' && n.props.label === 'View order');
  assert.equal(orderButtons.length, 2, 'Disabled-store snapshots remain reachable');
  orderButtons[1].props.onPress();
  assert.deepEqual(h.navigation.at(-1), { name: 'order', orderId: 'order-disabled', brandId: 'a' });
  const detail = harness(h.navigation.at(-1)!, { commerce: { cart: [], orders: records, legacySamples: [] } });
  assert.equal(detail.find('ShoppingLine').props.name, 'Recorded disabled');
  detail.find('Button', 'View demo orders').props.onPress();
  assert.deepEqual(detail.navigation, [{ name: 'orders', brandId: 'a' }]);
  assert.deepEqual(h.actions, []); assert.deepEqual(h.a.commerce.orders, records);
});

test('an empty scoped order view remains switchable and keeps a valid current-store filter', () => {
  const h = harness({ name: 'orders', brandId: 'a' });
  assert.equal(compactControl(h, 'Store a').props.accessibilityState.checked, true);
  assert.deepEqual(h.nodes.filter(n => n.props.accessibilityRole === 'radio').map(n => n.props.accessibilityLabel), ['All stores', 'Store a']);
  assert.equal(h.find('ShoppingEmpty').props.title, 'No demo orders yet');
  h.nodes.find(n => n.props.testID === 'bag-section-cart')!.props.onPress();
  assert.deepEqual(h.navigation, [{ name: 'cart', brandId: 'a' }]);
});


test('catalogue collapses to two compact rows with one count and a horizontal category rail at all text sizes', () => {
  const categories = ['Denim', 'Dresses', 'Co-ords', 'Everyday', 'Shoes', 'Outerwear', 'Bags', 'A very long category name that must remain readable'];
  const products = categories.map((category, i) => ({ ...product(String(i)), category }));
  const style = (node: Element) => typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
  for (const width of [320, 390, 540, 720, 884]) for (const fontScale of [1, 1.6, 2.2]) {
    const h = harness({ name: 'home' }, { products }, undefined, { width, height: 844, fontScale });
    h.find('CommerceHome').props.onBrowse(); h.render();
    const controls = h.nodes.find(n => n.props.testID === 'catalogue-controls')!;
    assert.equal(controls.props.children.flat().filter((n: any) => n && typeof n === 'object').length, 2);
    assert.equal(style(controls).gap, 2);
    assert.equal(h.find('ShoppingHeader'), undefined, 'No separate eyebrow or discovery introduction');
    assert.equal(h.nodes.filter(n => n.props.testID === 'catalogue-count').length, 1);
    assert.equal(content(h.nodes.find(n => n.props.testID === 'catalogue-count')), '8 pieces');
    assert.ok(!h.nodes.some(n => n.type === 'Heading'), 'No duplicate result count before the products');
    const rail = h.nodes.find(n => n.props.testID === 'catalogue-category-rail')!;
    assert.equal(rail.props.horizontal, true);
    assert.equal(rail.props.accessibilityRole, 'radiogroup');
    assert.equal(rail.props.contentContainerStyle.flexWrap, undefined);
    assert.equal(rail.props.keyboardShouldPersistTaps, 'handled');
    rail.props.onLayout({ nativeEvent: { layout: { width: width - 40 } } }); h.render();
    const radios = h.nodes.filter(n => n.props.accessibilityRole === 'radio');
    assert.deepEqual(radios.map(n => n.props.accessibilityLabel), ['All', ...categories]);
    for (const button of h.nodes.filter(n => n.type === 'Pressable')) {
      assert.ok(style(button).minHeight >= 48);
      assert.ok((style(button).minWidth || style(button).width) >= 48);
      assert.equal(style(button).height, undefined, 'Large text is not clipped by a fixed height');
    }
    for (const radio of radios) assert.equal(style(radio).maxWidth, width - 40);
    for (const text of h.nodes.filter(n => n.type === 'Text')) {
      assert.equal(text.props.numberOfLines, undefined);
      assert.equal(text.props.maxFontSizeMultiplier, undefined);
    }
    assert.equal(h.find('Field', 'Search catalogue'), undefined);
    const combined = h.nodes.find(n => n.props.testID === 'catalogue-category-filter-row')!;
    assert.equal(combined.props.style.flexDirection, 'row');
    assert.ok(combined.props.children.flat().includes(compactControl(h, 'Filters & sort')));
    compactControl(h, 'Search catalogue').props.onPress(); h.render();
    const search = h.find('Field', 'Search catalogue');
    assert.equal(search.props.compact, true);
    assert.equal(search.props.autoFocus, true);
    assert.equal(search.props.style.minHeight, 48);
    assert.ok(search.props.style.fontSize >= 13);
    assert.equal(h.nodes.some(n => n.props.testID === 'catalogue-filter-options'), false);
    assert.equal(compactControl(h, 'Filters & sort').props.accessibilityState.expanded, false);
    assert.deepEqual(h.actions, []); assert.deepEqual(h.navigation, []);
  }
});

test('compact catalogue search, category, store and sorting stay functional across repeated disclosure and reset', () => {
  const products = [
    { ...product('a'), name: 'Zebra jacket', category: 'Outerwear', createdAt: '2026-01-01', variants: [{ ...product('a').variants[0], amount: 30 }] },
    { ...product('b'), name: 'Amber dress', category: 'Dresses', createdAt: '2026-03-01', variants: [{ ...product('b').variants[0], amount: 10 }] },
    { ...product('c'), name: 'Cloud jacket', category: 'Outerwear', createdAt: '2026-02-01', variants: [{ ...product('c').variants[0], amount: 20 }] },
  ];
  const h = harness({ name: 'home' }, { products, brands: products.map(p => ({ id: p.brandId, name: p.brandName, products: [p] })) });
  const press = (label: string) => { compactControl(h, label).props.onPress(); h.render(); };
  h.find('CommerceHome').props.onBrowse(); h.render();
  press('Search catalogue');
  h.find('Field', 'Search catalogue').props.onChangeText('jacket'); h.render();
  assert.deepEqual(gridIds(h), ['a:piece', 'c:piece']);
  assert.equal(catalogueTitle(h), 'Search results');
  press('Dresses'); assert.deepEqual(gridIds(h), []);
  assert.equal(h.find('ShoppingEmpty').props.title, 'No matching pieces');
  press('Clear filters'); assert.deepEqual(gridIds(h), products.map(p => p.id));
  press('Outerwear'); assert.deepEqual(gridIds(h), ['a:piece', 'c:piece']);
  press('Filters & sort');
  assert.equal(compactControl(h, 'Filters & sort').props.accessibilityState.expanded, true);
  assert.equal(h.nodes.filter(n => n.type === 'ScrollView' && n.props.horizontal).length, 4);
  press('Store c'); assert.deepEqual(gridIds(h), ['c:piece']);
  press('Filters & sort'); assert.equal(h.nodes.some(n => n.props.testID === 'catalogue-store-rail'), false);
  press('Filters & sort'); assert.equal(compactControl(h, 'Store c').props.accessibilityState.checked, true);
  press('All onboarded stores'); press('All'); press('Name A–Z');
  assert.deepEqual(gridIds(h), ['b:piece', 'c:piece', 'a:piece']);
  press('Price ↑ · by currency'); assert.deepEqual(gridIds(h), ['b:piece', 'c:piece', 'a:piece']);
  press('Newest'); assert.deepEqual(gridIds(h), ['b:piece', 'c:piece', 'a:piece']);
  press('Catalogue order'); assert.deepEqual(gridIds(h), products.map(p => p.id));
  press('Store a'); press('Name A–Z');
  assert.equal(compactControl(h, 'Filters & sort').props.accessibilityValue.text, '2 active');
  press('Clear filters'); assert.deepEqual(gridIds(h), products.map(p => p.id));
  assert.equal(compactControl(h, 'All').props.accessibilityState.checked, true);
  assert.equal(compactControl(h, 'Catalogue order').props.accessibilityState.checked, true);
  assert.equal(compactControl(h, 'All onboarded stores').props.accessibilityState.checked, true);
  assert.equal(h.nodes.some(n => n.props.accessibilityLabel === 'Clear filters'), false);
  const grid = h.find('ProductGrid'); grid.props.onTryOn(products[1]);
  assert.deepEqual(h.navigation, [{ name: 'try-on', productId: 'b:piece', brandId: 'b' }]);
  assert.equal(grid.props.onSave, undefined); assert.equal(grid.props.saved, undefined);
  press('Back to home'); assert.ok(h.find('CommerceHome'));
  assert.deepEqual(h.actions, []);
});

test('compact filters never offer a store switch outside the current brand scope', () => {
  const h = harness({ name: 'home', brandId: 'a' });
  h.find('CommerceHome').props.onBrowse(); h.render();
  compactControl(h, 'Filters & sort').props.onPress(); h.render();
  assert.equal(h.nodes.some(n => n.props.testID === 'catalogue-store-rail'), false);
  assert.ok(h.nodes.some(n => n.props.testID === 'catalogue-sort-products-rail'));
  compactControl(h, 'Name A–Z').props.onPress(); h.render();
  assert.deepEqual(gridIds(h), ['a:piece']);
  assert.deepEqual(h.actions, []);
});

test('a selected category remains reachable in its measured horizontal rail without mutating catalogue data', () => {
  const h = harness({ name: 'home' });
  h.find('CommerceHome').props.onBrowse({ category: 'Dress' }); h.render();
  const rail = h.nodes.find(n => n.props.testID === 'catalogue-category-rail')!;
  const scrolls: any[] = [];
  rail.props.ref.current = { scrollTo: (value: any) => scrolls.push(value) };
  compactControl(h, 'Dress').props.onLayout({ nativeEvent: { layout: { x: 210 } } });
  assert.deepEqual(scrolls, [{ x: 206, animated: false }]);
  assert.equal(compactControl(h, 'Dress').props.accessibilityState.checked, true);
  assert.deepEqual(gridIds(h), ['a:piece', 'b:piece']);
  assert.deepEqual(h.actions, []);
});


test('catalogue search opens on demand, keeps a hidden query, and clears without changing other filters', () => {
  const h = harness({ name: 'home' });
  const press = (label: string) => { compactControl(h, label).props.onPress(); h.render(); };
  h.find('CommerceHome').props.onBrowse(); h.render();
  assert.equal(h.find('Field'), undefined);
  press('Search catalogue');
  h.find('Field', 'Search catalogue').props.onChangeText('Piece a'); h.render();
  press('Dress');
  press('Hide catalogue search');
  assert.equal(h.find('Field'), undefined);
  assert.deepEqual(gridIds(h), ['a:piece']);
  assert.match(content(h.nodes.find(n => n.props.testID === 'catalogue-active-filters')), /Search: “Piece a” · Dress/);
  press('Search catalogue');
  assert.equal(h.find('Field', 'Search catalogue').props.value, 'Piece a');
  press('Clear catalogue search');
  assert.equal(h.find('Field', 'Search catalogue').props.value, '');
  assert.equal(compactControl(h, 'Dress').props.accessibilityState.checked, true);
  assert.deepEqual(gridIds(h), ['a:piece', 'b:piece']);
  press('Clear filters'); press('Hide catalogue search');
  assert.equal(h.nodes.some(n => n.props.testID === 'catalogue-active-filters'), false);
  assert.deepEqual(h.actions, []);
});

test('home filter handoff opens real controls and currency changes reconcile the active price cap', () => {
  const products = homeCatalogue();
  const h = harness({ name: 'home' }, { products });
  const press = (label: string) => { compactControl(h, label).props.onPress(); h.render(); };
  h.find('CommerceHome').props.onBrowse({ showFilters: true, query: 'low', currency: 'USD', maxPrice: 25, sort: 'price' }); h.render();
  assert.equal(compactControl(h, 'Filters & sort').props.accessibilityState.expanded, true);
  assert.equal(h.find('Field', 'Search catalogue').props.value, 'low');
  assert.deepEqual(gridIds(h), ['usd-low:piece']);
  assert.match(content(h.nodes.find(n => n.props.testID === 'catalogue-active-filters')), /USD.*Up to/);
  press('Remove price limit');
  assert.equal(h.nodes.some(n => n.props.accessibilityLabel === 'Remove price limit'), false);
  assert.match(content(h.nodes.find(n => n.props.testID === 'catalogue-active-filters')), /USD/);
  press('EUR');
  assert.deepEqual(gridIds(h), ['eur-low:piece']);
  assert.equal(compactControl(h, 'EUR').props.accessibilityState.checked, true);
  press('Filters & sort'); press('Filters & sort');
  assert.equal(compactControl(h, 'EUR').props.accessibilityState.checked, true);
  press('All currencies');
  assert.deepEqual(gridIds(h), ['eur-low:piece', 'usd-low:piece']);
  press('Back to home');
  h.find('CommerceHome').props.onBrowse({ showFilters: true, currency: 'USD', maxPrice: 25 }); h.render();
  press('EUR');
  assert.equal(h.nodes.some(n => n.props.accessibilityLabel === 'Remove price limit'), false, 'Changing currency removes an incompatible old limit');
  assert.deepEqual(gridIds(h), ['eur-low:piece']);
  press('Back to home');
  h.find('CommerceHome').props.onBrowse(); h.render();
  assert.equal(compactControl(h, 'Filters & sort').props.accessibilityState.expanded, false);
  assert.equal(h.find('Field'), undefined);
  assert.deepEqual(gridIds(h), products.map(p => p.id));
  assert.deepEqual(h.actions, []); assert.deepEqual(h.navigation, []);
});

test('compact Buy views retain scoped totals, snapshots, checkout and all quantity controls', () => {
  const products = [product('a'), product('b')];
  const cart = [line(products[0], 2), line(products[1], 3)];
  const h = harness({ name: 'cart', brandId: 'a' }, { commerce: { cart, orders: [], legacySamples: [] } });
  assert.ok(h.nodes.filter(n => n.type === 'ShoppingHeader').every(n => n.props.compact));
  assert.ok(h.nodes.filter(n => n.type === 'ShoppingLine').every(n => n.props.compact));
  assert.equal(h.nodes.filter(n => n.type === 'ShoppingLine').length, 1);
  assert.equal(h.nodes.some(n => n.type === 'Card'), false);
  assert.equal(h.nodes.filter(n => n.type === 'ShoppingCard').length, 2);
  assert.match(h.nodes.filter(n => n.type === 'Text').map(content).join(' '), /50/);
  h.find('Button', '−').props.onPress(); h.find('Button', '+').props.onPress(); h.find('Button', 'Remove').props.onPress();
  assert.deepEqual(h.actions, [{ type: 'adjust', ...cart[0], delta: -1 }, { type: 'adjust', ...cart[0], delta: 1 }, { type: 'remove', ...cart[0] }]);
  h.find('Button', 'Review demo checkout').props.onPress();
  assert.deepEqual(h.navigation, [{ name: 'checkout', brandId: 'a' }]);
  const checkout = harness(h.navigation[0], { commerce: { cart, orders: [], legacySamples: [] } });
  assert.equal(checkout.find('ShoppingHeader').props.compact, true);
  assert.equal(checkout.find('ShoppingLine').props.compact, true);
  assert.equal(checkout.find('Button', 'Remove'), undefined);
  assert.equal(checkout.find('Button', 'Place demo order').props.disabled, false);
  assert.equal(checkout.find('ShoppingNotice').props.title, 'No payment will be taken');
  assert.deepEqual(checkout.actions, []);
  assert.deepEqual(h.a.commerce.cart, cart);
});


test('home owns its list without a vertical Screen wrapper and catalogue browsing retains its shell', () => {
  const h = harness({ name: 'home' });
  assert.ok(h.find('CommerceHome'));
  assert.equal(h.find('Screen'), undefined);
  h.find('CommerceHome').props.onBrowse({ showFilters: true }); h.render();
  assert.ok(h.find('Screen'));
  assert.equal(h.find('CommerceHome'), undefined);
});
