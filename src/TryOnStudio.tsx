import { lazy, Suspense, useContext, useEffect, useState } from 'react';
import { recentEntries, studioPhoto, type BrowsingHistory, type StudioPhoto } from '../mobile/src/core/browsingHistory';
import { TryOnPanel } from './TryOnPanel';
import { BrandContext, BrandLink } from './StoreNavigation';
import { scopeHref } from './navigationScope';
import type { Brand, Product } from './domain';

const AccountScreen = lazy(() => import('./AccountScreen'));
export function TryOnStudio({ history, products, brands, loading }: {
  history: BrowsingHistory; products: Product[]; brands: Brand[]; loading: boolean;
}) {
  const scope = useContext(BrandContext);
  const [photo, setPhoto] = useState<StudioPhoto>('checking');
  const [accountOpen, setAccountOpen] = useState(() => new URLSearchParams(location.search).has('signin'));
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      if (new URLSearchParams(location.search).has('signin')) return sessionStorage.getItem('fc.signin.piece');
    } catch { /* Storage is optional. */ }
    return null;
  });
  const garment = products.find(item => item.id === selected);
  const reviewing = !!garment && !accountOpen;
  function openAccount() {
    try {
      if (selected) sessionStorage.setItem('fc.signin.piece', selected);
      else sessionStorage.removeItem('fc.signin.piece');
    } catch { /* The current page keeps the selection in memory. */ }
    setAccountOpen(true);
  }
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (accountOpen || reviewing) return;
    const abort = new AbortController();
    setPhoto('checking');
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store', signal: abort.signal })
      .then(studioPhoto).then(result => { if (!abort.signal.aborted) setPhoto(result); })
      .catch(() => { if (!abort.signal.aborted) setPhoto('error'); });
    return () => abort.abort();
  }, [accountOpen, revision, reviewing]);
  const garments = recentEntries(history.products, products);
  const stores = recentEntries(history.stores, brands);
  if (accountOpen) return <Suspense fallback={<p>Opening your account…</p>}><AccountScreen studio close={() => {
    try { sessionStorage.removeItem('fc.signin.piece'); } catch { /* Optional storage. */ }
    setAccountOpen(false);
  }} /></Suspense>;
  return <section className="try-preparation studio">
    <p className="eyebrow">TRY-ON STUDIO</p><h1>Prepare your next look.</h1>
    <section className="preparation-panel studio-photo"><h2>Your try-on photo</h2>
      <p role="status">{{checking:'Checking your account…', ready:'Your saved photo is ready. Choose a piece to try on.',
        missing:'Add a full-body photo to try on a piece.', guest:'Sign in to add your full-body photo.',
        error:'We couldn’t check your photo. You can still browse your recent pieces.'}[photo]}</p>
      {(photo === 'guest' || photo === 'missing') && <button className="primary" onClick={openAccount}>{photo === 'guest' ? 'Sign in to add a photo' : 'Add a photo'}</button>}
      {photo === 'error' && <button className="secondary" onClick={() => setRevision(n => n + 1)}>Check again</button>}
    </section>
    <section><h2>Recently viewed pieces</h2>
      {garments.length ? <div className="studio-pieces">{garments.map(item => <button key={item.id} className="studio-piece"
        onClick={() => setSelected(item.id)} disabled={!item.image} aria-label={'Try on ' + item.name}>
        {item.image && <img loading="lazy" alt="" src={item.image}/>}<span>{item.brandName}</span><strong>{item.name}</strong>
        <small>{item.image ? 'Try on →' : 'Photo unavailable'}</small></button>)}</div> :
        <p>{loading ? 'Loading pieces…' : 'Open a product while browsing and it will appear here.'}</p>}
    </section>
    <section><h2>Recently visited stores</h2>{stores.length ? <div className="studio-stores">{stores.map(store =>
      <BrandLink key={store.id} className="secondary" href={'#/brand/' + encodeURIComponent(store.id)}>{store.name} ↗</BrandLink>)}</div> :
      <p>{loading ? 'Loading stores…' : 'Stores you explore on this device will appear here.'}</p>}
      <BrandLink global href="#/brands">Browse stores</BrandLink>
    </section>
    <label className="garment-select">Catalogue garment<select aria-label="Catalogue garment" value="" onChange={e => {
      if (e.target.value) location.hash = scopeHref('#/try/' + encodeURIComponent(e.target.value), scope);
    }}><option value="">Choose a garment</option>{products.map(item => <option key={item.id} value={item.id}>{item.brandName} — {item.name}</option>)}</select></label>
    {garment && <TryOnPanel product={garment} onClose={() => setSelected(null)} onSignIn={openAccount}/>}
  </section>;
}
