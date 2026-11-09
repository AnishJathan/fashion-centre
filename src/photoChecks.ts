import {FilesetResolver,PoseLandmarker} from '@mediapipe/tasks-vision';

export type CheckResult={ok:true}|{ok:false;message:string};

const MIN_HEIGHT=1000;
const MIN_BRIGHTNESS=50;
const MAX_BRIGHTNESS=220;
const MIN_SHARPNESS=120; // tune with real phone photos
const LIVE_SIDE=320;
const LIVE_MIN_SHARPNESS=40; // lower than the full-size check, because the live frame is smaller
const BODY_IDS=[0,11,12,23,24,25,26,27,28];
const WASM_URL='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Live video needs VIDEO mode, so this is a separate landmarker from the upload check
let liveLandmarkerPromise:Promise<PoseLandmarker>|null=null;
function getLiveLandmarker(){
  liveLandmarkerPromise??=(async()=>{
    const vision=await FilesetResolver.forVisionTasks(WASM_URL);
    return PoseLandmarker.createFromOptions(vision,{
      baseOptions:{modelAssetPath:MODEL_URL},
      runningMode:'VIDEO',
      numPoses:1,
    });
  })().catch(err=>{
    liveLandmarkerPromise=null; // allow a retry instead of caching the failure
    throw err;
  });
  return liveLandmarkerPromise;
}

export type LiveFeedback={ready:boolean;message:string};

export async function analyseLiveFrame(
  video:HTMLVideoElement,
  canvas:HTMLCanvasElement,
  timestampMs:number,
):Promise<LiveFeedback>{
  if(!video.videoWidth) return {ready:false,message:'Starting camera…'};
  if(video.videoHeight<=video.videoWidth){
    return {ready:false,message:'Use a phone held upright. Laptop cameras are too wide, so upload a photo instead.'};
  }

  // Small copy of the frame, used for brightness and sharpness
  const scale=LIVE_SIDE/video.videoHeight;
  canvas.width=Math.round(video.videoWidth*scale);
  canvas.height=LIVE_SIDE;
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
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

  const landmarker=await getLiveLandmarker();
  const pose=landmarker.detectForVideo(video,timestampMs).landmarks[0];
  if(!pose) return {ready:false,message:'Stand in the frame.'};

  const visible=(i:number)=>{
    const p=pose[i];
    return (p.visibility??0)>0.5&&p.x>0.02&&p.x<0.98&&p.y>0.02&&p.y<0.98;
  };
  if(!BODY_IDS.every(visible)){
    return {ready:false,message:'Step back so your head to your feet are in the frame.'};
  }
  return {ready:true,message:'Perfect, hold still…'};
}

let landmarkerPromise:Promise<PoseLandmarker>|null=null;
function getLandmarker(){
  landmarkerPromise??=(async()=>{
    const vision=await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
    return PoseLandmarker.createFromOptions(vision,{
      baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'},
      runningMode:'IMAGE',
      numPoses:1,
    });
  })().catch(err=>{
    landmarkerPromise=null; // allow a retry instead of caching the failure
    throw err;
  });
  return landmarkerPromise;
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
const BODY_POINTS=[0,11,12,23,24,25,26,27,28];

async function checkFullBody(bitmap:ImageBitmap):Promise<CheckResult>{
  let landmarker:PoseLandmarker;
  try{
    landmarker=await getLandmarker();
  }catch{
    throw new Error('The body check could not load. Check your internet connection and try again.');
  }
    const pose=landmarker.detect(bitmap).landmarks[0];
  if(!pose){
    return {ok:false,message:'We could not see you. Stand in the frame and try again.'};
  }
  const visible=(i:number)=>{
    const p=pose[i];
    return (p.visibility??0)>0.5&&p.x>0.02&&p.x<0.98&&p.y>0.02&&p.y<0.98;
  };
  if(!BODY_POINTS.every(visible)){
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