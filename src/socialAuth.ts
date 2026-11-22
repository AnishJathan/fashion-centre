import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';

export const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;
export const IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined;

export const isNative = Capacitor.isNativePlatform();
export const isIos = Capacitor.getPlatform() === 'ios';
// Native uses the Capacitor plugins; the browser uses Google Identity Services.
export const socialSupported = isNative || !!WEB_CLIENT_ID;

let initialized = false;
async function initNative() {
  if (initialized) return;
  await SocialLogin.initialize({
    google: { webClientId: WEB_CLIENT_ID ?? 'preview', iOSClientId: IOS_CLIENT_ID },
  });
  initialized = true;
}

declare global {
  interface Window { google?: any }
}

export function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google sign-in could not load.'));
    document.head.appendChild(script);
  });
}

export async function googleIdToken(): Promise<string> {
  // Sur le web, le token arrive par le composant GoogleWebButton
  if (!isNative) throw new Error('Use the Google button on the web.');
  await initNative();
  const res = await SocialLogin.login({
    provider: 'google',
    options: { scopes: ['email', 'profile'] },
  });
  const token = (res.result as any)?.idToken;
  if (!token) throw new Error('Google did not return a token.');
  return token;
}

function googleWebIdToken(): Promise<string> {
  if (!WEB_CLIENT_ID) return Promise.reject(new Error('VITE_GOOGLE_WEB_CLIENT_ID is missing.'));
  return loadGis().then(() => new Promise<string>((resolve, reject) => {
    window.google.accounts.id.initialize({
      client_id: WEB_CLIENT_ID,
      auto_select: false,
      callback: (response: { credential?: string }) => {
        if (response.credential) resolve(response.credential);
        else reject(new Error('Google did not return a token.'));
      },
    });
    // Affiche un bouton temporaire dans un conteneur caché, puis clique dessus
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-9999px';
    document.body.appendChild(host);
    window.google.accounts.id.renderButton(host, { type: 'standard', size: 'large' });
    const btn = host.querySelector('div[role=button]') as HTMLElement | null;
    if (!btn) { host.remove(); reject(new Error('Google button could not render.')); return; }
    btn.click();
    setTimeout(() => host.remove(), 60000);
  }));
}

export async function appleIdToken(): Promise<string> {
  const res = await SignInWithApple.authorize({
    clientId: 'com.fashioncentre.app',
    redirectURI: 'https://YOUR-DOMAIN/api/auth/apple/callback',
    scopes: 'email name',
    state: crypto.randomUUID(),
    nonce: crypto.randomUUID(),
  });
  const token = res.response?.identityToken;
  if (!token) throw new Error('Apple did not return a token.');
  return token;
}