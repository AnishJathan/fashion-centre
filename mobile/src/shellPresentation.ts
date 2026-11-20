import { metrics } from "./design.ts";
import { cleanRoute, scopeRoute, type Route, type RouteName } from "./navigation.ts";
export function activeTab(route: RouteName): RouteName {
  if (["brand", "product", "brands", "stores"].includes(route)) return "home";
  if (route === "owner" || route === "settings") return "profile";
  if (["orders", "order", "checkout"].includes(route)) return "cart";
  return route;
}
/** A tab switch creates one root destination rather than a stack of prior tabs. */
export function tabDestination(name: RouteName, current: Route): Route {
  if (current.brandId?.startsWith("shop-") && ["home", "cart", "profile"].includes(name)) return { name };
  return scopeRoute({ name }, current);
}
export function isRootTab(name: RouteName) {
  return ["home", "brands", "brand", "orders", "cart", "profile"].includes(name);
}

export type BottomTabName = "home" | "cart" | "profile";

/** The tab opens the studio. A product card opens that garment's try-on. */
export function tryOnDestination(current: Route, brands: readonly { id: string }[]): Route {
  const { brandId } = cleanRoute(current);
  return cleanRoute({ name: "prepare", brandId: brands.some(brand => brand.id === brandId) ? brandId : undefined });
}

/** A separate footer owns the system inset and grows for larger accessibility labels. */
export function bottomNavFrame(width: number, fontScale: number, insets: { left: number; right: number; bottom: number }) {
  const edge = width < 320 ? metrics.compactGap : metrics.gap;
  const left = Math.max(edge, insets.left), right = Math.max(edge, insets.right);
  const available = Math.min(metrics.dockWidth, Math.max(0, width - left - right));
  const scale = Math.min(2, Math.max(1, Number.isFinite(fontScale) ? fontScale : 1));
  const labelLines = (available - 16) / 4 < 51 * scale ? 2 : 1;
  const height = Math.max(metrics.dockHeight, 42 + Math.ceil(15 * scale) * labelLines);
  const bottom = insets.bottom + metrics.dockOffset;
  return { left, right, bottom, width: available, height, labelLines };
}
