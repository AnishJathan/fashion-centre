import { cleanRoute, scopeRoute, type Route, type RouteName } from "./navigation.ts";
export function activeTab(route: RouteName): RouteName {
  if (["brand", "product", "brands", "stores"].includes(route)) return "home";
  if (route === "owner" || route === "settings") return "profile";
  if (["orders", "order", "checkout"].includes(route)) return "cart";
  return route;
}
/** A tab switch creates one root destination rather than a stack of prior tabs. */
export function tabDestination(name: RouteName, current: Route): Route {
  return scopeRoute({ name }, current);
}
export function isRootTab(name: RouteName) {
  return ["home", "brands", "brand", "orders", "cart", "profile"].includes(name);
}

export type BottomTabName = "home" | "cart" | "profile";

/** Only a current, available catalogue product is preselected. Never guess a
 * garment from the bag or silently choose the first catalogue entry. */
export function tryOnDestination(
  current: Route,
  products: readonly { id: string; brandId: string }[],
  brands: readonly { id: string }[],
): Route {
  const route = cleanRoute(current);
  const brandId = brands.some(brand => brand.id === route.brandId) ? route.brandId : undefined;
  const product = ["product", "photos", "prepare", "try-on"].includes(route.name)
    ? products.find(item => item.id === route.productId &&
        (!brandId || item.brandId === brandId) && brands.some(brand => brand.id === item.brandId))
    : undefined;
  return cleanRoute({ name: "prepare", brandId: product?.brandId || brandId, ...(product ? { productId: product.id } : {}) });
}

/** The painted capsule is slimmer than its four touch targets. Keep the row
 * at least 48px tall and grow both surfaces for labels at up to 150% scale. */
export function bottomNavLayout(availableWidth: number, fontScale = 1) {
  const width = Math.max(196, Math.min(720, Number.isFinite(availableWidth) ? availableWidth : 366));
  const scale = Math.min(1.5, Math.max(1, Number.isFinite(fontScale) ? fontScale : 1));
  const height = 30 + Math.ceil(12 * scale);
  const targetHeight = Math.max(48, height + 2);
  return { width, height, targetHeight, radius: height / 2, targetWidth: (width - 4) / 4 };
}

/** Shared dock geometry keeps the scroll clearance equal to the actual overlay,
 * including safe insets, larger labels and a stacked companion on tiny windows. */
export function bottomNavFrame(width: number, fontScale: number, insets: { left: number; right: number; bottom: number }, accessory = true) {
  const edge = width < 320 ? 8 : 12;
  const left = Math.max(edge, insets.left), right = Math.max(edge, insets.right);
  const availableWidth = Math.min(720, width - left - right);
  const stackedAccessory = accessory && availableWidth < 260;
  const layout = bottomNavLayout(availableWidth - (accessory && !stackedAccessory ? 56 : 0), fontScale);
  const bottom = Math.max(8, insets.bottom);
  return { left, right, bottom, stackedAccessory, layout, footprint: 2 + layout.targetHeight + (stackedAccessory ? 56 : 0) + bottom };
}

/** Native uses true translucency; the web renderer additionally blurs the real
 * content behind the dock. No duplicated or screenshot backdrop is used. */
export function bottomNavGlass(surface: string, web = false, reducedTransparency = false) {
  return {
    backgroundColor: reducedTransparency ? surface : `${surface}${web ? "B3" : "C7"}`,
    borderColor: `${surface}BF`,
    borderTopColor: `${surface}F2`,
    ...(web && !reducedTransparency ? { backdropFilter: "blur(18px) saturate(150%)", WebkitBackdropFilter: "blur(18px) saturate(150%)" } : {}),
  };
}
