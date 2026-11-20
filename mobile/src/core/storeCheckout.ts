type Line = {brandId?: string; variantKey?: string; quantity: number};
export function isLiveStore(id: string | undefined) {
  return !!id && /^shop-[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(id);
}
export async function storeCheckout(send: (path:string,init:RequestInit)=>Promise<Response>,id:string,lines:Line[]) {
  if(!isLiveStore(id)||!lines.length||lines.some(line=>line.brandId!==id))throw Error('Select one store basket.');
  const r=await send('/api/integrations/shopify/checkout/'+id,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({lines:lines.map(({variantKey,quantity})=>({variantKey,quantity}))})});
  if(!r.ok)throw Error('Checkout is unavailable. Your basket is saved.');
  const url=new URL((await r.json()).url);
  if(url.origin!=='https://'+id.slice(5)+'.myshopify.com'||!url.pathname.startsWith('/cart/')||url.username||url.password)throw Error('Invalid store checkout.');
  return url.href;
}
