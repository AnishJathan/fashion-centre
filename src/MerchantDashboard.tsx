
import { useEffect, useState } from 'react';
import { BrandLink } from './StoreNavigation';
import { canonicalShop } from './merchant';
import { browserSignIn, takeSignInResult } from './providerSignIn';
import { merchantSession } from '../mobile/src/core/providerSignIn';
import { loadMerchantStores, loadMerchantCatalogue, money } from './domain';
import type { ConnectedStore, Brand } from './domain';
import './merchant.css';

type Readiness = {
  marketplace?: boolean;
  published?: boolean;
  ready: boolean;
  connected: boolean;
  blockers: string[];
};

export function MerchantDashboard() {
  const [shop, setShop] = useState('');
  const [checked, setChecked] = useState(false);
  const [activeShop, setActiveShop] = useState('');
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  const [stores, setStores] = useState<ConnectedStore[] | null>(null);
  const [storesError, setStoresError] = useState('');
  const [catalogue, setCatalogue] = useState<Brand | null>(null);
  const [catalogueError, setCatalogueError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const domain = canonicalShop(shop);

  useEffect(() => {
    const abort = new AbortController();
    const result = takeSignInResult();

    setAuthError(result.message);

    merchantSession(fetch, abort.signal)
      .then(value => {
        if (abort.signal.aborted) return;

        setActiveShop(value);

        if (!value && result.returned) {
          setAuthError('Couldn’t confirm your merchant session. Please sign in again.');
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setAuthError('Couldn’t check your merchant session. Please try again.');
        }
      });

    return () => abort.abort();
  }, []);

  useEffect(() => {
    const abort = new AbortController();

    setData(null);
    setError('');

    fetch('/api/merchant/shopify/readiness', {
      signal: abort.signal,
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then(async response => {
        if (!response.ok) throw new Error();

        const next = await response.json();

        if (
          typeof next.ready !== 'boolean' ||
          typeof next.connected !== 'boolean' ||
          !Array.isArray(next.blockers) ||
          !next.blockers.every((item: unknown) => typeof item === 'string')
        ) {
          throw new Error();
        }

        if (!abort.signal.aborted) setData(next);
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setError('Connection readiness is unavailable. Installation remains blocked.');
        }
      });

    return () => abort.abort();
  }, [retry]);

  useEffect(() => {
    const abort = new AbortController();

    setStoresError('');

    loadMerchantStores(abort.signal)
      .then(list => {
        if (abort.signal.aborted) return;

        setStores(list);

        if (list.length && !activeShop) {
          setActiveShop(list[0].shop);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setStoresError('Could not load connected stores.');
        }
      });

    return () => abort.abort();
  }, [retry]);

  useEffect(() => {
    if (!activeShop) {
      setCatalogue(null);
      return;
    }

    const abort = new AbortController();

    setCatalogue(null);
    setCatalogueError('');

    loadMerchantCatalogue(activeShop, abort.signal)
      .then(value => {
        if (!abort.signal.aborted) setCatalogue(value);
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setCatalogueError('Could not load products for this store.');
        }
      });

    return () => abort.abort();
  }, [activeShop]);

  async function signIn() {
    setChecked(true);
    setAuthError('');

    if (!domain || busy) return;

    setBusy(true);

    try {
      await browserSignIn('shopify', domain);
    } catch (cause) {
      setAuthError(
        cause instanceof Error ? cause.message : 'Couldn’t sign in with Shopify.'
      );
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setAuthError('');

    try {
      const response = await fetch('/api/auth/sign-in/shopify/logout', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) throw new Error();

      setActiveShop('');
      setCatalogue(null);
      setChecked(false);
      setStores(null);
      setRetry(value => value + 1);
    } catch {
      setAuthError('Couldn’t sign out of Shopify. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function publishToBrands() {
    if (!activeShop || syncing) return;

    setSyncing(true);
    setSyncMsg('');

    try {
      const csrfResponse = await fetch('/api/auth/csrf', {
        credentials: 'same-origin',
        cache: 'no-store',
      });

      if (!csrfResponse.ok) throw new Error('Please sign in again.');

      const { csrfToken } = await csrfResponse.json();

      if (!csrfToken) throw new Error('Security token is missing. Please sign in again.');

      const response = await fetch('/api/merchant/shopify/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.message ||
          errorData?.error ||
          `Publishing failed (${response.status})`
        );
      }

      const result = await response.json();

      setSyncMsg(`Published ${result.synced} products to the Brands page.`);
      setRetry(value => value + 1);
      window.dispatchEvent(new Event('store-directory-changed'));
    } catch (cause) {
      setSyncMsg(cause instanceof Error ? cause.message : 'Publishing failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function togglePublication() {
    if (!activeShop || busy || !data) return;

    setBusy(true);
    setAuthError('');

    try {
      const csrfResponse = await fetch('/api/auth/csrf', {
        credentials: 'same-origin',
        cache: 'no-store',
      });

      if (!csrfResponse.ok) throw new Error('Please sign in again.');

      const { csrfToken } = await csrfResponse.json();

      if (!csrfToken) throw new Error('Security token is missing.');

      const response = await fetch('/api/merchant/shopify/publish', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ published: !data.published }),
      });

      if (!response.ok) throw new Error();

      setRetry(value => value + 1);
      window.dispatchEvent(new Event('store-directory-changed'));
    } catch {
      setAuthError('Couldn’t update your store. Please check your permissions and retry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="owner-page">
      <p className="eyebrow">Fashion Centre for brands</p>
      <h1>Your brand. A new place to be discovered.</h1>
      <p className="owner-lead">
        Sign in with your Shopify store to access your merchant account.
      </p>

      <div className="owner-grid">
        <article className="owner-card">
          <h2>Merchant sign-in</h2>

          {activeShop ? (
            <>
              <span className="owner-badge">Connected</span>
              <p>Signed in to <strong>{activeShop}</strong></p>

              <button
                className="secondary"
                disabled={busy}
                onClick={signOut}
              >
                Sign out of merchant account
              </button>
            </>
          ) : (
            <form
              onSubmit={event => {
                event.preventDefault();
                void signIn();
              }}
            >
              <label htmlFor="shop-domain">Shopify store domain</label>

              <input
                id="shop-domain"
                value={shop}
                placeholder="your-brand.myshopify.com"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={busy}
                onChange={event => {
                  setShop(event.target.value);
                  setChecked(false);
                  setAuthError('');
                }}
                aria-invalid={checked && !domain}
                aria-describedby="domain-help"
              />

              <p id="domain-help" className="fine">
                Use your original .myshopify.com domain.
              </p>

              <button
                className="secondary"
                type="button"
                onClick={() => setChecked(true)}
              >
                Check domain
              </button>

              {checked && (
                <p role={domain ? 'status' : 'alert'}>
                  {domain
                    ? `Domain format valid: ${domain}. Ownership has not been verified.`
                    : 'Enter only a valid store.myshopify.com domain, without a URL scheme, path or port.'}
                </p>
              )}

              <button
                className="primary wide"
                type="submit"
                disabled={busy || !domain}
              >
                {busy ? 'Opening Shopify…' : 'Sign in with Shopify'}
              </button>
            </form>
          )}

          {authError && (
            <p role="alert" className="login-error">{authError}</p>
          )}
        </article>

        <article className="owner-card">
          <h2>Connection readiness</h2>

          {!data && !error && (
            <p role="status">Checking server readiness…</p>
          )}

          {error && <p role="alert">{error}</p>}

          {data && (
            <>
              <p>
                {data.ready
                  ? 'The server reports that the installation prerequisites are ready.'
                  : 'Installation prerequisites:'}
              </p>
              {data.blockers.length > 0 && (
                <ul>
                  {data.blockers.map(item => <li key={item}>{item}</li>)}
                </ul>
              )}
            </>
          )}

          <button
            className="secondary"
            onClick={() => setRetry(value => value + 1)}
          >
            Refresh readiness
          </button>

          <h3>Connected stores</h3>

          {storesError && <p role="alert">{storesError}</p>}
          {!stores && !storesError && (
            <p role="status">Loading stores…</p>
          )}
          {stores?.length === 0 && <p>No stores connected yet.</p>}

          <ul>
            {stores?.map(store => (
              <li key={store.shop}>
                <button
                  className={store.shop === activeShop ? 'primary' : 'secondary'}
                  type="button"
                  onClick={() => setActiveShop(store.shop)}
                >
                  {store.shop}
                </button>
              </li>
            ))}
          </ul>
        </article>
      </div>

      {activeShop && (
        <section className="owner-card">
          <h2>Products from {activeShop}</h2>

          <button
            className="primary"
            type="button"
            disabled={syncing}
            onClick={() => void publishToBrands()}
          >
            {syncing ? 'Publishing…' : 'Publish to Brands'}
          </button>

          {syncMsg && <p role="status">{syncMsg}</p>}

          {data?.marketplace && (
            <>
              <h3>Storefront publication</h3>
              <p>
                {data.published
                  ? 'Your collection is visible to shoppers.'
                  : 'Your collection is not currently published.'}
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void togglePublication()}
              >
                {data.published ? 'Unpublish store' : 'Publish store'}
              </button>
            </>
          )}

          {catalogueError && <p role="alert">{catalogueError}</p>}
          {!catalogue && !catalogueError && (
            <p role="status">Loading products…</p>
          )}
          {catalogue?.products.length === 0 && <p>No products found.</p>}

          <div className="owner-products">
            {catalogue?.products.map(product => (
              <div key={product.id} className="owner-product">
                {product.image && (
                  <img src={product.image} alt={product.name} loading="lazy" />
                )}
                <strong>{product.name}</strong>
                {product.variants[0] && (
                  <span>
                    {money(
                      product.variants[0].amount,
                      product.variants[0].currency
                    )}
                  </span>
                )}
                {product.url && (
                  <a href={product.url} target="_blank" rel="noopener noreferrer">
                    View on store →
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <aside className="owner-demo">
        <h2>Explore the experience today</h2>
        <p>Browse fictional catalogues with a demo store.</p>
        <BrandLink className="primary" href="#/merchant">
          Explore demo stores
        </BrandLink>
      </aside>
    </section>
  );
}
