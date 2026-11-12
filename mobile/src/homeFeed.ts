import type { Product } from './core/domain.ts';

export const HOME_FEED_BATCH = 6;
/** Store identity is part of the key: identical provider IDs in two stores are distinct. */
export const homeProductKey = (product: Pick<Product, 'id' | 'brandId'>) => JSON.stringify([product.brandId, product.id]);
export function uniqueHomeProducts(products: Product[]) {
  const seen = new Set<string>();
  return products.filter(product => {
    const key = homeProductKey(product);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function homeFeedRows(products: Product[], count: number, columns: number) {
  const limit = Math.max(0, Math.min(products.length, Number.isFinite(count) ? Math.floor(count) : 0));
  const size = Math.max(1, Math.min(4, Number.isFinite(columns) ? Math.floor(columns) : 1));
  const rows: { key: string; products: Product[] }[] = [];
  for (let index = 0; index < limit; index += size) {
    const row = products.slice(index, Math.min(index + size, limit));
    rows.push({ key: homeProductKey(row[0]), products: row });
  }
  return rows;
}
