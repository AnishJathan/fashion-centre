import {body,fail,identity,json} from './http.js';
const max=10*1024*1024, origin='https://api.pruna.ai';
async function image(req,env,field){
  const type=req.headers.get('Content-Type')||'';
  if(!type.startsWith('multipart/form-data'))fail(415,'Use a multipart image upload.');
  const form=await new Response(await body(req,max+32768),{headers:{'Content-Type':type}}).formData();
  const file=form.get(field);if(!(file instanceof File)||!file.size||file.size>max)fail(400,'Invalid image.');
  const info=await env.IMAGES.info(file.stream()).catch(()=>null);
  if(!info||!['image/jpeg','image/png','image/webp'].includes(info.format)||info.width*info.height>40000000)fail(400,'Unsupported image.');
  const output=await env.IMAGES.input(file.stream()).transform({width:2048,height:2048,fit:'scale-down'}).output({format:'image/jpeg',quality:90});
  return output.response().blob();
}
async function pruna(env,path,options={}){
  const r=await fetch(origin+path,{...options,redirect:'manual',signal:AbortSignal.timeout(20000),headers:{apikey:env.PRUNA_API_KEY,...options.headers}});
  if(!r.ok)fail(502,'Try-on provider unavailable.');return r;
}
async function upload(env,file,name){
  const data=new FormData();data.set('content',file,name);
  const {urls}=await (await pruna(env,'/v1/files',{method:'POST',body:data})).json();
  if(typeof urls?.get!=='string'||new URL(urls.get).protocol!=='https:')fail(502,'Invalid provider response.');
  return urls.get;
}
export async function photos(req,env,path){
  const user=await identity(req,env,'google'), key='photos/'+user+'.jpg';
  if(!env.PHOTOS || !env.IMAGES)fail(503,'Photo storage setup required.');
  if(path==='/api/users/me/photo'){
    if(req.method==='POST'){
      const file=await image(req,env,'file');await env.PHOTOS.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:'image/jpeg'}});
      await env.DB.prepare('UPDATE users SET photo_key=? WHERE id=?').bind(key,user).run();return json({ok:true});
    }
    if(req.method==='HEAD'){
      const stored=await env.PHOTOS.head(key);
      return new Response(null,{status:stored?200:404,headers:{'Cache-Control':'no-store',...(stored?{'Content-Type':'image/jpeg'}:{})}});
    }
    if(req.method==='GET'){const obj=await env.PHOTOS.get(key);if(!obj)fail(404,'Add a photo first.');return new Response(obj.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store'}});}
  }
  if(!env.PRUNA_API_KEY)fail(503,'Try-on provider setup required.');
  if(path==='/api/try-on/me'&&req.method==='POST'){
    const person=await env.PHOTOS.get(key);if(!person)fail(409,'Add a photo first.');
    const garment=await image(req,env,'garment');
    const [personUrl,garmentUrl]=await Promise.all([upload(env,await person.blob(),'person.jpg'),upload(env,garment,'garment.jpg')]);
    const r=await pruna(env,'/v1/predictions',{method:'POST',headers:{'Content-Type':'application/json',Model:'p-image-try-on'},body:JSON.stringify({input:{person_image:personUrl,garment_images:[garmentUrl],prompt:'',output_format:'jpg'}})});
    const {id}=await r.json();if(typeof id!=='string'||!/^[\w-]{1,128}$/.test(id))fail(502,'Invalid provider response.');
    const local=crypto.randomUUID();await env.DB.prepare('INSERT INTO predictions VALUES(?,?,?)').bind(local,user,id).run();return json({id:local});
  }
  const m=path.match(/^\/api\/try-on\/([a-f0-9-]{36})(\/result)?$/);
  if(!m||req.method!=='GET')fail(404,'Unknown prediction.');
  const row=await env.DB.prepare('SELECT provider_id FROM predictions WHERE id=? AND user_id=?').bind(m[1],user).first();
  if(!row)fail(404,'Unknown prediction.');
  const status=await (await pruna(env,'/v1/predictions/status/'+row.provider_id)).json();
  if(!['starting','processing','succeeded','failed','canceled'].includes(status.status))fail(502,'Unknown provider status.');
  if(!m[2])return json({status:status.status});
  if(status.status!=='succeeded')fail(409,'Prediction is incomplete.');
  const url=new URL(status.generation_url,origin);
  if(url.origin!==origin||url.username||url.password||url.search||url.hash||!/^\/v1\/predictions\/delivery\/(?:[\w-]+\/)+[\w-]+\.jpe?g$/.test(url.pathname))fail(502,'Invalid provider delivery.');
  const result=await body(await pruna(env,url.pathname),max);
  return new Response(result,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
