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
function assertStoredCurrent(key: string) {
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
        return current;
    if (recovery.has(key) && current !== null) {
        localStorage.setItem(key + '.recovery.' + Date.now(), current);
        recovery.delete(key);
    }
    const next = JSON.stringify(value);
    localStorage.setItem(key, next);
    baseline.set(key, next);
    return next;
}
export async function withStorageLock<T>(key: string, operation: () => T | Promise<T>): Promise<T> {
    if (!navigator.locks)
        throw new Error('This browser cannot safely coordinate saved changes. Open Fashion Centre in a supported browser.');
    return navigator.locks.request('fashion-centre:' + key, { mode: 'exclusive' }, operation);
}
export function storageRecoveryNeeded() { return recovery.size > 0; }

const shoppingKeys = ['fc.commerce.v2', 'fc.stores.v1', 'fc.saved', 'fc.followed'] as const;
type ShoppingKey = typeof shoppingKeys[number];
type ShoppingSnapshot = Record<ShoppingKey, string | null>;
const snapshotStore = 'shopping';
let databasePromise: Promise<IDBDatabase> | undefined;

function shoppingDatabase() {
    databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('fashion-centre-shopping', 1);
        request.onupgradeneeded = () => { request.result.createObjectStore(snapshotStore); };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => {
                database.close();
                databasePromise = undefined;
            };
            resolve(database);
        };
    });
    return databasePromise.catch(error => {
        databasePromise = undefined;
        throw error;
    });
}

function readSnapshot(database: IDBDatabase) {
    return new Promise<ShoppingSnapshot | undefined>((resolve, reject) => {
        const request = database.transaction(snapshotStore).objectStore(snapshotStore).get('current');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function saveSnapshot(database: IDBDatabase, snapshot: ShoppingSnapshot) {
    return new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(snapshotStore, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error('Browser shopping data could not be saved.'));
        transaction.objectStore(snapshotStore).put(snapshot, 'current');
    });
}

function mirror(key: ShoppingKey, raw: string | null) {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
}

/** Import existing records once and recover a local mirror interrupted by a failed save. */
export function restoreShoppingStorage() {
    return withStorageLock('app-state', async () => {
        const database = await shoppingDatabase();
        const snapshot = await readSnapshot(database);
        if (!snapshot) {
            const existing = Object.fromEntries(shoppingKeys.map(key => [key, localStorage.getItem(key)])) as ShoppingSnapshot;
            await saveSnapshot(database, existing);
            return;
        }
        for (const key of shoppingKeys) {
            const raw = localStorage.getItem(key);
            if (raw === snapshot[key]) continue;
            if (raw !== null) localStorage.setItem(key + '.recovery.' + Date.now(), raw);
            mirror(key, snapshot[key]);
        }
    });
}

/** A Web Lock orders writes, but another tab can still read cached localStorage bytes. */
export function withShoppingStorage<T>(operation: (storage: {
    assertCurrent: (key: ShoppingKey) => string | null;
    write: (key: ShoppingKey, value: unknown) => Promise<void>;
}) => Promise<T>) {
    return withStorageLock('app-state', async () => {
        const database = await shoppingDatabase();
        const saved = await readSnapshot(database);
        if (!saved) throw new Error('Browser shopping data could not be read. Reload before saving changes.');
        const snapshot = saved;

        function assertCurrent(key: ShoppingKey) {
            const raw = assertStoredCurrent(key);
            if (raw !== snapshot[key])
                throw new Error('Newer browser data was found. Reload this page before making more changes.');
            return raw;
        }

        return operation({ assertCurrent, async write(key, value) {
            const previous = assertCurrent(key);
            const raw = writeStored(key, value);
            if (raw === previous) return;

            try {
                await saveSnapshot(database, { ...snapshot, [key]: raw });
                snapshot[key] = raw;
            } catch (error) {
                try {
                    mirror(key, previous);
                    baseline.set(key, previous);
                } catch {
                    baseline.delete(key);
                }
                throw error;
            }
        } });
    });
}
