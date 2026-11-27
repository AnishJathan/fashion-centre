import {account} from './account.js';
import {appleCallback,appleReady,oauth} from './oauth.js';
import {marketplace} from './marketplace.js';
import {photos} from './photos.js';
import {fail,json,now} from './http.js';

export default {
  async fetch(req,env){
    const url=new URL(req.url),path=url.pathname;
    try{
      if(!path.startsWith('/api/'))return env.ASSETS.fetch(req);
      if(req.method==='POST'&&path!==appleCallback&&req.headers.has('Origin')&&req.headers.get('Origin')!==url.origin)fail(403,'Origin mismatch.');
      if(path==='/api/auth/providers'&&req.method==='GET')return json({apple:appleReady(req,env)});
      const auth=path.match(/^\/api\/auth\/sign-in\/(google|apple|shopify)\/(start|browser|callback|finish|me|logout)$/);
      if(auth)return await oauth(req,env,auth[1],auth[2]);
      if(path==='/api/auth/logout')return await oauth(req,env,'google','logout');
      if(path.startsWith('/api/auth/'))return await account(req,env,path);
      if(path.startsWith('/api/merchant/')||path.startsWith('/api/integrations/'))return await marketplace(req,env,path);
      if(path==='/api/users/me/photo'||path.startsWith('/api/try-on/'))return await photos(req,env,path);
      return json({message:'Unknown endpoint.'},404);
    }catch(e){return e instanceof Response?e:json({message:'The service could not complete this request.'},500);}
  },
  async scheduled(event,env){
    await env.DB.batch(['flows','grants','sessions'].map(table=>env.DB.prepare('DELETE FROM '+table+' WHERE expires<=?').bind(now())).concat(env.DB.prepare('DELETE FROM codes WHERE window_start<=?').bind(now()-3600)));
  }
};
