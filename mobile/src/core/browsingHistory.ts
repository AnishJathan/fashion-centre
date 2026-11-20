/** Local to this installation. Only catalogue identifiers are persisted. */
export const HISTORY_KEY = 'fc.browsing.v1';
export type BrowsingHistory = { products: string[]; stores: string[] };
export const emptyHistory = (): BrowsingHistory => ({ products: [], stores: [] });
const limit = 16;

export function readHistory(raw: string | null): BrowsingHistory {
  try {
    const data = JSON.parse(raw || '{}');
    const ids = (input: unknown) => Array.isArray(input)
      ? [...new Set(input.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 4096))].slice(0, limit) : [];
    return { products: ids(data.products), stores: ids(data.stores) };
  } catch { return emptyHistory(); }
}
export function recordVisit(history: BrowsingHistory, store: string, product?: string): BrowsingHistory {
  const promote = (list: string[], id: string) => list[0] === id ? list : [id, ...list.filter(previous => previous !== id)].slice(0, limit);
  const products = product ? promote(history.products, product) : history.products;
  const stores = promote(history.stores, store);
  return products === history.products && stores === history.stores ? history : { products, stores };
}
export function recentEntries<T extends {id: string}>(ids: string[], catalogue: T[]): T[] {
  const available = new Map(catalogue.map(entry => [entry.id, entry]));
  return ids.flatMap(id => { const entry = available.get(id); return entry ? [entry] : []; });
}
export type StudioPhoto = 'checking' | 'ready' | 'missing' | 'guest' | 'error';
export async function studioPhoto(response: Response): Promise<StudioPhoto> {
  if (response.status === 401 || response.status === 403) return 'guest';
  if (!response.ok) return 'error';
  const account = await response.json();
  if (!account?.id || typeof account.hasPhoto !== 'boolean') return 'error';
  return account.hasPhoto ? 'ready' : 'missing';
}
