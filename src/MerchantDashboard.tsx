import {useEffect, useState} from 'react';
import {BrandLink} from './StoreNavigation';
import {canonicalShop} from './merchant';
import {browserSignIn, takeSignInResult} from './providerSignIn';
import {merchantSession} from '../mobile/src/core/providerSignIn';
import './merchant.css';

type Readiness = {marketplace?:boolean; published?:boolean;ready: boolean; connected: boolean; blockers: string[]};

export function MerchantDashboard() {
  const [shop, setShop] = useState(''), [checked, setChecked] = useState(false);
  const [activeShop, setActiveShop] = useState(''), [busy, setBusy] = useState(false), [authError, setAuthError] = useState('');
  const [data, setData] = useState<Readiness|null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const domain = canonicalShop(shop);

  useEffect(() => {
    const abort = new AbortController(), result = takeSignInResult();
    setAuthError(result.message);
    merchantSession(fetch, abort.signal).then(value => {
      if (abort.signal.aborted) return;
      setActiveShop(value);
      if (!value && result.returned) setAuthError('Couldn’t confirm your merchant session. Please sign in again.');
    }).catch(() => {if (!abort.signal.aborted) setAuthError('Couldn’t check your merchant session. Please try again.');});
    return () => abort.abort();
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    setData(null); setError('');
    fetch('/api/merchant/shopify/readiness', {signal: abort.signal, cache: 'no-store'}).then(async response => {
      if (!response.ok) throw Error();
      const next = await response.json();
      if ((!next.marketplace && (next.ready !== false || next.connected !== false)) || !Array.isArray(next.blockers) ||
          !next.blockers.every((item: unknown) => typeof item === 'string')) throw Error();
      if (!abort.signal.aborted) setData(next);
    }).catch(() => {if (!abort.signal.aborted) setError('Connection readiness is unavailable. Installation remains blocked.');});
    return () => abort.abort();
  }, [retry]);

  async function signIn() {
    setChecked(true); setAuthError('');
    if (!domain || busy) return;
    setBusy(true);
    try { await browserSignIn('shopify', domain); }
    catch (cause) {setAuthError(cause instanceof Error ? cause.message : 'Couldn’t sign in with Shopify.'); setBusy(false);}
  }

  async function signOut() {
    setBusy(true); setAuthError('');
    try {
      const response = await fetch('/api/auth/sign-in/shopify/logout', {method: 'POST', credentials: 'include'});
      if (!response.ok) throw Error();
      setActiveShop(''); setChecked(false);
    } catch {setAuthError('Couldn’t sign out of Shopify. Please try again.');}
    finally {setBusy(false);}
  }

  return <section className="owner-page">
    <p className="eyebrow">Fashion Centre for brands</p>
    <h1>Your brand. A new place to be discovered.</h1>
    <p className="owner-lead">Sign in with your Shopify store to access your merchant account.</p>
    <div className="owner-grid">
      <article className="owner-card">
        <h2>Merchant sign-in</h2>
        {activeShop ? <>
          <p>Signed in to <strong>{activeShop}</strong></p>
          <button className="secondary" disabled={busy} onClick={signOut}>Sign out of merchant account</button>
        </> : <form onSubmit={event => {event.preventDefault(); void signIn();}}>
          <label htmlFor="shop-domain">Shopify store domain</label>
          <input id="shop-domain" value={shop} placeholder="your-brand.myshopify.com" autoComplete="off" autoCapitalize="none"
            spellCheck={false} disabled={busy} onChange={event => {setShop(event.target.value);setChecked(false);setAuthError('');}}
            aria-invalid={checked && !domain} aria-describedby="domain-help"/>
          <p id="domain-help" className="fine">Use your original .myshopify.com domain.</p>
          <button className="secondary" type="button" onClick={() => setChecked(true)}>Check domain</button>
          {checked && <p role={domain ? 'status' : 'alert'}>{domain ? `Domain format valid: ${domain}. Ownership has not been verified.`
            : 'Enter only a valid store.myshopify.com domain, without a URL scheme, path or port.'}</p>}
          <button className="primary wide" type="submit" disabled={busy}>{busy ? 'Opening Shopify…' : 'Sign in with Shopify'}</button>
        </form>}
        {authError && <p role="alert" className="login-error">{authError}</p>}
      </article>
      {data?.marketplace ? <article className="owner-card"><h2>Your storefront</h2>
        <p>{data.published?'Your collection is visible to shoppers.':activeShop?'Publish your Shopify collection to open your store.':'Sign in with your store owner account to publish a collection.'}</p>
        {activeShop && <button className="primary" disabled={busy} onClick={async()=>{
          setBusy(true);setAuthError('');
          try {const r=await fetch('/api/merchant/shopify/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({published:!data.published})});
            if(!r.ok)throw Error();setRetry(n=>n+1);window.dispatchEvent(new Event('store-directory-changed'));
          } catch {setAuthError('Couldn’t update your store. Check your Shopify storefront permissions and retry.');} finally {setBusy(false);}
        }}>{data.published?'Unpublish store':'Publish store'}</button>}
      </article> : <article className="owner-card">
        <span className="owner-badge">Not connected</span><h2>Connection readiness</h2>
        {!data && !error && <p role="status">Checking server readiness…</p>}
        {error && <p role="alert">{error}</p>}
        {data && <><p>Installation is blocked until these prerequisites are completed:</p><ul>{data.blockers.map(item => <li key={item}>{item}</li>)}</ul></>}
        <button className="secondary" onClick={() => setRetry(n => n + 1)}>Refresh readiness</button>
        <button className="secondary wide" disabled>Connect Shopify — setup required</button>
      </article>}
    </div>
    {!data?.marketplace && <aside className="owner-demo"><h2>Explore the experience today</h2>
      <p>Browse fictional catalogues with a demo store.</p><BrandLink className="primary" href="#/merchant">Explore demo stores</BrandLink>
    </aside>}
  </section>;
}
