import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultVariant,
  profileSelection,
  browseControls,
} from "../src/core/shopper.ts";
import type { Product, Variant } from "../src/core/domain.ts";
const variant = (key: string, available: boolean): Variant => ({
  key,
  id: key,
  title: key,
  available,
  amount: 20,
  currency: "USD",
  options: { Size: key },
});
const product = (
  id: string,
  brandId: string,
  variants: Variant[] = [],
): Product => ({
  id,
  brandId,
  brandName: brandId,
  name: id,
  category: "Dress",
  image: "",
  variants,
  moreVariants: false,
});
test("product initially selects first available variant, not unavailable first entry", () => {
  const p = product("a:1", "a", [
    variant("small", false),
    variant("medium", true),
    variant("large", true),
  ]);
  assert.equal(defaultVariant(p)?.key, "medium");
});
test("all-unavailable variants preserve first variant and empty variants remain undefined", () => {
  assert.equal(
    defaultVariant(
      product("a:1", "a", [variant("small", false), variant("medium", false)]),
    )?.key,
    "small",
  );
  assert.equal(defaultVariant(product("a:1", "a")), undefined);
});
test("profile saved and retained cart counts respect active Brand Centre", () => {
  const products = [product("a:1", "a"), product("b:1", "b")];
  const saved = ["a:1", "b:1", "a:missing"];
  const cart = [
    { productId: "a:1", brandId: "a", quantity: 2, size: "M" },
    { productId: "a:missing", brandId: "a", quantity: 1, size: "L" },
    { productId: "b:1", brandId: "b", quantity: 4, size: "S" },
  ];
  assert.deepEqual(profileSelection(products, saved, cart, "a"), {
    savedCount: 1,
    cartCount: 3,
  });
  assert.deepEqual(profileSelection(products, saved, cart), {
    savedCount: 2,
    cartCount: 7,
  });
  assert.deepEqual(profileSelection(products, saved, cart, "disabled"), {
    savedCount: 0,
    cartCount: 0,
  });
});
test("home ignores stale store/sort inputs and hides controls while other routes preserve them", () => {
  assert.deepEqual(browseControls("home", "a", "price"), {
    store: "",
    sort: "featured",
    showStoreAndSort: false,
  });
  for (const route of ["brand", "saved"])
    assert.deepEqual(browseControls(route, "a", "price"), {
      store: "a",
      sort: "price",
      showStoreAndSort: true,
    });
});

import { createOperationGate } from "../src/core/shopper.ts";
test("checkout completion navigation is limited to its original focused session", () => {
  const gate = createOperationGate();
  assert.equal(gate.permits(gate.capture()), false);
  gate.focus();
  const accepted = gate.capture();
  assert.equal(gate.permits(accepted), true);
  gate.blur();
  assert.equal(gate.permits(accepted), false);
  gate.focus();
  assert.equal(gate.permits(accepted), false);
  const next = gate.capture();
  assert.equal(gate.permits(next), true);
  gate.blur();
  assert.equal(gate.permits(next), false);
});
