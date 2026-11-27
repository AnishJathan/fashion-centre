import test from "node:test";
import assert from "node:assert/strict";
import { appReturn, appleSignInAvailable, beginSignIn, finishNativeSignIn } from "../src/core/providerSignIn.ts";
import { matchingCountries, normalisePhone } from "../src/phoneCountries.ts";

test("picker distinguishes countries sharing a prefix and validates an international paste", () => {
  assert.deepEqual(matchingCountries("+1").map(item => item.iso), ["CA", "US"]);
  assert.equal(matchingCountries(" uk ")[0].dial, "+44");
  assert.equal(normalisePhone("+61", "0061 400 000 000"), "+61400000000");
  assert.throws(() => normalisePhone("+44", "+61 400 000 000"));
  assert.throws(() => normalisePhone("+61", "400x000000"));
});

test("native return exchanges both one-time proofs with the initiating provider", async () => {
  const verifier = "v".repeat(43), grant = "g".repeat(43);
  const origin = "https://fixture.example";
  const start = await beginSignIn(async (path, init) => {
    assert.equal(path, "/api/auth/sign-in/shopify/start");
    assert.deepEqual(JSON.parse(String(init.body)), {platform:"native",shop:"fixture.myshopify.com"});
    return Response.json({url:origin+"/api/auth/sign-in/shopify/browser?platform=native", verifier});
  }, origin, "native", "shopify", "fixture.myshopify.com");
  await finishNativeSignIn(async (path, init) => {
    assert.equal(path, "/api/auth/sign-in/shopify/finish");
    assert.deepEqual(JSON.parse(String(init.body)), {grant, verifier});
    assert.equal(init.credentials, "include");
    return new Response(null, {status:204});
  }, "shopify", appReturn+"?grant="+grant, start.verifier!);
});

test("unexpected addresses and cancellations never submit a grant", async () => {
  const origin = "https://fixture.example";
  await assert.rejects(beginSignIn(async () => Response.json({url:"https://elsewhere.example/api/auth/sign-in/google/browser?platform=web"}),
    origin, "web", "google"), /doesn’t match/);
  const never = async () => {throw Error("unexpected transport request");};
  await assert.rejects(finishNativeSignIn(never, "google", appReturn+"?signin=cancelled", ""), /cancelled/);
  await assert.rejects(finishNativeSignIn(never, "google", "fashioncentre://other/complete", ""), /Unexpected/);
});


test("Apple sign-in is offered only when the server reports that it is configured", async () => {
  const { signal } = new AbortController();
  assert.equal(await appleSignInAvailable(async (path, init) => {
    assert.equal(path, "/api/auth/providers");
    assert.equal(init.signal, signal);
    return Response.json({ apple: true });
  }, signal), true);
  assert.equal(await appleSignInAvailable(async () => Response.json({ apple: "true" }), signal), false);
  assert.equal(await appleSignInAvailable(async () => new Response(null, { status: 404 }), signal), false);
});
