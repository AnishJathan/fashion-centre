import {useEffect,useState} from 'react';

/** Presentation-only authentication prototype. Never creates a session or sends a request. */
export function LoginDemo({close}:{close:()=>void}) {
 const [step,setStep]=useState<'phone'|'code'|'success'>('phone');
 const [country,setCountry]=useState('+61');
 const [phone,setPhone]=useState('');
 const [code,setCode]=useState('');
 const [error,setError]=useState('');
 const [expiresAt,setExpiresAt]=useState(0);
 const [resendAt,setResendAt]=useState(0);
 const [now,setNow]=useState(Date.now());
 const [expired,setExpired]=useState(false);
 const [attempts,setAttempts]=useState(0);
 const [message,setMessage]=useState('');
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 const remaining=Math.max(0,Math.ceil((expiresAt-now)/1000));
 const cooldown=Math.max(0,Math.ceil((resendAt-now)/1000));
 const isExpired=expired||(step==='code'&&remaining===0);
 const reset=()=>{setStep('phone');setCode('');setError('');setMessage('');setExpired(false);setAttempts(0)};
 function issueDemoCode(){const time=Date.now();setNow(time);setExpiresAt(time+120000);setResendAt(time+30000);setCode('');setError('');setExpired(false);setAttempts(0);setStep('code');setMessage('Demo code ready. No WhatsApp message was sent.');}
 function start(){if(!/^\d{7,12}$/.test(phone.replace(/[\s()-]/g,''))){setError('Enter 7–12 digits, without the country code. A sample number is fine.');return}issueDemoCode();}
 function verify(){if(isExpired){setError('This demo code has expired. Request another code.');return}if(attempts>=3){setError('Too many demo attempts. Request a new code.');return}if(code!=='123456'){setAttempts(n=>n+1);setError('That code does not match. For this simulation, enter 123456.');return}setStep('success');setCode('');setError('');setMessage('');}
 return <section className="login-demo"><button className="back" onClick={close}>← Back to Fashion Centre</button><div className="login-card"><span className="pill">WHATSAPP OTP · UI SIMULATION</span>
 {step==='phone'?<><h1>Your style.<br/><em>All together.</em></h1><p>In the planned experience, we’ll send a one-time code to your WhatsApp number.</p><p className="demo-note">This local demo sends nothing. Use a sample number; it stays only in this screen’s memory.</p><form onSubmit={e=>{e.preventDefault();start()}}><label htmlFor="country">Country code</label><select id="country" value={country} onChange={e=>setCountry(e.target.value)}><option value="+61">Australia +61</option><option value="+91">India +91</option><option value="+1">US / Canada +1</option><option value="+44">United Kingdom +44</option></select><label htmlFor="phone">WhatsApp number</label><input id="phone" type="tel" autoComplete="off" placeholder="400 000 000" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={18}/><button type="submit" className="primary wide">Continue with demo OTP →</button></form><button className="text-action" onClick={()=>setError('Simulated delivery failure. Nothing was sent. Please try the demo again.')}>Simulate delivery failure</button></>:
 step==='code'?<><h1>Check WhatsApp.</h1><p>In the live flow, a code would arrive at <strong>{country} •••• {phone.replace(/\D/g,'').slice(-3)}</strong>.</p><div className="demo-note">Demo code: <strong>123456</strong><br/>No message sent. This code cannot authenticate anyone.</div><form onSubmit={e=>{e.preventDefault();verify()}}><label htmlFor="otp">Enter 6-digit code</label><input id="otp" className="otp-input" inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="000000"/><p className="fine">{isExpired?'Demo code expired':`Demo code expires in ${remaining}s`}</p><button type="submit" className="primary wide">Verify demo code</button></form><div className="login-actions"><button disabled={cooldown>0} onClick={issueDemoCode}>{cooldown>0?`Resend in ${cooldown}s`:'Resend demo code'}</button><button onClick={reset}>Change number</button></div><button className="text-action" onClick={()=>{setExpired(true);setResendAt(0);setMessage('Demo expiry simulated. You can request another code.')}}>Simulate expiry</button></>:
 <><div className="success-mark">✓</div><h1>You’re ready<br/>to explore.</h1><p>Demo verification complete.</p><div className="demo-note">No account was created and no authenticated session exists. Your favourites remain saved only in this browser.</div><button className="primary wide" onClick={close}>Continue browsing →</button><button className="text-action" onClick={reset}>Restart simulation</button></>}
 {error&&<p role="alert" className="login-error">{error}</p>}{message&&<p role="status" className="fine">{message}</p>}{step!=='success'&&<button className="cancel-login" onClick={close}>Cancel and browse</button>}
 </div></section>
}
