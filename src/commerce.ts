import type { Product } from './domain.ts';
import { currencyDigits, validMoney, safeImage } from './domain.ts';
import { readStored, writeStored } from './browserStorage.ts';
export const COMMERCE_KEY = 'fc.commerce.v2';
export const MAX_QUANTITY = 9;
export interface CartLine {
    productId: string;
    size: string;
    quantity: number;
    brandId?: string;
    brandName?: string;
    name?: string;
    variantKey?: string;
}
export interface OrderLine extends CartLine {
    name: string;
    image: string;
    price: number;
    currency: string;
    color: string;
}
export interface DemoOrder {
    id: string;
    brandId: string;
    brandName?: string;
    date: string;
    status: string;
    lines: OrderLine[];
    sample: true;
    legacy?: boolean;
}
export interface Preferences {
    style: string;
    fit: string;
    updates: boolean;
}
export interface CommerceState {
    cart: CartLine[];
    orders: DemoOrder[];
    legacySamples: unknown[];
    preferences: Preferences;
}
export type CommerceAction = {
    type: 'add';
    product: Product;
    variantKey: string;
} | {
    type: 'quantity';
    productId: string;
    size: string;
    variantKey?: string;
    quantity: number;
} | {
    type: 'adjust';
    productId: string;
    size: string;
    variantKey?: string;
    delta: number;
} | {
    type: 'remove';
    productId: string;
    size: string;
    variantKey?: string;
} | {
    type: 'checkout';
    brandId: string;
    catalogue: Product[];
    id: string;
    date: string;
} | {
    type: 'preferences';
    value: Preferences;
};
export const initialCommerce = (): CommerceState => ({ cart: [], orders: [], legacySamples: [], preferences: { style: '', fit: '', updates: false } });
export const validQuantity = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_QUANTITY;
export const sameLine = (l: CartLine, id: string, size: string, variantKey?: string) => l.productId === id && (variantKey ? l.variantKey === variantKey : !l.variantKey && l.size === size);
export function resolveLine(line: CartLine, products: Product[]) { const product = products.find(p => p.id === line.productId && p.brandId === line.brandId); const variant = product?.variants.find(v => v.key === line.variantKey); return { product, variant, available: !!variant?.available && validMoney(Number(variant.amount), variant.currency) }; }
export function totals(lines: {
    price: number;
    currency: string;
    quantity: number;
}[]) { const amounts = new Map<string, bigint>(); for (const l of lines) {
    if (!validMoney(l.price, l.currency) || !validQuantity(l.quantity))
        continue;
    const factor = 10 ** currencyDigits(l.currency)!;
    amounts.set(l.currency, (amounts.get(l.currency) || 0n) + BigInt(Math.round(l.price * factor)) * BigInt(l.quantity));
} return [...amounts].map(([currency, units]) => ({ currency, amount: units > BigInt(Number.MAX_SAFE_INTEGER) ? NaN : Number(units) / 10 ** currencyDigits(currency)! })); }
export function checkoutReady(lines: CartLine[], products: Product[]) { if (!lines.length || !lines.every(l => resolveLine(l, products).available && validQuantity(l.quantity)) || new Set(lines.map(l => l.brandId)).size !== 1 || new Set(lines.map(l => resolveLine(l, products).variant?.currency)).size !== 1)
    return false; return totals(lines.map(l => { const v = resolveLine(l, products).variant!; return { price: Number(v.amount), currency: v.currency, quantity: l.quantity }; })).every(t => Number.isFinite(t.amount)); }
export function commerceReducer(state: CommerceState, action: CommerceAction): CommerceState {
    switch (action.type) {
        case 'add': {
            const v = action.product.variants.find(v => v.key === action.variantKey);
            if (!v?.available || !validMoney(Number(v.amount), v.currency))
                return state;
            const old = state.cart.find(l => l.productId === action.product.id && l.variantKey === v.key);
            if (old && old.quantity >= MAX_QUANTITY)
                return state;
            return { ...state, cart: old ? state.cart.map(l => l === old ? { ...l, quantity: l.quantity + 1 } : l) : [...state.cart, { productId: action.product.id, size: v.title, variantKey: v.key, quantity: 1, brandId: action.product.brandId, brandName: action.product.brandName, name: action.product.name }] };
        }
        case 'adjust': return { ...state, cart: state.cart.map(l => sameLine(l, action.productId, action.size, action.variantKey) && Number.isInteger(action.delta) && validQuantity(l.quantity + action.delta) ? { ...l, quantity: l.quantity + action.delta } : l) };
        case 'quantity': return validQuantity(action.quantity) ? { ...state, cart: state.cart.map(l => sameLine(l, action.productId, action.size, action.variantKey) ? { ...l, quantity: action.quantity } : l) } : state;
        case 'remove': return { ...state, cart: state.cart.filter(l => !sameLine(l, action.productId, action.size, action.variantKey)) };
        case 'preferences': return { ...state, preferences: action.value };
        case 'checkout': {
            const lines = state.cart.filter(l => l.brandId === action.brandId);
            if (!checkoutReady(lines, action.catalogue) || state.orders.some(o => o.id === action.id))
                return state;
            const snapshots: OrderLine[] = lines.map(l => { const { product: p, variant: v } = resolveLine(l, action.catalogue); return { ...l, size: v!.title, brandName: p!.brandName, name: p!.name, image: p!.image, price: Number(v!.amount), currency: v!.currency, color: Object.values(v!.options).join(' / ') }; });
            return { ...state, cart: state.cart.filter(l => !lines.includes(l)), orders: [{ id: action.id, brandId: action.brandId, brandName: snapshots[0].brandName, date: action.date, status: 'Recorded locally', sample: true, legacy: false, lines: snapshots }, ...state.orders] };
        }
    }
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === 'string';
function cartLine(v: unknown): CartLine | null { if (!object(v) || !string(v.productId) || !v.productId || !string(v.size) || !validQuantity(v.quantity as number))
    return null; const line: CartLine = { productId: v.productId, size: v.size, quantity: v.quantity as number }; for (const key of ['brandId', 'brandName', 'name', 'variantKey'] as const)
    if (string(v[key]))
        line[key] = v[key]; return line; }
/** Bad records are isolated. The repository preserves original raw bytes before any repaired write. */
export function parseCommerce(raw: string | null): CommerceState {
    const empty = initialCommerce();
    let data: unknown;
    try {
        data = JSON.parse(raw || 'null');
    }
    catch {
        return empty;
    }
    if (!object(data))
        return empty;
    const cart: CartLine[] = [];
    const seen = new Set<string>();
    for (const value of Array.isArray(data.cart) ? data.cart : []) {
        const line = cartLine(value);
        if (!line)
            continue;
        const key = JSON.stringify([line.productId, line.variantKey || null, line.variantKey ? null : line.size]);
        if (!seen.has(key)) {
            seen.add(key);
            cart.push(line);
        }
    }
    const orders: DemoOrder[] = [], legacySamples = Array.isArray(data.legacySamples) ? [...data.legacySamples] : [], orderIds = new Set<string>();
    for (const value of Array.isArray(data.orders) ? data.orders : []) {
        if (!object(value) || !string(value.id))
            continue;
        if (value.id.startsWith('SAMPLE-')) {
            legacySamples.push(value);
            continue;
        }
        if (!value.id || orderIds.has(value.id) || !string(value.brandId) || !string(value.date) || !Number.isFinite(Date.parse(value.date)) || !Array.isArray(value.lines) || !value.lines.length)
            continue;
        const lines: OrderLine[] = [];
        let legacy = value.legacy === true;
        for (const row of value.lines) {
            const base = cartLine(row);
            if (!base || !object(row) || !string(row.name) || typeof row.price !== 'number')
                continue;
            // Only a missing field denotes the old AUD schema; malformed explicit
            // currencies must never be reinterpreted as a different currency.
            if (row.currency !== undefined && !string(row.currency))
                continue;
            if (base.brandId !== undefined && base.brandId !== value.brandId)
                continue;
            const currency = string(row.currency) ? row.currency : 'AUD';
            if (!validMoney(row.price, currency))
                continue;
            if (!string(row.currency))
                legacy = true;
            lines.push({ ...base, name: row.name, image: safeImage(row.image), price: row.price, currency, color: string(row.color) ? row.color : '' });
        }
        // Never present a partial order total as a complete historical order.
        if (lines.length !== value.lines.length)
            continue;
        orderIds.add(value.id);
        orders.push({ id: value.id, brandId: value.brandId, ...(string(value.brandName) ? { brandName: value.brandName } : {}), date: value.date, status: string(value.status) ? value.status : 'Recorded locally', lines, sample: true, legacy });
    }
    const prefs = object(data.preferences) ? data.preferences : {};
    const preferences = { style: string(prefs.style) ? prefs.style : '', fit: string(prefs.fit) ? prefs.fit : '', updates: prefs.updates === true };
    return { cart, orders, legacySamples, preferences };
}
export const localCommerceRepository = { read(): CommerceState { return readStored(COMMERCE_KEY, raw => parseCommerce(raw ?? localStorage.getItem('fc.commerce.v1')), initialCommerce()); }, write(state: CommerceState) { writeStored(COMMERCE_KEY, state); } };
