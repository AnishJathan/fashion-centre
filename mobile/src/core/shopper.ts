import type { Product, Variant } from "./domain.ts";
export function defaultVariant(product: Product): Variant | undefined {
  return product.variants.find((v) => v.available) || product.variants[0];
}

/** A completed operation may navigate only within the focus session that started it. */
export function createOperationGate() {
  let epoch = 0,
    active = false;
  return {
    focus() {
      active = true;
      epoch++;
    },
    blur() {
      active = false;
      epoch++;
    },
    capture() {
      return epoch;
    },
    permits(token: number) {
      return active && token === epoch;
    },
  };
}
