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
    try {
        const raw = localStorage.getItem(key);
        baseline.set(key, raw);
        const value = parse(raw);
        if (raw !== null && !equivalent(raw, value))
            recovery.add(key);
        return value;
    }
    catch {
        return fallback;
    }
}
export function writeStored(key: string, value: unknown) {
    const current = localStorage.getItem(key);
    if (!baseline.has(key))
        baseline.set(key, current);
    if (current !== baseline.get(key))
        throw new Error('Newer browser data was found. Reload this page before making more changes.');
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
/** Web Locks serializes read/compare/write across same-origin tabs. No unsafe fallback. */
export async function withStorageLock<T>(key: string, operation: () => T): Promise<T> {
    if (!navigator.locks)
        throw new Error('This browser cannot safely coordinate saved changes. Open the app in a supported browser on localhost.');
    return navigator.locks.request('fashion-centre:' + key, { mode: 'exclusive' }, operation);
}
export function storageRecoveryNeeded() { return recovery.size > 0; }
