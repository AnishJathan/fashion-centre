import type { Product } from './core/domain.ts';
import { money, validMoney } from './core/domain.ts';

export type BrowseSelection = { showFilters?: boolean; category?: string; query?: string; sort?: string; store?: string; maxPrice?: number; currency?: string };
export function homeCategories(products: Product[]) {
  return [...new Set(products.map(p => p.category).filter(Boolean))].map(category => ({
    category, products: products.filter(p => p.category === category),
    image: products.find(p => p.category === category && p.image)?.image || '',
  }));
}
/** Never compare prices across currencies or claim an unobserved discount. */
export function priceMinima(products: Product[]) {
  const minima = new Map<string, number>();
  products.forEach(p => p.variants.forEach(v => {
    if (v.available && validMoney(v.amount, v.currency)) minima.set(v.currency, Math.min(minima.get(v.currency) ?? Infinity, v.amount));
  }));
  return [...minima].map(([currency, amount]) => ({ currency, amount }));
}
export function homePrice(product: Product) {
  const minima = priceMinima([product]);
  return minima.length ? minima.map(p => `From ${money(p.amount, p.currency)}`).join(' · ') : 'See product availability';
}
/** Generic catalogue recommendations never depend on retained wishlist data. */
export function homeRecommendations(products: Product[]) {
  return products.slice(0, 10);
}
export function homeSuggestions(products: Product[], query: string) {
  const q = query.trim().toLocaleLowerCase();
  return q ? products.filter(p => `${p.name} ${p.category} ${p.brandName}`.toLocaleLowerCase().includes(q)).slice(0, 5) : [];
}
export function homeValueCollections(products: Product[]) {
  return homeCategories(products).flatMap(group => priceMinima(group.products).map(price => ({
    ...price, category: group.category, image: group.image,
    count: group.products.filter(p => p.variants.some(v => v.available && v.currency === price.currency && validMoney(v.amount, v.currency))).length,
  }))).slice(0, 6);
}
