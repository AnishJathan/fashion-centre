export function canonicalShop(value:string):string|null {
 const host=value.trim().toLowerCase();
 return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(host)?host:null;
}
