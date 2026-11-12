/** Local visual identities for fictional demo stores, not official brand assets. */
import { palettes } from './design.ts';
import { selectProducts, validMoney, type Product } from './core/domain.ts';

export type BrandPalette = { [K in keyof typeof palettes.light]: string };
export type BrandIdentity = 'atelier' | 'everyday' | 'studio' | 'terra';
export type BrandSort = 'featured' | 'name' | 'price';
const colours: Record<BrandIdentity, { light: Partial<BrandPalette>; dark: Partial<BrandPalette> }> = {
  atelier: {
    light: { background: '#F7F3EC', surface: '#FFFDFA', text: '#29241F', muted: '#706253', accent: '#644631', onAccent: '#FFFFFF', tint: '#EDE2D3', line: '#DED2C2', controlLine: '#9D8770', disabled: '#E8E0D4' },
    dark: { background: '#1A1713', surface: '#28221C', text: '#FFF8EE', muted: '#CFC0AA', accent: '#E5BF98', onAccent: '#302218', tint: '#3B3025', line: '#574734', controlLine: '#A38C71', disabled: '#3C3329' },
  },
  everyday: {
    light: { background: '#F0F8F5', surface: '#FFFFFF', text: '#132F2B', muted: '#4D6B64', accent: '#146253', onAccent: '#FFFFFF', tint: '#D9EEE7', line: '#C9DED5', controlLine: '#648F81', disabled: '#D5E7E0' },
    dark: { background: '#101F1B', surface: '#1B3029', text: '#F0FFF8', muted: '#B3CFC2', accent: '#98DDC1', onAccent: '#12372B', tint: '#29483C', line: '#3F6355', controlLine: '#7DAA98', disabled: '#2B463B' },
  },
  studio: {
    light: { background: '#F1F4FC', surface: '#FFFFFF', text: '#17263F', muted: '#556580', accent: '#214AA6', onAccent: '#FFFFFF', tint: '#DFE7FB', line: '#CCD7EE', controlLine: '#7A8DAF', disabled: '#DFE5F1' },
    dark: { background: '#111A2C', surface: '#1D2B43', text: '#F2F6FF', muted: '#BBCBE7', accent: '#AFC5FF', onAccent: '#192C56', tint: '#2A3D61', line: '#435A7E', controlLine: '#819CCA', disabled: '#2F405C' },
  },
  terra: {
    light: { background: '#FBF1ED', surface: '#FFFCFA', text: '#39251F', muted: '#795A50', accent: '#94442C', onAccent: '#FFFFFF', tint: '#F1DFD5', line: '#E5CBBE', controlLine: '#AF7A65', disabled: '#EADBD2' },
    dark: { background: '#261714', surface: '#35231D', text: '#FFF4EE', muted: '#DCC1B2', accent: '#F3B394', onAccent: '#422419', tint: '#503226', line: '#714A38', controlLine: '#C08E76', disabled: '#503B32' },
  },
};
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
    palette: { ...palettes[theme], ...colours[identity][theme] } as BrandPalette,
    serif: identity === 'atelier',
    radius: identity === 'atelier' ? 3 : identity === 'everyday' ? 22 : identity === 'studio' ? 6 : 12,
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
