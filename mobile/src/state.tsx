import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { readStorefront } from "./core/catalogue.ts";
import { NativeStorage } from "./core/storage.ts";
import {
  COMMERCE_KEY,
  commerceReducer,
  initialCommerce,
  parseCommerce,
  type CommerceAction,
  type CommerceState,
} from "./core/commerce.ts";
import {
  parseIds,
  parseStores,
  STORES_KEY,
  toggleId,
  type Brand,
  type Product,
  type Source,
  type StoreRegistration,
} from "./core/domain.ts";
import {
  parseTheme,
  resolveTheme,
  THEME_KEY,
  type ThemePreference,
} from "./core/themePreference.ts";

interface Snapshot {
  commerce: CommerceState;
  saved: string[];
  followed: string[];
  registrations: StoreRegistration[];
  themePreference: ThemePreference;
}
export interface AppState extends Snapshot {
  ready: boolean;
  error: string;
  notice: string;
  clearNotice(): void;
  sources: Source[];
  brands: Brand[];
  products: Product[];
  catalogueLoading: boolean;
  catalogueError: string;
  theme: "light" | "dark";
  reload(): Promise<void>;
  onboard(id: string): Promise<void>;
  toggleStore(id: string): Promise<void>;
  toggleSaved(id: string): Promise<void>;
  toggleFollowed(id: string): Promise<void>;
  dispatch(action: CommerceAction): Promise<boolean>;
  setTheme(value: ThemePreference): Promise<void>;
  exportBackup(): Promise<void>;
}
const Context = createContext<AppState | null>(null);
const repository = new NativeStorage(AsyncStorage);
const empty = (): Snapshot => ({
  commerce: initialCommerce(),
  saved: [],
  followed: [],
  registrations: [],
  themePreference: "system",
});
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Device data could not be saved. Reload and try again.";
export function AppProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const current = useRef(snapshot);
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueError, setCatalogueError] = useState("");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const catalogueAbort = useRef<AbortController | null>(null);
  const liveProducts = useRef<Product[]>([]);
  const scheme = useColorScheme();
  function publish(next: Snapshot) {
    current.current = next;
    if (mounted.current) setSnapshot(next);
  }
  function invalidateCatalogue() {
    generation.current++;
    catalogueAbort.current?.abort();
    liveProducts.current = [];
    if (mounted.current) setBrands([]);
  }
  async function reload() {
    await repository.run(async () => {
      initialized.current = false;
      if (mounted.current) {
        setReady(false);
        setError("");
      }
      invalidateCatalogue();
      try {
        const next: Snapshot = {
          commerce: await repository.read(
            COMMERCE_KEY,
            parseCommerce,
            initialCommerce(),
          ),
          registrations: await repository.read(STORES_KEY, parseStores, []),
          saved: await repository.read("fc.saved", parseIds, []),
          followed: await repository.read("fc.followed", parseIds, []),
          themePreference: await repository.read(
            THEME_KEY,
            parseTheme,
            "system" as ThemePreference,
          ),
        };
        publish(next);
        initialized.current = true;
        if (mounted.current) {
          setReady(true);
          setRetry((n) => n + 1);
          if (repository.recoveryNeeded())
            setNotice(
              "Some saved records need repair. Original data will be preserved before your next change.",
            );
        }
      } catch (e) {
        if (mounted.current) setError(message(e));
      }
    });
  }
  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
      invalidateCatalogue();
    };
  }, []);
  // Catalogue requests are read-only. No auth, upload, or generation is triggered here.
  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    catalogueAbort.current = abort;
    const version = ++generation.current;
    const valid = () =>
      mounted.current &&
      !abort.signal.aborted &&
      version === generation.current;
    setCatalogueLoading(true);
    setCatalogueError("");
    setBrands([]);
    liveProducts.current = [];
    const enabled = current.current.registrations.filter((s) => s.enabled);
    let directoryError = "",
      storeErrors: string[] = [];
    const publishErrors = () =>
      setCatalogueError(
        [directoryError, ...storeErrors].filter(Boolean).join("\n"),
      );
    void readStorefront(
      enabled.map((s) => s.id),
      abort.signal,
      (result) => {
        if (!valid()) return;
        setSources(result.status === "fulfilled" ? result.value : []);
        directoryError =
          result.status === "rejected" ? message(result.reason) : "";
        publishErrors();
      },
      (results) => {
        if (!valid()) return;
        const loaded = results.flatMap((r) =>
          r.status === "fulfilled" ? [r.value] : [],
        );
        setBrands(loaded);
        liveProducts.current = loaded.flatMap((b) => b.products);
        storeErrors = results.flatMap((r, i) =>
          r.status === "rejected"
            ? [enabled[i].id + ": " + message(r.reason)]
            : [],
        );
        publishErrors();
        setCatalogueLoading(false);
      },
    );
    return () => abort.abort();
  }, [ready, snapshot.registrations, retry]);
  async function mutate(operation: () => Promise<void>): Promise<void> {
    await repository.run(async () => {
      try {
        if (!initialized.current)
          throw new Error(
            "Wait for device data to load, or reload after a storage error.",
          );
        await operation();
        if (mounted.current) setError("");
      } catch (e) {
        if (mounted.current) setError(message(e));
      }
    });
  }
  async function changeStores(
    update: (old: StoreRegistration[]) => StoreRegistration[],
  ) {
    await mutate(async () => {
      const registrations = update(current.current.registrations);
      await repository.write(STORES_KEY, registrations);
      invalidateCatalogue();
      publish({ ...current.current, registrations });
    });
  }
  async function onboard(id: string) {
    await changeStores((old) => {
      if (!sources.some((s) => s.key === id))
        throw new Error(
          "Reload the store directory before onboarding this store.",
        );
      return old.some((s) => s.id === id)
        ? old.map((s) => (s.id === id ? { ...s, enabled: true } : s))
        : [
            ...old,
            { id, enabled: true, onboardedAt: new Date().toISOString() },
          ];
    });
  }
  async function toggleStore(id: string) {
    await changeStores((old) =>
      old.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    );
  }
  async function toggle(key: "saved" | "followed", id: string) {
    await mutate(async () => {
      if (!id) throw new Error("A saved reference is required.");
      const next = toggleId(current.current[key], id);
      await repository.write("fc." + key, next);
      publish({ ...current.current, [key]: next });
    });
  }
  async function dispatch(action: CommerceAction): Promise<boolean> {
    let changed = false;
    await mutate(async () => {
      let safeAction = action;
      if (action.type === "add" || action.type === "checkout") {
        await repository.assertCurrent(STORES_KEY);
        const id =
          action.type === "add" ? action.product.brandId : action.brandId;
        if (
          !current.current.registrations.some((s) => s.id === id && s.enabled)
        )
          throw new Error(
            "Enable this store before adding items or checking out.",
          );
        if (action.type === "add") {
          const product = liveProducts.current.find(
            (p) => p.id === action.product.id && p.brandId === id,
          );
          if (!product)
            throw new Error("Reload this catalogue before adding the item.");
          safeAction = { ...action, product };
        } else
          safeAction = {
            ...action,
            catalogue: liveProducts.current.filter((p) => p.brandId === id),
          };
      }
      const next = commerceReducer(current.current.commerce, safeAction);
      if (next === current.current.commerce) return;
      await repository.write(COMMERCE_KEY, next);
      publish({ ...current.current, commerce: next });
      changed = true;
    });
    return changed;
  }
  async function setTheme(themePreference: ThemePreference) {
    await mutate(async () => {
      parseTheme(JSON.stringify(themePreference));
      await repository.write(THEME_KEY, themePreference);
      publish({ ...current.current, themePreference });
    });
  }
  async function exportBackup() {
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("Sharing is unavailable on this device.");
      const backup = await repository.run(() => repository.backup());
      if (!FileSystem.cacheDirectory)
        throw new Error("Temporary device storage is unavailable.");
      const uri =
        FileSystem.cacheDirectory +
        "fashion-centre-local-backup-" +
        Date.now() +
        ".json";
      try {
        await FileSystem.writeAsStringAsync(
          uri,
          JSON.stringify(backup, null, 2),
        );
        await Sharing.shareAsync(uri, {
          mimeType: "application/json",
          UTI: "public.json",
          dialogTitle: "Export private shopping records",
        });
        if (mounted.current)
          setNotice(
            "Backup sharing opened. Keep your local shopping records private.",
          );
      } finally {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch (e) {
      if (mounted.current) setError(message(e));
    }
  }
  const value: AppState = {
    ...snapshot,
    ready,
    error,
    notice,
    clearNotice: () => setNotice(""),
    sources,
    brands,
    products: brands.flatMap((b) => b.products),
    catalogueLoading,
    catalogueError,
    theme: resolveTheme(snapshot.themePreference, scheme === "dark"),
    reload,
    onboard,
    toggleStore,
    toggleSaved: (id) => toggle("saved", id),
    toggleFollowed: (id) => toggle("followed", id),
    dispatch,
    setTheme,
    exportBackup,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp(): AppState {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be used within AppProvider.");
  return value;
}
