import {useEffect,useState,type FormEvent} from 'react';
import {PhotoCapture} from './PhotoCapture';

const API='/api/auth';
type Step='phone'|'code'|'photo'|'success';

const PHONE_LENGTH:Record<string,number>={'+61':9,'+91':10,'+1':10,'+44':10};

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

// Returns the national digits (without country code or trunk 0) and the full number
function normalisePhone(country:string,input:string){
  const code=country.replace('+','');
  const trimmed=input.trim();
  let digits=trimmed.replace(/\D/g,'');
  if(trimmed.startsWith('+')||trimmed.startsWith('00')){
    digits=digits.replace(/^00/,'');
    if(digits.startsWith(code)) digits=digits.slice(code.length);
  }
  digits=digits.replace(/^0/,'');
  return {digits,number:`+${code}${digits}`};
}

export function LoginDemo({close}:{close:()=>void}){
  const [step,setStep]=useState<Step>('phone');
  const [country,setCountry]=useState('+61');
  const [phone,setPhone]=useState('');
  const [sentTo,setSentTo]=useState('');
  const [code,setCode]=useState('');
  const [error,setError]=useState('');
  const [uploadError,setUploadError]=useState('');
  const [busy,setBusy]=useState(false);
  const [expiresAt,setExpiresAt]=useState(0);
  const [resendAt,setResendAt]=useState(0);
  const [now,setNow]=useState(Date.now());
  const [devCode,setDevCode]=useState('');
  const [savedNow,setSavedNow]=useState(false); // true only right after a photo was saved in this visit

  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);

  const remaining=Math.max(0,Math.ceil((expiresAt-now)/1000));
  const cooldown=Math.max(0,Math.ceil((resendAt-now)/1000));

  async function requestCode(){
    const {digits,number}=normalisePhone(country,phone);
    if(digits.length!==PHONE_LENGTH[country]){
      setError(`Enter a ${PHONE_LENGTH[country]}-digit WhatsApp number for ${country}.`);
      return;
    }
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
          {step==='photo'?'STEP 2 OF 2':'WHATSAPP VERIFICATION'}
        </span>

        {step==='phone'&&(
          <>
            <h1>Your style.<br/><em>All together.</em></h1>
            <p>We’ll send a one-time code to your WhatsApp number.</p>
            <form onSubmit={e=>{e.preventDefault();requestCode()}}>
              <label htmlFor="country">Country code</label>
              <select id="country" value={country} onChange={e=>setCountry(e.target.value)}>
                <option value="+61">Australia +61</option>
                <option value="+91">India +91</option>
                <option value="+1">US / Canada +1</option>
                <option value="+44">United Kingdom +44</option>
              </select>
              <label htmlFor="phone">WhatsApp number</label>
              <input id="phone" type="tel" autoComplete="tel-national" placeholder="400 000 000"
                value={phone} onChange={e=>setPhone(e.target.value)} maxLength={18}/>
              <button type="submit" className="primary wide" disabled={busy}>
                {busy?'Sending code…':'Send code on WhatsApp →'}
              </button>
            </form>
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
          <PhotoCapture onAccepted={savePhoto} busy={busy} uploadError={uploadError}/>
        )}

        {step==='success'&&(
          <>
            <div className="success-mark">✓</div>
            <h1>{savedNow?'You’re all set.':'Welcome back.'}</h1>
            <p>{savedNow
              ?'Your full-body photo is ready for try-on.'
              :'Your full-body photo is saved and ready for try-on.'}</p>
            <button className="primary wide" onClick={close}>Start browsing →</button>
            {!savedNow&&(
              <button className="secondary wide" onClick={()=>{setUploadError('');setStep('photo')}}>
                Take a new photo
              </button>
            )}
          </>
        )}

        {error&&<p role="alert" className="login-error">{error}</p>}
        <button className="secondary wide" disabled={busy} onClick={close}>Back to local profile</button>
      </div>
    </section>
  );
}