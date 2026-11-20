import { useState } from 'react';
import { storeThumbnail } from '../mobile/src/storeThumbnail';
import { CatalogueImage } from './CatalogueImage';
import { money, productPath, selectProducts, type Brand, type Product } from './domain';
import { BrandLink } from './StoreNavigation';

export function CatalogueDirectory({ brands }: { brands: Brand[] }) {
  return (
    <div className="brand-grid">
      {brands.map(brand => (
        <BrandLink href={'#/brand/' + brand.id} key={brand.id}>
          {brand.image && (
            <CatalogueImage key={brand.image} src={storeThumbnail(brand.image)} alt={brand.name + ' catalogue selection'} referrerPolicy="no-referrer" />
          )}
          <div>
            <strong>{brand.name}</strong>
            <span>{brand.products.length} pieces{brand.more ? ' · Partial catalogue' : ''}</span>
            <b>{brand.id.startsWith("shop-") ? "Visit store" : "Visit demo store"} →</b>
          </div>
        </BrandLink>
      ))}
    </div>
  );
}

function CatalogueCards({ products, saved, toggleSaved }: {
  products: Product[];
  saved: string[];
  toggleSaved: (id: string) => void;
}) {
  return (
    <div className="products">
      {products.map(product => {
        const isSaved = saved.includes(product.id);
        const price = product.variants[0];
        const href = productPath(product.id);
        return (
          <article className="product" key={product.id}>
            <div className="product-photo">
              <BrandLink className="photo-link" href={href}>
                {product.image
                  ? <CatalogueImage key={product.image} src={product.image} alt={product.name} loading="lazy" referrerPolicy="no-referrer" />
                  : <span className="no-image">No product image supplied</span>}
              </BrandLink>
              <button
                className={isSaved ? 'save selected' : 'save'}
                aria-label={(isSaved ? 'Unsave ' : 'Save ') + product.name}
                aria-pressed={isSaved}
                onClick={() => toggleSaved(product.id)}
              >{isSaved ? '♥' : '♡'}</button>
            </div>
            <p className="eyebrow">{product.brandName}</p>
            <BrandLink className="product-title" href={href}>{product.name}</BrandLink>
            <p className="price">{price ? money(price.amount, price.currency) : 'No variants supplied'}</p>
            <small>{product.variants.some(variant => variant.available) ? 'Demo catalogue availability' : 'Unavailable'}</small>
          </article>
        );
      })}
    </div>
  );
}

type Sort = 'featured' | 'newest' | 'name' | 'price';

function sortProducts(products: Product[], sort: Sort) {
  if (sort === 'newest') {
    return products.sort((a, b) => (b.createdAt ? Date.parse(b.createdAt) : 0) - (a.createdAt ? Date.parse(a.createdAt) : 0));
  }
  if (sort === 'name') return products.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'price') {
    return products.sort((a, b) => {
      const first = a.variants[0], second = b.variants[0];
      return (first?.currency || '').localeCompare(second?.currency || '') ||
        (first?.amount ?? Infinity) - (second?.amount ?? Infinity);
    });
  }
  return products;
}

export function CatalogueBrowser({
  editorial, mode, brandId, brands, products, loading, saved, followed, toggleSaved, toggleFollowed,
}: {
  editorial?: React.ReactNode;
  mode: 'home' | 'store' | 'saved';
  brandId: string;
  brands: Brand[];
  products: Product[];
  loading: boolean;
  saved: string[];
  followed: string[];
  toggleSaved: (id: string) => void;
  toggleFollowed: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [storeFilter, setStoreFilter] = useState('');
  const [sort, setSort] = useState<Sort>('featured');

  const isHome = mode === 'home';
  const isSaved = mode === 'saved';
  const brand = brands.find(store => store.id === brandId);
  const brandFollowed = followed.includes(brandId);
  const categories = [...new Set(products.map(product => product.category).filter(Boolean))];
  const hasDates = products.some(product => product.createdAt);
  const list = sortProducts(
    selectProducts(products, storeFilter, query, category).filter(product => !isSaved || saved.includes(product.id)),
    sort,
  );
  // Use the products already scoped by the route. A store never advertises another store's hero image.
  const hero = products.find(product => product.image);
  const unavailableSaved = saved.filter(id =>
    (!brandId || id.startsWith(brandId + ':')) && !products.some(product => product.id === id),
  );

  function clearFilters() {
    setQuery('');
    setCategory('All');
    setStoreFilter('');
  }

  const storeDirectory = !!brands.length && <section className="home-storefronts" aria-label="Shop by stores">
          <div className="section-title"><h2>Shop by stores</h2><BrandLink global href="#/brands">All stores →</BrandLink></div>
          <CatalogueDirectory brands={brands} />
        </section>;
  const filtering = Boolean(query.trim()) || category !== "All";
  return (
    <div className="catalogue-layout">
      <div className="catalogue-filters">
        <section className={isHome ? "intro discovery-search" : "intro"}>
          {isHome ? <h2>Browse the catalogue</h2> : <h1>{isSaved ? 'Saved pieces.' : brand?.name || 'Catalogue'}</h1>}
          {brand && (
            <button className="secondary" aria-pressed={brandFollowed} onClick={() => toggleFollowed(brand.id)}>
              {brandFollowed ? 'Following' : 'Follow store'}
            </button>
          )}
          <input className="search"
              aria-label="Search catalogue"
              placeholder={brandId ? 'Search this brand' : 'Search products and stores'}
              value={query}
              onChange={event => setQuery(event.target.value)}
          />
          {!isHome && (
            <div className="catalogue-controls">
              {!brandId && (
                <label>Store
                  <select aria-label="Filter by store" value={storeFilter} onChange={event => setStoreFilter(event.target.value)}>
                    <option value="">All onboarded stores</option>
                    {brands.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </select>
                </label>
              )}
              <label>Sort products
                <select value={sort} onChange={event => setSort(event.target.value as Sort)}>
                  <option value="featured">Catalogue order</option>
                  {hasDates && <option value="newest">Newest in catalogue</option>}
                  <option value="name">Name A–Z</option>
                  <option value="price">Price: low to high, grouped by currency</option>
                </select>
              </label>
              {(query || category !== 'All' || storeFilter) && (
                <button className="secondary" onClick={clearFilters}>Clear filters</button>
              )}
            </div>
          )}
        </section>
        {!isHome && !isSaved && hero && (
          <section className="hero catalogue-hero">
            <CatalogueImage
              key={hero.image}
              src={hero.image}
              alt={hero.name + ' from ' + hero.brandName}
              referrerPolicy="no-referrer"
            />
            <BrandLink className="campaign-caption" href={productPath(hero.id)}>
              <span>FROM {hero.brandName}</span>
              <strong>{hero.name}</strong>
            </BrandLink>
          </section>
        )}
        {!isSaved && products.length > 0 && (
          <section className="categories" aria-label="Shop categories">
            <button aria-pressed={category === 'All'} onClick={() => setCategory('All')}>Shop all</button>
            {categories.map(name => {
              const image = products.find(product => product.category === name && product.image)?.image;
              return (
                <button
                  key={name}
                  aria-pressed={category === name}
                  className={category === name ? 'chosen' : ''}
                  onClick={() => setCategory(name)}
                >
                  {image && <CatalogueImage key={image} src={image} alt="" referrerPolicy="no-referrer" />}
                  <span>{name}</span>
                </button>
              );
            })}
          </section>
        )}
        {isHome && !filtering && storeDirectory}
      </div>
      <div className="catalogue-results">
        {isHome && !filtering && editorial}
        <section id="collection" tabIndex={-1}>
          <div className="section-title">
            <h2>{isSaved ? 'Saved catalogue items' : sort === 'newest' ? 'New arrivals' : category === 'All' ? 'The collection' : category}</h2>
            <span>{list.length} loaded products</span>
            {!isHome && !isSaved && hasDates && sort !== 'newest' && (
              <button className="secondary" onClick={() => setSort('newest')}>View new arrivals</button>
            )}
          </div>
          <CatalogueCards products={list} saved={saved} toggleSaved={toggleSaved} />
          {!loading && !list.length && <p className="empty">No matching products in the loaded catalogue.</p>}
          {brands.some(store => (!brandId || brandId === store.id) && store.more) && (
            <p className="fine">Bounded preview: up to 48 products per store. Additional products may exist.</p>
          )}
          {isSaved && unavailableSaved.length > 0 && (
            <div className="commerce-panel">
              <h2>Unavailable saved items</h2>
              <p>These references are retained. Re-enable their store to see current details, or remove a reference yourself.</p>
              {unavailableSaved.map((id, i) => (
                <div className="unavailable-reference" key={id}>
                  <span>Saved reference {i + 1}<small>{id}</small></span>
                  <button className="secondary" onClick={() => toggleSaved(id)}>Remove saved reference {i + 1}</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {isHome && filtering && storeDirectory}
      </div>
    </div>
  );
}
