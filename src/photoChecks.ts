import * as tf from '@tensorflow/tfjs';
import * as poseDetection from '@tensorflow-models/pose-detection';

export type CheckResult={ok:true}|{ok:false;message:string};
export type LiveFeedback={ready:boolean;message:string};

const MIN_HEIGHT=1000;
const MIN_BRIGHTNESS=50;
const MAX_BRIGHTNESS=220;
const MIN_SHARPNESS=120;
const LIVE_SIDE=320;
const LIVE_MIN_SHARPNESS=40;
const MIN_KEYPOINT_SCORE=0.3;
const EDGE_MARGIN=0.02;

const REQUIRED=[
  'nose','left_shoulder','right_shoulder','left_hip','right_hip',
  'left_knee','right_knee','left_ankle','right_ankle',
];

let detectorPromise:Promise<poseDetection.PoseDetector>|null=null;
function getDetector(){
  detectorPromise??=(async()=>{
    await tf.ready();
    return poseDetection.createDetector(poseDetection.SupportedModels.MoveNet,{
      modelType:poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
    });
  })().catch(err=>{
    detectorPromise=null; // allow a retry instead of caching the failure
    throw err;
  });
  return detectorPromise;
}

type Keypoint={name?:string;x:number;y:number;score?:number};

// Returns a message for the first problem found, or null when the body is in frame
function bodyProblem(keypoints:Keypoint[]|undefined,w:number,h:number):string|null{
  if(!keypoints) return 'Stand in the frame.';
  const byName=new Map(keypoints.filter(k=>k.name).map(k=>[k.name as string,k]));
  const points=REQUIRED.map(n=>byName.get(n));
  if(points.some(p=>!p||(p.score??0)<MIN_KEYPOINT_SCORE)){
    return 'Step back so your head to your feet are all in the frame.';
  }
  const inside=(p:Keypoint)=>{
    const x=p.x/w, y=p.y/h;
    return x>EDGE_MARGIN&&x<1-EDGE_MARGIN&&y>EDGE_MARGIN&&y<1-EDGE_MARGIN;
  };
  if(!points.every(p=>inside(p as Keypoint))){
    return 'Step back so your head to your feet are all in the frame.';
  }
  return null;
}

export async function analyseLiveFrame(
  video:HTMLVideoElement,
  canvas:HTMLCanvasElement,
  _timestampMs:number,
):Promise<LiveFeedback>{
  if(!video.videoWidth) return {ready:false,message:'Starting camera…'};
  if(video.videoHeight<=video.videoWidth){
    return {ready:false,message:'Use a phone held upright. Laptop cameras are too wide, so upload a photo instead.'};
  }

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

  const detector=await getDetector();
  const [pose]=await detector.estimatePoses(video,{flipHorizontal:false});
  const problem=bodyProblem(pose?.keypoints,video.videoWidth,video.videoHeight);
  if(problem) return {ready:false,message:problem};
  return {ready:true,message:'Perfect, hold still…'};
}

async function checkFullBody(bitmap:ImageBitmap):Promise<CheckResult>{
  let detector:poseDetection.PoseDetector;
  try{
    detector=await getDetector();
  }catch{
    throw new Error('The body check could not load. Check your internet connection and try again.');
  }
  const canvas=document.createElement('canvas');
  canvas.width=bitmap.width;
  canvas.height=bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap,0,0);

  const [pose]=await detector.estimatePoses(canvas,{flipHorizontal:false});
  const problem=bodyProblem(pose?.keypoints,canvas.width,canvas.height);
  if(problem){
    return {ok:false,message:pose?problem:'We could not see you. Stand in the frame and try again.'};
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