import {createRemoteJWKSet,jwtVerify} from 'jose';
import {bytes,cookie,digest,fail,identity,input,json,now,random,readCookie,session,shopPattern,validMac} from './http.js';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const token=/^[A-Za-z0-9_-]{43}$/;
const base='/api/auth/sign-in/';
function redirect(url,cookies=[]) {
  const headers=new Headers({Location:url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  for(const c of cookies)headers.append('Set-Cookie',c);
  return new Response(null,{status:303,headers});
}
class GoogleFailure extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}
async function exchange(env,p,flow,params,key,callback) {
  if(p==='google'){
    const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({
      client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,code:params.get('code'),grant_type:'authorization_code',redirect_uri:callback,code_verifier:key}).toString()});
    if(!r.ok){
      const code=(await r.json().catch(()=>({}))).error;
      throw new GoogleFailure(['invalid_grant','invalid_client','invalid_request'].includes(code)?code:'token_exchange');
    }
    const {payload}=await jwtVerify((await r.json()).id_token,keys,{issuer:['accounts.google.com','https://accounts.google.com'],audience:env.GOOGLE_CLIENT_ID,algorithms:['RS256'],requiredClaims:['exp','sub','nonce']}).catch(error=>{
      const code = ['ERR_JWT_EXPIRED','ERR_JWT_CLAIM_VALIDATION_FAILED','ERR_JWKS_TIMEOUT','ERR_JWS_SIGNATURE_VERIFICATION_FAILED'].includes(error.code) ? error.code : 'token_verification';
      throw new GoogleFailure(code);
    });
    if(payload.nonce!==await digest('nonce:'+key)||!payload.sub||((payload.azp||Array.isArray(payload.aud)&&payload.aud.length>1)&&payload.azp!==env.GOOGLE_CLIENT_ID))throw new GoogleFailure('identity_binding');
    const user=await env.DB.prepare('INSERT INTO users(id,google_sub,first_name) VALUES(?,?,?) ON CONFLICT(google_sub) DO UPDATE SET google_sub=excluded.google_sub RETURNING id').bind(crypto.randomUUID(),payload.sub,String(payload.given_name||'').slice(0,80)).first();
    return {subject:user.id,expires:now()+2592000};
  }
  const mac=params.get('hmac')||'', timestamp=Number(params.get('timestamp'));
  if(params.get('shop')!==flow.shop||!Number.isFinite(timestamp)||Math.abs(now()-timestamp)>300||!/^[a-f0-9]{64}$/.test(mac))throw Error();
  const message=[...params].filter(([k])=>k!=='hmac').sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('&');
  if(!await validMac(env.SHOPIFY_CLIENT_SECRET,bytes(message),Uint8Array.from(mac.match(/../g),v=>parseInt(v,16))))throw Error();
  const r=await fetch('https://'+flow.shop+'/admin/oauth/access_token',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:env.SHOPIFY_CLIENT_ID,client_secret:env.SHOPIFY_CLIENT_SECRET,code:params.get('code')})});
  if(!r.ok)throw Error();
  const grant=await r.json();
  if(!grant.access_token||grant.associated_user?.account_owner!==true||!(grant.expires_in>0))throw Error();
  await env.DB.prepare('INSERT OR IGNORE INTO stores(shop,name) VALUES(?,?)').bind(flow.shop,flow.shop.split('.')[0]).run();
  return {subject:flow.shop,expires:now()+Math.min(86400,grant.expires_in)};
}
export async function oauth(req,env,p,action) {
  const u=new URL(req.url),q=u.searchParams, google=p==='google';
  if(!google&&p!=='shopify')fail(404,'Unknown provider.');
  if(action==='me'&&!google&&req.method==='GET')return json({shop:await identity(req,env,p)});
  if(action==='logout'&&req.method==='POST'){
    const name=google?'fc_session':'fc_merchant';
    await env.DB.prepare('DELETE FROM sessions WHERE kind=? AND hash=?').bind(p,await digest(readCookie(req,name))).run();
    return new Response(null,{status:204,headers:{'Set-Cookie':cookie(name,'',0)}});
  }
  const origin=env.AUTH_PUBLIC_ORIGIN,id=google?env.GOOGLE_CLIENT_ID:env.SHOPIFY_CLIENT_ID;
  if(!id||!(google?env.GOOGLE_CLIENT_SECRET:env.SHOPIFY_CLIENT_SECRET)||!origin||u.origin!==origin)fail(503,'Provider setup required.');
  const callback=origin+base+p+'/callback';
  if(action==='start'&&req.method==='POST'){
    const {platform,shop}=await input(req);
    if(!['native','web'].includes(platform)||(!google&&!shopPattern.test(shop)))fail(400,'Invalid sign-in request.');
    const url=new URL(base+p+'/browser',origin);url.searchParams.set('platform',platform);
    if(!google)url.searchParams.set('shop',shop);
    if(platform==='web')return json({url:url.href});
    const verifier=random();url.searchParams.set('challenge',await digest(verifier));return json({url:url.href,verifier});
  }
  if(action==='browser'&&req.method==='GET'){
    const shop=google?null:q.get('shop'), challenge=q.get('challenge'), platform=q.get('platform');
    if(!((platform==='web'&&challenge===null)||(platform==='native'&&token.test(challenge)))||(!google&&!shopPattern.test(shop)))fail(400,'Invalid sign-in request.');
    const state=random(),key=random();
    await env.DB.prepare('INSERT INTO flows VALUES(?,?,?,?,?,?)').bind(await digest(state),p,await digest(key),shop,challenge,now()+600).run();
    const dest=new URL(google?'https://accounts.google.com/o/oauth2/v2/auth':'https://'+shop+'/admin/oauth/authorize');
    dest.search=new URLSearchParams({client_id:id,redirect_uri:callback,state,...(google?{scope:'openid profile',response_type:'code',nonce:await digest('nonce:'+key),code_challenge_method:'S256',code_challenge:await digest(key)}:{scope:'read_products','grant_options[]':'per-user'})}).toString();
    return redirect(dest,[cookie('fc_bind_'+state.slice(0,16),key,600)]);
  }
  if(action==='callback'&&req.method==='GET'){
    const state=q.get('state');if(!token.test(state)||new Set(q.keys()).size!==q.size)fail(400,'Restart sign-in.');
    const name='fc_bind_'+state.slice(0,16),key=readCookie(req,name);
    const flow=await env.DB.prepare('DELETE FROM flows WHERE hash=? AND provider=? AND binding=? AND expires>? RETURNING *').bind(await digest(state),p,await digest(key),now()).first();
    if(!flow)fail(400,'Restart sign-in.');
    const cookies=[cookie(name,'',0)],route=google?'#/login':'#/owner';
    let status='cancelled', reason='';
    if(!q.has('error'))try{
      const who=await exchange(env,p,flow,q,key,callback);
      if(flow.challenge){
        const grant=random();await env.DB.prepare('INSERT INTO grants VALUES(?,?,?,?,?,?)').bind(await digest(grant),p,who.subject,flow.challenge,now()+90,who.expires).run();
        return redirect('fashioncentre://auth/complete?grant='+grant,cookies);
      }
      cookies.push(await session(env,p,who.subject,who.expires));status='success';
    }catch(error){status='failed';if(google)reason='&reason='+(error instanceof GoogleFailure?error.reason:'provider_response');}
    return redirect(flow.challenge?'fashioncentre://auth/complete?signin='+status+reason:origin+'/?signin='+status+reason+route,cookies);
  }
  if(action==='finish'&&req.method==='POST'){
    const {grant,verifier}=await input(req);if(!token.test(grant)||!token.test(verifier))fail(400,'Restart sign-in.');
    const row=await env.DB.prepare('DELETE FROM grants WHERE hash=? AND provider=? AND challenge=? AND expires>? RETURNING *').bind(await digest(grant),p,await digest(verifier),now()).first();
    if(!row)fail(400,'Restart sign-in.');
    return new Response(null,{status:204,headers:{'Set-Cookie':await session(env,p,row.subject,row.session_expires)}});
  }
  fail(404,'Unknown sign-in action.');
}
