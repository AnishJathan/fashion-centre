import {body,fail,identity,input,json,shopPattern,validMac} from './http.js';
import mock from './sample-stores/mock.json' with {type:'json'};
import apparel from './sample-stores/apparel.json' with {type:'json'};

const previews = new Map([
  ['mock', {name:'Mock Shop', products:mock}],
  ['apparel', {name:'Elysian Thread (Demo)', products:apparel}],
]);
const previewDirectory = [...previews].map(([key, store]) => ({key, name:store.name, preview:true}));
const query=`{products(first:48){nodes{id title description productType createdAt featuredImage{url} variants(first:100){nodes{id title availableForSale selectedOptions{name value} price{amount currencyCode}} pageInfo{hasNextPage}}} pageInfo{hasNextPage endCursor}}}`;
export function storeKey(shop){if(!shopPattern.test(shop))fail(400,'Invalid store.');return 'shop-'+shop.split('.')[0];}
export function checkoutLink(shop,lines){
  const key=storeKey(shop);
  if(!Array.isArray(lines)||!lines.length||lines.length>250)fail(400,'Invalid basket.');
  const items=new Map();
  for(const line of lines){
    const prefix=key+':gid://shopify/ProductVariant/';
    if(typeof line?.variantKey!=='string'||!line.variantKey.startsWith(prefix))fail(400,'Basket contains another store.');
    const id=line.variantKey.slice(prefix.length),qty=(items.get(id)||0)+line.quantity;
    if(!/^[1-9]\d*$/.test(id)||!Number.isInteger(line.quantity)||line.quantity<1||qty>99)fail(400,'Invalid basket quantity or variant.');
    items.set(id,qty);
  }
  return 'https://'+shop+'/cart/'+[...items].map(([id,qty])=>id+':'+qty).join(',');
}
export async function catalogue(shop){
  const r=await fetch('https://'+shop+'/api/2026-10/graphql.json',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(12000)});
  if(!r.ok)fail(502,'The Shopify catalogue is unavailable.');
  const data=await r.json(),products=data.data?.products;
  if(data.errors||!Array.isArray(products?.nodes))fail(502,'Enable Storefront API access and publish products to this sales channel.');
  return presentCatalogue(storeKey(shop), shop.split('.')[0], products);
}
function presentCatalogue(key, name, products){
  return {shopKey:key,shopName:name,hasNextPage:products.pageInfo.hasNextPage,endCursor:products.pageInfo.endCursor,products:products.nodes.map(p=>({
    id:p.id,key:key+':'+p.id,title:p.title,category:p.productType||'Other',description:p.description||'',createdAt:p.createdAt,image:p.featuredImage?.url||'',moreVariants:p.variants.pageInfo.hasNextPage,
    variants:p.variants.nodes.map(v=>({id:v.id,key:key+':'+v.id,title:v.title,available:v.availableForSale,amount:v.price.amount,currency:v.price.currencyCode,options:Object.fromEntries(v.selectedOptions.map(o=>[o.name,o.value]))}))
  }))};
}
export async function marketplace(req,env,path){
  if(path==='/api/merchant/shopify/launch'&&req.method==='GET'){
    const shop=new URL(req.url).searchParams.get('shop');
    const next=shopPattern.test(shop)?'/api/auth/sign-in/shopify/browser?platform=web&shop='+shop:'/#/owner';
    return Response.redirect(new URL(next,req.url),303);
  }
  if(path==='/api/integrations/shopify/status'&&req.method==='GET'){
    const {results}=await env.DB.prepare('SELECT shop,name FROM stores WHERE published=1 ORDER BY name').all();
    return json({shops:[...results.map(s=>({key:storeKey(s.shop),name:s.name})), ...previewDirectory],mode:'MARKETPLACE',connected:!!results.length});
  }
  const previewKey=path.match(/^\/api\/integrations\/shopify\/catalogue\/([a-z0-9-]+)$/)?.[1];
  const preview=previews.get(previewKey);
  if(preview && req.method==='GET')return json(presentCatalogue(previewKey,preview.name,preview.products));
  const match=path.match(/^\/api\/integrations\/shopify\/(catalogue|checkout)\/shop-([a-z0-9-]+)$/);
  if(match){
    const shop=match[2]+'.myshopify.com';
    if(!shopPattern.test(shop)||!await env.DB.prepare('SELECT 1 FROM stores WHERE shop=? AND published=1').bind(shop).first())fail(404,'Store is unavailable.');
    if(match[1]==='catalogue'&&req.method==='GET')return json(await catalogue(shop));
    if(match[1]==='checkout'&&req.method==='POST')return json({url:checkoutLink(shop,(await input(req)).lines)});
  }
  if(path==='/api/merchant/shopify/readiness'&&req.method==='GET'){
    let shop;try{shop=await identity(req,env,'shopify');}catch(e){if(!(e instanceof Response)||e.status!==401)throw e;}
    const store=shop&&await env.DB.prepare('SELECT published FROM stores WHERE shop=?').bind(shop).first();
    const ready = Boolean(env.SHOPIFY_CLIENT_SECRET && env.SHOPIFY_CLIENT_ID && env.AUTH_PUBLIC_ORIGIN === new URL(req.url).origin);
    return json({
      ready, connected:Boolean(store), marketplace:true, published:Boolean(store?.published),
      blockers:ready ? [] : ['Configure Shopify client credentials and the public OAuth origin on the backend.'],
    });
  }
  if(path==='/api/merchant/shopify/products'&&req.method==='GET'){
    const shop=await identity(req,env,'shopify');
    return json(await catalogue(shop));
  }
  if(path==='/api/merchant/shopify/publish'&&req.method==='POST'){
    const shop=await identity(req,env,'shopify'),{published}=await input(req);
    if(typeof published!=='boolean')fail(400,'Invalid publication status.');
    if(published)await catalogue(shop);
    const change=await env.DB.prepare('UPDATE stores SET published=? WHERE shop=?').bind(+published,shop).run();
    if(!change.meta.changes)fail(409,'Sign in again to publish.');
    return json({published,key:storeKey(shop)});
  }
  if(path==='/api/merchant/shopify/webhook'&&req.method==='POST'){
    if(!env.SHOPIFY_CLIENT_SECRET)fail(503,'Shopify setup required.');
    const raw=await (await body(req,262144)).arrayBuffer(), sig=req.headers.get('X-Shopify-Hmac-Sha256')||'';
    if(!/^[A-Za-z0-9+/]{43}=$/.test(sig)||!await validMac(env.SHOPIFY_CLIENT_SECRET,raw,Uint8Array.from(atob(sig),v=>v.charCodeAt(0))))fail(401,'Invalid signature.');
    const payload=JSON.parse(new TextDecoder().decode(raw)),topic=req.headers.get('X-Shopify-Topic');
    if(['app/uninstalled','shop/redact'].includes(topic)){
      const shop=payload.myshopify_domain||payload.shop_domain;
      if(!shopPattern.test(shop)||shop!==req.headers.get('X-Shopify-Shop-Domain'))fail(400,'Invalid store.');
      await env.DB.batch([['DELETE FROM stores WHERE shop=?'],["DELETE FROM sessions WHERE kind='shopify' AND subject=?"],["DELETE FROM grants WHERE provider='shopify' AND subject=?"],['DELETE FROM flows WHERE shop=?']].map(([sql])=>env.DB.prepare(sql).bind(shop)));
    }
    return new Response(null,{status:204});
  }
  fail(404,'Unknown marketplace action.');
}
