export const MAX_PHOTO_BYTES=10*1024*1024;
export const MAX_PHOTO_PIXELS=40_000_000;
export function validatePhotoHeader(type:string,size:number,bytes:Uint8Array){
 if(!['image/jpeg','image/png','image/webp'].includes(type))throw new Error('Choose a JPEG, PNG or WebP photo. HEIC, SVG and other formats are not supported in this local preview.');
 if(size===0||size>MAX_PHOTO_BYTES)throw new Error('Choose a non-empty photo no larger than 10 MiB (local preview limit).');
 const png=[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!((type==='image/png'&&png)||(type==='image/jpeg'&&jpeg)||(type==='image/webp'&&webp)))throw new Error('The file contents do not match its image type. Choose an original photo file.');
}
export function resolutionWarning(width:number,height:number){return Math.min(width,height)<768?'The shorter edge is below 768 pixels. A sharper original may preserve more detail. This is local guidance, not a Pruna requirement or a quality score.':''}
export async function inspectPhoto(file:File){
 validatePhotoHeader(file.type,file.size,new Uint8Array(await file.slice(0,16).arrayBuffer()));
 let bitmap:ImageBitmap;try{bitmap=await createImageBitmap(file)}catch{throw new Error('This photo could not be decoded. It may be damaged or unsupported.');}
 const {width,height}=bitmap;bitmap.close();
 if(!width||!height||width>12000||height>12000||width*height>MAX_PHOTO_PIXELS)throw new Error('Photo dimensions exceed this preview’s limit: 12,000 pixels per edge and 40 megapixels.');
 return {width,height,warning:resolutionWarning(width,height)};
}
