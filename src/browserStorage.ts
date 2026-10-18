/** Preserve original malformed data and reject replacement by a stale browser tab. */
const baseline = new Map<string, string | null>();
const recovery = new Set<string>();
function canonical(value: unknown): string { return JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v); }
function equivalent(raw: string | null, value: unknown) { if (raw === null)
    return false; try {
    return canonical(JSON.parse(raw)) === canonical(value);
}
catch {
    return false;
} }
export function readStored<T>(key: string, parse: (raw: string | null) => T, fallback: T): T {
    let raw: string | null;
    try {
        raw = localStorage.getItem(key);
    }
    catch {
        // A fallback is not evidence that the existing storage is empty.
        baseline.delete(key);
        return fallback;
    }
    baseline.set(key, raw);
    try {
        const value = parse(raw);
        if (raw !== null && !equivalent(raw, value))
            recovery.add(key);
        else
            recovery.delete(key);
        return value;
    }
    catch {
        if (raw !== null)
            recovery.add(key);
        else
            // A parser may read a legacy key when the current key is absent.
            // Do not create an empty current record after that migration fails.
            baseline.delete(key);
        return fallback;
    }
}
/** Check a transaction dependency without rereading it into the UI baseline. */
export function assertStoredCurrent(key: string) {
    const current = localStorage.getItem(key);
    if (!baseline.has(key))
        throw new Error('Existing browser data could not be read. Reload before saving changes.');
    if (current !== baseline.get(key))
        throw new Error('Newer browser data was found. Reload this page before making more changes.');
    return current;
}
export function writeStored(key: string, value: unknown) {
    const current = assertStoredCurrent(key);
    if (equivalent(current, value))
        return;
    if (recovery.has(key) && current !== null) {
        localStorage.setItem(key + '.recovery.' + Date.now(), current);
        recovery.delete(key);
    }
    const next = JSON.stringify(value);
    localStorage.setItem(key, next);
    baseline.set(key, next);
}
const relatedKeys = new Set(['fc.commerce.v2', 'fc.stores.v1', 'fc.saved', 'fc.followed']);
/** Related app state uses one lock so dependency checks and writes cannot interleave. */
export async function withStorageLock<T>(key: string, operation: () => T): Promise<T> {
    if (!navigator.locks)
        throw new Error('This browser cannot safely coordinate saved changes. Open the app in a supported browser on localhost.');
    return navigator.locks.request('fashion-centre:' + (relatedKeys.has(key) ? 'app-state' : key), { mode: 'exclusive' }, operation);
}
export function storageRecoveryNeeded() { return recovery.size > 0; }
