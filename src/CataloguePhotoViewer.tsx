import { useEffect, useRef, useState } from 'react';
import type { Product } from './domain';
import { CatalogueImage } from './CatalogueImage';
import './photo-viewer.css';
/** Full-screen reference browsing only. Catalogue photography is never labelled as generated output. */
export function CataloguePhotoViewer({ products, initialId, close }: {
    products: Product[];
    initialId: string;
    close: () => void;
}) {
    const initial = products.find(p => p.id === initialId), photos = products.filter(p => p.brandId === initial?.brandId && p.image);
    const start = Math.max(0, photos.findIndex(p => p.id === initialId)), [index, setIndex] = useState(start), dialog = useRef<HTMLDialogElement>(null), feed = useRef<HTMLDivElement>(null);
    useEffect(() => { const node = dialog.current; if (node && !node.open)
        node.showModal(); setIndex(start); feed.current?.scrollTo({ top: start * (feed.current?.clientHeight || 0) }); return () => { node?.close(); }; }, [initialId, photos.length]);
    function move(next: number) { const value = Math.max(0, Math.min(photos.length - 1, next)); feed.current?.scrollTo({ top: value * (feed.current?.clientHeight || 0), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
    return <dialog className="catalogue-viewer" ref={dialog} aria-label="Full-screen catalogue photos" onCancel={e => { e.preventDefault(); close(); }} onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        move(index + (e.key === 'ArrowDown' ? 1 : -1));
    } }}><div className="viewer-toolbar"><div><strong>{initial?.brandName || 'Catalogue photos'}</strong><small>Catalogue photography · Not a try-on result</small></div><button onClick={close} aria-label="Close photo viewer">Close</button></div>{photos.length ? <><div className="viewer-feed" ref={feed} tabIndex={0} aria-label="Scroll vertically through catalogue photos" onScroll={e => setIndex(Math.round(e.currentTarget.scrollTop / e.currentTarget.clientHeight))}>{photos.map(p => <section className="viewer-slide" key={p.id}><CatalogueImage src={p.image} alt={p.name} referrerPolicy="no-referrer"/><div className="viewer-caption"><h1>{p.name}</h1><p>{p.brandName}</p></div></section>)}</div><div className="viewer-controls"><button onClick={() => move(index - 1)} disabled={index === 0}>Previous photo</button><span aria-live="polite">{index + 1} / {photos.length}</span><button onClick={() => move(index + 1)} disabled={index >= photos.length - 1}>Next photo</button></div></> : <div className="viewer-empty"><h1>No catalogue photo available.</h1><p>The store may be disabled or its catalogue unavailable.</p><button onClick={close}>Return to product</button></div>}</dialog>;
}
