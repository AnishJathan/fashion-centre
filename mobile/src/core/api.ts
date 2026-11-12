/** Only the public backend origin belongs in the mobile bundle. Never put secrets here. */
export function validateApiBase(
  value: string | undefined,
  development = false,
): string {
  if (!value)
    throw new Error(
      "Configure EXPO_PUBLIC_API_URL with your backend HTTPS origin.",
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("EXPO_PUBLIC_API_URL must be an absolute HTTPS origin.");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" &&
      !(development && loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "Use an HTTPS backend origin. HTTP loopback is permitted only in development.",
    );
  }
  return url.origin;
}
export function apiUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
    throw new Error("API paths must be relative to the configured backend.");
  return (
    validateApiBase(
      process.env.EXPO_PUBLIC_API_URL,
      typeof __DEV__ !== "undefined" && __DEV__,
    ) + path
  );
}
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), { ...init, credentials: "include" });
}
