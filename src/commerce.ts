import type {Product} from './domain.ts';
export const COMMERCE_KEY='fc.commerce.v2';
export const MAX_QUANTITY=9;
export interface CartLine {productId:string;size:string;quantity:number;brandId?:string;brandName?:string;name?:string;variantKey?:string}
export interface OrderLine extends CartLine {name:string;image:string;price:number;currency:string;color:string}
export interface DemoOrder {id:string;brandId:string;brandName?:string;date:string;status:string;lines:OrderLine[];sample:true;legacy?:boolean}
export interface Preferences {style:string;fit:string;updates:boolean}
export interface CommerceState {cart:CartLine[];orders:DemoOrder[];legacySamples:unknown[];preferences:Preferences}
export type CommerceAction={type:'add';product:Product;variantKey:string}|{type:'quantity';productId:string;size:string;quantity:number}|{type:'remove';productId:string;size:string}|{type:'checkout';brandId:string;catalogue:Product[];id:string;date:string}|{type:'preferences';value:Preferences};
export const initialCommerce=():CommerceState=>({cart:[],orders:[],legacySamples:[],preferences:{style:'',fit:'',updates:false}});
export const validQuantity=(n:number)=>Number.isInteger(n)&&n>=1&&n<=MAX_QUANTITY;
export const sameLine=(l:CartLine,id:string,size:string)=>l.productId===id&&l.size===size;
export function resolveLine(line:CartLine,products:Product[]){const product=products.find(p=>p.id===line.productId);const variant=product?.variants.find(v=>v.key===line.variantKey);return {product,variant,available:!!variant?.available}}
export function totals(lines:{price:number;currency:string;quantity:number}[]){const amounts:Record<string,number>={};for(const l of lines)amounts[l.currency]=(amounts[l.currency]||0)+Math.round(l.price*100)*l.quantity;return Object.entries(amounts).map(([currency,cents])=>({currency,amount:cents/100}))}
export function checkoutReady(lines:CartLine[],products:Product[]){return lines.length>0&&lines.every(l=>resolveLine(l,products).available&&validQuantity(l.quantity))&&new Set(lines.map(l=>resolveLine(l,products).variant?.currency)).size===1}
export function commerceReducer(state:CommerceState,action:CommerceAction):CommerceState{
 switch(action.type){
 case 'add':{const v=action.product.variants.find(v=>v.key===action.variantKey);if(!v?.available)return state;const old=state.cart.find(l=>l.productId===action.product.id&&l.variantKey===v.key);if(old?.quantity===MAX_QUANTITY)return state;return {...state,cart:old?state.cart.map(l=>l===old?{...l,quantity:l.quantity+1}:l):[...state.cart,{productId:action.product.id,size:v.title,variantKey:v.key,quantity:1,brandId:action.product.brandId,brandName:action.product.brandName,name:action.product.name}]}}
 case 'quantity':return validQuantity(action.quantity)?{...state,cart:state.cart.map(l=>sameLine(l,action.productId,action.size)?{...l,quantity:action.quantity}:l)}:state;
 case 'remove':return {...state,cart:state.cart.filter(l=>!sameLine(l,action.productId,action.size))};
 case 'preferences':return {...state,preferences:action.value};
 case 'checkout':{const lines=state.cart.filter(l=>l.brandId===action.brandId);if(!checkoutReady(lines,action.catalogue)||state.orders.some(o=>o.id===action.id))return state;const snapshots:OrderLine[]=lines.map(l=>{const {product:p,variant:v}=resolveLine(l,action.catalogue);return {...l,name:p!.name,image:p!.image,price:Number(v!.amount),currency:v!.currency,color:Object.values(v!.options).join(' / ')}});return {...state,cart:state.cart.filter(l=>!lines.includes(l)),orders:[{id:action.id,brandId:action.brandId,brandName:lines[0].brandName,date:action.date,status:'Recorded locally',sample:true,legacy:false,lines:snapshots},...state.orders]}}
 }
}
/** Catalogue-independent migration preserves unknown IDs and user snapshots. Original v1 is never overwritten. */
export function parseCommerce(raw:string|null):CommerceState{
 const empty=initialCommerce();try{const data=JSON.parse(raw||'null');if(!data||typeof data!=='object')return empty;
 const cart=Array.isArray(data.cart)?data.cart.filter((l:CartLine)=>l&&typeof l.productId==='string'&&typeof l.size==='string'&&validQuantity(l.quantity)):[];
 const records=Array.isArray(data.orders)?data.orders:[];
 const orders=records.filter((o:DemoOrder)=>o&&typeof o.id==='string'&&!o.id.startsWith('SAMPLE-')&&Array.isArray(o.lines)).map((o:DemoOrder)=>({...o,legacy:o.legacy??!o.lines.every(l=>typeof l.currency==='string'),lines:o.lines.map(l=>({...l,currency:l.currency||'AUD'}))}));
 return {cart,orders,legacySamples:[...(Array.isArray(data.legacySamples)?data.legacySamples:[]),...records.filter((o:DemoOrder)=>o?.id?.startsWith('SAMPLE-'))],preferences:data.preferences&&typeof data.preferences==='object'?data.preferences:empty.preferences};
 }catch{return empty}
}
export const localCommerceRepository={read():CommerceState{try{return parseCommerce(localStorage.getItem(COMMERCE_KEY)??localStorage.getItem('fc.commerce.v1'))}catch{return initialCommerce()}},write(state:CommerceState){localStorage.setItem(COMMERCE_KEY,JSON.stringify(state))}};
