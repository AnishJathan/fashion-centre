import { LocalDataTools } from './LocalDataTools';
import { CatalogueImage } from './CatalogueImage';
import { useRef, useState } from 'react';
import { money, productPath, type Product, type Brand } from './domain';
import { resolveLine, checkoutReady, totals, MAX_QUANTITY, type CartLine, type CommerceState, type CommerceAction } from './commerce';
type Shared = {
    state: CommerceState;
    dispatch: (action: CommerceAction) => Promise<boolean>;
    products: Product[];
};
function Total({ lines }: {
    lines: {
        price: number;
        currency: string;
        quantity: number;
    }[];
}) { return <div className="currency-totals">{totals(lines).map(t => <strong key={t.currency}>{money(t.amount, t.currency)}</strong>)}</div>; }
function Prices({ lines, products }: {
    lines: CartLine[];
    products: Product[];
}) { return <Total lines={lines.flatMap(l => { const { variant } = resolveLine(l, products); return variant ? [{ price: Number(variant.amount), currency: variant.currency, quantity: l.quantity }] : []; })}/>; }
export function CartScreen({ state, dispatch, products }: Shared) {
    const groups = [...new Set(state.cart.map(l => l.brandId || 'legacy'))];
    return <section className="commerce-page"><p className="eyebrow">YOUR LOCAL SELECTION</p><h1>Your cart.</h1><p>{state.cart.reduce((n, l) => n + l.quantity, 0)} pieces retained in this browser. Each store has its own demo checkout.</p>{!state.cart.length && <div className="commerce-empty"><h2>Your cart is empty.</h2><a className="primary" href="#/">Browse your stores</a></div>}
 {groups.map(id => { const lines = state.cart.filter(l => (l.brandId || 'legacy') === id), ready = checkoutReady(lines, products); return <section className="commerce-panel" key={id} aria-label={(lines[0].brandName || 'Unavailable store') + ' cart'}><h2>{lines[0].brandName || 'Legacy cart items'}</h2>{lines.map((line, i) => { const { product: p, variant: v, available } = resolveLine(line, products); return <article className={'cart-line ' + (!available ? 'unavailable' : '')} key={line.productId + line.size + i}><div>{p?.image && <a href={productPath(p.id)}><CatalogueImage key={p.image} src={p.image} alt={p.name} referrerPolicy="no-referrer"/></a>}</div><div className="cart-line-info"><h3>{p?.name || line.name || 'Unavailable item'}</h3><p>{line.size}</p>{v && <p className="fine">{Object.entries(v.options).map(([name, value]) => name + ': ' + value).join(' · ')}</p>}{v ? <p>{money(Number(v.amount), v.currency)} each</p> : <p>Price unavailable</p>}{!available && <p role="status">Unavailable — store disabled, catalogue unavailable, or variant no longer offered. This item is preserved.</p>}<div className="quantity-control"><button aria-label="Decrease quantity" disabled={line.quantity === 1} onClick={() => dispatch({ type: 'adjust', productId: line.productId, size: line.size, variantKey: line.variantKey, delta: -1 })}>−</button><span aria-label="Quantity">{line.quantity}</span><button aria-label="Increase quantity" disabled={line.quantity === MAX_QUANTITY} onClick={() => dispatch({ type: 'adjust', productId: line.productId, size: line.size, variantKey: line.variantKey, delta: 1 })}>+</button></div><button className="remove-line" onClick={() => dispatch({ type: 'remove', productId: line.productId, size: line.size, variantKey: line.variantKey })}>Remove item</button></div></article>; })}<div className="brand-subtotal"><span>Known catalogue amounts</span><Prices lines={lines} products={products}/></div>{ready ? <a className="primary" href={'#/checkout/' + encodeURIComponent(id)}>Demo checkout · {lines[0].brandName}</a> : <p>Checkout unavailable until every variant is available in one currency. Re-enable or retry the store, or remove unavailable items yourself.</p>}</section>; })}<p className="demo-note">Currencies stay separate. No combined cross-currency total, taxes, shipping, reservations or payments are calculated.</p></section>;
}
export function CheckoutScreen({ state, dispatch, products, brandId, go }: Shared & {
    brandId: string;
    go: (path: string) => void;
}) {
    const lines = state.cart.filter(l => l.brandId === brandId), ready = checkoutReady(lines, products), submitted = useRef(false), [busy, setBusy] = useState(false);
    const complete = async () => { if (!ready || submitted.current)
        return; submitted.current = true; setBusy(true); const id = 'DEMO-' + crypto.randomUUID(); if (await dispatch({ type: 'checkout', brandId, catalogue: products, id, date: new Date().toISOString() }))
        go('/orders/' + id);
    else {
        submitted.current = false;
        setBusy(false);
    } };
    return <section className="commerce-page checkout-page"><a href="#/cart">← Back to cart</a><p className="eyebrow">LOCAL DEMO CHECKOUT</p><h1>Review your selection.</h1><div className="commerce-panel">{lines.map(l => { const { product: p, variant: v } = resolveLine(l, products); return <div className="checkout-line" key={l.productId + (l.variantKey || l.size)}>{p?.image && <CatalogueImage key={p.image} src={p.image} alt={p.name}/>}<div><strong>{p?.name || l.name || 'Unavailable item'}</strong><p>{l.size} · Quantity {l.quantity}</p></div>{v && <strong>{money(Number(v.amount) * l.quantity, v.currency)}</strong>}</div>; })}<Prices lines={lines} products={products}/><p className="demo-note">Creates a record only in this browser. No request is sent to Shopify or Mock Shop, no stock is reserved and no payment is taken.</p>{!ready && <p role="alert">Checkout unavailable. All items must be available from the enabled store in a single currency.</p>}<button className="primary wide" disabled={!ready || busy} onClick={complete}>Place demo order</button><a className="text-action" href="#/cart">Cancel and keep shopping</a></div></section>;
}
export function OrdersScreen({ state, orderId }: {
    state: CommerceState;
    orderId?: string;
}) {
    const [filter, setFilter] = useState('All');
    const order = state.orders.find(o => o.id === orderId);
    const storeIds = [...new Set(state.orders.map(o => o.brandId))];
    if (orderId)
        return <section className="commerce-page"><a href="#/orders">← All your demo orders</a>{!order ? <h1>Order not found in this browser.</h1> : <><h1>{order.legacy ? 'Earlier demo order' : 'Demo order placed'}</h1><p>{order.legacy ? 'Preserved from the previous catalogue. This is your historical demo snapshot.' : 'Saved locally. No payment taken or order sent to a merchant.'}</p><div className="commerce-panel"><h2>{order.brandName || order.brandId}</h2><dl className="order-metadata"><dt>Order ID</dt><dd>{order.id}</dd><dt>Recorded</dt><dd>{new Date(order.date).toLocaleString()}</dd></dl><p>{order.legacy ? 'Historical status: ' + order.status : 'Recorded locally · No shipment or tracking'}</p>{order.lines.map((l, i) => <div className="checkout-line" key={i}>{!order.legacy && l.image && <CatalogueImage key={l.image} src={l.image} alt={l.name}/>}<div><strong>{l.name}</strong><p>{l.size} · Quantity {l.quantity}</p></div><strong>{money(l.price * l.quantity, l.currency)}</strong></div>)}<Total lines={order.lines}/><a className="primary" href="#/orders">View all orders</a></div></>}</section>;
    const orders = state.orders.filter(o => filter === 'All' || o.brandId === filter);
    return <section className="commerce-page"><p className="eyebrow">YOUR RECORDS</p><h1>Orders.</h1><p>Only demo orders placed in this browser. No seeded examples or real purchases.</p><label>Filter orders by store<select value={filter} onChange={e => setFilter(e.target.value)}><option value="All">All stores</option>{storeIds.map(id => <option key={id} value={id}>{state.orders.find(o => o.brandId === id)?.brandName || id}</option>)}</select></label>{!orders.length && <div className="commerce-empty"><h2>No demo orders yet.</h2><a className="primary" href="#/">Browse onboarded stores</a></div>}<div className="order-grid">{orders.map(o => <a className="order-card commerce-panel" href={'#/orders/' + encodeURIComponent(o.id)} key={o.id}><p className="eyebrow">{o.legacy ? 'PRESERVED EARLIER DEMO' : 'YOUR DEMO ORDER'}</p><h2>{o.brandName || o.brandId}</h2><p>{new Date(o.date).toLocaleString()}</p><p>{o.lines.reduce((n, l) => n + l.quantity, 0)} pieces</p><Total lines={o.lines}/><span>View order →</span></a>)}</div>{state.legacySamples.length > 0 && <p className="legacy-note">{state.legacySamples.length} old seeded examples retained in the storage archive, excluded from your orders.</p>}</section>;
}
export function ProfileScreen({ state, dispatch, saved, followed, products, brands, unfollow }: Shared & {
    saved: string[];
    followed: string[];
    brands: Brand[];
    unfollow: (id: string) => void;
}) {
    const [preferences, setPreferences] = useState(state.preferences), [message, setMessage] = useState('');
    const knownSaved = saved.filter(id => products.some(p => p.id === id));
    return <section className="commerce-page"><p className="eyebrow">THIS BROWSER</p><h1>Your local space.</h1><p>No signed-in identity or real account is connected.</p><div className="profile-links"><a href="#/orders"><strong>{state.orders.length}</strong><span>Your demo orders</span></a><a href="#/saved"><strong>{knownSaved.length}</strong><span>Available saved pieces</span></a><a href="#/cart"><strong>{state.cart.reduce((n, l) => n + l.quantity, 0)}</strong><span>Retained cart pieces</span></a></div><section className="commerce-panel"><h2>Followed stores</h2>{brands.filter(b => followed.includes(b.id)).map(b => <p key={b.id}><a href={'#/brand/' + b.id}>{b.name}</a></p>)}{!brands.some(b => followed.includes(b.id)) && <p>No available followed stores.</p>}{followed.filter(id => !brands.some(b => b.id === id)).map(id => <div className="unavailable-reference" key={id}><span>Unavailable followed store: {id}</span><button className="secondary" onClick={() => unfollow(id)}>Unfollow {id}</button></div>)}<a className="primary" href="#/merchant">Manage demo stores</a></section><section className="commerce-panel"><h2>For brand owners</h2><p>Review Shopify connection readiness in the separate merchant dashboard.</p><a className="secondary" href="#/owner">Brand-owner dashboard</a></section><form className="commerce-panel preferences" onSubmit={async (e) => { e.preventDefault(); setMessage(await dispatch({ type: 'preferences', value: preferences }) ? 'Preferences saved in this browser.' : 'Preferences were not saved. Check the storage message.'); }}><h2>Your preferences</h2><label>Favourite style<select value={preferences.style} onChange={e => setPreferences({ ...preferences, style: e.target.value })}>{['', 'Everyday', 'Minimal', 'Statement'].map(s => <option key={s} value={s}>{s || 'Not selected'}</option>)}</select></label><label>Preferred fit<select value={preferences.fit} onChange={e => setPreferences({ ...preferences, fit: e.target.value })}>{['', 'Relaxed', 'Regular', 'Fitted'].map(s => <option key={s} value={s}>{s || 'Not selected'}</option>)}</select></label><button className="primary" type="submit">Save preferences</button>{message && <p role="status">{message}</p>}<p>Preferences remain local; they do not change store inventory or send notifications.</p></form><LocalDataTools /><section className="commerce-panel"><h2>Authentication UI preview</h2><p>The OTP simulation sends no message and creates no account.</p><a className="secondary" href="#/login">Preview WhatsApp OTP login</a></section></section>;
}
