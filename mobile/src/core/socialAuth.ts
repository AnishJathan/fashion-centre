import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";
import { Platform } from "react-native";

let configured = false;

export function configureGoogle() {
  if (configured) return;
  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, 
  });
  configured = true;
}

export type SocialCredential =
  | { provider: "apple"; idToken: string; firstName?: string }
  | { provider: "google"; idToken: string };

/** Returns null when the user cancels. Throws for real failures. */
export async function signInWithApple(): Promise<SocialCredential | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error("Apple did not return a sign-in token.");
    return {
      provider: "apple",
      idToken: credential.identityToken,
      // Apple sends the name only on the first sign-in
      firstName: credential.fullName?.givenName ?? undefined,
    };
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw e;
  }
}


export async function signInWithGoogle(): Promise<SocialCredential | null> {
  configureGoogle();
  try {
    await GoogleSignin.hasPlayServices?.();
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null; // user cancelled
    const idToken = response.data.idToken;
    if (!idToken) throw new Error("Google did not return a sign-in token.");
    return { provider: "google", idToken };
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw e;
  }
}
export const signOutGoogle = () => GoogleSignin.signOut().catch(() => {});
export const appleAvailable = () => Platform.OS === "ios";