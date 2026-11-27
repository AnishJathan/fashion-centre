import {useEffect,useState,type FormEvent} from 'react';
import {CountryPicker} from './CountryPicker';
import {BrandLink} from './StoreNavigation';
import {browserSignIn, takeSignInResult} from './providerSignIn';
import {appleSignInAvailable} from '../mobile/src/core/providerSignIn';
import {defaultCountry, normalisePhone, type PhoneCountry} from '../mobile/src/phoneCountries';
import appleButton from '../mobile/assets/identity/apple-sign-in.png';
import googleMark from '../mobile/assets/identity/google-g.png';
import {PhotoCapture} from './PhotoCapture';

const API='/api/auth';
type Step='phone'|'code'|'photo'|'success';

async function postJson<T>(path:string,body:unknown){
  const res=await fetch(`${API}${path}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    credentials:'include',
    body:JSON.stringify(body),
  });
  const data=(await res.json().catch(()=>null)) as T|null;
  return {ok:res.ok,status:res.status,data};
}

export default function AccountScreen({close,studio=false}:{close:()=>void;studio?:boolean}){
  const [step,setStep]=useState<Step>('phone');
  const [country,setCountry]=useState<PhoneCountry>(defaultCountry);
  const [phone,setPhone]=useState('');
  const [sentTo,setSentTo]=useState('');
  const [code,setCode]=useState('');
  const [error,setError]=useState('');
  const [uploadError,setUploadError]=useState('');
  const [busy,setBusy]=useState(false);
  const [openingProvider,setOpeningProvider]=useState<'apple'|'google'|null>(null);
  const [appleAvailable,setAppleAvailable]=useState(false);
  const [expiresAt,setExpiresAt]=useState(0);
  const [resendAt,setResendAt]=useState(0);
  const [now,setNow]=useState(Date.now());
  const [devCode,setDevCode]=useState('');
  const [savedNow,setSavedNow]=useState(false); // true only right after a photo was saved in this visit

  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);

  useEffect(()=>{
    const abort=new AbortController();
    const result=takeSignInResult();
    setError(result.message);
    void appleSignInAvailable(fetch, abort.signal).then(available=>{
      if(!abort.signal.aborted)setAppleAvailable(available);
    });
    void (async()=>{
      try {
        const response=await fetch(API+'/me',{credentials:'include',cache:'no-store',signal:abort.signal});
        if (!response.ok) throw Error();
        const me=await response.json();
        if (typeof me.id!=='string' || !me.id) throw Error();
        if (!abort.signal.aborted) setStep(me.hasPhoto?'success':'photo');
      } catch {
        if (!abort.signal.aborted && result.returned) setError('Couldn’t confirm your session. Please sign in again.');
      }
    })();
    return ()=>abort.abort();
  },[]);

  async function signInWith(provider:'apple'|'google'){
    setBusy(true);setOpeningProvider(provider);setError('');
    try { await browserSignIn(provider, undefined, studio); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Couldn’t start sign-in.');
      setBusy(false);setOpeningProvider(null);
    }
  }

  async function logout(){
    setBusy(true);setError('');
    try {
      const res=await fetch(API+'/logout',{method:'POST',credentials:'include'});
      if(!res.ok) throw Error();
      setPhone('');setSentTo('');setCode('');setDevCode('');setSavedNow(false);setUploadError('');setStep('phone');
    } catch {setError('Couldn’t sign out. Please try again.');}
    finally {setBusy(false);}
  }

  const remaining=Math.max(0,Math.ceil((expiresAt-now)/1000));
  const cooldown=Math.max(0,Math.ceil((resendAt-now)/1000));

  async function requestCode(){
    let number:string;
    try { number=normalisePhone(country.dial,phone); }
    catch (cause) {setError(cause instanceof Error?cause.message:'Check your phone number.');return;}
    setBusy(true);setError('');
    try{
      const r=await postJson<{expiresInSeconds?:number;resendInSeconds?:number;devCode?:string}>('/request-code',{phone:number});
      if(!r.ok){
        setError(r.status===429
          ?'Too many requests. Please wait a few minutes.'
          :'We could not send the code. Check the number and try again.');
        return;
      }
      setDevCode(r.data?.devCode ?? '');
      const t=Date.now();setNow(t);
      setExpiresAt(t+(r.data?.expiresInSeconds??120)*1000);
      setResendAt(t+(r.data?.resendInSeconds??30)*1000);
      setSentTo(number);
      setCode('');
      setStep('code');
    }catch{
      setError('Network error. Check your connection and try again.');
    }finally{
      setBusy(false);
    }
  }

  async function verifyCode(e:FormEvent){
    e.preventDefault();
    if(code.length!==6){setError('Enter the 6-digit code.');return}
    setBusy(true);setError('');
    try{
      const r=await postJson<{ok:boolean;hasPhoto?:boolean}>('/verify-code',{phone:sentTo,code});
      if(!r.ok){
        setError(r.status===410
          ?'This code has expired. Request a new one.'
          :r.status===429
            ?'Too many attempts. Request a new code.'
            :'That code is not correct.');
        return;
      }
      // Returning user with a saved photo: skip the photo step
      setSavedNow(false);
      setStep(r.data?.hasPhoto?'success':'photo');
    }catch{
      setError('Network error. Check your connection and try again.');
    }finally{
      setBusy(false);
    }
  }

  async function savePhoto(file:Blob){
    setBusy(true);setUploadError('');
    try{
      const form=new FormData();
      form.append('file',file,'full-body.jpg');
      const res=await fetch('/api/users/me/photo',{method:'POST',body:form,credentials:'include'});
      if(!res.ok){
        setUploadError(res.status===401
          ?'Your session expired. Please sign in again.'
          :'We could not save your photo. Please try again.');
        return;
      }
      setSavedNow(true);
      setStep('success');
    }catch{
      setUploadError('Network error. Check your connection and try again.');
    }finally{
      setBusy(false);
    }
  }

  return(
    <section className="login-demo">
      <div className="login-card">
        <span className="pill">
          {step==='phone'?'Welcome back':step==='code'?'WhatsApp verification':'Your account'}
        </span>

        {step==='phone'&&(
          <>
            <h1>Sign in to <em>Fashion Centre</em></h1>
            <button className="google-signin wide" type="button" aria-busy={openingProvider==='google'} disabled={busy} onClick={()=>void signInWith('google')}>
              <img src={googleMark} width="20" height="20" alt=""/>{openingProvider==='google'?'Opening Google…':'Continue with Google'}
            </button>
            {appleAvailable&&(
              <button className="apple-signin wide" type="button" aria-label="Sign in with Apple"
                aria-busy={openingProvider==='apple'} disabled={busy} onClick={()=>void signInWith('apple')}>
                <img src={appleButton} alt="" width="240" height="48"/>
              </button>
            )}
            <p className="signin-divider">or use WhatsApp</p>
            <form onSubmit={e=>{e.preventDefault();void requestCode();}}>
              <label htmlFor="phone">WhatsApp number</label>
              <div className="phone-entry">
                <CountryPicker country={country} onChange={setCountry} disabled={busy}/>
                <input id="phone" type="tel" autoComplete="tel-national" placeholder="Mobile number"
                  value={phone} onChange={e=>setPhone(e.target.value)} maxLength={22} disabled={busy}/>
              </div>
              <button type="submit" className="primary wide" disabled={busy}>
                {busy&&!openingProvider?'Sending code…':'Send code on WhatsApp →'}
              </button>
            </form>
            <BrandLink className="merchant-login-link" href="#/owner">For stores</BrandLink>
          </>
        )}

        {step==='code'&&(
          <>
            <h1>Check WhatsApp.</h1>
            <p>We sent a code to <strong>{sentTo.slice(0,3)} •••• {sentTo.slice(-3)}</strong>.</p>
            {devCode&&<p className="fine">Dev Code: {devCode}</p>}
            <form onSubmit={verifyCode}>
              <label htmlFor="otp">Enter 6-digit code</label>
              <input id="otp" className="otp-input" inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}
                placeholder="000000"/>
              <p className="fine">{remaining>0?`Code expires in ${remaining}s`:'This code has expired.'}</p>
              <button type="submit" className="primary wide" disabled={busy||remaining===0}>
                {busy?'Checking…':'Verify code'}
              </button>
            </form>
            <div className="login-actions">
              <button disabled={cooldown>0||busy} onClick={requestCode}>
                {cooldown>0?`Resend in ${cooldown}s`:'Resend code'}
              </button>
              <button onClick={()=>{setStep('phone');setError('')}}>Change number</button>
            </div>
          </>
        )}

        {step==='photo'&&(
          <>
            <p role="status">You’re signed in. Add a photo for try-on whenever you’re ready.</p>
            <PhotoCapture onAccepted={savePhoto} busy={busy} uploadError={uploadError}/>
            <button className="secondary wide" disabled={busy} onClick={close}>Skip photo and start browsing</button>
          </>
        )}

        {step==='success'&&(
          <>
            <div className="success-mark">✓</div>
            <h1>{savedNow?'You’re all set.':'Welcome back.'}</h1>
            <p>{savedNow
              ?'Your full-body photo is ready for try-on.'
              :'Your full-body photo is saved and ready for try-on.'}</p>
            <button className="primary wide" onClick={close}>{studio?'Return to Try On':'Start browsing →'}</button>
            {!savedNow&&(
              <button className="secondary wide" onClick={()=>{setUploadError('');setStep('photo')}}>
                Take a new photo
              </button>
            )}
          </>
        )}

        {(step==='photo'||step==='success')&&<button className="text-action wide" disabled={busy} onClick={logout}>Sign out</button>}
        {error&&<p role="alert" className="login-error">{error}</p>}
        <button className="secondary wide" disabled={busy} onClick={close}>{studio?'Back to Try On':'Back to local profile'}</button>
      </div>
    </section>
  );
}
