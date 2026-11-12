import {
  loadCatalogue,
  loadSources,
  type Brand,
  type Source,
} from "./domain.ts";
export interface CatalogueReaders {
  sources(signal?: AbortSignal): Promise<Source[]>;
  catalogue(id: string, signal?: AbortSignal): Promise<Brand>;
}
/** Directory and registered catalogues are independent reads. A directory outage must
 * not hide healthy, already-onboarded stores. Callers guard publication by generation. */
export async function readStorefront(
  ids: string[],
  signal: AbortSignal,
  publishDirectory: (result: PromiseSettledResult<Source[]>) => void,
  publishCatalogues: (results: PromiseSettledResult<Brand>[]) => void,
  readers: CatalogueReaders = {
    sources: loadSources,
    catalogue: loadCatalogue,
  },
): Promise<void> {
  const directory = Promise.resolve()
    .then(() => readers.sources(signal))
    .then(
      (value) => {
        if (!signal.aborted) publishDirectory({ status: "fulfilled", value });
      },
      (reason) => {
        if (!signal.aborted) publishDirectory({ status: "rejected", reason });
      },
    );
  const catalogues = Promise.allSettled(
    ids.map((id) =>
      Promise.resolve().then(() => readers.catalogue(id, signal)),
    ),
  ).then((results) => {
    if (!signal.aborted) publishCatalogues(results);
  });
  await Promise.all([directory, catalogues]);
}
