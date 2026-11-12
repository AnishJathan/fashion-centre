import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanRoute,
  parseLink,
  routeLink,
  scopeRoute,
} from "../src/navigation.ts";

test("product deep links derive owning brand and survive encoding", () => {
  const route = {
    name: "product" as const,
    productId: "mock:gid://shopify/Product/1",
  };
  assert.deepEqual(parseLink(routeLink(route)), { ...route, brandId: "mock" });
});
test("brand context follows cart and profile, explicit product owner wins", () => {
  assert.deepEqual(
    scopeRoute({ name: "cart" }, { name: "brand", brandId: "mock" }),
    { name: "cart", brandId: "mock" },
  );
  assert.deepEqual(
    scopeRoute(
      { name: "product", productId: "apparel:gid://shopify/Product/1" },
      { name: "brand", brandId: "mock" },
    ),
    {
      name: "product",
      productId: "apparel:gid://shopify/Product/1",
      brandId: "apparel",
    },
  );
  assert.deepEqual(
    scopeRoute({ name: "home" }, { name: "profile", brandId: "mock" }),
    { name: "brand", brandId: "mock" },
  );
  assert.deepEqual(
    scopeRoute({ name: "brands" }, { name: "cart", brandId: "mock" }),
    { name: "brands" },
  );
});
test("old browser paths retain native equivalents", () => {
  assert.deepEqual(parseLink("#/merchant"), { name: "stores" });
  assert.deepEqual(parseLink("#/orders/demo-1?brand=mock"), {
    name: "order",
    orderId: "demo-1",
    brandId: "mock",
  });
  assert.deepEqual(parseLink("#/try?brand=mock"), {
    name: "prepare",
    brandId: "mock",
  });
});
test("malformed and arbitrary links cannot become app destinations", () => {
  for (const url of [
    "https://evil.example/product/a",
    "javascript:alert(1)",
    "fashioncentre://product/%E0%A4%A",
    "fashioncentre://brand/../",
    "fashioncentre://checkout/",
    "fashioncentre://not-a-route",
  ])
    assert.equal(parseLink(url), null);
  assert.deepEqual(cleanRoute({ name: "profile", brandId: "../bad" }), {
    name: "profile",
  });
});

test('personal settings retain store scope and have an explicit deep-link route', () => {
  assert.deepEqual(scopeRoute({ name: 'settings' }, { name: 'profile', brandId: 'mock' }), { name: 'settings', brandId: 'mock' });
  assert.deepEqual(parseLink('fashioncentre://settings?brand=mock'), { name: 'settings', brandId: 'mock' });
  assert.deepEqual(parseLink(routeLink({ name: 'settings' })), { name: 'settings' });
});
