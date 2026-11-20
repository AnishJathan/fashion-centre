import { useState } from 'react';
import { CatalogueImage } from './CatalogueImage';
import { money, type Product } from './domain';
import { BrandLink } from './StoreNavigation';

export function ProductDetail({ product, saved, toggleSaved, add, tryOn }: {
  product: Product;
  saved: boolean;
  toggleSaved: () => void;
  add: (key: string) => void;
  tryOn: () => void;
}) {
  const initialVariant = product.variants.find(variant => variant.available) ?? product.variants[0];
  const [key, setKey] = useState(initialVariant?.key ?? '');
  const variant = product.variants.find(option => option.key === key);
  const productId = encodeURIComponent(product.id);

  return (
    <section className="detail">
      <BrandLink className="back" href={'#/brand/' + product.brandId}>← {product.brandName}</BrandLink>
      <div className="detail-grid">
        {product.image
          ? <CatalogueImage key={product.image} src={product.image} alt={product.name} referrerPolicy="no-referrer" />
          : <p>No product image supplied.</p>}
        <div>
          <p className="eyebrow">{product.brandName}</p>
          <h1>{product.name}</h1>
          <p>{product.category}</p>
          {product.description && <p className="product-description">{product.description}</p>}
          {product.image && (
            <BrandLink className="secondary wide" href={'#/photos/' + productId}>View catalogue photos full screen</BrandLink>
          )}
          <label>Variant
            <select aria-label="Select variant" value={key} onChange={event => setKey(event.target.value)}>
              {product.variants.map(option => {
                const duplicateTitle = product.variants.some(other => other.key !== option.key && other.title === option.title);
                const details = duplicateTitle
                  ? ' — ' + Object.entries(option.options).map(([name, value]) => name + ': ' + value).join(', ')
                  : '';
                return (
                  <option key={option.key} value={option.key}>
                    {option.title}{details}{option.available ? '' : ' — unavailable'}
                  </option>
                );
              })}
            </select>
          </label>
          {variant && <h2>{money(variant.amount, variant.currency)}</h2>}
          <button className="primary wide" disabled={!variant?.available} onClick={() => variant && add(variant.key)}>
            Add to demo cart
          </button>
          <BrandLink className="cart-detail-link" href="#/cart">View your cart →</BrandLink>
          <button className="primary wide" disabled={!product.image} onClick={tryOn}>Try on with my saved photo</button>
          <BrandLink className="secondary wide try-prepare-link" href={'#/try/' + productId}>Prepare a try-on photo</BrandLink>
          <button className="secondary wide" onClick={toggleSaved}>{saved ? 'Unsave piece' : 'Save piece'}</button>
          {product.moreVariants && <p>Additional variants exist outside this preview.</p>}
          <p className="demo-note">
            Fictional catalogue availability. This product photo is not a try-on result. Demo orders are recorded locally; nothing is sent to this store.
          </p>
        </div>
      </div>
    </section>
  );
}
