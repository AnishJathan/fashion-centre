import { readStored } from './browserStorage.ts';
export interface Variant {
    key: string;
    id: string;
    title: string;
    available: boolean;
    amount: number;
    currency: string;
    options: Record<string, string>;
}
export interface Product {
    description?: string;
    createdAt?: string;
    id: string;
    brandId: string;
    brandName: string;
    name: string;
    category: string;
    image: string;
    variants: Variant[];
    moreVariants: boolean;
}
export interface Brand {
    id: string;
    name: string;
    image: string;
    products: Product[];
    more: boolean;
}
export interface StoreRegistration {
    id: string;
    enabled: boolean;
    onboardedAt: string;
}
export interface Source {
    key: string;
    name: string;
}
export const STORES_KEY = 'fc.stores.v1';
export function readStores(): StoreRegistration[] { return readStored(STORES_KEY, raw => { try {
    const parsed = JSON.parse(raw || '[]');
    const seen = new Set<string>();
    return Array.isArray(parsed) ? parsed.filter((s: StoreRegistration) => s && typeof s.id === 'string' && /^[a-z0-9-]+$/.test(s.id) && typeof s.enabled === 'boolean' && typeof s.onboardedAt === 'string' && !seen.has(s.id) && !!seen.add(s.id)) : [];
}
catch {
    return [];
} }, []); }
export function toggleId(ids: string[], id: string) { return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]; }
export function readIds(key: string): string[] { return readStored(key, raw => { try {
    const value = JSON.parse(raw || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0))] : [];
}
catch {
    return [];
} }, []); }
export function selectProducts(items: Product[], brandId = '', query = '', category = 'All') { return items.filter(p => (!brandId || p.brandId === brandId) && (category === 'All' || p.category === category) && (p.name + ' ' + p.brandName + ' ' + p.category).toLowerCase().includes(query.trim().toLowerCase())); }
const currencies = new Set(Intl.supportedValuesOf('currency'));
const precision = new Map<string, number>();
export function currencyDigits(currency: string) { if (!/^[A-Z]{3}$/.test(currency) || !currencies.has(currency))
    return null; if (!precision.has(currency))
    precision.set(currency, new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2); return precision.get(currency)!; }
export function validMoney(amount: number, currency: string) { const digits = currencyDigits(currency); if (digits === null || !Number.isFinite(amount) || amount < 0)
    return false; const units = amount * 10 ** digits; return Number.isSafeInteger(Math.round(units)) && units <= 50039995859672 && Math.abs(units - Math.round(units)) < 0.00001; }
export function money(amount: number, currency: string) { const digits = currencyDigits(currency); if (digits === null || !Number.isFinite(amount))
    return 'Amount unavailable'; return currency + ' ' + new Intl.NumberFormat('en', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount); }
export const productPath = (id: string) => '#/product/' + encodeURIComponent(id);
export function decodeRoute(value: string) { try {
    return decodeURIComponent(value);
}
catch {
    return null;
} }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 4096;
export function safeImage(value: unknown): string { if (typeof value !== 'string' || !value)
    return ''; if (/^\/images\/[a-zA-Z0-9_.-]+$/.test(value))
    return value; try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'cdn.shopify.com' && !u.username && !u.password && !u.port ? value : '';
}
catch {
    return '';
} }
export function parseSources(data: unknown): Source[] { if (!record(data) || !Array.isArray(data.shops))
    throw Error('Demo store directory response is invalid.'); const seen = new Set<string>(); return data.shops.map(s => { if (!record(s) || !text(s.key) || !/^[a-z0-9-]+$/.test(s.key) || !text(s.name) || seen.has(s.key))
    throw Error('Demo store directory response is invalid.'); seen.add(s.key); return { key: s.key, name: s.name }; }); }
export function parseCatalogue(id: string, data: unknown): Brand {
    const fail = () => { throw Error('Catalogue response is invalid. Retry when the source is available.'); };
    if (!record(data) || data.shopKey !== id || !text(data.shopName) || !Array.isArray(data.products) || data.products.length > 48 || typeof data.hasNextPage !== 'boolean')
        return fail();
    const names = data.shopName, ids = new Set<string>(), variantDefinitions = new Map<string, string>();
    const products: Product[] = data.products.map(p => {
        if (!record(p) || !text(p.key) || !p.key.startsWith(id + ':gid://shopify/Product/') || ids.has(p.key) || !text(p.title) || typeof p.category !== 'string' || typeof p.moreVariants !== 'boolean' || !Array.isArray(p.variants) || p.variants.length > 100)
            return fail();
        ids.add(p.key);
        if (p.description !== undefined && (typeof p.description !== 'string' || p.description.length > 20000)) return fail();
        if (p.createdAt !== undefined && (typeof p.createdAt !== 'string' || p.createdAt && (!/^\d{4}-\d{2}-\d{2}T/.test(p.createdAt) || !Number.isFinite(Date.parse(p.createdAt))))) return fail();
        const variantIds = new Set<string>();
        const variants: Variant[] = p.variants.map(v => {
            if (!record(v) || !text(v.id) || !/^gid:\/\/shopify\/ProductVariant\/[0-9]+$/.test(v.id) || v.key !== id + ':' + v.id || variantIds.has(v.key as string) || !text(v.title) || typeof v.available !== 'boolean' || !record(v.options) || !Object.entries(v.options).every(([k, val]) => text(k) && text(val)) || typeof v.currency !== 'string' || !['number', 'string'].includes(typeof v.amount) || (typeof v.amount === 'string' && !/^\d+(?:\.\d+)?$/.test(v.amount)) || !validMoney(Number(v.amount), v.currency)) return fail();
            variantIds.add(v.key as string);
            const variant = { key: v.key as string, id: v.id, title: v.title, available: v.available, amount: Number(v.amount), currency: v.currency, options: v.options as Record<string, string> };
            // Combined listings can expose one identical source variant under multiple products.
            const definition = JSON.stringify({ ...variant, options: Object.entries(variant.options).sort(([a], [b]) => a.localeCompare(b)) });
            const previous = variantDefinitions.get(variant.key);
            if (previous !== undefined && previous !== definition) return fail();
            variantDefinitions.set(variant.key, definition);
            return variant;
        });
        return { id: p.key, brandId: id, brandName: names, name: p.title, description: p.description as string || undefined, createdAt: p.createdAt as string || undefined, category: p.category, image: safeImage(p.image), variants, moreVariants: p.moreVariants };
    });
    return { id, name: names, image: products.find(p => p.image)?.image || '', products, more: data.hasNextPage };
}
export async function loadSources(signal?: AbortSignal): Promise<Source[]> { const r = await fetch('/api/integrations/shopify/status', { signal }); if (!r.ok)
    throw Error('Demo store directory unavailable.'); return parseSources(await r.json()); }
export async function loadCatalogue(id: string, signal?: AbortSignal): Promise<Brand> { const r = await fetch('/api/integrations/shopify/catalogue/' + encodeURIComponent(id) + '?source=public', { signal }); if (!r.ok)
    throw Error('Catalogue unavailable. Retry when your connection is ready.'); return parseCatalogue(id, await r.json()); }
