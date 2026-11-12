import { test } from "node:test";
import assert from "node:assert/strict";
import { readStorefront } from "../src/core/catalogue.ts";
import type { Brand, Source } from "../src/core/domain.ts";
const brand: Brand = {
  id: "mock",
  name: "Mock",
  image: "",
  products: [],
  more: false,
};
test("directory failure does not suppress healthy enabled catalogues", async () => {
  let directory: PromiseSettledResult<Source[]> | undefined;
  let catalogues: PromiseSettledResult<Brand>[] = [];
  await readStorefront(
    ["mock", "offline"],
    new AbortController().signal,
    (r) => {
      directory = r;
    },
    (r) => {
      catalogues = r;
    },
    {
      sources: async () => {
        throw Error("Directory offline");
      },
      catalogue: async (id) => {
        if (id === "offline") throw Error("Store offline");
        return brand;
      },
    },
  );
  assert.equal(directory?.status, "rejected");
  assert.deepEqual(catalogues[0], { status: "fulfilled", value: brand });
  assert.equal(catalogues[1].status, "rejected");
});
test("catalogues publish without waiting for an unresolved directory", async () => {
  let finish!: (value: Source[]) => void;
  const pending = new Promise<Source[]>((resolve) => {
    finish = resolve;
  });
  let published!: () => void;
  const ready = new Promise<void>((resolve) => {
    published = resolve;
  });
  let directoryPublished = false;
  const task = readStorefront(
    ["mock"],
    new AbortController().signal,
    () => {
      directoryPublished = true;
    },
    () => published(),
    {
      sources: () => pending,
      catalogue: async () => brand,
    },
  );
  await ready;
  assert.equal(directoryPublished, false);
  finish([]);
  await task;
  assert.equal(directoryPublished, true);
});
test("cancelled catalogue reads cannot publish late results", async () => {
  const controller = new AbortController();
  let publications = 0;
  await readStorefront(
    ["mock"],
    controller.signal,
    () => publications++,
    () => publications++,
    {
      sources: async () => {
        controller.abort();
        return [];
      },
      catalogue: async () => brand,
    },
  );
  assert.equal(publications, 0);
});
