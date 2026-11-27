import {createRemoteJWKSet,jwtVerify} from 'jose';
import {appleConfigured, appleIssuer, exchangeApple} from './apple.js';
import {body,bytes,cookie,digest,fail,identity,input,json,now,random,readCookie,session,shopPattern,validMac} from './http.js';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const token=/^[A-Za-z0-9_-]{43}$/;
const base='/api/auth/sign-in/';
const appReturn='fashioncentre://auth/complete';
export const appleCallback=base+'apple/callback';

export function appleReady(req,env) {
  const origin = new URL(req.url).origin;
  return origin.startsWith('https://') && origin === env.AUTH_PUBLIC_ORIGIN && appleConfigured(env);
}

function bindingCookie(provider,name,value,ttl) {
  const result = cookie(name,value,ttl);
  // Apple's form_post is cross-site. The callback still requires state and this binding cookie.
  return provider === 'apple' ? result.replace('SameSite=Lax','SameSite=None') : result;
}

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
  if(p==='apple')return exchangeApple(env,params,key,callback);
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
  const u=new URL(req.url),q=u.searchParams;
  const google=p==='google', apple=p==='apple', shopify=p==='shopify';
  if(!google&&!apple&&!shopify)fail(404,'Unknown provider.');
  // Keep the existing shopper session kind for Google, WhatsApp and Apple.
  const kind=shopify?'shopify':'google';
  if(action==='me'&&shopify&&req.method==='GET')return json({shop:await identity(req,env,kind)});
  if(action==='logout'&&req.method==='POST'){
    const name=shopify?'fc_merchant':'fc_session';
    await env.DB.prepare('DELETE FROM sessions WHERE kind=? AND hash=?').bind(kind,await digest(readCookie(req,name))).run();
    return new Response(null,{status:204,headers:{'Set-Cookie':cookie(name,'',0)}});
  }
  const origin=env.AUTH_PUBLIC_ORIGIN;
  const id=apple?env.APPLE_SERVICES_ID:google?env.GOOGLE_CLIENT_ID:env.SHOPIFY_CLIENT_ID;
  const configured=apple?appleReady(req,env):Boolean(id&&(google?env.GOOGLE_CLIENT_SECRET:env.SHOPIFY_CLIENT_SECRET));
  if(!configured||!origin||u.origin!==origin)fail(503,'Provider setup required.');
  const callback=origin+base+p+'/callback';
  if(action==='start'&&req.method==='POST'){
    const {platform,shop,returnTo}=await input(req)||{};
    if(!['native','web'].includes(platform)||(shopify&&!shopPattern.test(shop))||
       (returnTo!=null&&(platform!=='native'||returnTo!==appReturn)))fail(400,'Invalid sign-in request.');
    const url=new URL(base+p+'/browser',origin);url.searchParams.set('platform',platform);
    if(shopify)url.searchParams.set('shop',shop);
    if(platform==='web')return json({url:url.href});
    if(returnTo===appReturn)url.searchParams.set('return',appReturn);
    const verifier=random();url.searchParams.set('challenge',await digest(verifier));return json({url:url.href,verifier});
  }
  if(action==='browser'&&req.method==='GET'){
    const shop=shopify?q.get('shop'):null, challenge=q.get('challenge'), platform=q.get('platform');
    const returnTo=q.get('return');
    if(!((platform==='web'&&challenge===null&&returnTo===null)||(platform==='native'&&token.test(challenge)&&(returnTo===null||returnTo===appReturn)))||
       (shopify&&!shopPattern.test(shop)))fail(400,'Invalid sign-in request.');
    const state=random(),key=random();
    await env.DB.prepare('INSERT INTO flows VALUES(?,?,?,?,?,?)').bind(await digest(state),p,await digest(key),shop,challenge,now()+600).run();
    const dest=new URL(apple?appleIssuer+'/auth/authorize':google?'https://accounts.google.com/o/oauth2/v2/auth':'https://'+shop+'/admin/oauth/authorize');
    const params={client_id:id,redirect_uri:callback,state};
    if(shopify)Object.assign(params,{scope:'read_products','grant_options[]':'per-user'});
    else{
      Object.assign(params,{response_type:'code',nonce:await digest('nonce:'+key)});
      if(apple)Object.assign(params,{scope:'name',response_mode:'form_post'});
      else Object.assign(params,{scope:'openid profile',code_challenge_method:'S256',code_challenge:await digest(key)});
    }
    dest.search=new URLSearchParams(params).toString();
    return redirect(dest,[bindingCookie(p,'fc_bind_'+state.slice(0,16),key,600)]);
  }
  if(action==='callback'&&req.method===(apple?'POST':'GET')){
    if(apple&&req.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/x-www-form-urlencoded'){
      fail(415,'Invalid callback format.');
    }
    const params=apple?new URLSearchParams(await (await body(req,8192)).text()):q;
    const state=params.get('state');
    if(!token.test(state)||new Set(params.keys()).size!==params.size)fail(400,'Restart sign-in.');
    const name='fc_bind_'+state.slice(0,16),key=readCookie(req,name);
    const flow=await env.DB.prepare('DELETE FROM flows WHERE hash=? AND provider=? AND binding=? AND expires>? RETURNING *').bind(await digest(state),p,await digest(key),now()).first();
    if(!flow)fail(400,'Restart sign-in.');
    const cookies=[bindingCookie(p,name,'',0)],route=shopify?'#/owner':'#/login';
    let status='cancelled', reason='';
    if(!params.has('error'))try{
      if(!params.get('code'))throw new Error('Missing authorization code.');
      const who=await exchange(env,p,flow,params,key,callback);
      if(flow.challenge){
        const grant=random();await env.DB.prepare('INSERT INTO grants VALUES(?,?,?,?,?,?)').bind(await digest(grant),p,who.subject,flow.challenge,now()+90,who.expires).run();
        return redirect(appReturn+'?grant='+grant,cookies);
      }
      cookies.push(await session(env,kind,who.subject,who.expires));status='success';
    }catch(error){status='failed';if(google)reason='&reason='+(error instanceof GoogleFailure?error.reason:'provider_response');}
    return redirect(flow.challenge?appReturn+'?signin='+status+reason:origin+'/?signin='+status+reason+route,cookies);
  }
  if(action==='finish'&&req.method==='POST'){
    const {grant,verifier}=await input(req);if(!token.test(grant)||!token.test(verifier))fail(400,'Restart sign-in.');
    const row=await env.DB.prepare('DELETE FROM grants WHERE hash=? AND provider=? AND challenge=? AND expires>? RETURNING *').bind(await digest(grant),p,await digest(verifier),now()).first();
    if(!row)fail(400,'Restart sign-in.');
    return new Response(null,{status:204,headers:{'Set-Cookie':await session(env,kind,row.subject,row.session_expires)}});
  }
  fail(404,'Unknown sign-in action.');
}
