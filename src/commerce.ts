import {products, type Product} from './domain.ts';

export const COMMERCE_KEY = 'fc.commerce.v1';
export const MAX_QUANTITY = 9;
export const sizesFor = (product: Product) => product.category === 'Sneakers' ? ['EU 38','EU 39','EU 40','EU 41','EU 42'] : ['XS','S','M','L','XL'];
export interface CartLine { productId: string; size: string; quantity: number }
export interface OrderLine extends CartLine { name: string; image: string; price: number; color: string }
export interface DemoOrder { id: string; brandId: string; date: string; status: 'Processing'|'Shipped'|'Delivered'; lines: OrderLine[]; sample: true }
export interface Preferences { style: 'Everyday'|'Minimal'|'Statement'; fit: 'Relaxed'|'Regular'|'Fitted'; updates: boolean }
export interface CommerceState { cart: CartLine[]; orders: DemoOrder[]; preferences: Preferences }
export type CommerceAction =
 | {type:'add'; product:Product; size:string}
 | {type:'quantity'; productId:string; size:string; quantity:number}
 | {type:'remove'; productId:string; size:string}
 | {type:'checkout'; brandId:string; catalogue:Product[]; id:string; date:string}
 | {type:'preferences'; value:Preferences};

const snapshot = (p:Product, size:string, quantity=1):OrderLine => ({productId:p.id,size,quantity,name:p.name,image:p.image,price:p.price,color:p.color});
export const sampleOrders:DemoOrder[] = [
 {id:'SAMPLE-1042',brandId:'violet',date:'2026-10-12',status:'Delivered',sample:true,lines:[snapshot(products[0],'M'),snapshot(products[3],'M')]},
 {id:'SAMPLE-1043',brandId:'nimble',date:'2026-10-16',status:'Shipped',sample:true,lines:[snapshot(products[1],'L')]},
 {id:'SAMPLE-1044',brandId:'lume',date:'2026-10-18',status:'Processing',sample:true,lines:[snapshot(products[2],'S')]}
];
export function initialCommerce():CommerceState {return {cart:[],orders:sampleOrders,preferences:{style:'Everyday',fit:'Regular',updates:false}};}
export const sameLine = (line:CartLine,productId:string,size:string) => line.productId===productId&&line.size===size;
export const validQuantity = (quantity:number) => Number.isInteger(quantity)&&quantity>=1&&quantity<=MAX_QUANTITY;
export function cartTotal(lines:CartLine[],catalogue:Product[]) {return lines.reduce((sum,line)=>sum+(catalogue.find(p=>p.id===line.productId)?.price||0)*line.quantity,0);}
export const orderTotal = (order:DemoOrder) => order.lines.reduce((sum,line)=>sum+line.price*line.quantity,0);

/** Pure local-demo transaction. Repeated checkout cannot create another order once that brand's cart is empty. */
export function commerceReducer(state:CommerceState,action:CommerceAction):CommerceState {
 switch(action.type){
  case 'add': {
   if(!sizesFor(action.product).includes(action.size)) return state;
   const existing=state.cart.find(line=>sameLine(line,action.product.id,action.size));
   if(existing&&existing.quantity>=MAX_QUANTITY) return state;
   return {...state,cart:existing?state.cart.map(line=>line===existing?{...line,quantity:line.quantity+1}:line):[...state.cart,{productId:action.product.id,size:action.size,quantity:1}]};
  }
  case 'quantity': return validQuantity(action.quantity)?{...state,cart:state.cart.map(line=>sameLine(line,action.productId,action.size)?{...line,quantity:action.quantity}:line)}:state;
  case 'remove': return {...state,cart:state.cart.filter(line=>!sameLine(line,action.productId,action.size))};
  case 'checkout': {
   const selected=state.cart.filter(line=>action.catalogue.find(p=>p.id===line.productId)?.brandId===action.brandId);
   if(!selected.length||state.orders.some(o=>o.id===action.id))return state;
   const order:DemoOrder={id:action.id,brandId:action.brandId,date:action.date,status:'Processing',sample:true,lines:selected.map(line=>snapshot(action.catalogue.find(p=>p.id===line.productId)!,line.size,line.quantity))};
   return {...state,cart:state.cart.filter(line=>!selected.includes(line)),orders:[order,...state.orders]};
  }
  case 'preferences': return {...state,preferences:action.value};
 }
}

export function parseCommerce(raw:string|null):CommerceState {
 const fallback=initialCommerce();
 try {
  const value=JSON.parse(raw||'null');if(!value||typeof value!=='object')return fallback;
  const cart:CartLine[]=[];
  if(Array.isArray(value.cart))for(const candidate of value.cart){
   const p=products.find(p=>p.id===candidate?.productId);
   if(p&&sizesFor(p).includes(candidate.size)&&validQuantity(candidate.quantity)&&!cart.some(line=>sameLine(line,p.id,candidate.size)))cart.push({productId:p.id,size:candidate.size,quantity:candidate.quantity});
  }
  const prefs=value.preferences;
  const preferences:Preferences={style:['Everyday','Minimal','Statement'].includes(prefs?.style)?prefs.style:'Everyday',fit:['Relaxed','Regular','Fitted'].includes(prefs?.fit)?prefs.fit:'Regular',updates:prefs?.updates===true};
  const orders:DemoOrder[]=Array.isArray(value.orders)?value.orders.filter((o:DemoOrder)=>o&&o.sample===true&&typeof o.id==='string'&&/^(SAMPLE|DEMO)-[\w-]+$/.test(o.id)&&['violet','nimble','lume'].includes(o.brandId)&&/^\d{4}-\d{2}-\d{2}/.test(o.date)&&['Processing','Shipped','Delivered'].includes(o.status)&&Array.isArray(o.lines)&&o.lines.length&&o.lines.every(line=>products.some(p=>p.id===line.productId&&p.brandId===o.brandId)&&validQuantity(line.quantity)&&typeof line.name==='string'&&typeof line.color==='string'&&typeof line.image==='string'&&line.image.startsWith('/images/')&&Number.isFinite(line.price)&&line.price>=0&&sizesFor(products.find(p=>p.id===line.productId)!).includes(line.size))):fallback.orders;
  return {cart,orders,preferences};
 }catch{return fallback;}
}
/** Replace this browser repository with authenticated Java endpoints in a later integration. */
export const localCommerceRepository={
 read():CommerceState {try{return parseCommerce(localStorage.getItem(COMMERCE_KEY))}catch{return initialCommerce()}},
 write(state:CommerceState):void {localStorage.setItem(COMMERCE_KEY,JSON.stringify(state));}
};
