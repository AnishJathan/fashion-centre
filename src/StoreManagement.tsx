import type { ReactNode } from 'react';
import type { Source, StoreRegistration } from './domain';
import { BrandLink } from './StoreNavigation';

export type Directory = {
  status: 'loading' | 'ready' | 'error';
  sources: Source[];
};

export function StoreManagement({ directory, stores, enable, disable, retry, children }: {
  directory: Directory;
  stores: StoreRegistration[];
  enable: (id: string) => void;
  disable: (id: string) => void;
  retry: () => void;
  children: ReactNode;
}) {
  return (
    <section className="commerce-page">
      <p className="eyebrow">LOCAL DEMO ONBOARDING</p>
      <h1>Choose your demo stores.</h1>
      <p>Add a public Mock Shop catalogue to this browser.</p>
      {directory.status === 'loading' && !directory.sources.length && <p role="status">Loading demo store directory…</p>}
      {directory.status === 'ready' && !directory.sources.length && <p>No demo stores are available.</p>}
      {directory.status === 'error' && (
        <div role="alert">Demo store directory unavailable.<button onClick={retry}>Retry directory</button></div>
      )}
      <div className="onboard-grid">
        {directory.sources.map(source => {
          const entry = stores.find(store => store.id === source.key);
          return (
            <article className="commerce-panel" key={source.key}>
              <h2>{source.name}</h2>
              <p>{entry?.enabled ? 'Onboarded in this browser' : entry ? 'Disabled · History retained' : 'Not onboarded'}</p>
              {entry?.enabled ? (
                <button className="secondary" onClick={() => disable(source.key)}>Disable {source.name}</button>
              ) : (
                <button className="primary" onClick={() => enable(source.key)}>
                  {entry ? 'Enable ' : 'Onboard '}{source.name}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {children}
      <p className="demo-note">
        Disabling a store hides its products. Cart items, saved IDs, preferences and your demo orders remain stored.
        Re-enable to fetch its catalogue again. Catalogue reads only; no public cart mutations, real connection, payment or order synchronization.
      </p>
      <BrandLink className="primary" href="#/">Browse onboarded stores</BrandLink>
    </section>
  );
}
