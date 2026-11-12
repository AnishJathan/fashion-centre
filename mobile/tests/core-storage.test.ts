import { test } from "node:test";
import assert from "node:assert/strict";
import { NativeStorage, type StorageAdapter } from "../src/core/storage.ts";
import { parseIds, parseStores } from "../src/core/domain.ts";
import { validateApiBase } from "../src/core/api.ts";
class Memory implements StorageAdapter {
  data = new Map<string, string>();
  writes: string[] = [];
  failRead = false;
  failWrite = "";
  async getItem(key: string) {
    if (this.failRead) throw Error("read failed");
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.writes.push(key);
    if (key.includes(this.failWrite) && this.failWrite)
      throw Error("write failed");
    this.data.set(key, value);
  }
  async getAllKeys() {
    return [...this.data.keys()];
  }
}
test("serialized mutations retain repeated taps", async () => {
  const adapter = new Memory(),
    store = new NativeStorage(adapter);
  let ids = await store.read("fc.saved", parseIds, []);
  await Promise.all(
    ["a", "b", "c"].map((id) =>
      store.run(async () => {
        const next = [...ids, id];
        await store.write("fc.saved", next);
        ids = next;
      }),
    ),
  );
  assert.deepEqual(JSON.parse(adapter.data.get("fc.saved")!), ["a", "b", "c"]);
});
test("malformed originals are recovered before repaired writes", async () => {
  const adapter = new Memory(),
    store = new NativeStorage(adapter);
  adapter.data.set("fc.saved", "broken");
  assert.deepEqual(await store.read("fc.saved", parseIds, []), []);
  await store.run(() => store.write("fc.saved", ["new"]));
  assert.match(adapter.writes[0], /^fc.saved.recovery.\d+$/);
  assert.equal(adapter.data.get(adapter.writes[0]), "broken");
  assert.equal(adapter.writes[1], "fc.saved");
});
test("failed recovery prevents replacement and queue remains usable", async () => {
  const adapter = new Memory(),
    store = new NativeStorage(adapter);
  adapter.data.set("fc.saved", "broken");
  await store.read("fc.saved", parseIds, []);
  adapter.failWrite = ".recovery.";
  await assert.rejects(store.run(() => store.write("fc.saved", ["new"])));
  assert.equal(adapter.data.get("fc.saved"), "broken");
  adapter.failWrite = "";
  await store.run(() => store.write("fc.saved", ["new"]));
  assert.equal(adapter.data.get("fc.saved"), '["new"]');
});
test("failed reads and stale baseline never overwrite persisted data", async () => {
  const adapter = new Memory(),
    store = new NativeStorage(adapter);
  adapter.failRead = true;
  await assert.rejects(store.read("fc.saved", parseIds, []));
  adapter.failRead = false;
  await assert.rejects(store.write("fc.saved", []), /could not be read/);
  await store.read("fc.saved", parseIds, []);
  adapter.data.set("fc.saved", '["external"]');
  await assert.rejects(store.write("fc.saved", []), /Newer/);
  assert.equal(adapter.data.get("fc.saved"), '["external"]');
});
test("uncertain write failure requires reread", async () => {
  const adapter = new Memory(),
    store = new NativeStorage(adapter);
  await store.read("fc.saved", parseIds, []);
  adapter.failWrite = "fc.saved";
  await assert.rejects(store.write("fc.saved", ["a"]));
  adapter.failWrite = "";
  await assert.rejects(store.write("fc.saved", ["b"]), /could not be read/);
  await store.read("fc.saved", parseIds, []);
  await store.write("fc.saved", ["b"]);
});
test("backup whitelists shopping records and recovery, excluding auth and photos", async () => {
  const adapter = new Memory(),
    store = new NativeStorage(adapter);
  for (const key of [
    "fc.saved",
    "fc.saved.recovery.123",
    "auth",
    "otp",
    "photo",
    "fc.theme.v1",
    "fc.commerce.v1",
  ])
    adapter.data.set(key, "value");
  const backup = await store.backup();
  assert.equal(backup.format, "fashion-centre-local-backup-v1");
  assert.deepEqual(Object.keys(backup.records).sort(), [
    "fc.commerce.v1",
    "fc.saved",
    "fc.saved.recovery.123",
  ]);
});
test("parsers isolate invalid and duplicate choices", () => {
  assert.deepEqual(parseIds('["a",null,"a",""]'), ["a"]);
  assert.equal(
    parseStores(
      '[{"id":"ok","enabled":false,"onboardedAt":"today"},{"id":"bad/id","enabled":true,"onboardedAt":"today"}]',
    ).length,
    1,
  );
});
test("API origins reject credentials, insecure non-loopback, path and missing configuration", () => {
  assert.equal(
    validateApiBase("https://api.example.test"),
    "https://api.example.test",
  );
  assert.equal(
    validateApiBase("http://127.0.0.1:8081", true),
    "http://127.0.0.1:8081",
  );
  for (const value of [
    undefined,
    "/api",
    "http://127.0.0.1:8081",
    "http://example.test",
    "https://user:pass@example.test",
    "https://example.test/api",
    "https://example.test/?token=x",
  ])
    assert.throws(() => validateApiBase(value));
  assert.throws(() => validateApiBase("http://192.168.1.2", true));
});
