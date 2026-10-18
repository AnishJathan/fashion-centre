import { parseNavigation, scopeHref } from './navigationScope';
import { BrandContext, BrandLink } from './StoreNavigation';
import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { loadCatalogue, loadSources, readStores, STORES_KEY, readIds, toggleId, selectProducts, money, productPath, type Product, type Brand, type Source, type StoreRegistration, decodeRoute } from './domain';
import { writeStored, storageRecoveryNeeded, withStorageLock, assertStoredCurrent } from './browserStorage';
import { commerceReducer, localCommerceRepository, COMMERCE_KEY, type CommerceAction } from './commerce';
import { CartScreen, CheckoutScreen, OrdersScreen, ProfileScreen } from './CommerceScreens';
import { LoginDemo } from './LoginDemo';
import { CataloguePhotoViewer } from './CataloguePhotoViewer';
import { CatalogueImage } from './CatalogueImage';
import { MerchantDashboard } from './MerchantDashboard';
import { TryOnPreparation } from './TryOnPreparation';
import './style.css';
import './approved.css';
import './login.css';
import './commerce-base.css';
import './commerce.css';
import './commerce-controls.css';
import './checkout-confirmation.css';
import './live-catalogue.css';
import './quality.css';
import './mobile-navigation.css';
import './theme.css';
import { ThemeProvider } from './Appearance';
type Load = {
    status: 'loading' | 'ready' | 'error';
    brand?: Brand;
    error?: string;
};
function App() {
    const [hash, setHash] = useState(location.hash), [stores, setStores] = useState(readStores), [sources, setSources] = useState<Source[]>([]), [directoryError, setDirectoryError] = useState(''), [loads, setLoads] = useState<Record<string, Load>>({}), [retry, setRetry] = useState(0);
    const { route, brandId } = parseNavigation(hash);
    const [state, setState] = useState(() => localCommerceRepository.read()), stateRef = useRef(state);
    const [storageIssue, setStorageIssue] = useState('');
    async function dispatch(action: CommerceAction) { try {
        return await withStorageLock(COMMERCE_KEY, () => { if (action.type === 'add' || action.type === 'checkout') assertStoredCurrent(STORES_KEY); const next = commerceReducer(stateRef.current, action); if (next === stateRef.current)
            return false; localCommerceRepository.write(next); stateRef.current = next; setState(next); return true; });
    }
    catch (e) {
        setStorageIssue(e instanceof Error ? e.message : 'Browser storage unavailable. Your change was not saved.');
        return false;
    } }
    async function changeStores(update: (old: StoreRegistration[]) => StoreRegistration[]) { try {
        await withStorageLock(STORES_KEY, () => { const next = update(choices.current.stores); writeStored(STORES_KEY, next); choices.current.stores = next; setStores(next); });
    }
    catch (e) {
        setStorageIssue(e instanceof Error ? e.message : 'Store choices could not be saved.');
    } }
    const [saved, setSaved] = useState(() => readIds('fc.saved')), [followed, setFollowed] = useState(() => readIds('fc.followed')), [query, setQuery] = useState(''), [category, setCategory] = useState('All'), [notice, setNotice] = useState(''), [storeFilter, setStoreFilter] = useState(''), [sort, setSort] = useState('featured');
    const [recovered] = useState(storageRecoveryNeeded);
    const choices = useRef({ stores, saved, followed });
    const go = (path: string) => { location.hash = scopeHref('#' + path, brandId); };
    useEffect(() => { const handler = () => { setHash(location.hash); setQuery(''); setCategory('All'); setStoreFilter(''); setSort('featured'); window.scrollTo(0, 0); }; addEventListener('hashchange', handler); return () => removeEventListener('hashchange', handler); }, []);
    useEffect(() => { const abort = new AbortController(); setDirectoryError(''); loadSources(abort.signal).then(setSources).catch(() => { if (!abort.signal.aborted)
        setDirectoryError('Demo store directory unavailable.'); }); return () => abort.abort(); }, [retry]);
    useEffect(() => { const abort = new AbortController(); const active = stores.filter(s => s.enabled); setLoads(Object.fromEntries(active.map(s => [s.id, { status: 'loading' }]))); for (const s of active)
        loadCatalogue(s.id, abort.signal).then(brand => { if (!abort.signal.aborted)
            setLoads(old => ({ ...old, [s.id]: { status: 'ready', brand } })); }).catch(e => { if (!abort.signal.aborted)
            setLoads(old => ({ ...old, [s.id]: { status: 'error', error: e.message } })); }); return () => abort.abort(); }, [stores, retry]);
    useEffect(() => { void withStorageLock(COMMERCE_KEY, () => localCommerceRepository.write(stateRef.current)).catch(e => setStorageIssue(e instanceof Error ? e.message : 'Stored data could not be saved.')); }, []);
    useEffect(() => { const handler = (e: StorageEvent) => { if (e.key === null || ['fc.commerce.v2', STORES_KEY, 'fc.saved', 'fc.followed'].includes(e.key))
        setStorageIssue('Browser data changed in another tab. Reload to use the latest saved records.'); }; addEventListener('storage', handler); return () => removeEventListener('storage', handler); }, []);
    useEffect(() => { const main = document.getElementById('main-content'); if (main && !main.contains(document.activeElement))
        main.focus({ preventScroll: true }); }, [route]);
    const enabled = stores.filter(s => s.enabled), brands = enabled.flatMap(s => loads[s.id]?.brand ? [loads[s.id].brand!] : []), products = brands.flatMap(b => b.products), loading = enabled.some(s => !loads[s.id] || loads[s.id].status === 'loading');
    const brand = brands.find(b => b.id === brandId);
    const productId = route.startsWith('/product/') ? decodeRoute(route.slice(9)) || '' : '', product = products.find(p => p.id === productId && (!brandId || p.brandId === brandId)), isSaved = route === '/saved';
    const isHome = route === '/' && !brandId;
    const scopedProducts = brandId ? products.filter(p => p.brandId === brandId) : products;
    const scopedState = brandId ? { ...state, cart: state.cart.filter(line => line.brandId === brandId) } : state;
    const brandName = brand?.name || sources.find(s => s.key === brandId)?.name || 'Brand Centre';
    const effectiveSort = isHome ? 'featured' : sort;
    const relevant = brandId ? products.filter(p => p.brandId === brandId) : products;
    const list = selectProducts(relevant, isHome ? '' : storeFilter, query, category).filter(p => !isSaved || saved.includes(p.id));
    if (effectiveSort === 'newest') list.sort((a,b)=>(b.createdAt?Date.parse(b.createdAt):0)-(a.createdAt?Date.parse(a.createdAt):0));
    if (effectiveSort === 'name')
        list.sort((a, b) => a.name.localeCompare(b.name));
    if (effectiveSort === 'price')
        list.sort((a, b) => (a.variants[0]?.currency || '').localeCompare(b.variants[0]?.currency || '') || (Number(a.variants[0]?.amount ?? Infinity) - Number(b.variants[0]?.amount ?? Infinity)));
    const knownRoute = ['/', '/owner', '/merchant', '/login', '/cart', '/orders', '/profile', '/try', '/brands', '/saved'].includes(route) || /^\/(brand|product|checkout|try|orders|photos)\/[^/]+$/.test(route) && decodeRoute(route.slice(route.indexOf('/', 1) + 1)) !== null;
    const unavailableSaved = saved.filter(id => (!brandId || id.startsWith(brandId + ':')) && !products.some(p => p.id === id));
    const categories = [...new Set(relevant.map(p => p.category).filter(Boolean))], hero = brand?.products.find(p => p.image) || products.find(p => p.image);
    async function save(id: string) { try {
        await withStorageLock('fc.saved', () => { const next = toggleId(choices.current.saved, id); writeStored('fc.saved', next); choices.current.saved = next; setSaved(next); });
    }
    catch (e) {
        setStorageIssue(e instanceof Error ? e.message : 'Saved choices could not be persisted.');
    } }
    async function follow(id: string) { try {
        await withStorageLock('fc.followed', () => { const next = toggleId(choices.current.followed, id); writeStored('fc.followed', next); choices.current.followed = next; setFollowed(next); });
    }
    catch (e) {
        setStorageIssue(e instanceof Error ? e.message : 'Followed choices could not be persisted.');
    } }
    function onboard(id: string) { if (!sources.some(s => s.key === id))
        return; changeStores(old => old.some(s => s.id === id) ? old.map(s => s.id === id ? { ...s, enabled: true } : s) : [...old, { id, enabled: true, onboardedAt: new Date().toISOString() }]); }
    const issues = <>{enabled.map(s => loads[s.id]?.status === 'error' && <div className="demo-note" role="alert" key={s.id}><strong>{sources.find(x => x.key === s.id)?.name || s.id}</strong><p>{loads[s.id].error}</p><button onClick={() => setRetry(n => n + 1)}>Retry catalogue</button></div>)}{loading && <p role="status">Loading onboarded catalogues…</p>}</>;
    const cards = <div className="products">{list.map(p => <article className="product" key={p.id}><div className="product-photo"><BrandLink className="photo-link" href={productPath(p.id)}>{p.image ? <CatalogueImage key={p.image} src={p.image} alt={p.name} loading="lazy" referrerPolicy="no-referrer"/> : <span className="no-image">No product image supplied</span>}</BrandLink><button className={'save ' + (saved.includes(p.id) ? 'selected' : '')} aria-label={(saved.includes(p.id) ? 'Unsave ' : 'Save ') + p.name} aria-pressed={saved.includes(p.id)} onClick={() => save(p.id)}>{saved.includes(p.id) ? '♥' : '♡'}</button></div><p className="eyebrow">{p.brandName}</p><BrandLink className="product-title" href={productPath(p.id)}>{p.name}</BrandLink><p className="price">{p.variants[0] ? money(Number(p.variants[0].amount), p.variants[0].currency) : 'No variants supplied'}</p><small>{p.variants.some(v => v.available) ? 'Demo catalogue availability' : 'Unavailable'}</small></article>)}</div>;
    const directory = <div className="brand-grid">{brands.map(b => <BrandLink href={'#/brand/' + b.id} key={b.id}>{b.image && <CatalogueImage key={b.image} src={b.image} alt={b.name + ' catalogue selection'} referrerPolicy="no-referrer"/>}<div><strong>{b.name}</strong><span>{b.products.length} loaded products{b.more ? ' · Partial catalogue' : ''}</span><b>Visit demo store →</b></div></BrandLink>)}</div>;
    return <BrandContext.Provider value={brandId}><BrandLink className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</BrandLink><div className="announcement">{brandId ? brandName : 'FASHION CENTRE'} <span>Onboarded demo catalogues · No live purchases</span></div><header><BrandLink className="logo" href="#/">{brandId ? brandName : 'Fashion Centre'}</BrandLink><nav className="desktop-nav"><BrandLink href="#/">Discover</BrandLink><BrandLink href="#/brands">Brands</BrandLink><BrandLink href={brandId ? '#/profile' : '#/merchant'}>{brandId ? 'Settings' : 'Demo stores'}</BrandLink><BrandLink href="#/orders">Orders</BrandLink></nav>{!brandId && <BrandLink className="owner-entry" href="#/owner">For brands</BrandLink>}<BrandLink className="header-cart" href="#/cart" aria-label="Cart">Bag <span>{scopedState.cart.reduce((n, l) => n + l.quantity, 0)}</span></BrandLink></header><main id="main-content" tabIndex={-1} className={route === '/' ? 'discovery' : ''}>
 {storageIssue && <div className="storage-warning" role="alert"><strong>Changes need your attention.</strong><p>{storageIssue}</p><p>No newer saved records have been overwritten. Reload before continuing.</p><button className="secondary" onClick={() => location.reload()}>Reload saved data</button></div>}
 {recovered && <p className="demo-note">Some stored records needed recovery. Valid records remain available; original data is preserved before any repaired save.</p>}
 {brandId && <div className="brand-mode"><strong>{brandName}</strong><span>Brand Centre</span><BrandLink global href="#/">Back to Fashion Centre</BrandLink><BrandLink global href="#/brands">Switch brand</BrandLink></div>}{brandId && (route.startsWith('/orders') || ['/profile','/owner','/merchant'].includes(route)) && <p className="demo-note">{route.startsWith('/orders') ? 'All-store order history: each record retains its original store and currency.' : route === '/profile' ? 'Settings, followed stores and order history are shared across stores. Cart and saved pieces below are for ' + brandName + '.' : 'Shared browser settings and management. Shopping stays in ' + brandName + '.'}</p>}{!knownRoute ? <section className="commerce-empty"><h1>Page not found.</h1><p>This link is invalid or no longer available. Your saved records are unchanged.</p><BrandLink global className="primary" href="#/">Return to Fashion Centre</BrandLink></section> : route === '/owner' ? <MerchantDashboard /> : route === '/merchant' ? <section className="commerce-page"><p className="eyebrow">LOCAL DEMO ONBOARDING</p><h1>Choose your demo stores.</h1><p>Add an allowlisted public Mock Shop catalogue to this browser. This is not Shopify merchant authorization.</p>{!sources.length && !directoryError && <p role="status">Loading demo store directory…</p>}{directoryError && <div role="alert">{directoryError}<button onClick={() => setRetry(n => n + 1)}>Retry directory</button></div>}<div className="onboard-grid">{sources.map(s => { const entry = stores.find(x => x.id === s.key); return <article className="commerce-panel" key={s.key}><h2>{s.name}</h2><p>{entry?.enabled ? 'Onboarded in this browser' : entry ? 'Disabled · History retained' : 'Not onboarded'}</p>{entry?.enabled ? <button className="secondary" onClick={() => changeStores(old => old.map(x => x.id === s.key ? { ...x, enabled: false } : x))}>Disable {s.name}</button> : <button className="primary" onClick={() => onboard(s.key)}>{entry ? 'Enable ' : 'Onboard '}{s.name}</button>}</article>; })}</div>{issues}<p className="demo-note">Disabling a store hides its products. Cart items, saved IDs, preferences and your demo orders remain stored. Re-enable to fetch its catalogue again. Catalogue reads only; no public cart mutations, real connection, payment or order synchronization.</p><BrandLink className="primary" href="#/">Browse onboarded stores</BrandLink></section> :
            route.startsWith('/photos/') ? <CataloguePhotoViewer key={route} products={scopedProducts} initialId={decodeRoute(route.slice(8)) || ''} close={() => go('/product/' + route.slice(8))}/> : route === '/login' ? <LoginDemo close={() => go('/profile')}/> :
                route === '/cart' ? <>{issues}<CartScreen state={scopedState} dispatch={dispatch} products={scopedProducts}/></> :
                    route.startsWith('/checkout/') ? <>{issues}<CheckoutScreen key={route} state={scopedState} dispatch={dispatch} products={scopedProducts} brandId={decodeRoute(route.slice(10)) || ''} go={go}/></> :
                        route === '/orders' || route.startsWith('/orders/') ? <OrdersScreen state={state} orderId={decodeRoute(route.split('/')[2] || '') || undefined}/> :
                            route === '/profile' ? <ProfileScreen state={scopedState} dispatch={dispatch} saved={saved} followed={followed} unfollow={follow} products={scopedProducts} brands={brands}/> :
                                route.startsWith('/try') ? <TryOnPreparation key={route} products={scopedProducts} initialId={route.startsWith('/try/') ? decodeRoute(route.slice(5)) || '' : ''}/> :
                                    productId ? <>{issues}{product ? <ProductDetail key={product.id} product={product} save={() => save(product.id)} saved={saved.includes(product.id)} add={async (key) => { if (await dispatch({ type: 'add', product, variantKey: key }))
                                        setNotice('Added to your local demo cart.');
                                    else
                                        setNotice('Not added. Check the quantity limit or storage message.'); }}/> : !loading && <Empty title="Product unavailable" detail="Its store may be disabled, its catalogue unavailable, or this product is outside the loaded page. Existing cart and order records are preserved."/>}</> :
                                        route === '/brands' ? <section className="commerce-page"><p className="eyebrow">YOUR ONBOARDED STORES</p><h1>Brand Centre.</h1>{issues}{directory}{!brands.length && !loading && <Empty title="No catalogue to show yet." detail="Onboard a demo store to begin."/>}<BrandLink href="#/merchant" className="primary">Manage demo stores</BrandLink></section> :
                                            brandId && !brand && !loading ? <>{issues}<Empty title="This store is unavailable." detail="Re-enable its catalogue or return to Brand Centre. Products from other stores are not shown here."/></> :
                                                <>{issues}{!enabled.length && !isSaved ? <Empty title="Your Fashion Centre starts here." detail="Choose a demo store to fill your centre with its fetched products."/> : <><section className="intro"><p className="eyebrow">{isSaved ? 'YOUR SAVED SELECTION' : 'CURATED BY YOUR CHOICES'}</p><h1>{isSaved ? 'Saved pieces.' : brand?.name || 'Discover your next favourite.'}</h1>{brand && <button className="secondary" aria-pressed={followed.includes(brand.id)} onClick={() => follow(brand.id)}>{followed.includes(brand.id) ? 'Following' : 'Follow store'}</button>}<label className="search"><input aria-label="Search catalogue" placeholder={brandId ? 'Search this brand' : 'Search products and stores'} value={query} onChange={e => setQuery(e.target.value)}/></label>{!isHome && <div className="catalogue-controls">{!brandId && <label>Store<select aria-label="Filter by store" value={storeFilter} onChange={e => setStoreFilter(e.target.value)}><option value="">All onboarded stores</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}<label>Sort products<select value={sort} onChange={e => setSort(e.target.value)}><option value="featured">Catalogue order</option>{relevant.some(p=>p.createdAt)&&<option value="newest">Newest in catalogue</option>}<option value="name">Name A–Z</option><option value="price">Price: low to high, grouped by currency</option></select></label>{(query || category !== 'All' || storeFilter) && <button className="secondary" onClick={() => { setQuery(''); setCategory('All'); setStoreFilter(''); }}>Clear filters</button>}</div>}</section>{!isSaved && hero && (!brandId || brand) && <section className="hero catalogue-hero"><CatalogueImage key={hero.image} src={hero.image} alt={hero.name + ' from ' + hero.brandName} referrerPolicy="no-referrer"/><BrandLink className="campaign-caption" href={productPath(hero.id)}><span>FROM {hero.brandName}</span><strong>{hero.name}</strong></BrandLink></section>}{!isSaved && categories.length > 0 && <section className="categories" aria-label="Shop categories"><button aria-pressed={category === 'All'} onClick={() => setCategory('All')}>All products</button>{categories.map(c => { const image = relevant.find(p => p.category === c && p.image)?.image; return <button key={c} aria-pressed={c === category} className={c === category ? 'chosen' : ''} onClick={() => setCategory(c)}>{image && <CatalogueImage key={image} src={image} alt=""/>}<span>{c}</span></button>; })}</section>}<section><div className="section-title"><h2>{isSaved ? 'Saved catalogue items' : effectiveSort==='newest' ? 'New arrivals' : category === 'All' ? 'The collection' : category}</h2><span>{list.length} loaded products</span>{!isHome&&!isSaved&&relevant.some(p=>p.createdAt)&&effectiveSort!=='newest'&&<button className="secondary" onClick={()=>setSort('newest')}>View new arrivals</button>}</div>{cards}{!loading && !list.length && <p className="empty">No matching products in the loaded catalogue.</p>}{brands.some(b => b.more) && <p className="fine">Bounded preview: up to 48 products per store. Additional products may exist.</p>}{isSaved && unavailableSaved.length > 0 && <div className="commerce-panel"><h2>Unavailable saved items</h2><p>These references are retained. Re-enable their store to see current details, or remove a reference yourself.</p>{unavailableSaved.map((id, i) => <div className="unavailable-reference" key={id}><span>Saved reference {i + 1}<small>{id}</small></span><button className="secondary" onClick={() => save(id)}>Remove saved reference {i + 1}</button></div>)}</div>}</section>{!brandId && !isSaved && <section><div className="section-title"><h2>Shop by stores</h2><BrandLink href="#/merchant">Manage stores</BrandLink></div>{directory}</section>}</>}</>}
 <footer><BrandLink className="logo" href="#/">{brandId ? brandName : 'Fashion Centre'}</BrandLink><p>{brandId ? 'Your selected Brand Centre.' : 'Only your onboarded demo catalogues.'}</p><small>Public Mock Shop products, prices and availability are fictional. No real purchases or authentication.</small></footer></main><nav className="bottom-nav" aria-label="Main navigation">{[['/', 'discover', 'Discover'], ['/brands', 'brands', 'Brands'], ['/try', 'try', 'Try on'], ['/saved', 'saved', 'Saved'], ['/profile', 'profile', 'Profile']].map(([path, icon, label]) => <BrandLink href={'#' + path} key={path} aria-current={(route === path || (path === '/' && route === '/brand/' + brandId) || (path === '/try' && route.startsWith('/try/'))) ? 'page' : undefined} className={route === path ? 'active' : ''}><img className="nav-icon" src={'/images/' + icon + '.svg'} alt=""/><span>{label}</span></BrandLink>)}</nav>{notice && <div role="status" className="toast" onClick={() => setNotice('')}>{notice} <button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}</BrandContext.Provider>;
}
function Empty({ title, detail }: {
    title: string;
    detail: string;
}) { return <section className="commerce-empty"><p className="eyebrow">YOUR STORES. YOUR SELECTION.</p><h1>{title}</h1><p>{detail}</p><BrandLink className="primary" href="#/merchant">Manage demo stores</BrandLink></section>; }
function ProductDetail({ product: p, saved, save, add }: {
    product: Product;
    saved: boolean;
    save: () => void;
    add: (key: string) => void;
}) {
    const [key, setKey] = useState(p.variants.find(v => v.available)?.key || p.variants[0]?.key || '');
    const variant = p.variants.find(v => v.key === key);
    return <section className="detail"><BrandLink className="back" href={'#/brand/' + p.brandId}>← {p.brandName}</BrandLink><div className="detail-grid">{p.image ? <CatalogueImage key={p.image} src={p.image} alt={p.name} referrerPolicy="no-referrer"/> : <p>No product image supplied.</p>}<div><p className="eyebrow">{p.brandName}</p><h1>{p.name}</h1><p>{p.category}</p>{p.description&&<p className="product-description">{p.description}</p>}{p.image && <BrandLink className="secondary wide" href={'#/photos/' + encodeURIComponent(p.id)}>View catalogue photos full screen</BrandLink>}<label>Variant<select aria-label="Select variant" value={key} onChange={e => setKey(e.target.value)}>{p.variants.map(v => <option key={v.key} value={v.key}>{v.title}{p.variants.filter(other => other.title === v.title).length > 1 ? ' — ' + Object.entries(v.options).map(([name, value]) => name + ': ' + value).join(', ') : ''}{v.available ? '' : ' — unavailable'}</option>)}</select></label>{variant && <h2>{money(Number(variant.amount), variant.currency)}</h2>}<button className="primary wide" disabled={!variant?.available} onClick={() => variant && add(variant.key)}>Add to demo cart</button><BrandLink className="cart-detail-link" href="#/cart">View your cart →</BrandLink><BrandLink className="secondary wide try-prepare-link" href={'#/try/' + encodeURIComponent(p.id)}>Prepare a try-on photo</BrandLink><button className="secondary wide" onClick={save}>{saved ? 'Unsave piece' : 'Save piece'}</button>{p.moreVariants && <p>Additional variants exist outside this preview.</p>}<p className="demo-note">Fictional catalogue availability. This product photo is not a try-on result. Demo orders are recorded locally; nothing is sent to this store.</p></div></div></section>;
}
createRoot(document.getElementById('app')!).render(<ThemeProvider><App /></ThemeProvider>);
