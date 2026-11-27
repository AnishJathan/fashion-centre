import{ signInMessage, type Provider } from '../mobile/src/core/providerSignIn';

// Web only. A top-level navigation: the server sets the flow cookie and redirects to the provider.
// No start call, so the origin check in beginSignIn does not apply here.
export function browserSignIn(provider: Provider, shop?: string, studio = false) {
  try {
    if (studio) sessionStorage.setItem('fc.signin.try', location.hash);
    else sessionStorage.removeItem('fc.signin.try');
  } catch { /* Sign-in still works without session storage. */ }
  const query = shop ? `?shop=${encodeURIComponent(shop)}` : '';
  location.assign(`/api/auth/web/sign-in/${provider}/browser${query}`);
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
