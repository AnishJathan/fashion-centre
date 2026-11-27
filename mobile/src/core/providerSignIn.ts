// import { shopifyDomain } from "../settingsPresentation.ts";

// export type Provider = "google" | "shopify";
// type Transport = (path: string, init: RequestInit) => Promise<Response>;
// const base = "/api/auth/sign-in/";
// const token = /^[A-Za-z0-9_-]{43}$/;
// export const appReturn = "fashioncentre://auth/complete";

// export async function beginSignIn(send: Transport, origin: string, platform: "web" | "native", provider: Provider, shop?: string, returnTo?: string) {
//   const name = provider === "google" ? "Google" : "Shopify";
//   let response: Response;
//   try {
//     response = await send(base + provider + "/start", {method: "POST", headers: {"Content-Type":"application/json"},
//       body: JSON.stringify({platform, shop, returnTo}), credentials: "include"});
//   } catch { throw new Error("Couldn’t reach Fashion Centre. Check your connection and try again."); }
//   if (response.status === 503 || response.status === 404)
//     throw new Error(`${name} sign-in is unavailable on this server. Please try again later.`);
//   if (!response.ok) throw new Error(`Couldn’t start ${name} sign-in. Please try again.`);
//   const data = await response.json().catch(() => null);
//   let target: URL;
//   try { target = new URL(data?.url); }
//   catch { throw new Error("Fashion Centre returned an invalid sign-in address. Please try again."); }
//   if (target.origin !== origin || target.pathname !== base + provider + "/browser" || target.username || target.password ||
//       target.searchParams.get("platform") !== platform || (platform === "native" && (typeof data.verifier !== "string" || !token.test(data.verifier))))
//     throw new Error("The sign-in address doesn’t match this Fashion Centre server.");
//   return {url: target.href, verifier: data.verifier as string | undefined};
// }

// export function signInMessage(status: string | null) {
//   if (status === "cancelled") return "Sign-in was cancelled. You can try again.";
//   if (status === "failed") return "We couldn’t verify your sign-in. Please try again.";
//   return "";
// }

// export async function merchantSession(send: Transport, signal?: AbortSignal): Promise<string> {
//   const response = await send(base + "shopify/me", {credentials: "include", cache: "no-store", signal});
//   if (response.status === 401 || response.status === 404) return "";
//   if (!response.ok) throw new Error("Couldn’t check your merchant session.");
//   const data = await response.json();
//   if (typeof data.shop !== "string" || !shopifyDomain(data.shop).valid || data.shop !== data.shop.trim().toLowerCase())
//     throw new Error("Invalid merchant session.");
//   return data.shop;
// }

// export async function finishNativeSignIn(send: Transport, provider: Provider, url: string, verifier: string , returnTo: string) {
//   const result = new URL(url);
//   const expected = new URL(returnTo);
//   // if (result.protocol !== "fashioncentre:" || result.host !== "auth" || result.pathname !== "/complete" ||
//   //     result.username || result.password || result.hash) throw new Error("Unexpected sign-in return address.");
//     // Compare protocol, host and path; custom schemes have origin "null"
//   if (result.protocol !== expected.protocol || result.host !== expected.host ||
//       result.pathname !== expected.pathname || result.username || result.password || result.hash)
//     throw new Error("Unexpected sign-in return address.");
//   const message = signInMessage(result.searchParams.get("signin"));
//   if (message) throw new Error(message);
//   const grant = result.searchParams.get("grant");
//   if (!grant || !token.test(grant)) throw new Error("Sign-in expired. Please try again.");
//   const response = await send(base + provider + "/finish", {method: "POST", headers: {"Content-Type":"application/json"},
//     body: JSON.stringify({grant, verifier, returnTo}), credentials: "include"});
//   if (!response.ok) throw new Error("Couldn’t complete sign-in. Please start again.");
// }

import { shopifyDomain } from "../settingsPresentation.ts";

export type Provider = "google" | "apple" | "shopify";
type Transport = (path: string, init: RequestInit) => Promise<Response>;
const base = "/api/auth/sign-in/";
const token = /^[A-Za-z0-9_-]{43}$/;

export async function beginSignIn(
  send: Transport,
  origin: string,
  platform: "web" | "native",
  provider: Provider,
  shop?: string,
  returnTo?: string,
) {
  const name = provider === "google" ? "Google" : provider === "apple" ? "Apple" : "Shopify";
  if (platform === "native" && !returnTo) throw new Error("Missing app return address.");
  let response: Response;
  try {
    response = await send(base + provider + "/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, shop, returnTo }),
      credentials: "include",
    });
  } catch {
    throw new Error("Couldn’t reach Fashion Centre. Check your connection and try again.");
  }
  if (response.status === 503 || response.status === 404)
    throw new Error(`${name} sign-in is unavailable on this server. Please try again later.`);
  if (!response.ok) throw new Error(`Couldn’t start ${name} sign-in. Please try again.`);
  const data = await response.json().catch(() => null);
  let target: URL;
  try {
    target = new URL(data?.url);
  } catch {
    throw new Error("Fashion Centre returned an invalid sign-in address. Please try again.");
  }
  if (
    target.origin !== origin ||
    target.pathname !== base + provider + "/browser" ||
    target.username ||
    target.password ||
    target.searchParams.get("platform") !== platform ||
    (platform === "native" &&
      (typeof data.verifier !== "string" ||
        !token.test(data.verifier) ||
        target.searchParams.get("return") !== returnTo))
  )
    throw new Error("The sign-in address doesn’t match this Fashion Centre server.");
  return { url: target.href, verifier: data.verifier as string | undefined };
}

export function signInMessage(status: string | null) {
  if (status === "cancelled") return "Sign-in was cancelled. You can try again.";
  if (status === "failed") return "We couldn’t verify your sign-in. Please try again.";
  return "";
}

export async function merchantSession(send: Transport, signal?: AbortSignal): Promise<string> {
  const response = await send(base + "shopify/me", { credentials: "include", cache: "no-store", signal });
  if (response.status === 401 || response.status === 404) return "";
  if (!response.ok) throw new Error("Couldn’t check your merchant session.");
  const data = await response.json();
  if (
    typeof data.shop !== "string" ||
    !shopifyDomain(data.shop).valid ||
    data.shop !== data.shop.trim().toLowerCase()
  )
    throw new Error("Invalid merchant session.");
  return data.shop;
}

function queryValue(query: string, key: string): string | null {
  for (const pair of query.split("&")) {
    const [name, value = ""] = pair.split("=");
    if (name === key) return decodeURIComponent(value);
  }
  return null;
}

export async function finishNativeSignIn(
  send: Transport,
  provider: Provider,
  url: string,
  verifier: string,
  returnTo: string,
) {
  // Exact prefix match: the backend redirects to the same returnTo the app registered.
  if (!url.startsWith(returnTo + "?") || url.includes("#"))
    throw new Error("Unexpected sign-in return address.");
  const query = url.slice(returnTo.length + 1);
  const message = signInMessage(queryValue(query, "signin"));
  if (message) throw new Error(message);
  const grant = queryValue(query, "grant");
  if (!grant || !token.test(grant)) throw new Error("Sign-in expired. Please try again.");
  const response = await send(base + provider + "/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant, verifier }),
    credentials: "include",
  });
  if (!response.ok) throw new Error("Couldn’t complete sign-in. Please start again.");
}