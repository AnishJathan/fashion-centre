import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { normalisePhone, resolutionWarning, safeGarmentUrl } from "../src/photo/validation.ts";
import { preparationReady } from "../src/photo/preparation.ts";
import { otpFieldMetrics } from "../src/photo/layout.ts";
import { createTryOnSession, verifyProfileAccount } from "../src/profileSession.ts";

type Element = { type: string; props: Record<string, any>; children: any[] };
// Real event handlers with inert native elements and injected account/photo IO.
// These tests do not render native pixels, request permissions or call a service.
function componentHarness(
  file: string,
  name: string,
  dependencies: Record<string, any>,
  props: Record<string, any>,
) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const component = source.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  assert.ok(component);
  const code = ts.transpileModule(
    component.getText(source).replace(/^export /, ""),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.React,
      },
    },
  ).outputText;
  const values: any[] = [],
    refs: any[] = [],
    effects: (() => (() => void) | void)[] = [];
  let valueIndex = 0,
    refIndex = 0;
  const env = {
    React: {
      Fragment: "Fragment",
      createElement: (
        type: string,
        props: any,
        ...children: any[]
      ): Element => ({
        type,
        props: props || {},
        children: children.flat(Infinity),
      }),
    },
    useState: (initial: any) => {
      const index = valueIndex++;
      if (!(index in values)) values[index] = initial;
      return [
        values[index],
        (next: any) => {
          values[index] =
            typeof next === "function" ? next(values[index]) : next;
        },
      ];
    },
    useRef: (initial: any) => {
      const index = refIndex++;
      return (refs[index] ||= { current: initial });
    },
    useEffect: (effect: () => (() => void) | void) => effects.push(effect),
    usePalette: () => ({}),
    ...Object.fromEntries(
      [
        "Screen",
        "View",
        "ScrollView",
        "Pressable",
        "Heading",
        "Text",
        "Badge",
        "Title",
        "Body",
        "Card",
        "Choices",
        "Field",
        "Button",
        "AccountNotice",
        "AccountSection",
        "PhotoPreview",
        "PhotoEditor",
        "ConsentRow",
        "Icon",
        "CameraScanner",
        "SelectedGarment",
        "ActivityIndicator",
        "Image",
      ].map((value) => [value, value]),
    ),
    ...dependencies,
  };
  const renderComponent = new Function(
    "env",
    `with(env){${code};return ${name};}`,
  )(env);
  const render = () => {
    valueIndex = 0;
    refIndex = 0;
    effects.length = 0;
    return renderComponent(props) as Element;
  };
  return { render, effects };
}
function all(tree: Element, type: string): Element[] {
  return [
    tree.type === type ? tree : null,
    ...tree.children.flatMap((child) =>
      child && typeof child === "object" ? all(child, type) : [],
    ),
  ].filter(Boolean) as Element[];
}
function find(tree: Element, type: string, label?: string) {
  const found = all(tree, type).find(
    (node) => label === undefined || node.props.label === label,
  );
  assert.ok(found, `${type}: ${label || "any"}`);
  return found;
}
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
function loginHarness(simulation: boolean) {
  const requests: string[] = [];
  let cleared = 0;
  return {
    requests,
    cleared: () => cleared,
    ...componentHarness(
      "AccountScreens.tsx",
      "Login",
      {
        tryOnSession: { clear: () => { cleared++; } },
        normalisePhone,
        otpFieldMetrics,
        useWindowDimensions: () => ({ width: 320, height: 568, fontScale: 1 }),
        configuredUrl: (path: string) => path,
        errorText: (error: Error) => error.message,
        setInterval: () => 1,
        clearInterval: () => {},
        apiFetch: async (path: string) => {
          requests.push(path);
          return {
            ok: path !== "/api/auth/me",
            json: async () => ({ expiresInSeconds: 120, resendInSeconds: 30 }),
          };
        },
      },
      { simulation },
    ),
  };
}

test("OTP simulation stays offline through validation, verification and restart", async () => {
  const h = loginHarness(true);
  let screen = h.render();
  const cleanup = h.effects[0]();
  assert.equal(
    find(screen, "Field", "WhatsApp number").props.autoComplete,
    "off",
  );
  assert.equal(find(screen, "Button", "Start demo").props.disabled, true);
  find(screen, "Field", "WhatsApp number").props.onChangeText("123456789");
  find(h.render(), "Button", "Start demo").props.onPress();
  await flush();
  screen = h.render();
  assert.equal(find(screen, "Button", "Verify code").props.disabled, true);
  assert.equal(
    find(screen, "Field", "Six-digit code").props.autoComplete,
    "off",
  );
  find(screen, "Field", "Six-digit code").props.onChangeText("12a3456");
  find(h.render(), "Button", "Verify code").props.onPress();
  await flush();
  screen = h.render();
  assert.equal(all(screen, "PhotoEditor").length, 0);
  find(screen, "Button", "Restart demo").props.onPress();
  assert.ok(find(h.render(), "Field", "WhatsApp number"));
  assert.deepEqual(h.requests, []);
  cleanup?.();
});

test("simulation expiry and change-number actions remain available without a session", async () => {
  const h = loginHarness(true);
  find(h.render(), "Field", "WhatsApp number").props.onChangeText("12");
  find(h.render(), "Button", "Start demo").props.onPress();
  await flush();
  assert.ok(
    all(h.render(), "AccountNotice").some(
      (notice) => notice.props.error && /7–12/.test(notice.props.message),
    ),
  );
  find(h.render(), "Field", "WhatsApp number").props.onChangeText("123456789");
  find(h.render(), "Button", "Start demo").props.onPress();
  await flush();
  find(h.render(), "Button", "Simulate expiry").props.onPress();
  assert.equal(find(h.render(), "Button", "Verify code").props.disabled, true);
  assert.equal(find(h.render(), "Button", "Resend code").props.disabled, false);
  find(h.render(), "Button", "Use a different number").props.onPress();
  assert.ok(find(h.render(), "Field", "WhatsApp number"));
  assert.deepEqual(h.requests, []);
});

test("real sign-in enables native autofill and prevents repeated send taps", async () => {
  const h = loginHarness(false);
  let screen = h.render();
  assert.equal(
    find(screen, "Field", "WhatsApp number").props.textContentType,
    "telephoneNumber",
  );
  find(screen, "Field", "WhatsApp number").props.onChangeText("0412345678");
  const send = find(h.render(), "Button", "Send WhatsApp code");
  send.props.onPress();
  send.props.onPress();
  await flush();
  screen = h.render();
  assert.deepEqual(h.requests, ["/api/auth/request-code"]);
  assert.equal(
    find(screen, "Field", "Six-digit code").props.textContentType,
    "oneTimeCode",
  );
  assert.equal(
    find(screen, "Field", "Six-digit code").props.autoComplete,
    "one-time-code",
  );
  find(screen, "Field", "Six-digit code").props.onChangeText("654321");
  find(h.render(), "Button", "Verify code").props.onPress();
  await flush();
  assert.equal(all(h.render(), "PhotoEditor").length, 1);
  assert.deepEqual(h.requests, [
    "/api/auth/request-code",
    "/api/auth/verify-code",
  ]);
});

function photoHarness(
  upload: boolean,
  garmentReady = true,
  holdSaveValidation = false,
) {
  const uploads: string[] = [],
    checked: string[] = [],
    removed: unknown[] = [],
    alerts: any[] = [],
    selections: boolean[] = [];
  const photo = {
    uri: "file:///private/test.jpg",
    width: 1000,
    height: 1600,
    warning: "",
  };
  let saves = 0;
  let releaseValidation = () => {};
  return {
    uploads,
    checked,
    removed,
    alerts,
    selections,
    releaseValidation: () => releaseValidation(),
    saves: () => saves,
    ...componentHarness(
      "photo/PhotoEditor.tsx",
      "PhotoEditor",
      {
        preparationReady,
        hasNativeVision: true,
        visionUnavailableMessage: "Unavailable",
        choosePhoto: async (camera: boolean) => { selections.push(camera); return photo; },
        requireGoodPhoto: async (uri: string) => {
          checked.push(uri);
          if (holdSaveValidation && checked.length > 1)
            await new Promise<void>((resolve) => {
              releaseValidation = resolve;
            });
        },
        discard: async (value: unknown) => {
          removed.push(value);
        },
        appendPhoto: () => {},
        apiFetch: async (path: string) => {
          uploads.push(path);
          return { ok: true };
        },
        Alert: { alert: (...args: any[]) => alerts.push(args) },
      },
      {
        upload,
        garmentReady,
        onSaved: () => {
          saves++;
        },
      },
    ),
  };
}

test("account-photo save retains consent, confirmation and duplicate upload protection", async () => {
  const h = photoHarness(true);
  find(h.render(), "Button", "Choose from photos").props.onPress();
  await flush();
  assert.equal(
    find(h.render(), "Button", "Save photo to account").props.disabled,
    true,
  );
  find(h.render(), "ConsentRow").props.onChange(true);
  find(h.render(), "Button", "Save photo to account").props.onPress();
  assert.deepEqual(h.uploads, []);
  assert.equal(h.alerts[0][0], "Upload account photo?");
  assert.equal(h.alerts[0][2][0].style, "cancel");
  const confirm = h.alerts[0][2][1].onPress;
  confirm();
  confirm();
  await flush();
  assert.deepEqual(h.uploads, ["/api/users/me/photo"]);
  assert.equal(h.saves(), 1);
  assert.equal(h.checked.length, 2);
  assert.equal(all(h.render(), "PhotoPreview").length, 0);
});

test("local preparation requires both acknowledgements and never uploads", async () => {
  const h = photoHarness(false);
  find(h.render(), "Button", "Take a photo").props.onPress();
  await flush();
  const consents = all(h.render(), "ConsentRow");
  consents[0].props.onChange(true);
  assert.equal(
    find(h.render(), "Button", "Review local preparation").props.disabled,
    true,
  );
  consents[1].props.onChange(true);
  assert.equal(
    find(h.render(), "Button", "Review local preparation").props.disabled,
    false,
  );
  find(h.render(), "Button", "Review local preparation").props.onPress();
  assert.ok(
    all(h.render(), "AccountNotice").some((notice) =>
      /Nothing was uploaded or generated/.test(notice.props.message),
    ),
  );
  find(h.render(), "Button", "Remove local photo").props.onPress();
  assert.equal(all(h.render(), "PhotoPreview").length, 0);
  assert.deepEqual(h.uploads, []);
  assert.deepEqual(h.alerts, []);
  assert.deepEqual(h.checked, []);
});

test("retained native upload confirmation cannot submit after the photo editor unmounts", async () => {
  const h = photoHarness(true);
  const initial = h.render();
  const cleanup = h.effects[0]();
  find(initial, "Button", "Choose from photos").props.onPress();
  await flush();
  find(h.render(), "ConsentRow").props.onChange(true);
  find(h.render(), "Button", "Save photo to account").props.onPress();
  const retainedConfirm = h.alerts[0][2][1].onPress;
  cleanup?.();
  retainedConfirm();
  await flush();
  assert.deepEqual(h.uploads, []);
  assert.equal(h.checked.length, 1);
  assert.equal(h.saves(), 0);
});

test("leaving during final photo validation aborts before any upload", async () => {
  const h = photoHarness(true, true, true);
  const initial = h.render();
  const cleanup = h.effects[0]();
  find(initial, "Button", "Choose from photos").props.onPress();
  await flush();
  find(h.render(), "ConsentRow").props.onChange(true);
  find(h.render(), "Button", "Save photo to account").props.onPress();
  h.alerts[0][2][1].onPress();
  await flush();
  assert.equal(h.checked.length, 2);
  cleanup?.();
  h.releaseValidation();
  await flush();
  assert.deepEqual(h.uploads, []);
  assert.equal(h.saves(), 0);
});


test("real verification and successful logout clear the in-session gallery; simulation does not", async () => {
  const h = loginHarness(false);
  find(h.render(), "Field", "WhatsApp number").props.onChangeText("0412345678");
  find(h.render(), "Button", "Send WhatsApp code").props.onPress();
  await flush();
  find(h.render(), "Field", "Six-digit code").props.onChangeText("654321");
  find(h.render(), "Button", "Verify code").props.onPress();
  await flush();
  assert.equal(h.cleared(), 1);
  find(h.render(), "Button", "Sign out").props.onPress();
  await flush();
  assert.equal(h.cleared(), 2);
  assert.equal(h.requests.at(-1), "/api/auth/logout");
  assert.ok(find(h.render(), "Field", "WhatsApp number"));
  assert.equal(loginHarness(true).cleared(), 0);
});


test("compact account headers and section labels preserve natural text growth", () => {
  const screen = loginHarness(true).render();
  assert.deepEqual(screen.props.contentContainerStyle, { maxWidth: 704, gap: 12 });
  const header = all(screen, "View")[0].props.style;
  assert.equal(header.gap, 6);
  assert.equal(header.paddingBottom, 10);
  assert.equal(header.height, undefined);
  const section = componentHarness("AccountUI.tsx", "AccountSection", {}, {
    step: "Step 1", title: "Your photo", description: "Check before continuing.",
  }).render();
  assert.equal(section.props.style.gap, 6);
  assert.equal(section.props.style.height, undefined);
  assert.equal(all(section, "Heading").length, 1);
});

test("compact consent rows keep 48px targets, readable labels and disabled semantics", () => {
  const changes: boolean[] = [];
  const row = componentHarness("AccountUI.tsx", "ConsentRow", {}, {
    checked: false, disabled: false, label: "I agree to this specific upload.", onChange: (value: boolean) => changes.push(value),
  }).render();
  assert.equal(row.props.accessibilityRole, "checkbox");
  assert.deepEqual(row.props.accessibilityState, { checked: false, disabled: false });
  const style = row.props.style({ pressed: false });
  assert.equal(style.minHeight, 48);
  assert.equal(style.padding, 10);
  assert.equal(style.height, undefined);
  const label = all(row, "Text")[0];
  assert.equal(label.props.style.fontSize, 14);
  assert.equal(label.props.numberOfLines, undefined);
  assert.equal(label.props.allowFontScaling, undefined);
  row.props.onPress();
  assert.deepEqual(changes, [true]);
  const disabled = componentHarness("AccountUI.tsx", "ConsentRow", {}, {
    checked: true, disabled: true, label: "Permission", onChange() {},
  }).render();
  assert.equal(disabled.props.disabled, true);
  assert.deepEqual(disabled.props.accessibilityState, { checked: true, disabled: true });
});

test("photo preparation is compact without removing the usable-garment gate", () => {
  const product = { id: "brand:piece", brandId: "brand", brandName: "A brand", name: "A long garment name that can wrap", image: "https://cdn.shopify.com/garment.jpg" };
  const routes: any[] = [];
  const h = componentHarness("AccountScreens.tsx", "ActiveAccountScreen", {
    useApp: () => ({ products: [product] }),
    safeGarmentUrl,
    resolutionWarning,
    Image: { getSize: (_: string, success: (width: number, height: number) => void) => success(1000, 1600) },
  }, { route: { name: "prepare", productId: product.id }, navigate: (route: any) => routes.push(route) });
  let screen = h.render();
  assert.deepEqual(screen.props.contentContainerStyle, { maxWidth: 704, gap: 12 });
  const piece = all(screen, "Pressable")[0];
  const style = piece.props.style({ pressed: false });
  assert.equal(style.width, 144);
  assert.equal(style.minHeight, 64);
  assert.equal(style.padding, 10);
  assert.equal(style.height, undefined, "long garment names must grow rather than clip");
  for (const text of all(piece, "Text")) {
    assert.equal(text.props.allowFontScaling, undefined);
    assert.equal(text.props.numberOfLines, undefined);
  }
  assert.equal(find(screen, "PhotoEditor").props.garmentReady, false);
  h.effects[0]();
  screen = h.render();
  assert.equal(find(screen, "PhotoEditor").props.garmentReady, true);
  assert.equal(find(screen, "PhotoPreview").props.compact, true);
  find(screen, "PhotoPreview").props.onError();
  screen = h.render();
  assert.equal(find(screen, "PhotoEditor").props.garmentReady, false);
  assert.ok(find(screen, "Button", "Retry garment check"));
  piece.props.onPress();
  assert.deepEqual(routes, [{ name: "prepare", productId: product.id, brandId: undefined }]);
});

test("compact personal-photo previews still require both local acknowledgements", async () => {
  const h = photoHarness(false);
  let screen = h.render();
  const placeholder = all(screen, "View").find(view => view.props.style?.borderStyle === "dashed")!;
  assert.equal(placeholder.props.style.padding, 12);
  assert.equal(placeholder.props.style.borderRadius, 12);
  assert.equal(placeholder.props.style.height, undefined);
  find(screen, "Button", "Take a photo").props.onPress();
  await flush();
  screen = h.render();
  assert.equal(find(screen, "PhotoPreview").props.compact, true);
  assert.equal(all(screen, "ConsentRow").length, 2);
  assert.equal(find(screen, "Button", "Review local preparation").props.disabled, true);
  assert.deepEqual(h.uploads, []);
});


test("Try On preparation offers camera capture without a photo-library option", async () => {
  const h = photoHarness(false);
  const labels = () => all(h.render(), "Button").map(button => button.props.label);
  assert.ok(!labels().includes("Choose from photos"));
  assert.ok(!labels().includes("Choose a different photo"));
  assert.ok(labels().includes("Take a photo"));
  assert.match(find(h.render(), "AccountSection").props.description, /^Take an upright photo/);
  find(h.render(), "Button", "Take a photo").props.onPress();
  await flush();
  assert.deepEqual(h.selections, [true]);
  assert.ok(!labels().includes("Choose from photos"));
  assert.ok(!labels().includes("Choose a different photo"));
  assert.ok(labels().includes("Take a photo"));
  assert.equal(all(h.render(), "ConsentRow").length, 2);
  assert.equal(find(h.render(), "Button", "Review local preparation").props.disabled, true);
  assert.deepEqual(h.uploads, []);
});

test("account photo management retains its existing library and camera options", async () => {
  const h = photoHarness(true);
  assert.ok(find(h.render(), "Button", "Scan full body automatically"));
  find(h.render(), "Button", "Choose from photos").props.onPress();
  await flush();
  assert.deepEqual(h.selections, [false]);
  assert.ok(find(h.render(), "Button", "Choose a different photo"));
  assert.equal(find(h.render(), "Button", "Save photo to account").props.disabled, true);
  assert.deepEqual(h.uploads, []);
});


function savedTryOnHarness(options: { signedOut?: boolean; photoStatus?: number; offline?: boolean; missingProduct?: boolean; wrongStore?: boolean; deferPhoto?: boolean } = {}) {
  const requests: { path: string; method: string }[] = [], routes: any[] = [], alerts: any[] = [];
  const session = createTryOnSession();
  const pending = new Set<string>();
  const product = { id: "brand:piece", brandId: "brand", brandName: "A brand", name: "The finishing touch", image: "https://cdn.shopify.com/garment.jpg" };
  let releasePhoto = () => {}, background = () => {};
  const h = componentHarness("AccountScreens.tsx", "SavedTryOn", {
    useApp: () => ({ products: [product] }),
    safeGarmentUrl,
    apiUrl: (path: string) => "https://configured.example" + path,
    configuredUrl: (path: string) => "https://configured.example" + path,
    errorText: (error: Error) => error.message,
    tryOnSession: session,
    verifyProfileAccount: (read: any, active: any) => verifyProfileAccount(read, active, session),
    pendingSubmissions: pending,
    apiFetch: async (path: string, init: any = {}) => {
      requests.push({ path, method: init.method || "GET" });
      if (options.offline) throw Error("Connection unavailable.");
      if (path === "/api/auth/me") return { ok: !options.signedOut, status: options.signedOut ? 401 : 200, json: async () => ({ id: "account-a" }) };
      assert.equal(path, "/api/users/me/photo");
      assert.equal(init.method, "HEAD");
      if (options.deferPhoto) await new Promise<void>(resolve => { releasePhoto = resolve; });
      return { ok: (options.photoStatus || 200) === 200, status: options.photoStatus || 200 };
    },
    AppState: { addEventListener: (_: string, listener: (state: string) => void) => { background = () => listener("background"); return { remove() {} }; } },
    Alert: { alert: (...args: any[]) => alerts.push(args) },
    FS: { deleteAsync: async () => {} },
  }, { route: { name: "try-on", productId: options.missingProduct ? "missing" : product.id, brandId: options.wrongStore ? "other-store" : product.brandId }, navigate: (route: any) => routes.push(route) });
  return { ...h, requests, routes, alerts, session, pending, product, releasePhoto: () => releasePhoto(), background: () => background() };
}
const content = (tree: Element): string => tree.children.map(child => child && typeof child === "object" ? content(child) : String(child ?? "")).join(" ");
function mountSaved(h: ReturnType<typeof savedTryOnHarness>) {
  h.render();
  return h.effects[0]();
}

test("saved-photo Try On treats sign-in as a calm prerequisite with exact actions", async () => {
  const h = savedTryOnHarness({ signedOut: true });
  let screen = h.render();
  assert.equal(all(screen, "SelectedGarment").length, 1);
  assert.equal(find(screen, "SelectedGarment").props.uri, h.product.image);
  assert.match(content(screen), /Getting your try-on ready/);
  assert.equal(all(screen, "PhotoPreview").length, 0);
  assert.equal(all(screen, "ConsentRow").length, 0);
  mountSaved(h);
  await flush();
  screen = h.render();
  assert.match(content(screen), /See it on you/);
  assert.doesNotMatch(content(screen), /Something needs attention|Picture your next look/);
  assert.equal(all(screen, "Badge").length, 0);
  assert.equal(all(screen, "AccountNotice").length, 0, "sign-in must not be presented as an error");
  assert.equal(all(screen, "PhotoPreview").length, 0);
  assert.equal(all(screen, "ConsentRow").length, 0);
  find(screen, "Button", "Sign in to continue").props.onPress();
  find(screen, "Button", "Prepare a photo locally").props.onPress();
  assert.deepEqual(h.routes, [{ name: "login" }, { name: "prepare", productId: h.product.id, brandId: "brand" }]);
  assert.deepEqual(h.requests, [{ path: "/api/auth/me", method: "GET" }]);
  assert.deepEqual(h.alerts, []);
});

test("missing saved photo has a specific next step; expired authentication stays closed", async () => {
  for (const photoStatus of [404, 401]) {
    const h = savedTryOnHarness({ photoStatus });
    mountSaved(h);
    await flush();
    const screen = h.render();
    assert.equal(all(screen, "PhotoPreview").length, 0);
    assert.equal(all(screen, "ConsentRow").length, 0);
    assert.equal(all(screen, "AccountNotice").length, 0);
    const label = photoStatus === 404 ? "Add an account photo" : "Sign in to continue";
    find(screen, "Button", label).props.onPress();
    assert.deepEqual(h.routes, [{ name: "login" }]);
    assert.deepEqual(h.requests.map(request => request.method), ["GET", "HEAD"]);
  }
});

test("failed account or photo checks offer only a read-only retry and hide private previews", async () => {
  for (const options of [{ offline: true }, { photoStatus: 500 }]) {
    const h = savedTryOnHarness(options);
    let cleanup = mountSaved(h);
    await flush();
    let screen = h.render();
    assert.equal(all(screen, "PhotoPreview").length, 0);
    assert.equal(all(screen, "ConsentRow").length, 0);
    assert.equal(find(screen, "AccountNotice").props.error, true);
    assert.equal(find(screen, "AccountNotice").props.compact, true);
    find(screen, "Button", "Retry account check").props.onPress();
    cleanup?.();
    cleanup = mountSaved(h);
    await flush();
    screen = h.render();
    assert.ok(find(screen, "Button", "Open account"));
    assert.ok(h.requests.every(request => request.method === "GET" || request.method === "HEAD"));
    assert.equal(h.requests.filter(request => request.path === "/api/auth/me").length, 2);
    assert.deepEqual(h.alerts, []);
    cleanup?.();
  }
});

test("ready saved-photo Try On preserves explicit consent, native confirmation and uncertainty lock", async () => {
  const h = savedTryOnHarness();
  const cleanup = mountSaved(h);
  await flush();
  let screen = h.render();
  assert.equal(find(screen, "PhotoPreview").props.label, "Saved account photo");
  assert.equal(find(screen, "PhotoPreview").props.compact, true);
  assert.equal(find(screen, "Button", "Generate with saved photo").props.disabled, true);
  find(screen, "ConsentRow").props.onChange(true);
  screen = h.render();
  assert.equal(find(screen, "Button", "Generate with saved photo").props.disabled, false);
  find(screen, "Button", "Generate with saved photo").props.onPress();
  assert.equal(h.alerts[0][0], "Send images for try-on?");
  assert.match(h.alerts[0][1], /may incur service charges/);
  assert.equal(h.alerts[0][2][0].style, "cancel");
  assert.ok(h.requests.every(request => request.method !== "POST"));
  h.pending.add(h.product.id);
  assert.equal(find(h.render(), "Button", "Generate with saved photo").props.disabled, true);
  h.pending.clear();
  find(h.render(), "PhotoPreview").props.onError();
  screen = h.render();
  assert.equal(all(screen, "PhotoPreview").length, 0);
  find(screen, "Button", "Reload preview").props.onPress();
  assert.equal(all(h.render(), "PhotoPreview").length, 1);
  cleanup?.();
  h.alerts[0][2][1].onPress();
  await flush();
  assert.deepEqual(h.requests.map(request => request.method), ["GET", "HEAD"], "retained confirmation must not submit after leaving");
});

test("late saved-photo checks cannot reveal private images after leaving or an account switch", async () => {
  for (const interrupt of ["unmount", "background", "switch"] as const) {
    const h = savedTryOnHarness({ deferPhoto: true });
    const cleanup = mountSaved(h);
    await flush();
    assert.equal(h.requests.at(-1)?.method, "HEAD");
    if (interrupt === "unmount") cleanup?.();
    else if (interrupt === "background") h.background();
    else h.session.bind("account-b");
    h.releasePhoto();
    await flush();
    assert.equal(all(h.render(), "PhotoPreview").length, 0);
    assert.equal(all(h.render(), "ConsentRow").length, 0);
  }
});

test("missing or mismatched-store garments show a useful empty state without generation controls", async () => {
  for (const options of [{ missingProduct: true }, { wrongStore: true }]) {
    const h = savedTryOnHarness(options);
    mountSaved(h);
    await flush();
    const screen = h.render();
    assert.equal(all(screen, "SelectedGarment").length, 0);
    assert.equal(all(screen, "PhotoPreview").length, 0);
    assert.equal(all(screen, "ConsentRow").length, 0);
    assert.ok(find(screen, "Button", "Choose a garment"));
    assert.ok(h.requests.every(request => request.method !== "POST"));
  }
});

test("selected-garment artwork has a quiet fallback and naturally wrapping compact text", () => {
  const h = componentHarness("AccountUI.tsx", "SelectedGarment", {}, { name: "A long selected garment name", brand: "A brand", uri: "https://cdn.shopify.com/garment.jpg" });
  let screen = h.render();
  assert.equal(screen.props.style.padding, 10);
  assert.equal(find(screen, "Image").props.resizeMode, "contain");
  assert.equal(find(screen, "Image").props.accessibilityLabel, "Selected garment: A long selected garment name");
  assert.ok(all(screen, "View").some(view => view.props.style?.minWidth === 0));
  for (const text of all(screen, "Text")) {
    assert.equal(text.props.allowFontScaling, undefined);
    assert.equal(text.props.numberOfLines, undefined);
  }
  find(screen, "Image").props.onError();
  screen = h.render();
  assert.equal(all(screen, "Image").length, 0);
  assert.ok(find(screen, "Icon"));
});

test("compact notices retain announced errors without a large alert panel", () => {
  const screen = componentHarness("AccountUI.tsx", "AccountNotice", {}, { compact: true, error: true, message: "Check your connection." }).render();
  assert.equal(screen.props.accessibilityRole, "alert");
  assert.equal(screen.props.accessibilityLiveRegion, "polite");
  assert.equal(screen.props.style.backgroundColor, undefined);
  assert.equal(screen.props.style.paddingVertical, 6);
  assert.equal(all(screen, "Status").length, 0);
  assert.match(content(screen), /Check your connection/);
});


test("backgrounding a ready try-on hides private UI and rechecking never clears an unknown submission", async () => {
  const h = savedTryOnHarness();
  let cleanup = mountSaved(h);
  await flush();
  find(h.render(), "ConsentRow").props.onChange(true);
  find(h.render(), "Button", "Generate with saved photo").props.onPress();
  const retainedConfirmation = h.alerts[0][2][1].onPress;
  h.pending.add(h.product.id);
  h.background();
  let screen = h.render();
  assert.equal(all(screen, "PhotoPreview").length, 0);
  assert.equal(all(screen, "ConsentRow").length, 0);
  assert.equal(find(screen, "AccountNotice").props.error, false);
  find(screen, "Button", "Retry account check").props.onPress();
  cleanup?.();
  cleanup = mountSaved(h);
  await flush();
  screen = h.render();
  assert.equal(find(screen, "ConsentRow").props.checked, false);
  assert.equal(find(screen, "Button", "Generate with saved photo").props.disabled, true);
  assert.equal(h.pending.has(h.product.id), true);
  retainedConfirmation();
  await flush();
  assert.deepEqual(h.requests.map(request => request.method), ["GET", "HEAD", "GET", "HEAD"]);
  assert.equal(all(h.render(), "PhotoPreview").length, 1);
  cleanup?.();
});

test("backgrounding a pending check leaves a read-only recovery action instead of a stuck spinner", async () => {
  const options = { deferPhoto: true };
  const h = savedTryOnHarness(options);
  let cleanup = mountSaved(h);
  await flush();
  h.background();
  let screen = h.render();
  assert.equal(all(screen, "PhotoPreview").length, 0);
  assert.equal(all(screen, "ConsentRow").length, 0);
  assert.ok(all(screen, "AccountNotice").every(notice => !notice.props.busy));
  h.releasePhoto();
  await flush();
  assert.equal(all(h.render(), "PhotoPreview").length, 0);
  find(h.render(), "Button", "Retry account check").props.onPress();
  cleanup?.();
  options.deferPhoto = false;
  cleanup = mountSaved(h);
  await flush();
  screen = h.render();
  assert.equal(all(screen, "PhotoPreview").length, 1);
  assert.equal(find(screen, "ConsentRow").props.checked, false);
  assert.equal(find(screen, "Button", "Generate with saved photo").props.disabled, true);
  assert.deepEqual(h.requests.map(request => request.method), ["GET", "HEAD", "GET", "HEAD"]);
  assert.deepEqual(h.alerts, []);
  cleanup?.();
});
