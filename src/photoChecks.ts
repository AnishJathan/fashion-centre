import {FilesetResolver,PoseLandmarker} from '@mediapipe/tasks-vision';

export type CheckResult={ok:true}|{ok:false;message:string};

const MIN_HEIGHT=1000;
const MIN_BRIGHTNESS=50;
const MAX_BRIGHTNESS=220;
const MIN_SHARPNESS=120; // tune with real phone photos
const LIVE_SIDE=320;
const LIVE_MIN_SHARPNESS=40; // lower than the full-size check, because the live frame is smaller
const BODY_IDS=[0,11,12,23,24,25,26,27,28];
const MODEL_URL = '/vision/pose-landmarker-lite-v1.task';

function fullBodyVisible(pose: readonly { visibility?: number; x: number; y: number }[]) {
  return BODY_IDS.every(index => {
    const point = pose[index];
    return point && (point.visibility ?? 0) > 0.5 && point.x > 0.02 && point.x < 0.98 && point.y > 0.02 && point.y < 0.98;
  });
}

function makeLandmarker(runningMode: 'VIDEO' | 'IMAGE') {
  return FilesetResolver.forVisionTasks(__VISION_WASM_ROOT__).then(vision =>
    PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL_URL }, runningMode, numPoses: 1 }));
}

let live: Promise<PoseLandmarker> | undefined;
let still: Promise<PoseLandmarker> | undefined;
function getLandmarker(mode: 'VIDEO' | 'IMAGE') {
  if (mode === 'VIDEO') return live ??= makeLandmarker(mode).catch(error => { live = undefined; throw error; });
  return still ??= makeLandmarker(mode).catch(error => { still = undefined; throw error; });
}

/** A wide camera uses the same centred portrait crop for its guide, live checks and final photo. */
export function drawPortraitFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, maxHeight = video.videoHeight) {
  const height = video.videoHeight, width = video.videoWidth;
  if (!height || !width) return false;
  const cropWidth = width >= height ? Math.round(height * .75) : width;
  const scale = Math.min(1, maxHeight / height);
  canvas.width = Math.max(1, Math.round(cropWidth * scale));
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d', { willReadFrequently: true })!.drawImage(video, (width - cropWidth) / 2, 0, cropWidth, height, 0, 0, canvas.width, canvas.height);
  return true;
}

export type LiveFeedback={ready:boolean;message:string};

export async function analyseLiveFrame(
  video:HTMLVideoElement,
  canvas:HTMLCanvasElement,
  timestampMs:number,
):Promise<LiveFeedback>{
  if (!drawPortraitFrame(video, canvas, LIVE_SIDE)) return {ready:false,message:'Starting camera…'};
  const ctx = canvas.getContext('2d', { willReadFrequently:true })!;
  const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
  const gray=new Float32Array(data.length/4);
  for(let i=0;i<gray.length;i++){
    gray[i]=0.299*data[i*4]+0.587*data[i*4+1]+0.114*data[i*4+2];
  }

  const brightness=averageBrightness(gray);
  if(brightness<MIN_BRIGHTNESS) return {ready:false,message:'Too dark. Move somewhere brighter.'};
  if(brightness>MAX_BRIGHTNESS) return {ready:false,message:'Too bright. Avoid light behind you.'};
  if(sharpness(gray,canvas.width,canvas.height)<LIVE_MIN_SHARPNESS){
    return {ready:false,message:'Hold still…'};
  }

  const landmarker=await getLandmarker('VIDEO');
  const pose=landmarker.detectForVideo(video.videoWidth >= video.videoHeight ? canvas : video,timestampMs).landmarks[0];
  if(!pose) return {ready:false,message:'Stand in the frame.'};

  if(!fullBodyVisible(pose)){
    return {ready:false,message:'Step back so your head to your feet are in the frame.'};
  }
  return {ready:true,message:'Perfect, hold still…'};
}

function grayscaleCopy(bitmap:ImageBitmap,maxSide:number){
  const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const w=Math.round(bitmap.width*scale);
  const h=Math.round(bitmap.height*scale);
  const ctx=new OffscreenCanvas(w,h).getContext('2d')!;
  ctx.drawImage(bitmap,0,0,w,h);
  const {data}=ctx.getImageData(0,0,w,h);
  const gray=new Float32Array(w*h);
  for(let i=0;i<w*h;i++){
    gray[i]=0.299*data[i*4]+0.587*data[i*4+1]+0.114*data[i*4+2];
  }
  return {gray,w,h};
}

function averageBrightness(gray:Float32Array){
  let sum=0;
  for(const v of gray) sum+=v;
  return sum/gray.length;
}

// Variance of the Laplacian: low values mean few sharp edges, so a blurry photo
function sharpness(gray:Float32Array,w:number,h:number){
  let sum=0,sumSq=0,n=0;
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      const i=y*w+x;
      const l=4*gray[i]-gray[i-1]-gray[i+1]-gray[i-w]-gray[i+w];
      sum+=l;sumSq+=l*l;n++;
    }
  }
  const mean=sum/n;
  return sumSq/n-mean*mean;
}

// Landmarks: 0 nose, 11/12 shoulders, 23/24 hips, 25/26 knees, 27/28 ankles


async function checkFullBody(bitmap:ImageBitmap):Promise<CheckResult>{
  let landmarker:PoseLandmarker;
  try{
    landmarker=await getLandmarker('IMAGE');
  }catch{
    throw new Error('The body check could not load. Check your internet connection and try again.');
  }
  const pose=landmarker.detect(bitmap).landmarks[0];

  if(!pose){
    return {ok:false,message:'We could not see you. Stand in the frame and try again.'};
  }
  if(!fullBodyVisible(pose)){
    return {ok:false,message:'Step back so your head to your feet are all in the frame.'};
  }
  return {ok:true};
}

export async function checkPhoto(file:Blob):Promise<CheckResult>{
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.height<MIN_HEIGHT||bitmap.height<=bitmap.width){
      return {ok:false,message:`Use a tall photo held upright, at least ${MIN_HEIGHT}px high. This one is ${bitmap.width}×${bitmap.height}.`};
    }
    const {gray,w,h}=grayscaleCopy(bitmap,512);
    const brightness=averageBrightness(gray);
    if(brightness<MIN_BRIGHTNESS){
      return {ok:false,message:'The photo is too dark. Move somewhere brighter.'};
    }
    if(brightness>MAX_BRIGHTNESS){
      return {ok:false,message:'The photo is overexposed. Avoid bright light behind you.'};
    }
    if(sharpness(gray,w,h)<MIN_SHARPNESS){
      return {ok:false,message:'The photo looks blurry. Hold still and try again.'};
    }
    return await checkFullBody(bitmap);
  }finally{
    bitmap.close();
  }
}
