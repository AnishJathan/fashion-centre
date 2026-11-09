import {useEffect,useRef,useState,type ChangeEvent} from 'react';
import {analyseLiveFrame,checkPhoto} from './photoChecks';

type Props={onAccepted:(file:Blob)=>void;busy:boolean;uploadError:string};
type Mode='choose'|'scan'|'upload';
type Preview={url:string;file:Blob};

const CAMERA_CONSTRAINTS:MediaStreamConstraints={
  video:{facingMode:'user',width:{ideal:1080},height:{ideal:1920}},
  audio:false,
};
const SCAN_INTERVAL_MS=350;
const HOLD_FRAMES=4; // about 1.4 s of good frames in a row before capture
// Converts any image the browser can read (WebP, GIF, and so on) into a JPEG
async function toJpeg(file:Blob):Promise<Blob>{
  if(file.type==='image/jpeg'||file.type==='image/png') return file;

  let bitmap:ImageBitmap;
  try{
    bitmap=await createImageBitmap(file);
  }catch{
    throw new Error('This image type cannot be read here. Please choose a JPEG or PNG photo.');
  }

  const canvas=document.createElement('canvas');
  canvas.width=bitmap.width;
  canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#fff';                 // white background, so transparent images look right
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(bitmap,0,0);
  bitmap.close();

  const jpeg=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92));
  if(!jpeg) throw new Error('Could not convert this image. Please choose a JPEG or PNG photo.');
  return jpeg;
}

export function PhotoCapture({onAccepted,busy,uploadError}:Props){
  const [mode,setMode]=useState<Mode>('choose');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [error,setError]=useState('');
  const [checking,setChecking]=useState(false);
  const [hint,setHint]=useState('Starting camera…');
  const [cameraOn,setCameraOn]=useState(false);
  const [cameraError,setCameraError]=useState('');

  const videoRef=useRef<HTMLVideoElement>(null);
  const analysisRef=useRef<HTMLCanvasElement>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const streamRef=useRef<MediaStream|null>(null);

  function stopStream(){
    streamRef.current?.getTracks().forEach(t=>t.stop());
    streamRef.current=null;
  }

  // Free the preview URL when it changes or the step closes
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview.url)},[preview]);

  // Camera runs only in scan mode, and only until a photo is accepted
  useEffect(()=>{
    if(mode!=='scan'||preview) return;
    let active=true;
    (async()=>{
      setCameraError('');
      setHint('Starting camera…');
      if(!navigator.mediaDevices?.getUserMedia){
        setCameraError('The camera is not available in this browser. Upload a photo instead.');
        return;
      }
      try{
        const stream=await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if(!active){
          stream.getTracks().forEach(t=>t.stop());
          return;
        }
        streamRef.current=stream;
        setCameraOn(true);
      }catch{
        if(active) setCameraError('Camera access was blocked. Allow it in your browser, or upload a photo instead.');
      }
    })();
    return()=>{
      active=false;
      stopStream();
      setCameraOn(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode,preview]);

  // Attach the stream once the video element is on screen
  useEffect(()=>{
    if(cameraOn&&videoRef.current&&streamRef.current){
      videoRef.current.srcObject=streamRef.current;
    }
  },[cameraOn]);

  // Live scan: check each frame, capture once the pose has been good for a moment
  useEffect(()=>{
    if(mode!=='scan'||!cameraOn||preview) return;
    let stopped=false;
    let scanning=false;
    let goodFrames=0;

    const timer=setInterval(async()=>{
      if(stopped||scanning||!videoRef.current||!analysisRef.current) return;
      scanning=true;
      try{
        const feedback=await analyseLiveFrame(videoRef.current,analysisRef.current,performance.now());
        if(stopped) return;
        setHint(feedback.message);
        goodFrames=feedback.ready?goodFrames+1:0;

        if(goodFrames>=HOLD_FRAMES){
          goodFrames=0;
          setHint('Checking your photo…');
          const blob=await snapshot();
          if(stopped||!blob) return;
          const result=await checkPhoto(blob);
          if(stopped) return;
          if(result.ok){
            setPreview({url:URL.createObjectURL(blob),file:blob}); // ends the camera via the effect above
          }else{
            setHint(result.message);
          }
        }
      }catch{
        if(!stopped) setHint('The body check could not load. Check your connection, or upload a photo instead.');
      }finally{
        scanning=false;
      }
    },SCAN_INTERVAL_MS);

    return()=>{
      stopped=true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode,cameraOn,preview]);

  // Full-resolution frame for the final check
  async function snapshot():Promise<Blob|null>{
    const video=videoRef.current;
    if(!video||!video.videoWidth) return null;
    const canvas=document.createElement('canvas');
    canvas.width=video.videoWidth;
    canvas.height=video.videoHeight;
    canvas.getContext('2d')!.drawImage(video,0,0);
    return new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92));
  }

async function review(file:Blob){
  setError('');
  setChecking(true);
  try{
    const jpeg=await toJpeg(file);
    const result=await checkPhoto(jpeg);
    if(!result.ok){
      setError(result.message);
      return;
    }
    setPreview({url:URL.createObjectURL(jpeg),file:jpeg});
  }catch(err){
    setError(err instanceof Error?err.message:'We could not check this photo. Please try again.');
  }finally{
    setChecking(false);
  }
}

  function onFile(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];
    e.target.value='';
    if(file) review(file);
  }

  function chooseMode(next:Mode){
    setError('');
    setPreview(null);
    setMode(next);
  }

  function backToChoice(){
    setError('');
    setPreview(null);
    setMode('choose');
  }

  // Step 1: pick the method
  if(mode==='choose'){
    return(
      <div className="photo-step">
        <h1>Add your full-body photo</h1>
        <p>It is used for try-on. Stand 2–3 steps back in good light, with only you in the frame.</p>

        <div className="photo-choices">
          <button className="choice" onClick={()=>chooseMode('scan')}>
            <strong>Scan full body</strong>
            <span>The camera checks your position and takes the photo automatically.</span>
          </button>
          <button className="choice" onClick={()=>chooseMode('upload')}>
            <strong>Upload from device</strong>
            <span>Pick a full-body photo already on your phone or computer.</span>
          </button>
        </div>
      </div>
    );
  }

  // Step 2: scan or upload
  return(
    <div className="photo-step">
      <h1>{mode==='scan'?'Scan your full body':'Upload your full-body photo'}</h1>

      <div className="photo-frame">
        {preview
          ? <img src={preview.url} alt="Your full-body photo"/>
          : mode==='scan'
            ? cameraOn
              ? <>
                  <video ref={videoRef} autoPlay playsInline muted/>
                  <svg className="silhouette" viewBox="0 0 200 400" aria-hidden="true">
                    <ellipse cx="100" cy="46" rx="26" ry="32"/>
                    <path d="M60 95 Q100 80 140 95 L150 230 L125 240 L118 390 L100 390 L92 240 L75 240 L70 390 L52 390 L50 230 Z"/>
                  </svg>
                  <div className="photo-hint" role="status">{hint}</div>
                </>
              : <div className="photo-empty">{cameraError||'Starting camera…'}</div>
: <div className="photo-empty">
    <p>Choose a photo: head to feet, sharp, plain background.</p>

    <button className="primary" onClick={()=>fileRef.current?.click()} disabled={checking}>
      Choose photo
    </button>
  </div>}
          {checking&&<div className="photo-checking">Checking your photo…</div>}
      </div>

      {error&&<p role="alert" className="login-error">{error}</p>}
      {uploadError&&<p role="alert" className="login-error">{uploadError}</p>}

<div className="photo-actions">
  {preview&&(
    <>
      <button className="secondary" onClick={()=>setPreview(null)} disabled={busy}>Retake</button>
      <button className="primary" onClick={()=>onAccepted(preview.file)} disabled={busy}>
        {busy?'Saving…':'Use this photo'}
      </button>
    </>
  )}
</div>

      {!preview&&mode==='scan'&&<p className="fine">Hold still. The photo is taken automatically once you are in position.</p>}
{!preview&&mode==='upload'&&<p className="fine">
  Accepted: photos up to 10 MB, portrait, at least 1000 px tall. Use the original photo from your gallery, not one sent through WhatsApp or email.
</p>}
<input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile}/>  
   <div className="photo-back">
  <button className="text-action" onClick={backToChoice} disabled={busy}>
    ← Choose a different method
  </button>
</div>
      <canvas ref={analysisRef} hidden/>
    </div>
  );
}