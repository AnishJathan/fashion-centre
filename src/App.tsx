import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { TryOnPreparation } from './TryOnPreparation';
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
  const [directory, setDirectory] = useState<Directory>({ status: 'loading', sources: [] });
  const [loads, setLoads] = useState<Record<string, CatalogueLoad>>({});
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setDirectory(current => ({ ...current, status: 'loading' }));
    void loadSources(controller.signal).then(sources => {
      if (!controller.signal.aborted) setDirectory({ status: 'ready', sources });
    }).catch(() => {
      if (!controller.signal.aborted) setDirectory(current => ({ ...current, status: 'error' }));
    });
    return () => controller.abort();
  }, [retryCount]);

  useEffect(() => {
    const controller = new AbortController();
    const enabled = stores.filter(store => store.enabled);
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
  }, [stores, retryCount]);

  const enabled = stores.filter(store => store.enabled);
  const brands = enabled.flatMap(store => {
    const load = loads[store.id];
    return load?.status === 'ready' ? [load.brand] : [];
  });
  const errors = enabled.flatMap(store => {
    const load = loads[store.id];
    return load?.status === 'error' ? [{ id: store.id, message: load.error }] : [];
  });
  const loading = enabled.some(store => !loads[store.id] || loads[store.id].status === 'loading');

  return { directory, hasEnabledStores: enabled.length > 0, brands, loading, errors, retry: () => setRetryCount(n => n + 1) };
}

const navigationLinks = [
  ['/', 'discover', 'Discover'],
  ['/brands', 'brands', 'Brands'],
  ['/try', 'try', 'Try on'],
  ['/saved', 'saved', 'Saved'],
  ['/profile', 'profile', 'Profile'],
];

function AppShell({ route, brandId, brandName, cartQuantity, children, overlay }: {
  route: string;
  brandId: string;
  brandName: string;
  cartQuantity: number;
  children: ReactNode;
  overlay: ReactNode;
}) {
  const title = brandId ? brandName : 'Fashion Centre';
  return (
    <BrandContext.Provider value={brandId}>
      <BrandLink className="skip-link" href="#main-content" onClick={event => {
        event.preventDefault();
        document.getElementById('main-content')?.focus();
      }}>Skip to content</BrandLink>
      <div className="announcement">
        {brandId ? brandName : 'FASHION CENTRE'} <span>Onboarded demo catalogues · No live purchases</span>
      </div>
      <header>
        <BrandLink className="logo" href="#/">{title}</BrandLink>
        <nav className="desktop-nav">
          <BrandLink href="#/">Discover</BrandLink>
          <BrandLink href="#/brands">Brands</BrandLink>
          <BrandLink href={brandId ? '#/profile' : '#/merchant'}>{brandId ? 'Settings' : 'Demo stores'}</BrandLink>
          <BrandLink href="#/orders">Orders</BrandLink>
        </nav>
        {!brandId && <BrandLink className="owner-entry" href="#/owner">For brands</BrandLink>}
        <BrandLink className="header-cart" href="#/cart" aria-label="Cart">Bag <span>{cartQuantity}</span></BrandLink>
      </header>
      <main id="main-content" tabIndex={-1} className={route === '/' ? 'discovery' : ''}>
        {children}
        <footer>
          <BrandLink className="logo" href="#/">{title}</BrandLink>
          <p>{brandId ? 'Your selected Brand Centre.' : 'Only your onboarded demo catalogues.'}</p>
          <small>Public Mock Shop products, prices and availability are fictional. No real purchases. Account sign-in and saved-photo try-on require configured services.</small>
        </footer>
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {navigationLinks.map(([path, icon, label]) => {
          const isCurrent = route === path ||
            (path === '/' && route === '/brand/' + brandId) ||
            (path === '/try' && route.startsWith('/try/'));
          return (
            <BrandLink href={'#' + path} key={path} aria-current={isCurrent ? 'page' : undefined} className={route === path ? 'active' : ''}>
              <img className="nav-icon" src={'/images/' + icon + '.svg'} alt="" />
              <span>{label}</span>
            </BrandLink>
          );
        })}
      </nav>
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
      <BrandLink className="primary" href="#/merchant">Manage demo stores</BrandLink>
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
  const { directory, hasEnabledStores, brands, loading, errors, retry } = useCatalogues(stores);
  const { route, brandId } = parseNavigation(hash);
  const parameterMatch = route.match(routeWithId);
  const parameter = parameterMatch ? decodeRoute(parameterMatch[2]) : null;
  const page = parameter !== null && parameterMatch ? '/' + parameterMatch[1] : route;

  useEffect(() => {
    function onHashChange() {
      setHash(location.hash);
      setTryOnProduct(null);
      window.scrollTo(0, 0);
    }
    addEventListener('hashchange', onHashChange);
    return () => removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const main = document.getElementById('main-content');
    if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
  }, [route]);

  const brand = brands.find(store => store.id === brandId);
  const brandName = brand?.name ?? directory.sources.find(source => source.key === brandId)?.name ?? 'Brand Centre';
  const scopedProducts = (brandId ? brands.filter(store => store.id === brandId) : brands).flatMap(store => store.products);
  const scopedState = brandId ? { ...state, cart: state.cart.filter(line => line.brandId === brandId) } : state;
  const cartQuantity = scopedState.cart.reduce((sum, line) => sum + line.quantity, 0);

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
          <ProfileScreen
            state={scopedState} dispatch={dispatch} saved={saved} followed={followed}
            unfollow={changeFollowed} products={scopedProducts} brands={brands}
          />
        );
      case '/try':
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
            <p className="eyebrow">YOUR ONBOARDED STORES</p>
            <h1>Brand Centre.</h1>
            {catalogueIssues}
            <CatalogueDirectory brands={brands} />
            {!brands.length && !loading && <Empty title="No catalogue to show yet." detail="Onboard a demo store to begin." />}
            <BrandLink href="#/merchant" className="primary">Manage demo stores</BrandLink>
          </section>
        );
      default:
        return (
          <>
            {catalogueIssues}
            {brandId && !brand && !loading ? (
              <Empty title="This store is unavailable." detail="Re-enable its catalogue or return to Brand Centre. Products from other stores are not shown here." />
            ) : !hasEnabledStores && route !== '/saved' ? (
              <Empty title="Your Fashion Centre starts here." detail="Choose a demo store to fill your centre with its fetched products." />
            ) : (
              <CatalogueBrowser
                key={hash}
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
      route={route} brandId={brandId} brandName={brandName} cartQuantity={cartQuantity}
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
      {brandId && (
        <div className="brand-mode">
          <strong>{brandName}</strong>
          <span>Brand Centre</span>
          <BrandLink global href="#/">Back to Fashion Centre</BrandLink>
          <BrandLink global href="#/brands">Switch brand</BrandLink>
        </div>
      )}
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
