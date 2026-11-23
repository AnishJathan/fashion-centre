import { lazy, Suspense, useMemo, useEffect, useRef, useState, type ReactNode } from 'react';
import { parseNavigation, scopeHref } from './navigationScope';
import { BrandContext, BrandLink } from './StoreNavigation';
import { decodeRoute, loadCatalogue, loadSources, readIds, readStores, STORES_KEY, toggleId, type Brand, type Product, type StoreRegistration } from './domain';
import { assertStoredCurrent, storageRecoveryNeeded, withStorageLock, writeStored } from './browserStorage';
import { COMMERCE_KEY, commerceReducer, localCommerceRepository, type CommerceAction } from './commerce';
import { CartScreen, CheckoutScreen, OrdersScreen, ProfileScreen } from './CommerceScreens';
import { LoginSimulation } from './LoginSimulation';
import { TryOnPanel } from './TryOnPanel';
import { CataloguePhotoViewer } from './CataloguePhotoViewer';
import { MerchantDashboard } from './MerchantDashboard';
import { useBrowsingHistory } from './useBrowsingHistory';
import { TryOnStudio } from './TryOnStudio';
import { TryOnPreparation } from './TryOnPreparation';
import { monogramPath } from '../mobile/src/brandIcon';
import { primaryNavigation } from '../mobile/src/primaryNavigation';
import { visibleBadgeCount } from '../mobile/src/design';
import { EditorialCover } from './EditorialCover';
import { CatalogueBrowser, CatalogueDirectory } from './CatalogueBrowser';
import { ProductDetail } from './ProductDetail';
import { StoreManagement, type Directory } from './StoreManagement';

const AccountScreen = lazy(() => import('./AccountScreen'));

const SAVED_KEY = 'fc.saved';
const FOLLOWED_KEY = 'fc.followed';
const shoppingKeys = [COMMERCE_KEY, STORES_KEY, SAVED_KEY, FOLLOWED_KEY];

const simpleRoutes = new Set([
  '/', '/owner', '/merchant', '/login', '/login-demo', '/cart', '/orders', '/profile', '/try', '/brands', '/saved',
]);
const routeWithId = /^\/(brand|product|checkout|try|orders|photos)\/([^/]+)$/;

type CatalogueLoad =
  | { status: 'loading' }
  | { status: 'ready'; brand: Brand }
  | { status: 'error'; error: string };

function useBrowserShopping() {
  const [state, setState] = useState(() => localCommerceRepository.read());
  const [stores, setStores] = useState(readStores);
  const [saved, setSaved] = useState(() => readIds(SAVED_KEY));
  const [followed, setFollowed] = useState(() => readIds(FOLLOWED_KEY));
  const [recovered] = useState(storageRecoveryNeeded);
  const [storageIssue, setStorageIssue] = useState('');
  const commerce = useRef(state);
  const choices = useRef({ stores, saved, followed });

  async function dispatch(action: CommerceAction) {
    try {
      return await withStorageLock(COMMERCE_KEY, () => {
        if (action.type === 'add' || action.type === 'checkout') assertStoredCurrent(STORES_KEY);
        const next = commerceReducer(commerce.current, action);
        if (next === commerce.current) return false;
        localCommerceRepository.write(next);
        commerce.current = next;
        setState(next);
        return true;
      });
    } catch (error) {
      setStorageIssue(error instanceof Error ? error.message : 'Browser storage unavailable. Your change was not saved.');
      return false;
    }
  }

  async function changeStores(update: (previous: StoreRegistration[]) => StoreRegistration[]) {
    try {
      await withStorageLock(STORES_KEY, () => {
        const next = update(choices.current.stores);
        writeStored(STORES_KEY, next);
        choices.current.stores = next;
        setStores(next);
      });
    } catch (error) {
      setStorageIssue(error instanceof Error ? error.message : 'Store choices could not be saved.');
    }
  }

  async function changeSaved(id: string) {
    try {
      await withStorageLock(SAVED_KEY, () => {
        const next = toggleId(choices.current.saved, id);
        writeStored(SAVED_KEY, next);
        choices.current.saved = next;
        setSaved(next);
      });
    } catch (error) {
      setStorageIssue(error instanceof Error ? error.message : 'Saved choices could not be persisted.');
    }
  }

  async function changeFollowed(id: string) {
    try {
      await withStorageLock(FOLLOWED_KEY, () => {
        const next = toggleId(choices.current.followed, id);
        writeStored(FOLLOWED_KEY, next);
        choices.current.followed = next;
        setFollowed(next);
      });
    } catch (error) {
      setStorageIssue(error instanceof Error ? error.message : 'Followed choices could not be persisted.');
    }
  }

  useEffect(() => {
    // Persist a migrated version of legacy records under the same lock as normal edits.
    void withStorageLock(COMMERCE_KEY, () => localCommerceRepository.write(commerce.current)).catch(error => {
      setStorageIssue(error instanceof Error ? error.message : 'Stored data could not be saved.');
    });

    function onStorage(event: StorageEvent) {
      if (event.key === null || shoppingKeys.includes(event.key)) {
        setStorageIssue('Browser data changed in another tab. Reload to use the latest saved records.');
      }
    }
    addEventListener('storage', onStorage);
    return () => removeEventListener('storage', onStorage);
  }, []);

  return { state, stores, saved, followed, recovered, storageIssue, dispatch, changeStores, changeSaved, changeFollowed };
}

function useCatalogues(stores: StoreRegistration[]) {
  const [marketplace, setMarketplace] = useState(false);
  const [directory, setDirectory] = useState<Directory>({ status: 'loading', sources: [] });
  const [loads, setLoads] = useState<Record<string, CatalogueLoad>>({});
  const [retryCount, setRetryCount] = useState(0);
  useEffect(()=>{const refresh=()=>setRetryCount(n=>n+1);window.addEventListener('store-directory-changed',refresh);return ()=>window.removeEventListener('store-directory-changed',refresh);},[]);

  useEffect(() => {
    const controller = new AbortController();
    setDirectory(current => ({ ...current, status: 'loading' }));
    void loadSources(controller.signal, setMarketplace).then(sources => {
      if (!controller.signal.aborted) setDirectory({ status: 'ready', sources });
    }).catch(() => {
      if (!controller.signal.aborted) setDirectory(current => ({ ...current, status: 'error' }));
    });
    return () => controller.abort();
  }, [retryCount]);

  const effectiveStores = useMemo(() => [
    ...stores, ...directory.sources.filter(source=>(source.preview || source.key.startsWith('shop-'))&&!stores.some(store=>store.id===source.key)).map(source=>({id:source.key,enabled:true}))
  ],[stores,directory.sources]);
  useEffect(() => {
    const controller = new AbortController();
    const enabled = effectiveStores.filter(store => store.enabled);
    setLoads(Object.fromEntries(enabled.map(store => [store.id, { status: 'loading' }])));
    for (const store of enabled) {
      void loadCatalogue(store.id, controller.signal).then(brand => {
        if (!controller.signal.aborted) setLoads(current => ({ ...current, [store.id]: { status: 'ready', brand } }));
      }).catch(error => {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : 'Catalogue unavailable.';
          setLoads(current => ({ ...current, [store.id]: { status: 'error', error: message } }));
        }
      });
    }
    return () => controller.abort();
  }, [effectiveStores, retryCount]);

  const enabled = effectiveStores.filter(store => store.enabled);
  const brands = enabled.flatMap(store => {
    const load = loads[store.id];
    return load?.status === 'ready' ? [load.brand] : [];
  });
  const errors = enabled.flatMap(store => {
    const load = loads[store.id];
    return load?.status === 'error' ? [{ id: store.id, message: load.error }] : [];
  });
  const loading = enabled.some(store => !loads[store.id] || loads[store.id].status === 'loading');

  return { marketplace, directory, hasEnabledStores: enabled.length > 0, brands, loading, errors, retry: () => setRetryCount(n => n + 1) };
}

function Monogram() {
  return <svg className="monogram" aria-hidden="true" focusable="false" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="50" fill="var(--accent)" />
    <path d={monogramPath} fill="var(--onAccent)" />
  </svg>;
}

function selectedDestination(route: string) {
  const section = route.split('/')[1];
  if (['try', 'try-on'].includes(section)) return 'prepare';
  if (['cart', 'orders', 'checkout'].includes(section)) return 'cart';
  if (['login', 'login-demo', 'saved', 'owner', 'profile'].includes(section)) return 'profile';
  if (['', 'brands', 'brand', 'product', 'photos', 'merchant'].includes(section)) return 'home';
}

function AppShell({ marketplace, route, brandId, brandName, cartQuantity, children, overlay }: {
  route: string;
  brandId: string;
  brandName: string;
  cartQuantity: number;
  marketplace: boolean;
  children: ReactNode;
  overlay: ReactNode;
}) {
  const title = brandId ? brandName : 'Fashion Centre';
  const selected = selectedDestination(route);
  let backLink: { href: string; label: string } | undefined;
  if (route.startsWith('/product/') && brandId) backLink = { href: '#/brand/' + brandId, label: brandName };
  else if (route.startsWith('/checkout/')) backLink = { href: '#/cart', label: 'Back to cart' };
  else if (route.startsWith('/orders/')) backLink = { href: '#/orders', label: 'All your demo orders' };
  else if (route === '/login-demo') backLink = { href: '#/profile', label: 'Back to Profile' };
  else if (route.startsWith('/try/')) backLink = { href: '#/try', label: 'Back to Try On' };
  else if (route === '/try' && !brandId) backLink = { href: '#/', label: 'Back to Discover' };
  const dock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = dock.current;
    if (!bar) return;
    const measure = () => bar.parentElement?.style.setProperty('--dock-clearance', bar.offsetHeight + 'px');
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar, { box: 'border-box' });
    return () => observer.disconnect();
  }, []);
  return (
    <BrandContext.Provider value={brandId}>
      <div className="app-shell">
      <div className="app-scroll" id="app-scroll">
      <BrandLink className="skip-link" href="#main-content" onClick={event => {
        event.preventDefault();
        document.getElementById('main-content')?.focus();
      }}>Skip to content</BrandLink>
      <div className="announcement">
        Independent stores · Separate baskets
      </div>
      <header>
        <BrandLink className="logo" href="#/"><Monogram /><span>{title}</span></BrandLink>
        <nav className="desktop-nav" aria-label="Shop">
          <BrandLink global={marketplace} href="#/">Discover</BrandLink>
          <BrandLink href="#/brands">Brands</BrandLink>
          {!marketplace && <BrandLink href={brandId ? '#/profile' : '#/merchant'}>{brandId ? 'Settings' : 'Demo stores'}</BrandLink>}
          <BrandLink href="#/orders">Orders</BrandLink>
          <BrandLink href="#/saved" aria-current={route === '/saved' ? 'page' : undefined}>Saved</BrandLink>
        </nav>
        {!brandId && <BrandLink className="owner-entry" href="#/owner">For brands</BrandLink>}
        <BrandLink global={brandId.startsWith('shop-')} className="header-cart" href="#/cart" aria-label="Cart">Bag <span>{cartQuantity}</span></BrandLink>
      </header>
      {(backLink || brandId) && <nav className={'return-row' + (brandId ? ' brand-mode' : '')} aria-label="Page navigation">
        {backLink && <BrandLink className="back" href={backLink.href}><span aria-hidden="true">←</span>{backLink.label}</BrandLink>}
        {brandId && <>
          <BrandLink global href="#/">{!backLink && <span aria-hidden="true">←</span>}Back to Fashion Centre</BrandLink>
          <BrandLink global href="#/brands">Switch brand</BrandLink>
        </>}
      </nav>}
      <main id="main-content" tabIndex={-1} className={route === '/' ? 'discovery' : ''}>
        <div className="page-content" key={route}>{children}</div>
        <footer>
          <BrandLink className="logo" href="#/"><Monogram /><span>{title}</span></BrandLink>
          <nav aria-label="More destinations">
            <BrandLink global href="#/brands">Brands</BrandLink>
            <BrandLink href="#/saved" aria-current={route === '/saved' ? 'page' : undefined}>Saved</BrandLink>
            <BrandLink href="#/orders">Orders</BrandLink>
            {!marketplace && <BrandLink href="#/merchant">Demo stores</BrandLink>}
          </nav>
          <small>Check out with each merchant for their payment methods and delivery options.{!marketplace && ' Mock Shop collections are for preview.'}</small>
        </footer>
      </main>
      </div>
      <div className="navigation-bar" ref={dock}>
      <nav className="bottom-nav" aria-label="Main navigation">
        {primaryNavigation.map(({ id, href, path, label }) => {
          const count = id === 'cart' ? cartQuantity : 0;
          return (
            <BrandLink global={(marketplace && id === 'home') || (brandId.startsWith('shop-') && ['home', 'cart', 'profile'].includes(id))} href={'#' + href} key={id} aria-current={selected === id ? 'page' : undefined}
              aria-label={count > 0 ? label + ', ' + count + (count === 1 ? ' piece' : ' pieces') : undefined}>
              <span className="nav-symbol" aria-hidden="true">
                <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d={path} />
                </svg>
                {count > 0 && <span className="nav-count">{visibleBadgeCount(count)}</span>}
              </span>
              <span className="nav-label">{label}</span>
            </BrandLink>
          );
        })}
      </nav>
      </div>
      </div>
      {overlay}
    </BrandContext.Provider>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="commerce-empty">
      <p className="eyebrow">YOUR STORES. YOUR SELECTION.</p>
      <h1>{title}</h1>
      <p>{detail}</p>
      <BrandLink global className="primary" href="#/brands">Browse stores</BrandLink>
    </section>
  );
}

export function App() {
  const [hash, setHash] = useState(location.hash);
  const [tryOnProduct, setTryOnProduct] = useState<Product | null>(null);
  const [notice, setNotice] = useState('');
  const {
    state, stores, saved, followed, recovered, storageIssue, dispatch, changeStores, changeSaved, changeFollowed,
  } = useBrowserShopping();
  const { marketplace, directory, hasEnabledStores, brands, loading, errors, retry } = useCatalogues(stores);
  const { route, brandId } = parseNavigation(hash);
  const parameterMatch = route.match(routeWithId);
  const parameter = parameterMatch ? decodeRoute(parameterMatch[2]) : null;
  const page = parameter !== null && parameterMatch ? '/' + parameterMatch[1] : route;

  useEffect(() => {
    function onHashChange() {
      setHash(location.hash);
      setTryOnProduct(null);
      document.getElementById('app-scroll')?.scrollTo(0, 0);
    }
    addEventListener('hashchange', onHashChange);
    return () => removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const main = document.getElementById('main-content');
    if (main && (!main.contains(document.activeElement) || document.activeElement?.closest('footer'))) {
      main.focus({ preventScroll: true });
    }
  }, [route]);

  const brand = brands.find(store => store.id === brandId);
  const brandName = brand?.name ?? directory.sources.find(source => source.key === brandId)?.name ?? 'Brand Centre';
  const scopedProducts = (brandId ? brands.filter(store => store.id === brandId) : brands).flatMap(store => store.products);
  const viewedProduct = page === '/product' ? scopedProducts.find(item => item.id === parameter) : undefined;
  const {history: browsing, clearHistory} = useBrowsingHistory(viewedProduct?.brandId || (page === '/brand' ? brand?.id : undefined), viewedProduct?.id);
  const scopedState = brandId ? { ...state, cart: state.cart.filter(line => line.brandId === brandId) } : state;
  const cartQuantity = (brandId.startsWith('shop-') ? state.cart : scopedState.cart).reduce((sum, line) => sum + line.quantity, 0);

  function go(path: string) {
    location.hash = scopeHref('#' + path, brandId);
  }

  function enableStore(id: string) {
    if (!directory.sources.some(source => source.key === id)) return;
    void changeStores(previous => previous.some(store => store.id === id)
      ? previous.map(store => store.id === id ? { ...store, enabled: true } : store)
      : [...previous, { id, enabled: true, onboardedAt: new Date().toISOString() }]);
  }

  const catalogueIssues = (
    <>
      {errors.map(({ id, message }) => (
        <div className="demo-note" role="alert" key={id}>
          <strong>{directory.sources.find(source => source.key === id)?.name ?? id}</strong>
          <p>{message}</p>
          <button onClick={retry}>Retry catalogue</button>
        </div>
      ))}
      {loading && <p role="status">Loading onboarded catalogues…</p>}
    </>
  );

  function renderPage() {
    if (parameter === null && !simpleRoutes.has(route)) {
      return (
        <section className="commerce-empty">
          <h1>Page not found.</h1>
          <p>This link is invalid or no longer available. Your saved records are unchanged.</p>
          <BrandLink global className="primary" href="#/">Return to Fashion Centre</BrandLink>
        </section>
      );
    }

    switch (page) {
      case '/owner':
        return <MerchantDashboard />;
      case '/merchant':
        if (marketplace) return <MerchantDashboard />;
        return (
          <StoreManagement
            directory={directory}
            stores={stores}
            enable={enableStore}
            disable={id => void changeStores(previous =>
              previous.map(store => store.id === id ? { ...store, enabled: false } : store))}
            retry={retry}
          >
            {catalogueIssues}
          </StoreManagement>
        );
      case '/photos':
        return (
          <CataloguePhotoViewer
            key={route}
            products={scopedProducts}
            initialId={parameter ?? ''}
            close={() => go('/product/' + encodeURIComponent(parameter ?? ''))}
          />
        );
      case '/login':
        return <Suspense fallback={<p role="status">Loading account…</p>}><AccountScreen close={() => go('/profile')} /></Suspense>;
      case '/login-demo':
        return <LoginSimulation close={() => go('/profile')} />;
      case '/cart':
        return <>{catalogueIssues}<CartScreen state={scopedState} dispatch={dispatch} products={scopedProducts} /></>;
      case '/checkout':
        return (
          <>
            {catalogueIssues}
            <CheckoutScreen key={route} state={scopedState} dispatch={dispatch} products={scopedProducts} brandId={parameter ?? ''} go={go} />
          </>
        );
      case '/orders':
        return <OrdersScreen state={state} orderId={parameter ?? undefined} />;
      case '/profile':
        return (
          <ProfileScreen marketplace={marketplace} clearHistory={clearHistory} hasHistory={!!(browsing.products.length || browsing.stores.length)}
            state={scopedState} dispatch={dispatch} saved={saved} followed={followed}
            unfollow={changeFollowed} products={scopedProducts} brands={brands}
          />
        );
      case '/try':
        if (!parameter) return <>{catalogueIssues}<TryOnStudio history={browsing} loading={loading} products={scopedProducts}
          brands={brandId ? brands.filter(store => store.id === brandId) : brands} /></>;
        return <TryOnPreparation key={route} products={scopedProducts} initialId={parameter ?? ''} />;
      case '/product': {
        const product = scopedProducts.find(item => item.id === parameter);
        return (
          <>
            {catalogueIssues}
            {product ? (
              <ProductDetail
                key={product.id}
                product={product}
                tryOn={() => setTryOnProduct(product)}
                saved={saved.includes(product.id)}
                toggleSaved={() => void changeSaved(product.id)}
                add={async variantKey => {
                  const added = await dispatch({ type: 'add', product, variantKey });
                  setNotice(added ? 'Added to your local demo cart.' : 'Not added. Check the quantity limit or storage message.');
                }}
              />
            ) : !loading && (
              <Empty
                title="Product unavailable"
                detail="Its store may be disabled, its catalogue unavailable, or this product is outside the loaded page. Existing cart and order records are preserved."
              />
            )}
          </>
        );
      }
      case '/brands':
        return (
          <section className="commerce-page">
            <p className="eyebrow">{marketplace ? 'INDEPENDENT STORES' : 'YOUR ONBOARDED STORES'}</p>
            <h1>Brand Centre.</h1>
            {catalogueIssues}
            <CatalogueDirectory brands={brands} />
            {!brands.length && !loading && <Empty title="No catalogue to show yet." detail="Published stores and their collections will appear here." />}
            {!marketplace && <BrandLink href="#/merchant" className="primary">Manage demo stores</BrandLink>}
          </section>
        );
      default:
        return (
          <>
            {catalogueIssues}
            {page === '/' && !brandId && !hasEnabledStores && <EditorialCover marketplace={marketplace} hasStores={hasEnabledStores} />}
            {brandId && !brand && !loading ? (
              <Empty title="This store is unavailable." detail="Re-enable its catalogue or return to Brand Centre. Products from other stores are not shown here." />
            ) : !hasEnabledStores && route !== '/saved' ? (
              <section className="discovery-tools" aria-label="Explore Fashion Centre">
                <BrandLink href="#/brands">Browse stores <span aria-hidden="true">↗</span></BrandLink>
                <BrandLink href="#/try">Try-on studio <span aria-hidden="true">↗</span></BrandLink>
                <BrandLink href="#/login">Your account <span aria-hidden="true">↗</span></BrandLink>
              </section>
            ) : (
              <CatalogueBrowser
                key={hash}
                editorial={page === '/' && !brandId ? <EditorialCover marketplace={marketplace} hasStores={hasEnabledStores} /> : undefined}
                mode={page === '/saved' ? 'saved' : brandId ? 'store' : 'home'}
                brandId={brandId}
                brands={brands}
                products={scopedProducts}
                loading={loading}
                saved={saved}
                followed={followed}
                toggleSaved={changeSaved}
                toggleFollowed={changeFollowed}
              />
            )}
          </>
        );
    }
  }

  return (
    <AppShell
      marketplace={marketplace} route={route} brandId={brandId} brandName={brandName} cartQuantity={cartQuantity}
      overlay={
        <>
          {notice && (
            <div role="status" className="toast">
              {notice} <button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button>
            </div>
          )}
          {tryOnProduct && <TryOnPanel key={tryOnProduct.id} product={tryOnProduct} onClose={() => setTryOnProduct(null)} />}
        </>
      }
    >
      {storageIssue && (
        <div className="storage-warning" role="alert">
          <strong>Changes need your attention.</strong>
          <p>{storageIssue}</p>
          <p>No newer saved records have been overwritten. Reload before continuing.</p>
          <button className="secondary" onClick={() => location.reload()}>Reload saved data</button>
        </div>
      )}
      {recovered && <p className="demo-note">Some stored records needed recovery. Valid records remain available; original data is preserved before any repaired save.</p>}
      {brandId && ['/orders', '/profile', '/owner', '/merchant'].includes(page) && (
        <p className="demo-note">
          {page === '/orders' ? 'All-store order history: each record retains its original store and currency.'
            : page === '/profile' ? 'Settings, followed stores and order history are shared across stores. Cart and saved pieces below are for ' + brandName + '.'
            : 'Shared browser settings and management. Shopping stays in ' + brandName + '.'}
        </p>
      )}
      {renderPage()}
    </AppShell>
  );
}
