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
    const start = Math.max(0, photos.findIndex(p => p.id === initialId)), [selectedId, setSelectedId] = useState(initialId), indexRef = useRef(start), dialog = useRef<HTMLDialogElement>(null), feed = useRef<HTMLDivElement>(null);
    const index = Math.max(0, photos.findIndex(p => p.id === selectedId));
    useEffect(() => { const node = dialog.current; if (node && !node.open)
        node.showModal(); indexRef.current = start; setSelectedId(initialId); feed.current?.scrollTo({ top: start * (feed.current?.clientHeight || 0) });
        const viewport = feed.current;
        let height = viewport?.clientHeight;
        const resize = new ResizeObserver(() => { if (viewport && viewport.clientHeight !== height) { height = viewport.clientHeight; viewport.scrollTo({ top: indexRef.current * height, behavior: 'instant' }); } });
        if (viewport) resize.observe(viewport);
        return () => { resize.disconnect(); node?.close(); }; }, [initialId, photos.length]);
    function move(next: number) { const value = Math.max(0, Math.min(photos.length - 1, next)); feed.current?.scrollTo({ top: value * (feed.current?.clientHeight || 0), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
    return <dialog className="catalogue-viewer" ref={dialog} aria-label="Full-screen catalogue photos" onCancel={e => { e.preventDefault(); close(); }} onKeyDown={e => { if (e.key === 'Tab') {
        const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]'));
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    } if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        move(index + (e.key === 'ArrowDown' ? 1 : -1));
    } }}><div className="viewer-toolbar"><div><strong>{initial?.brandName || 'Catalogue photos'}</strong><small>Catalogue photography · Not a try-on result</small></div><button onClick={close} aria-label="Close photo viewer">Close</button></div>{photos.length ? <><div className="viewer-feed" ref={feed} tabIndex={0} aria-label="Scroll vertically through catalogue photos" onScroll={e => { const next = Math.max(0, Math.min(photos.length - 1, Math.round(e.currentTarget.scrollTop / e.currentTarget.clientHeight))); indexRef.current = next; if (photos[next]) setSelectedId(photos[next].id); }}>{photos.map((p, photoIndex) => <section className="viewer-slide" key={p.id}>{Math.abs(photoIndex - index) <= 1 && <CatalogueImage src={p.image} alt={p.name} decoding="async" referrerPolicy="no-referrer"/>}<div className="viewer-caption"><h1>{p.name}</h1><p>{p.brandName}</p></div></section>)}</div><div className="viewer-controls"><button onClick={() => move(index - 1)} disabled={index === 0}>Previous photo</button><span aria-live="polite">{index + 1} / {photos.length}</span><button onClick={() => move(index + 1)} disabled={index >= photos.length - 1}>Next photo</button></div></> : <div className="viewer-empty"><h1>No catalogue photo available.</h1><p>The store may be disabled or its catalogue unavailable.</p><button onClick={close}>Return to product</button></div>}</dialog>;
}
