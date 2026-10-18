export interface Brand { id:string; name:string; tagline:string; color:string; image:string }
export interface Product { id:string; brandId:string; name:string; price:number; category:string; vibe:string; image:string; color:string }
export const brands:Brand[]=[
 {id:'violet',name:'STUDIO VIOLET',tagline:'A little bold. Entirely you.',color:'#7041d9',image:'/images/campaign.png'},
 {id:'nimble',name:'NIMBLE SUPPLY',tagline:'Made for the everyday adventure.',color:'#24604f',image:'/images/campaign.png'},
 {id:'lume',name:'lume studio',tagline:'Quiet confidence. Lasting impressions.',color:'#98512f',image:'/images/denim.png'}
];
export const products:Product[]=[
 {id:'p1',brandId:'violet',name:'Everyday denim',price:119,category:'Denim',vibe:'City muse',image:'/images/denim.png',color:'Denim blue'},
 {id:'p2',brandId:'nimble',name:'Relaxed Overshirt',price:89,category:'Tops',vibe:'Off duty',image:'/images/campaign.png',color:'White'},
 {id:'p3',brandId:'lume',name:'Wide Leg Jeans',price:129,category:'Denim',vibe:'Golden hour',image:'/images/denim.png',color:'Denim blue'},
 {id:'p4',brandId:'violet',name:'Relaxed cotton shirt',price:79,category:'Tops',vibe:'Off duty',image:'/images/campaign.png',color:'Cloud white'},
 {id:'p5',brandId:'nimble',name:'The everyday sneaker',price:119,category:'Sneakers',vibe:'Off duty',image:'/images/shoes.jpg',color:'White'},
 {id:'p6',brandId:'lume',name:'After hours edit',price:169,category:'Dresses',vibe:'City muse',image:'/images/evening.jpg',color:'Midnight'}
];
export function selectProducts(items:Product[],brandId='',query='',filter='All'){return items.filter(p=>(!brandId||p.brandId===brandId)&&(filter==='All'||filter==='New in'||(filter==='Men'&&p.brandId==='nimble')||(filter==='Women'&&p.brandId!=='nimble')||p.category===filter||p.vibe===filter)&&`${p.name} ${brands.find(b=>b.id===p.brandId)?.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()));}
export function toggleId(ids:string[],id:string){return ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];}
export function readIds(key:string):string[]{try{const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?[...new Set(v.filter((x:unknown)=>typeof x==='string'))]:[];}catch{return [];}}
export interface CatalogueGateway { listBrands():Promise<Brand[]>; listProducts(brandId?:string):Promise<Product[]> }
export const demoCatalogue:CatalogueGateway={listBrands:async()=>brands,listProducts:async(id)=>selectProducts(products,id)};
export const httpCatalogue:CatalogueGateway={listBrands:async()=>request('/api/brands'),listProducts:async(id)=>request('/api/products'+(id?'?brandId='+encodeURIComponent(id):''))};
async function request<T>(path:string):Promise<T>{const response=await fetch(path);if(!response.ok)throw new Error('Catalogue unavailable');return response.json();}
export interface TryOnResult {productId:string;image:string;simulated:true}
export async function previewTryOn(product:Product):Promise<TryOnResult>{return {productId:product.id,image:product.image,simulated:true};}
