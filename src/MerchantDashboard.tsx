import { BrandLink } from './StoreNavigation';
import { useEffect, useState } from 'react';
import { canonicalShop } from './merchant';
import './merchant.css';
import { loadMerchantStores, loadMerchantCatalogue, money } from './domain';
import type { ConnectedStore, Brand } from './domain';

type Readiness = {
  ready: boolean;
  connected: boolean;
  blockers: string[];
};

export function MerchantDashboard() {
  const [shop, setShop] = useState('');
  const [checked, setChecked] = useState(false);
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [stores, setStores] = useState<ConnectedStore[] | null>(null);
  const [storesError, setStoresError] = useState('');
  const [activeShop, setActiveShop] = useState('');
  const [catalogue, setCatalogue] = useState<Brand | null>(null);
  const [catalogueError, setCatalogueError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    const abort = new AbortController();

    setData(null);
    setError('');

    fetch('/api/merchant/shopify/readiness', {
      signal: abort.signal,
      cache: 'no-store',
      credentials: 'same-origin'
    })
      .then(async r => {
        if (!r.ok) throw new Error();
        const d = await r.json();

        if (
          typeof d.ready !== 'boolean' ||
          typeof d.connected !== 'boolean' ||
          !Array.isArray(d.blockers) ||
          !d.blockers.every((b: unknown) => typeof b === 'string')
        ) {
          throw new Error();
        }

        setData(d);
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setError('Connection readiness is unavailable.');
        }
      });

    return () => abort.abort();
  }, [retry]);

  useEffect(() => {
    const abort = new AbortController();
    setStoresError('');
    loadMerchantStores(abort.signal)
      .then(list => {
        setStores(list);
        if (list.length && !activeShop) setActiveShop(list[0].shop);
      })
      .catch(() => {
        if (!abort.signal.aborted) setStoresError('Could not load connected stores.');
      });
    return () => abort.abort();
  }, [retry]);

  useEffect(() => {
    if (!activeShop) return;
    const abort = new AbortController();
    setCatalogue(null);
    setCatalogueError('');
    loadMerchantCatalogue(activeShop, abort.signal)
      .then(setCatalogue)
      .catch(err => {
        console.error('Catalogue error:', err);
        if (!abort.signal.aborted) setCatalogueError('Could not load products for this store.');
      });
    return () => abort.abort();
  }, [activeShop]);

  const domain = canonicalShop(shop);

  async function publishToBrands() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const c = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
      if (!c.ok) throw new Error('Please sign in again.');
      const { csrfToken } = await c.json();

      const r = await fetch('/api/merchant/shopify/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken }
      });
      if (!r.ok) {
        const errorData = await r.json().catch(() => null);
        console.error('Publish error:', r.status, errorData);
        throw new Error(
          errorData?.message || errorData?.error || `Publishing failed (${r.status})`
        );
      }

      const d = await r.json();
      setSyncMsg('Published ' + d.synced + ' products to the Brands page.');
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Publishing failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function connectShopify() {
    if (!domain || !checked || connecting) return;

    setConnecting(true);
    setError('');

    try {
      const csrfResponse = await fetch('/api/auth/csrf', {
        credentials: 'same-origin',
        cache: 'no-store'
      });

      if (!csrfResponse.ok) {
        throw new Error('Unable to get security token. Please sign in again.');
      }

      const csrf = await csrfResponse.json();

      if (!csrf.csrfToken) {
        throw new Error('Security token is missing. Please sign in again.');
      }

      const response = await fetch('/api/merchant/shopify/install', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf.csrfToken
        },
        body: JSON.stringify({ shop: domain })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Shopify installation request failed.');
      }

      if (typeof result.authorizationUrl !== 'string') {
        throw new Error('Shopify authorization URL was not returned.');
      }

      const authorizationUrl = new URL(result.authorizationUrl);

      if (
        authorizationUrl.protocol !== 'https:' ||
        authorizationUrl.pathname !== '/admin/oauth/authorize'
      ) {
        throw new Error('Unexpected Shopify authorization URL.');
      }

      window.location.assign(authorizationUrl.toString());

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to connect Shopify. Please try again.'
      );

      setConnecting(false);
    }
  }

  return (
    <section className="owner-page">
      <p className="eyebrow">FASHION CENTRE FOR BRANDS</p>

      <h1>Your brand. A new place to be discovered.</h1>

      <p className="owner-lead">
        Connect your Shopify store to bring your collection into Fashion Centre.
        Secure merchant onboarding is being prepared.
      </p>

      <div className="owner-grid">
        <article className="owner-card">
          <span className="owner-badge">{data?.connected || stores?.length ? 'Connected' : 'Not connected'}</span>

          <h2>Connect Shopify</h2>

          <p>
            Use your original Shopify domain. A custom storefront URL
            cannot be used for authorization.
          </p>

          <form
            onSubmit={e => {
              e.preventDefault();
              setChecked(true);
              setError('');
            }}
          >
            <label htmlFor="shop-domain">Shopify store domain</label>

            <input
              id="shop-domain"
              value={shop}
              placeholder="your-brand.myshopify.com"
              autoComplete="off"
              spellCheck={false}
              onChange={e => {
                setShop(e.target.value);
                setChecked(false);
                setError('');
              }}
              aria-describedby="domain-help"
            />

            <p id="domain-help" className="fine">
              Example: your-brand.myshopify.com
            </p>

            <button className="secondary" type="submit">
              Check domain
            </button>

            {checked && (
              <p role={domain ? 'status' : 'alert'}>
                {domain
                  ? `Domain format valid: ${domain}. Ownership has not been verified.`
                  : 'Enter a valid store.myshopify.com domain.'}
              </p>
            )}

            <button
              className="primary wide"
              type="button"
              disabled={!domain || !checked || connecting}
              onClick={() => {
                connectShopify();
              }}
            >
              {connecting ? 'Connecting to Shopify…' : 'Connect Shopify'}
            </button>
          </form>

          {error && <p role="alert">{error}</p>}

          <p className="fine">
            Fashion Centre will request permission from Shopify.
            Your Shopify password is never collected here.
          </p>
        </article>

        <article className="owner-card">
          <h2>Connection readiness</h2>

          {!data && !error && (
            <p role="status">Checking server readiness…</p>
          )}

          {data && (
            <>
              <p>Installation prerequisites:</p>
              <ul>
                {data.blockers.map(b => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </>
          )}

          <button
            className="secondary"
            onClick={() => setRetry(n => n + 1)}
          >
            Refresh readiness
          </button>

          <h3>Connected stores</h3>
          {storesError && <p role="alert">{storesError}</p>}
          {!stores && !storesError && <p role="status">Loading stores…</p>}
          {stores?.length === 0 && <p>No stores connected yet.</p>}
          <ul>
            {stores?.map(s => (
              <li key={s.shop}>
                <button
                  className={s.shop === activeShop ? 'primary' : 'secondary'}
                  type="button"
                  onClick={() => setActiveShop(s.shop)}
                >
                  {s.shop}
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
            onClick={publishToBrands}
          >
            {syncing ? 'Publishing…' : 'Publish to Brands'}
          </button>
          {syncMsg && <p role="status">{syncMsg}</p>}

          {catalogueError && <p role="alert">{catalogueError}</p>}
          {!catalogue && !catalogueError && <p role="status">Loading products…</p>}
          {catalogue?.products.length === 0 && <p>No products found.</p>}
          <div className="owner-products">
            {catalogue?.products.map(p => (
              <div key={p.id} className="owner-product">
                {p.image && <img src={p.image} alt={p.name} loading="lazy" />}
                <strong>{p.name}</strong>
                {p.variants[0] && (
                  <span>{money(p.variants[0].amount, p.variants[0].currency)}</span>
                )}
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
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

        <p>
          The separate demo onboarding uses public fictional catalogues.
          It does not connect or authorize your store.
        </p>

        <BrandLink className="primary" href="#/merchant">
          Explore demo stores
        </BrandLink>
      </aside>
    </section>
  );
}