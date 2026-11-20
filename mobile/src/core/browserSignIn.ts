import * as WebBrowser from "expo-web-browser";
import { apiFetch, apiUrl } from "./api";
import { appReturn, beginSignIn, finishNativeSignIn, type Provider } from "./providerSignIn";

export async function browserSignIn(provider: Provider, shop?: string) {
  const start = await beginSignIn(apiFetch, new URL(apiUrl("/")).origin, "native", provider, shop);
  const result = await WebBrowser.openAuthSessionAsync(start.url, appReturn);
  if (result.type !== "success") throw new Error("Sign-in was cancelled. You can try again.");
  await finishNativeSignIn(apiFetch, provider, result.url, start.verifier!);
}
