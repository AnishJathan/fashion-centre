import assert from "node:assert/strict";
import test from "node:test";
import {
  pendingSubmissions,
  reserveSubmission,
  pollJob,
  validJobId,
} from "../src/photo/jobs.ts";
import { createTryOnSession, verifyProfileAccount } from "../src/profileSession.ts";
const sleep = async () => {};
test("poll success uses fixed backend status path and never submits", async () => {
  const paths: string[] = [];
  assert.equal(
    await pollJob({
      id: "test-1",
      active: () => true,
      sleep,
      read: async (p) => {
        paths.push(p);
        return {
          ok: true,
          json: async () => ({
            status: paths.length === 2 ? "succeeded" : "processing",
          }),
        };
      },
    }),
    "succeeded",
  );
  assert.deepEqual(paths, ["/api/try-on/test-1", "/api/try-on/test-1"]);
});
test("polling is bounded and surfaces failure", async () => {
  let calls = 0;
  assert.equal(
    await pollJob({
      id: "id",
      active: () => true,
      sleep,
      read: async () => {
        calls++;
        return { ok: true, json: async () => ({ status: "processing" }) };
      },
    }),
    "timeout",
  );
  assert.equal(calls, 60);
  assert.equal(
    await pollJob({
      id: "id",
      active: () => true,
      sleep,
      read: async () => ({
        ok: true,
        json: async () => ({ status: "failed" }),
      }),
    }),
    "failed",
  );
});
test("leaving prevents requests and ignores late status", async () => {
  let active = false;
  assert.equal(
    await pollJob({
      id: "id",
      active: () => active,
      sleep,
      read: async () => {
        throw Error("must not read");
      },
    }),
    "stopped",
  );
  active = true;
  assert.equal(
    await pollJob({
      id: "id",
      active: () => active,
      sleep,
      read: async () => {
        active = false;
        return { ok: true, json: async () => ({ status: "succeeded" }) };
      },
    }),
    "stopped",
  );
});
test("untrusted identifiers fail before any read and pending submissions remain in memory", async () => {
  assert.equal(validJobId("../private"), false);
  await assert.rejects(
    pollJob({
      id: "../private",
      active: () => true,
      sleep,
      read: async () => {
        throw Error("must not read");
      },
    }),
    /Invalid job/,
  );
  pendingSubmissions.add("garment");
  assert.equal(pendingSubmissions.has("garment"), true);
  pendingSubmissions.delete("garment");
});

test("reservation is synchronous and blocks concurrent instances before preflight", async () => {
  assert.equal(reserveSubmission("same-garment"), true);
  assert.equal(reserveSubmission("same-garment"), false);
  await Promise.resolve();
  assert.equal(reserveSubmission("same-garment"), false);
  pendingSubmissions.delete("same-garment");
  assert.equal(reserveSubmission("same-garment"), true);
  pendingSubmissions.delete("same-garment");
});

// Execute the screen's real submission coordinator with all native/network
// boundaries injected. No account, file, provider or timer delay is exercised.
import fs from "node:fs";
import ts from "typescript";
function submissionHarness(
  outcome: "succeeded" | "failed" | "timeout" | "local-error" | "unauthorized",
) {
  const source = ts.createSourceFile(
    "AccountScreens.tsx",
    fs.readFileSync(
      new URL("../src/AccountScreens.tsx", import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const screen = source.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === "SavedTryOn",
  );
  assert.ok(screen && ts.isFunctionDeclaration(screen) && screen.body);
  const run = screen.body.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "run",
  );
  assert.ok(run);
  const code = ts.transpile(run.getText(source), {
    target: ts.ScriptTarget.ES2022,
  });
  const product = {
    id: "retry-" + outcome,
    image: "https://cdn.shopify.com/example.jpg",
    name: "A real garment",
    brandName: "A real brand",
  };
  let posts = 0;
  const session = createTryOnSession();
  const ticket = session.bind("account-a");
  const env = {
    accountTicket: { current: ticket },
    tryOnSession: session,
    verifyProfileAccount: (read: any, active: any) => verifyProfileAccount(read, active, session),
    product,
    ready: true,
    consent: true,
    submitted: { current: false },
    alive: { current: true },
    abort: { current: new AbortController() },
    temporary: { current: null },
    download: { current: null },
    pendingSubmissions,
    reserveSubmission,
    validJobId,
    MAX_PHOTO_BYTES: 10 * 1024 * 1024,
    setBusy: () => {},
    setResult: () => {},
    setMessage: () => {},
    setStatusError: () => {},
    setPreviewError: () => {},
    errorText: (e: Error) => e.message,
    safeGarmentUrl: (uri: string) => uri,
    apiUrl: (path: string) => "https://app.example" + path,
    FS: {
      cacheDirectory: "file:///test/",
      createDownloadResumable: () => ({
        downloadAsync: async () => ({
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
        cancelAsync: async () => {},
      }),
      deleteAsync: async () => {},
    },
    inspectFile: async () => {
      if (outcome === "local-error") throw Error("Local validation failure");
    },
    appendPhoto: () => {},
    apiFetch: async (path: string) => {
      if (path === "/api/auth/me") return { ok: true, status: 200, json: async () => ({ id: "account-a" }) };
      posts++;
      return {
        ok: outcome !== "unauthorized",
        status: outcome === "unauthorized" ? 401 : 200,
        json: async () => ({ id: "fake-job" }),
      };
    },
    pollJob: async () => outcome,
  };
  const execute = new Function("env", `with(env){${code};return run;}`)(
    env,
  ) as () => Promise<void>;
  return { env, execute, posts: () => posts };
}
test("screen enables explicit retry only after definite safe outcomes", async () => {
  for (const outcome of [
    "succeeded",
    "failed",
    "local-error",
    "unauthorized",
  ] as const) {
    const h = submissionHarness(outcome);
    await h.execute();
    assert.equal(h.env.submitted.current, false, outcome);
    assert.equal(pendingSubmissions.has(h.env.product.id), false, outcome);
    await h.execute();
    assert.equal(h.posts(), outcome === "local-error" ? 0 : outcome === "unauthorized" ? 1 : 2, outcome);
  }
});
test("screen timeout retains uncertainty lock and blocks another paid submission", async () => {
  const h = submissionHarness("timeout");
  await h.execute();
  assert.equal(h.env.submitted.current, true);
  assert.equal(pendingSubmissions.has(h.env.product.id), true);
  await h.execute();
  assert.equal(h.posts(), 1);
  pendingSubmissions.delete(h.env.product.id);
});


test("only confirmed success enters the account-scoped session gallery", async () => {
  for (const outcome of ["succeeded", "failed", "timeout", "local-error", "unauthorized"] as const) {
    const h = submissionHarness(outcome);
    await h.execute();
    const looks = h.env.tryOnSession.read(h.env.accountTicket.current);
    assert.equal(looks.length, outcome === "succeeded" ? 1 : 0, outcome);
    if (looks.length) {
      assert.equal(looks[0].jobId, "fake-job");
      assert.equal(looks[0].productName, "A real garment");
      assert.deepEqual(Object.keys(looks[0]).sort(), ["brandName", "completedAt", "jobId", "productId", "productName"]);
    }
    pendingSubmissions.delete(h.env.product.id);
  }
});

test("account switch after success hides the result instead of attributing it to another account", async () => {
  const h = submissionHarness("succeeded");
  const original = h.env.apiFetch;
  let checks = 0;
  h.env.apiFetch = async (path: string) => {
    if (path === "/api/auth/me" && ++checks > 1)
      return { ok: true, status: 200, json: async () => ({ id: "account-b" }) };
    return original(path);
  };
  let displayed = 0;
  h.env.setResult = () => { displayed++; };
  await h.execute();
  assert.equal(h.posts(), 1);
  assert.equal(h.env.tryOnSession.read(h.env.accountTicket.current).length, 0);
  assert.equal(displayed, 1, "only the initial result reset, never a result URL");
  assert.equal(pendingSubmissions.has(h.env.product.id), false);
});

test("leaving during final identity verification never records or displays a result", async () => {
  const h = submissionHarness("succeeded");
  const original = h.env.apiFetch;
  let checks = 0;
  h.env.apiFetch = async (path: string) => {
    if (path === "/api/auth/me" && ++checks > 1) h.env.alive.current = false;
    return original(path);
  };
  let displayed = 0;
  h.env.setResult = () => { displayed++; };
  await h.execute();
  assert.equal(h.env.tryOnSession.read(h.env.accountTicket.current).length, 0);
  assert.equal(displayed, 1);
});


test("compact saved-photo screen keeps every generation gate before any request", async () => {
  const blockers = [
    (env: any) => { env.product = undefined; },
    (env: any) => { env.ready = false; },
    (env: any) => { env.consent = false; },
    (env: any) => { env.submitted.current = true; },
    (env: any) => { env.alive.current = false; },
    (env: any) => { pendingSubmissions.add(env.product.id); },
  ];
  for (const block of blockers) {
    const h = submissionHarness("succeeded");
    const id = h.env.product.id;
    let reads = 0;
    const original = h.env.apiFetch;
    h.env.apiFetch = async (path: string) => { reads++; return original(path); };
    block(h.env);
    await h.execute();
    assert.equal(reads, 0);
    assert.equal(h.posts(), 0);
    assert.equal(h.env.tryOnSession.read(h.env.accountTicket.current).length, 0);
    pendingSubmissions.delete(id);
  }
});
