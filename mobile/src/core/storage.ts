/** Native storage only. No browser migration or multi-process transaction is implied. */
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}
function equivalent(raw: string | null, value: unknown): boolean {
  try {
    return raw !== null && canonical(JSON.parse(raw)) === canonical(value);
  } catch {
    return false;
  }
}
export class NativeStorage {
  private adapter: StorageAdapter;
  private baseline = new Map<string, string | null>();
  private recovery = new Set<string>();
  private tail: Promise<unknown> = Promise.resolve();
  private stamp = 0;
  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
  }
  /** Failed operations cannot poison subsequent queue entries. */
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
  async read<T>(
    key: string,
    parse: (raw: string | null) => T,
    fallback: T,
  ): Promise<T> {
    this.baseline.delete(key);
    const raw = await this.adapter.getItem(key); // A read failure must not authorize an empty write.
    let value: T;
    try {
      value = parse(raw);
    } catch {
      value = fallback;
    }
    this.baseline.set(key, raw);
    if (raw !== null && !equivalent(raw, value)) this.recovery.add(key);
    else this.recovery.delete(key);
    return value;
  }
  async assertCurrent(key: string): Promise<string | null> {
    if (!this.baseline.has(key))
      throw new Error(
        "Stored data could not be read. Reload before saving changes.",
      );
    const raw = await this.adapter.getItem(key);
    if (raw !== this.baseline.get(key))
      throw new Error("Newer saved data was found. Reload before changing it.");
    return raw;
  }
  async write(key: string, value: unknown): Promise<void> {
    const raw = await this.assertCurrent(key);
    if (equivalent(raw, value)) return;
    if (this.recovery.has(key) && raw !== null) {
      this.stamp = Math.max(Date.now(), this.stamp + 1);
      let recoveryKey = key + ".recovery." + this.stamp;
      while ((await this.adapter.getItem(recoveryKey)) !== null)
        recoveryKey = key + ".recovery." + ++this.stamp;
      await this.adapter.setItem(recoveryKey, raw); // Never replace malformed bytes before this succeeds.
      this.recovery.delete(key);
    }
    const next = JSON.stringify(value);
    try {
      await this.adapter.setItem(key, next);
    } catch (error) {
      // A failed acknowledgement may conceal a successful write: force a reload.
      this.baseline.delete(key);
      throw error;
    }
    this.baseline.set(key, next);
  }
  recoveryNeeded(): boolean {
    return this.recovery.size > 0;
  }
  async backup(): Promise<{
    format: string;
    exportedAt: string;
    records: Record<string, string | null>;
  }> {
    const allowed = new Set([
      "fc.commerce.v1",
      "fc.commerce.v2",
      "fc.stores.v1",
      "fc.saved",
      "fc.followed",
    ]);
    const keys = (await this.adapter.getAllKeys()).filter(
      (k) =>
        allowed.has(k) ||
        /^fc\.(commerce\.v2|stores\.v1|saved|followed)\.recovery\.\d+$/.test(k),
    );
    const records: Record<string, string | null> = {};
    for (const key of keys) records[key] = await this.adapter.getItem(key);
    return {
      format: "fashion-centre-local-backup-v1",
      exportedAt: new Date().toISOString(),
      records,
    };
  }
}
