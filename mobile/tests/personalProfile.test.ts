import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createTryOnSession, profileGridColumns, sessionResultPath, verifyProfileAccount } from "../src/profileSession.ts";

type Element = { type: any; props: Record<string, any>; children: any[] };
const source = ts.createSourceFile("PersonalProfile.tsx", fs.readFileSync(new URL("../src/PersonalProfile.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const record = { jobId: "completed-job", productId: "brand:piece", productName: "A piece", brandName: "A brand", completedAt: 1000 };
function harness(name = "ActivePersonalProfile", options: { signedOut?: boolean; error?: boolean; deferred?: boolean; looks?: boolean; focused?: boolean; width?: number; fontScale?: number } = {}) {
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration);
  const code = ts.transpileModule(declaration.getText(source).replace(/^export /, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const values: any[] = [];
  const effects: (() => any)[] = [];
  const reads: string[] = [];
  const routes: any[] = [];
  const session = createTryOnSession();
  if (options.looks) session.recordSucceeded(session.bind("account-a"), record);
  let index = 0;
  let appListener: (state: string) => void = () => {};
  let release: () => void = () => {};
  const env = {
    React: { createElement: (type: any, props: any, ...children: any[]): Element => ({ type, props: props || {}, children: children.flat(Infinity) }) },
    useState: (initial: any) => {
      const i = index++;
      if (!(i in values)) values[i] = initial;
      return [values[i], (next: any) => { values[i] = typeof next === "function" ? next(values[i]) : next; }];
    },
    useEffect: (effect: () => any) => effects.push(effect),
    useIsFocused: () => options.focused !== false,
    usePalette: () => ({}),
    useWindowDimensions: () => ({ width: options.width ?? 390, fontScale: options.fontScale ?? 1 }),
    AppState: { currentState: "active", addEventListener: (_: string, listener: (state: string) => void) => { appListener = listener; return { remove: () => {} }; } },
    tryOnSession: session,
    verifyProfileAccount: (read: any, active: any) => verifyProfileAccount(read, active, session),
    profileGridColumns,
    sessionResultPath,
    apiUrl: (path: string) => "https://configured.example" + path,
    apiFetch: async (path: string, init: any) => {
      reads.push(path);
      assert.equal(init.cache, "no-store");
      if (options.deferred) await new Promise<void>(resolve => { release = resolve; });
      if (options.error) throw Error("offline");
      return { ok: !options.signedOut, status: options.signedOut ? 401 : 200, json: async () => ({ id: "account-a", firstName: "", phone: "+61 •••• 123" }) };
    },
    ...Object.fromEntries(["Screen", "View", "Text", "Icon", "Body", "Button", "ActivityIndicator", "Image", "ProfileNotice", "CompletedLook", "ActivePersonalProfile"].map(key => [key, key])),
  };
  const component = new Function("env", `with (env) { ${code}; return ${name}; }`)(env);
  const render = () => { index = 0; effects.length = 0; return component({ navigate: (route: unknown) => routes.push(route), look: record }) as Element; };
  return { render, effects, session, reads, routes, release: () => release(), background: () => appListener("background"), active: () => appListener("active") };
}
const all = (tree: Element, type: string): Element[] => [tree.type === type ? tree : null, ...tree.children.flatMap(child => child && typeof child === "object" ? all(child, type) : [])].filter(Boolean) as Element[];
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function start(h: ReturnType<typeof harness>) { h.render(); return h.effects.map(effect => effect()); }
const text = (tree: Element): string => tree.children.map(child => child && typeof child === "object" ? text(child) : String(child ?? "")).join(" ");

test("profile shows loading then a truthful session-empty state with Try On destination", async () => {
  const h = harness();
  const initial = h.render();
  assert.equal(all(initial, "CompletedLook").length, 0);
  assert.equal(all(initial, "ActivityIndicator").length, 1);
  start(h);
  await flush();
  const screen = h.render();
  assert.match(all(screen, "ProfileNotice")[0].props.description, /No completed try-ons in this app session/);
  assert.match(text(screen), /Older account history isn’t available/);
  assert.match(text(screen), /Your profile/);
  const tryOn = all(screen, "Button").find(button => button.props.label === "Try on a piece")!;
  tryOn.props.onPress();
  assert.deepEqual(h.routes, [{ name: "prepare" }]);
  assert.deepEqual(h.reads, ["/api/auth/me"]);
});

test("signed-out and offline profile never show results; account actions and retry remain explicit", async () => {
  for (const options of [{ signedOut: true }, { error: true }]) {
    const h = harness("ActivePersonalProfile", { ...options, looks: true });
    start(h);
    await flush();
    const screen = h.render();
    assert.equal(all(screen, "CompletedLook").length, 0);
    const label = options.signedOut ? "Sign in" : "Open account";
    all(screen, "Button").find(button => button.props.label === label)!.props.onPress();
    assert.deepEqual(h.routes, [{ name: "login" }]);
    if (options.error) assert.ok(all(screen, "Button").some(button => button.props.label === "Retry account check"));
    else assert.deepEqual(h.session.read(h.session.bind("account-a")), []);
  }
});

test("only verified current-account records render and logout immediately removes them", async () => {
  const h = harness("ActivePersonalProfile", { looks: true });
  start(h);
  await flush();
  assert.equal(all(h.render(), "CompletedLook").length, 1);
  assert.deepEqual(all(h.render(), "CompletedLook")[0].props.look, record);
  h.session.clear();
  assert.equal(all(h.render(), "CompletedLook").length, 0);
});

test("backgrounding removes private views, interrupted checks cannot revive results, and unfocused profile unmounts", async () => {
  const h = harness("ActivePersonalProfile", { looks: true });
  start(h);
  await flush();
  assert.equal(all(h.render(), "CompletedLook").length, 1);
  h.background();
  assert.equal(all(h.render(), "CompletedLook").length, 0);
  const pending = harness("ActivePersonalProfile", { looks: true, deferred: true });
  const cleanups = start(pending);
  cleanups[2]();
  pending.release();
  await flush();
  assert.equal(all(pending.render(), "CompletedLook").length, 0);
  assert.equal(harness("PersonalProfile", { focused: false }).render().type, "View");
});

test("completed image uses the known backend path and image failure offers a reload without generation", () => {
  const h = harness("CompletedLook");
  let screen = h.render();
  const image = all(screen, "Image")[0];
  assert.equal(image.props.source.uri, "https://configured.example/api/try-on/completed-job/result");
  assert.equal(image.props.source.cache, "reload");
  image.props.onError();
  screen = h.render();
  assert.match(text(screen), /This result is unavailable/);
  assert.equal(all(screen, "Image").length, 0);
  all(screen, "Button")[0].props.onPress();
  assert.equal(all(h.render(), "Image").length, 1);
  assert.deepEqual(h.reads, []);
});


test("You uses compact profile and notice cards without clipping accessibility text", () => {
  const screen = harness().render();
  assert.deepEqual(screen.props.contentContainerStyle, { maxWidth: 704, gap: 12 });
  const header = all(screen, "View")[0];
  assert.equal(header.props.style.padding, 10);
  assert.equal(header.props.style.borderRadius, 12);
  const avatar = all(header, "View").find(view => view.props.accessibilityElementsHidden)!;
  assert.equal(avatar.props.style.width, 40);
  assert.equal(avatar.props.style.height, 40);
  const notice = harness("ProfileNotice").render();
  assert.equal(notice.props.style.padding, 12);
  assert.equal(notice.props.style.gap, 10);
  assert.equal(notice.props.style.height, undefined);
  for (const text of all(notice, "Text")) {
    assert.equal(text.props.allowFontScaling, undefined);
    assert.equal(text.props.numberOfLines, undefined);
  }
  assert.ok(all(notice, "View").some(view => view.props.style?.minWidth === 0));
  assert.ok(all(notice, "Text").some(text => text.props.style?.fontSize === 14));
});

test("profile gallery fits exact gaps at 320px, phone and tablet widths and large type", async () => {
  for (const width of [320, 344, 390, 430, 768, 1024]) {
    for (const fontScale of [1, 1.4, 2, 3.5]) {
      const h = harness("ActivePersonalProfile", { looks: true, width, fontScale });
      start(h);
      await flush();
      let screen = h.render();
      const layout = all(screen, "View").find(view => !!view.props.onLayout)!;
      const gridWidth = Math.min(width - 24, 680);
      layout.props.onLayout({ nativeEvent: { layout: { width: gridWidth } } });
      screen = h.render();
      const card = all(screen, "View").find(view => view.children.some(child => child?.type === "CompletedLook"))!;
      const columns = profileGridColumns(gridWidth, fontScale);
      if (columns === 1) assert.equal(card.props.style.width, "100%");
      else assert.equal(card.props.style.width * columns + (columns - 1) * 10, gridWidth);
      assert.equal(all(screen, "CompletedLook").length, 1);
      assert.match(text(screen), /This list clears when you sign out or restart the app/);
      assert.deepEqual(h.reads, ["/api/auth/me"]);
    }
  }
});
