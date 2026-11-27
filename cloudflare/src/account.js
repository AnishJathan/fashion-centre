import {bytes,digest,fail,identity,input,json,now,session} from './http.js';
const validPhone=/^\+[1-9]\d{7,14}$/;
async function otpDigest(env,phone,code){
  const k=await crypto.subtle.importKey('raw',bytes(env.OTP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,bytes(phone+':'+code))),v=>v.toString(16).padStart(2,'0')).join('');
}
export async function account(req,env,path){
  if(path==='/api/auth/me' && req.method==='POST'){
    const id=await identity(req,env,'google');
    const data=await input(req);
    if(data?.accountId!==id)fail(409,'Your account changed.');
    const name=typeof data.firstName==='string' ? data.firstName.trim() : '';
    if(!name || name.length>80 || /[\u0000-\u001f\u007f]/.test(name))fail(400,'Enter a valid name.');
    const result=await env.DB.prepare('UPDATE users SET first_name=? WHERE id=?').bind(name,id).run();
    if(!result.meta.changes)fail(401,'Sign in again.');
    return json({firstName:name});
  }
  if(path==='/api/auth/me'&&req.method==='GET'){
    const id=await identity(req,env,'google'),u=await env.DB.prepare('SELECT first_name,phone,photo_key FROM users WHERE id=?').bind(id).first();
    if(!u)fail(401,'Sign in again.');
    return json({id,firstName:u.first_name,phone:u.phone?'•••• '+u.phone.slice(-3):'',hasPhoto:!!u.photo_key});
  }
  if(req.method!=='POST'||!['/api/auth/request-code','/api/auth/verify-code'].includes(path))fail(404,'Unknown account action.');
  if(!env.OTP_SECRET||!env.WHATSAPP_TOKEN||!env.WHATSAPP_PHONE_ID||!env.WHATSAPP_TEMPLATE)fail(503,'WhatsApp delivery is unavailable.');
  const {phone,code}=await input(req)||{};
  if(typeof phone!=='string'||!validPhone.test(phone))fail(400,'Invalid phone.');
  const t=now();
  if(path.endsWith('/request-code')){
    const pin=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0'),hash=await otpDigest(env,phone,pin);
    const row=await env.DB.prepare(`INSERT INTO codes VALUES(?,?,?,0,?,?,1) ON CONFLICT(phone) DO UPDATE SET digest=excluded.digest,expires=excluded.expires,attempts=0,sent=excluded.sent,window_start=CASE WHEN window_start<=?-3600 THEN excluded.sent ELSE window_start END,sends=CASE WHEN window_start<=?-3600 THEN 1 ELSE sends+1 END WHERE sent<=?-30 AND (sends<5 OR window_start<=?-3600) RETURNING phone`).bind(phone,hash,t+120,t,t,t,t,t,t).first();
    if(!row)fail(429,'Please wait before requesting another code.');
    try {
      const delivery=await fetch('https://graph.facebook.com/v24.0/'+env.WHATSAPP_PHONE_ID+'/messages',{
        method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),
        headers:{Authorization:'Bearer '+env.WHATSAPP_TOKEN,'Content-Type':'application/json'},
        body:JSON.stringify({
          messaging_product:'whatsapp',to:phone.slice(1),type:'template',
          template:{
            name:env.WHATSAPP_TEMPLATE,language:{code:env.WHATSAPP_LANGUAGE||'en_US'},
            components:[
              {type:'body',parameters:[{type:'text',text:pin}]},
              {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:pin}]},
            ],
          },
        }),
      });
      if(delivery.ok)return json({expiresInSeconds:120,resendInSeconds:30});
    } catch {
      // Preserve the cooldown and quota if delivery failed or timed out.
    }
    await env.DB.prepare('UPDATE codes SET expires=0 WHERE phone=? AND digest=? AND sent=?').bind(phone,hash,t).run();
    fail(503,'WhatsApp delivery is unavailable.');
  }
  if(typeof code!=='string'||!/^\d{6}$/.test(code))fail(400,'Enter six digits.');
  const attempt=await env.DB.prepare('UPDATE codes SET attempts=attempts+1 WHERE phone=? AND expires>? AND attempts<5 RETURNING digest').bind(phone,t).first();
  if(!attempt)fail(410,'Request a new code.');
  const hash=await otpDigest(env,phone,code);
  if(hash!==attempt.digest||!(await env.DB.prepare('UPDATE codes SET expires=0 WHERE phone=? AND digest=? AND expires>?').bind(phone,hash,t).run()).meta.changes)fail(401,'Incorrect code.');
  const user=await env.DB.prepare('INSERT INTO users(id,phone) VALUES(?,?) ON CONFLICT(phone) DO UPDATE SET phone=excluded.phone RETURNING id,photo_key').bind(crypto.randomUUID(),phone).first();
  const response=json({ok:true,hasPhoto:!!user.photo_key});response.headers.set('Set-Cookie',await session(env,'google',user.id,t+2592000));return response;
}
