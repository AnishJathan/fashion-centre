export interface Variant { key:string; id:string; title:string; available:boolean; amount:number; currency:string; options:Record<string,string> }
export interface Product { id:string; brandId:string; brandName:string; name:string; category:string; image:string; variants:Variant[]; moreVariants:boolean }
export interface Brand { id:string; name:string; image:string; products:Product[]; more:boolean }
export interface StoreRegistration { id:string; enabled:boolean; onboardedAt:string }
export interface Source {key:string;name:string}
export const STORES_KEY='fc.stores.v1';
export function readStores():StoreRegistration[]{try{const parsed=JSON.parse(localStorage.getItem(STORES_KEY)||'[]');return Array.isArray(parsed)?parsed.filter((s:StoreRegistration)=>s&&typeof s.id==='string'&&typeof s.enabled==='boolean'&&typeof s.onboardedAt==='string'):[]}catch{return []}}
export function toggleId(ids:string[],id:string){return ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]}
export function readIds(key:string):string[]{try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?[...new Set(value.filter((v:unknown)=>typeof v==='string'))]:[]}catch{return []}}
export function selectProducts(items:Product[],brandId='',query='',category='All'){return items.filter(p=>(!brandId||p.brandId===brandId)&&(category==='All'||p.category===category)&&(p.name+' '+p.brandName+' '+p.category).toLowerCase().includes(query.toLowerCase()))}
export function money(amount:number,currency:string){return currency+' '+new Intl.NumberFormat('en',{minimumFractionDigits:2,maximumFractionDigits:2}).format(amount)}
export const productPath=(id:string)=>'#/product/'+encodeURIComponent(id);
export async function loadSources(signal?:AbortSignal):Promise<Source[]>{const r=await fetch('/api/integrations/shopify/status',{signal});if(!r.ok)throw new Error('Demo store directory unavailable.');return (await r.json()).shops}
export async function loadCatalogue(id:string,signal?:AbortSignal):Promise<Brand>{
 const r=await fetch('/api/integrations/shopify/catalogue/'+encodeURIComponent(id)+'?source=public',{signal});if(!r.ok)throw new Error('Catalogue unavailable. Retry when your connection is ready.');
 const d=await r.json();if(d.shopKey!==id||typeof d.shopName!=='string'||!Array.isArray(d.products))throw new Error('Catalogue response is invalid.');
 const products:Product[]=d.products.map((p:{key:string;title:string;category:string;image:string;variants:Variant[];moreVariants:boolean})=>({id:p.key,brandId:id,brandName:d.shopName,name:p.title,category:p.category||'',image:p.image,variants:p.variants,moreVariants:p.moreVariants}));
 return {id,name:d.shopName,image:products.find(p=>p.image)?.image||'',products,more:d.hasNextPage};
}
