import type { Product, Variant } from "./domain.ts";
import type { CartLine } from "./commerce.ts";
export function defaultVariant(product: Product): Variant | undefined {
  return product.variants.find((v) => v.available) || product.variants[0];
}
export function profileSelection(
  products: Product[],
  saved: string[],
  cart: CartLine[],
  brandId?: string,
) {
  const available = products.filter((p) => !brandId || p.brandId === brandId);
  return {
    savedCount: saved.filter((id) => available.some((p) => p.id === id)).length,
    cartCount: cart
      .filter((l) => !brandId || l.brandId === brandId)
      .reduce((n, l) => n + l.quantity, 0),
  };
}
export function browseControls(routeName: string, store: string, sort: string) {
  return routeName === "home"
    ? { store: "", sort: "featured", showStoreAndSort: false }
    : { store, sort, showStoreAndSort: true };
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
