import assert from "node:assert/strict";
import test from "node:test";
import {
  merchantReadinessBlockers,
  shopifyDomain,
  stackSettingsControls,
} from "../src/settingsPresentation.ts";

test("settings controls stack on narrow screens and at larger text sizes", () => {
  assert.equal(stackSettingsControls(320, 1), true);
  assert.equal(stackSettingsControls(359, 1), true);
  assert.equal(stackSettingsControls(390, 1.3), true);
  assert.equal(stackSettingsControls(768, 2), true);
  assert.equal(stackSettingsControls(390, 1), false);
  assert.equal(stackSettingsControls(768, 1), false);
  assert.equal(stackSettingsControls(0, 1), true);
  assert.equal(stackSettingsControls(Number.NaN, Number.NaN), false);
});

test("merchant domain checks remain format-only and accept canonical Shopify hosts", () => {
  assert.deepEqual(shopifyDomain("  MY-BRAND.myshopify.com  "), {
    host: "my-brand.myshopify.com",
    valid: true,
  });
  assert.equal(shopifyDomain("a.myshopify.com").valid, true);
  assert.equal(shopifyDomain(`${"a".repeat(63)}.myshopify.com`).valid, true);
  for (const host of [
    "",
    "https://a.myshopify.com",
    "a.myshopify.com/",
    "a.myshopify.com:443",
    "a.myshopify.com.evil.com",
    "a.b.myshopify.com",
    "-a.myshopify.com",
    "a-.myshopify.com",
    "my-brand.com",
    `${"a".repeat(64)}.myshopify.com`,
  ]) {
    assert.equal(shopifyDomain(host).valid, false, host);
  }
});

test("merchant readiness accepts only explicitly disconnected, not-ready responses", () => {
  assert.deepEqual(
    merchantReadinessBlockers({
      ready: false,
      connected: false,
      blockers: ["Configure OAuth"],
    }),
    ["Configure OAuth"],
  );
  assert.deepEqual(
    merchantReadinessBlockers({ ready: false, connected: false, blockers: [] }),
    [],
  );
  for (const response of [
    null,
    [],
    "ready",
    {},
    { ready: true, connected: false, blockers: [] },
    { ready: false, connected: true, blockers: [] },
    { ready: false, connected: false, blockers: [1] },
    { ready: false, connected: false },
    { ready: "false", connected: false, blockers: [] },
  ]) {
    assert.throws(
      () => merchantReadinessBlockers(response),
      /Invalid readiness response/,
    );
  }
});
