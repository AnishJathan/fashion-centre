import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { apiFetch, apiUrl } from "./api";
import { beginSignIn, finishNativeSignIn, type Provider } from "./providerSignIn";

export async function browserSignIn(provider: Provider, shop?: string) {
  // Expo Go: exp://<host>:8081/--/auth/complete. Builds: fashioncentre://auth/complete.
  const returnTo = Linking.createURL("auth/complete");
  const start = await beginSignIn(
    apiFetch,
    new URL(apiUrl("/")).origin,
    "native",
    provider,
    shop,
    returnTo,
  );
  const result = await WebBrowser.openAuthSessionAsync(start.url, returnTo);
  if (result.type !== "success") throw new Error("Sign-in was cancelled. You can try again.");
  await finishNativeSignIn(apiFetch, provider, result.url, start.verifier!, returnTo);
}