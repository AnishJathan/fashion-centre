import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createTryOnSession, parseProfileAccount, profileGridColumns, sessionResultPath, verifyProfileAccount } from "../src/profileSession.ts";

const look = { jobId: "job-1", productId: "brand:piece", productName: "Piece", brandName: "Brand", completedAt: 100 };
const response = (id: string) => ({ ok: true, status: 200, json: async () => ({ id, firstName: "Avery", phone: "+61 •••• 123" }) });

test("identity uses only authenticated response fields and does not invent a name or expose a raw phone", () => {
  assert.deepEqual(parseProfileAccount({ id: "abc", firstName: "", phone: "+61412345678" }), { id: "abc", firstName: "", phone: "" });
  for (const value of [null, [], {}, { id: "../../x" }, { id: 123 }]) assert.equal(parseProfileAccount(value), null);
});

test("session records are bounded, deduplicated, copied, and whitelist metadata only", () => {
  const session = createTryOnSession();
  const ticket = session.bind("a");
  assert.equal(session.recordSucceeded(ticket, { ...look, image: "secret", url: "signed", token: "secret" } as any), true);
  assert.deepEqual(session.read(ticket), [look]);
  assert.equal(session.recordSucceeded(ticket, look), false);
  (session.read(ticket)[0] as any).jobId = "changed";
  assert.equal(session.read(ticket)[0].jobId, "job-1");
  for (let i = 0; i < 60; i++) session.recordSucceeded(ticket, { ...look, jobId: `look-${i}` });
  assert.equal(session.read(ticket).length, 48);
  assert.equal(session.read(ticket)[0].jobId, "look-59");
  assert.deepEqual(createTryOnSession().read(ticket), []);
});

test("logout and account changes clear records, reject old tickets, and notify mounted galleries", () => {
  const session = createTryOnSession();
  let changes = 0;
  const unsub = session.subscribe(() => { changes++; });
  const a = session.bind("a");
  session.recordSucceeded(a, look);
  const b = session.bind("b");
  assert.deepEqual(session.read(a), []);
  assert.deepEqual(session.read(b), []);
  assert.equal(session.recordSucceeded(a, look), false);
  session.recordSucceeded(b, look);
  session.clear();
  const bAgain = session.bind("b");
  assert.deepEqual(session.read(bAgain), []);
  assert.equal(session.recordSucceeded(b, look), false);
  assert.ok(changes >= 5);
  unsub();
});

test("account verification is fresh and fails closed for 401, invalid payload, offline, and aborted reads", async () => {
  const session = createTryOnSession();
  const account = await verifyProfileAccount(async () => response("a"), () => true, session);
  assert.equal(account?.account.firstName, "Avery");
  session.recordSucceeded(account!.ticket, look);
  assert.equal(await verifyProfileAccount(async () => ({ ok: false, status: 401, json: async () => ({}) }), () => true, session), null);
  assert.deepEqual(session.read(account!.ticket), []);
  await assert.rejects(verifyProfileAccount(async () => ({ ok: true, status: 200, json: async () => ({ phone: "x" }) }), () => true, session), /verified/);
  await assert.rejects(verifyProfileAccount(async () => { throw Error("offline"); }, () => true, session), /offline/);
  await assert.rejects(verifyProfileAccount(async () => response("a"), () => false, session), /interrupted/);
});

test("late identity responses cannot recreate a session after logout or account switching", async () => {
  const session = createTryOnSession();
  await assert.rejects(verifyProfileAccount(async () => {
    session.clear();
    return response("old-account");
  }, () => true, session), /interrupted/);
  await assert.rejects(verifyProfileAccount(async () => ({ ok: true, status: 200, json: async () => {
    session.bind("new-account");
    return { id: "old-account" };
  } }), () => true, session), /interrupted/);
});

test("result paths accept only known job identifiers and grid respects compact/large-type layouts", () => {
  assert.equal(sessionResultPath("job-1"), "/api/try-on/job-1/result");
  for (const id of ["https://evil.test/image", "../x", "", "job?token=x"]) assert.throws(() => sessionResultPath(id));
  assert.equal(profileGridColumns(296), 1);
  assert.equal(profileGridColumns(366), 2);
  assert.equal(profileGridColumns(680), 3);
  assert.equal(profileGridColumns(680, 1.4), 1);
  const source = fs.readFileSync(new URL("../src/profileSession.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /AsyncStorage|localStorage|expo-file-system|setItem|writeFile/);
});
