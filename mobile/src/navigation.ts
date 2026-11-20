/** Platform-independent route parsing. Route parameters, not global state, own brand scope. */
export const routeNames = [
  "home",
  "brands",
  "brand",
  "stores",
  "product",
  "cart",
  "checkout",
  "orders",
  "order",
  "profile",
  "settings",
  "owner",
  "login",
  "login-demo",
  "prepare",
  "photos",
  "try-on",
] as const;
export type RouteName = (typeof routeNames)[number];
export type Route = {
  name: RouteName;
  brandId?: string;
  productId?: string;
  orderId?: string;
};
const brand = (value: unknown): string | undefined =>
  typeof value === "string" && /^[a-z0-9-]{1,100}$/.test(value)
    ? value
    : undefined;
const id = (value: unknown): string | undefined =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 4096 &&
  !/[\u0000-\u001f]/.test(value)
    ? value
    : undefined;

export function cleanRoute(input: Route): Route {
  const name = routeNames.includes(input.name) ? input.name : "home";
  const productId = id(input.productId),
    orderId = id(input.orderId);
  // A bare Shopify GID has no store prefix even though it contains a colon.
  const owner = productId?.includes(":") && !productId.startsWith("gid://")
    ? brand(productId.split(":")[0])
    : undefined;
  const brandId = owner ?? brand(input.brandId);
  return {
    name,
    ...(brandId ? { brandId } : {}),
    ...(productId ? { productId } : {}),
    ...(orderId ? { orderId } : {}),
  };
}

export function scopeRoute(next: Route, current: Route): Route {
  const clean = cleanRoute(next);
  if (
    clean.name === "brands" ||
    clean.name === "stores" ||
    clean.name === "owner"
  )
    return { name: clean.name };
  if (clean.name === "brand") return clean;
  const active = clean.brandId || brand(current.brandId);
  if (clean.name === "home")
    return active ? { name: "brand", brandId: active } : { name: "home" };
  return active ? { ...clean, brandId: active } : clean;
}

/** Accept only app deep links and the original site's hash paths, never arbitrary remote URLs. */
export function parseLink(value: string): Route | null {
  if (value.length > 8192) return null;
  let path: string;
  if (value.startsWith("fashioncentre://"))
    path = "/" + value.slice("fashioncentre://".length).replace(/^\/+/, "");
  else if (value.startsWith("#/")) path = value.slice(1);
  else if (value.startsWith("/")) path = value;
  else return null;
  const [rawPath, query = ""] = path.split("?");
  const segments = rawPath.split("/").filter(Boolean);
  if (segments.length > 2) return null;
  let valueId: string | undefined;
  try {
    valueId = segments[1] ? decodeURIComponent(segments[1]) : undefined;
  } catch {
    return null;
  }
  let segment = segments[0] ?? "home";
  if (segment === "merchant") segment = "stores";
  if (segment === "try") segment = "prepare";
  if (segment === "orders" && valueId) segment = "order";
  const name = routeNames.find((route) => route === segment);
  if (!name) return null;
  if (
    ["brand", "product", "checkout", "order", "photos", "try-on"].includes(
      name,
    ) &&
    !id(valueId)
  )
    return null;
  if (["brand", "checkout"].includes(name) && !brand(valueId)) return null;
  return cleanRoute({
    name,
    brandId: ["brand", "checkout"].includes(name)
      ? valueId
      : new URLSearchParams(query).get("brand") || undefined,
    ...(["product", "prepare", "photos", "try-on"].includes(name) && valueId
      ? { productId: valueId }
      : {}),
    ...(name === "order" ? { orderId: valueId } : {}),
  });
}
