import { useState } from 'react';
export function LocalDataTools() { const [message, setMessage] = useState(''); function download() { try {
    const keys = Object.keys(localStorage).filter(k => ['fc.commerce.v1', 'fc.commerce.v2', 'fc.stores.v1', 'fc.saved', 'fc.followed'].includes(k) || /^fc\.(commerce\.v2|stores\.v1|saved|followed)\.recovery\.\d+$/.test(k));
    const data = { format: 'fashion-centre-local-backup-v1', exportedAt: new Date().toISOString(), records: Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fashion-centre-local-backup.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Backup download requested. Keep it private; it includes your local shopping records.');
}
catch {
    setMessage('Backup could not be read. Your browser records were not changed.');
} } return <section className="commerce-panel"><h2>Your browser data</h2><p>Demo orders, cart, follows and preferences are stored on this device. They are not a cloud account. Clearing browser data can remove them.</p><button className="secondary" onClick={download}>Download local backup</button><p className="fine">Includes saved references and any recovery copies. Personal-photo previews and OTP values are never included. No upload is performed.</p>{message && <p role="status">{message}</p>}</section>; }
