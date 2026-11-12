import type { Brand } from './core/domain.ts';
/** Only followed, currently loaded stores appear. Missing references remain in storage. */
export function followedBrands(brands: Brand[], followed: string[]) {
  const byId = new Map(brands.map(brand => [brand.id, brand]));
  return [...new Set(followed)].flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
}
/** Reverse horizontal scrolling moves the brand tiles visually left to right. */
export function nextBrandOffset(offset: number, maximum: number, step = 116) {
  if (!Number.isFinite(maximum) || maximum <= 0) return 0;
  return offset <= .5 ? maximum : Math.max(0, Math.min(offset, maximum) - step);
}
