export const now = () => Math.floor(Date.now() / 1000);
export const bytes = value => new TextEncoder().encode(value);
export function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async value => base64url(await crypto.subtle.digest('SHA-256',bytes(value)));
export function fail(status, message) { throw new Response(JSON.stringify({message}), {status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}); }
export function json(value,status=200) { return Response.json(value,{status,headers:{'Cache-Control':'no-store'}}); }
export const cookie = (name,value,ttl) => name+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+ttl;
export function readCookie(req,name) { return (req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||''; }
export const shopPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;
export async function identity(req,env,kind) {
  const key=readCookie(req,kind==='google'?'fc_session':'fc_merchant');
  const row=key && await env.DB.prepare('SELECT subject FROM sessions WHERE hash=? AND kind=? AND expires>?').bind(await digest(key),kind,now()).first();
  if(!row) fail(401,'Please sign in.');
  return row.subject;
}
export async function session(env,kind,subject,expires) {
  const key=random(), ttl=expires-now();
  if(ttl<=0) fail(401,'Sign-in expired.');
  await env.DB.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await digest(key),kind,subject,expires).run();
  return cookie(kind==='google'?'fc_session':'fc_merchant',key,ttl);
}
export async function validMac(secret,message,signature) {
  const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,signature,message);
}
export async function body(req,limit) {
  if(Number(req.headers.get('Content-Length'))>limit) fail(413,'Request too large.');
  const reader=req.body?.getReader(),chunks=[];let size=0;
  if(!reader) fail(400,'Missing body.');
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail(413,'Request too large.');}chunks.push(value);}
  return new Blob(chunks);
}
export async function input(req) { try {return JSON.parse(await (await body(req,8192)).text());}catch(e){if(e instanceof Response)throw e;fail(400,'Invalid request.');} }
