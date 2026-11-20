import {useEffect,useRef,useState} from 'react';
import {analyseLiveFrame,checkPhoto,drawPortraitFrame} from './photoChecks';

type Props={onAccepted:(file:Blob)=>void;busy:boolean;uploadError:string};
type Mode='choose'|'scan';
type Preview={url:string;file:Blob};

const CAMERA_CONSTRAINTS:MediaStreamConstraints={
  video:{facingMode:'user',width:{ideal:1080},height:{ideal:1920}},
  audio:false,
};
const SCAN_INTERVAL_MS=350;
const HOLD_FRAMES=4; // about 1.4 s of good frames in a row before capture
export function PhotoCapture({onAccepted,busy,uploadError}:Props){
  const [mode,setMode]=useState<Mode>('choose');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [ratio,setRatio]=useState(.75);
  const [hint,setHint]=useState('Starting camera…');
  const [cameraOn,setCameraOn]=useState(false);
  const [cameraError,setCameraError]=useState('');

  const videoRef=useRef<HTMLVideoElement>(null);
  const analysisRef=useRef<HTMLCanvasElement>(null);
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
        setCameraError('Open this page in a browser with camera access over HTTPS or localhost.');
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
        if(active) setCameraError('Camera access was blocked. Allow camera access in your browser settings, then try again.');
      }
    })();
    return()=>{
      active=false;
      stopStream();
      setCameraOn(false);
    };
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
      if(document.hidden){goodFrames=0;return;}
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
        goodFrames=0;
        if(!stopped) {
          clearInterval(timer);
          stopStream();
          setCameraOn(false);
          setCameraError('The body check could not start. Close the camera and try again.');
        }
      }finally{
        scanning=false;
      }
    },SCAN_INTERVAL_MS);

    return()=>{
      stopped=true;
      clearInterval(timer);
    };
    },[mode,cameraOn,preview]);

  // Full-resolution frame for the final check
  async function snapshot():Promise<Blob|null>{
    const video=videoRef.current;
    if(!video||!video.videoWidth) return null;
    const canvas=document.createElement('canvas');
    if (!drawPortraitFrame(video, canvas)) return null;
    return new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92));
  }

  function cameraRatio(video: HTMLVideoElement) {
    if (video.videoHeight) setRatio(video.videoWidth >= video.videoHeight ? .75 : video.videoWidth / video.videoHeight);
  }

  if (mode === 'choose') return (
    <section className="photo-step">
      <h1>Add your full-body photo</h1>
      <p>Stand back in even light with your head and feet in view. The camera captures a frame when you hold still.</p>
      <button className="primary" onClick={() => setMode('scan')}>Scan full body</button>
    </section>
  );
  return (
    <section className="photo-step">
      <h1>{preview ? 'Review your photo' : 'Scan your full body'}</h1>
      <div className="photo-frame" style={{ aspectRatio: ratio, width: `min(100%, calc(60dvh * ${ratio}))` }}>
        {preview ? <img src={preview.url} alt="Your full-body photo" /> :
          cameraOn ? <>
            <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={e => cameraRatio(e.currentTarget)} onResize={e => cameraRatio(e.currentTarget)} />
            <svg className="silhouette" viewBox="0 0 200 400" aria-hidden="true">
              <ellipse cx="100" cy="46" rx="26" ry="32" />
              <path d="M60 95 Q100 80 140 95 L150 230 L125 240 L118 390 L100 390 L92 240 L75 240 L70 390 L52 390 L50 230 Z" />
            </svg>
            <div className="photo-hint" role="status">{hint}</div>
          </> : <div className="photo-empty" role={cameraError ? 'alert' : 'status'}>{cameraError || 'Starting camera…'}</div>}
      </div>
      {uploadError && <p role="alert" className="login-error">{uploadError}</p>}
      {preview && <div className="photo-actions">
        <button className="secondary" onClick={() => setPreview(null)} disabled={busy}>Retake</button>
        <button className="primary" onClick={() => onAccepted(preview.file)} disabled={busy}>{busy ? 'Saving…' : 'Save to my account'}</button>
      </div>}
      <button className="text-action" onClick={() => { setPreview(null); setMode('choose'); }} disabled={busy}>Close camera</button>
      <canvas ref={analysisRef} hidden />
    </section>
  );
}
