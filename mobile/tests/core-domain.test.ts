import type { Product } from "../src/core/domain.ts";
export const product = (brandId = "mock", currency = "CAD"): Product => ({
  id: brandId + ":gid://shopify/Product/1",
  brandId,
  brandName: brandId === "mock" ? "Test Store" : "Other Store",
  name: "Test Shirt",
  category: "Shirts",
  image: "",
  moreVariants: false,
  variants: [
    {
      key: brandId + ":gid://shopify/ProductVariant/1",
      id: "gid://shopify/ProductVariant/1",
      title: "M",
      available: true,
      amount: 79.95,
      currency,
      options: { Size: "M" },
    },
    {
      key: brandId + ":gid://shopify/ProductVariant/2",
      id: "gid://shopify/ProductVariant/2",
      title: "L",
      available: false,
      amount: 81,
      currency,
      options: { Size: "L" },
    },
  ],
});
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectProducts,
  toggleId,
  money,
  productPath,
} from "../src/core/domain.ts";
test("filter uses only supplied catalogue and respects merchant category and search", () => {
  const p = product(),
    other = product("apparel", "USD");
  assert.deepEqual(selectProducts([]), []);
  assert.deepEqual(selectProducts([p, other], "mock", "shirt", "Shirts"), [p]);
  assert.deepEqual(selectProducts([p], "", "unknown"), []);
});
test("saved ids remain independent of catalogue refresh", () => {
  assert.deepEqual(toggleId(["legacy"], "new"), ["legacy", "new"]);
  assert.deepEqual(toggleId(["legacy"], "legacy"), []);
});
test("source currency and encoded shop scoped routes remain explicit", () => {
  assert.equal(money(79.95, "CAD"), "CAD 79.95");
  assert.notEqual(
    productPath(product().id),
    productPath(product("apparel").id),
  );
  assert.ok(productPath(product().id).includes("%2F"));
});

test("catalogue and source directory reject malformed or mismatched identities", async () => {
  const { parseSources, parseCatalogue, safeImage } =
    await import("../src/core/domain.ts");
  assert.deepEqual(parseSources({ shops: [{ key: "mock", name: "Mock" }] }), [
    { key: "mock", name: "Mock" },
  ]);
  assert.throws(() =>
    parseSources({
      shops: [
        { key: "mock", name: "A" },
        { key: "mock", name: "B" },
      ],
    }),
  );
  assert.throws(() =>
    parseCatalogue("mock", {
      shopKey: "other",
      shopName: "Other",
      products: [],
      hasNextPage: false,
    }),
  );
  assert.equal(safeImage("https://evil.test/photo.jpg"), "");
  assert.equal(
    safeImage("https://cdn.shopify.com/photo.jpg"),
    "https://cdn.shopify.com/photo.jpg",
  );
  assert.equal(safeImage("https://user:secret@cdn.shopify.com/photo.jpg"), "");
});
