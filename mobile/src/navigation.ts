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
export type ScreenProps = {
  route: Route;
  navigate: (route: Route) => void;
  back: () => void;
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
  const owner = productId ? brand(productId.split(":")[0]) : undefined;
  return {
    name,
    ...(brand(input.brandId) || owner
      ? { brandId: owner || brand(input.brandId) }
      : {}),
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
  const aliases: Record<string, RouteName> = {
    "": "home",
    home: "home",
    merchant: "stores",
    stores: "stores",
    brands: "brands",
    brand: "brand",
    product: "product",
    cart: "cart",
    checkout: "checkout",
    orders: valueId ? "order" : "orders",
    order: "order",
    profile: "profile",
    settings: "settings",
    owner: "owner",
    login: "login",
    "login-demo": "login-demo",
    try: "prepare",
    prepare: "prepare",
    photos: "photos",
    "try-on": "try-on",
  };
  const name = aliases[segments[0] || ""];
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

export function routeLink(route: Route): string {
  const r = cleanRoute(route);
  const value = ["brand", "checkout"].includes(r.name)
    ? r.brandId
    : r.name === "order"
      ? r.orderId
      : r.productId;
  return `fashioncentre://${r.name}${value ? "/" + encodeURIComponent(value) : ""}${r.brandId && !["brand", "checkout"].includes(r.name) ? "?brand=" + encodeURIComponent(r.brandId) : ""}`;
}
