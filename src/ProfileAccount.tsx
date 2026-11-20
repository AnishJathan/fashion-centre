import { useEffect, useState } from 'react';
import { parseProfileAccount, type ProfileAccount as Account } from '../mobile/src/profileSession';
import { saveProfileName } from '../mobile/src/core/profileOptions';
import { BrandLink } from './StoreNavigation';

export function ProfileAccount() {
  const [account,setAccount] = useState<Account | null>(null);
  const [phase,setPhase] = useState<'checking'|'guest'|'ready'|'error'>('checking');
  const [revision,setRevision] = useState(0);
  const [editing,setEditing] = useState(false);
  const [name,setName] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function read() {
      try {
        const response = await fetch('/api/auth/me',{credentials:'include',cache:'no-store',signal:controller.signal});
        if(controller.signal.aborted) return;
        if(response.status===401) { setAccount(null); setPhase('guest'); return; }
        const user = response.ok && parseProfileAccount(await response.json());
        if(!user) throw new Error();
        if(!controller.signal.aborted) {setAccount(user); setPhase('ready');}
      } catch { if(!controller.signal.aborted) {setAccount(null);setPhase('error');} }
    }
    void read();
    return () => controller.abort();
  },[revision]);
  async function act(action: 'save'|'logout') {
    if(!account || busy) return;
    setBusy(true);setMessage('');
    try {
      if(action==='save') {
        const firstName=await saveProfileName(fetch,account.id,name);
        setAccount({...account,firstName});setEditing(false);setMessage('Name saved.');
      } else {
        const response=await fetch('/api/auth/logout',{method:'POST',credentials:'include'});
        if(!response.ok && response.status!==401) throw new Error('Could not sign out. Try again.');
        setAccount(null);setEditing(false);setPhase('guest');
      }
    } catch(error) {setMessage(error instanceof Error ? error.message : 'Please try again.');}
    finally {setBusy(false);}
  }
  return <section className="commerce-panel profile-account">
    <p className="eyebrow">ACCOUNT</p>
    <h2>{account?.firstName || (phase==='guest'?'Welcome to Fashion Centre':'Your account')}</h2>
    {account ? <>
      <p>{account.phone || 'Signed in'} · {account.hasPhoto?'Try-on photo saved':'Add your try-on photo'}</p>
      {editing ? <form onSubmit={e=>{e.preventDefault();void act('save');}}>
        <label>Profile name<input autoComplete="given-name" maxLength={80} required value={name} onChange={e=>setName(e.target.value)}/></label>
        <div className="profile-actions"><button className="primary" disabled={busy || !name.trim()}>Save name</button>
        <button type="button" className="secondary" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button></div>
      </form> : <div className="profile-actions">
        <button className="secondary" onClick={()=>{setName(account.firstName);setMessage('');setEditing(true);}}>Edit name</button>
        <BrandLink className="secondary" href="#/login">{account.hasPhoto?'Manage try-on photo':'Add try-on photo'}</BrandLink>
        <button className="text-action" disabled={busy} onClick={()=>void act('logout')}>Sign out</button>
      </div>}
    </> : <>
      <p>{phase==='checking'?'Checking your account…':phase==='guest'?'Sign in to save a photo and try on pieces.':'We couldn’t check your account. Your shopping options are available below.'}</p>
      {phase!=='checking' && <BrandLink className="primary" href="#/login">Sign in or manage account</BrandLink>}
      {phase==='error' && <button className="secondary" onClick={()=>setRevision(n=>n+1)}>Check account again</button>}
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
