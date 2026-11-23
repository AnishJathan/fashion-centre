import { beginSignIn, signInMessage, type Provider } from '../mobile/src/core/providerSignIn';

export async function browserSignIn(provider: Provider, shop?: string, studio = false) {
  const start = await beginSignIn(fetch, location.origin, 'web', provider, shop);
  try {
    if (studio) sessionStorage.setItem('fc.signin.try', location.hash);
    else sessionStorage.removeItem('fc.signin.try');
  } catch { /* Sign-in still works without session storage. */ }
  location.assign(start.url);
}

// Only the server cookie establishes identity. The URL marker supplies feedback after the redirect.
export function takeSignInResult() {
  const url = new URL(location.href);
  const status = url.searchParams.get('signin');
  if (status !== null) {
    url.searchParams.delete('signin');
    history.replaceState(history.state, '', url);
  }
  return {returned: status === 'success', message: signInMessage(status)};
}
