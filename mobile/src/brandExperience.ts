/** Local visual identities for fictional demo stores, not official brand assets. */
import { metrics, palettes } from './design.ts';
import { selectProducts, validMoney, type Product } from './core/domain.ts';

export type BrandPalette = { [K in keyof typeof palettes.light]: string };
export type BrandIdentity = 'atelier' | 'everyday' | 'studio' | 'terra';
export type BrandSort = 'featured' | 'name' | 'price';
export function brandIdentity(id: string): BrandIdentity {
  if (/atelier|tailor/i.test(id)) return 'atelier';
  if (/everyday|daily/i.test(id)) return 'everyday';
  const hash = Array.from(id).reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 0);
  return (['atelier', 'everyday', 'studio', 'terra'] as const)[hash % 4];
}
export function brandExperience(id: string, theme: 'light' | 'dark') {
  const identity = brandIdentity(id);
  return {
    identity,
    palette: palettes[theme],
    serif: identity === 'atelier',
    radius: metrics.cardRadius,
    collectionLabel: identity === 'atelier' ? 'The collection' : identity === 'everyday' ? 'Your everyday edit' : identity === 'studio' ? 'In the studio' : 'The considered edit',
    heroTitle: identity === 'atelier' ? 'A closer look.' : identity === 'everyday' ? 'Good days.\nGreat pieces.' : identity === 'studio' ? 'Find your\nnext favourite.' : 'Make it\nyour own.',
  };
}
export function brandProducts(products: Product[], brandId: string, query = '', category = 'All', sort: BrandSort = 'featured', tryOnOnly = false) {
  const result = selectProducts(products, brandId, query, category).filter(p => !tryOnOnly || !!p.image);
  if (sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'price') {
    const price = (p: Product) => p.variants.filter(v => v.available && validMoney(v.amount, v.currency)).sort((a, b) => a.currency.localeCompare(b.currency) || a.amount - b.amount)[0];
    result.sort((a, b) => { const av = price(a), bv = price(b); return (av?.currency || 'ZZZ').localeCompare(bv?.currency || 'ZZZ') || (av?.amount ?? Infinity) - (bv?.amount ?? Infinity); });
  }
  return result;
}
