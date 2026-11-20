import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperationGate,
  defaultVariant,
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
