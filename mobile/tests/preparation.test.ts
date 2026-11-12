import test from "node:test";
import assert from "node:assert/strict";
import { preparationReady } from "../src/photo/preparation.ts";
test("local preparation needs usable personal and garment photos and both acknowledgements", () => {
  const good = { photo: true, garment: true, rights: true, understood: true };
  assert.equal(preparationReady(good), true);
  for (const key of Object.keys(good))
    assert.equal(preparationReady({ ...good, [key]: false }), false);
});
