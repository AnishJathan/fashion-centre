import {useEffect,useRef,useState} from 'react';
import type {Product} from './domain';

const API='/api/try-on';
const PHOTO_API='/api/users/me/photo';

type Phase='idle'|'working'|'done'|'error';
type PhotoState='loading'|'ready'|'missing'|'signed-out';

export function TryOnPanel({product,onClose}:{product:Product;onClose:()=>void}){
  const [savedPhoto,setSavedPhoto]=useState<string|null>(null);
  const [photoState,setPhotoState]=useState<PhotoState>('loading');
  const [resultUrl,setResultUrl]=useState<string|null>(null);
  const [phase,setPhase]=useState<Phase>('idle');
  const [message,setMessage]=useState('');
  const cancelled=useRef(false);

  // Stop polling if the panel closes
  useEffect(()=>{cancelled.current=false;return()=>{cancelled.current=true}},[]);

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape') onClose()};
    addEventListener('keydown',onKey);
    return()=>removeEventListener('keydown',onKey);
  },[onClose]);

  // Load the user's saved full-body photo
  useEffect(()=>{
    let url:string|null=null;
    (async()=>{
      try{
        const res=await fetch(PHOTO_API,{credentials:'include'});
        if(res.status===401){ setPhotoState('signed-out'); return; }
        if(!res.ok){ setPhotoState('missing'); return; }
        url=URL.createObjectURL(await res.blob());
        if(cancelled.current){ URL.revokeObjectURL(url); return; }
        setSavedPhoto(url);
        setPhotoState('ready');
      }catch{
        if(!cancelled.current) setPhotoState('missing');
      }
    })();
    return()=>{ if(url) URL.revokeObjectURL(url); };
  },[]);

  async function runTryOn(){
    setPhase('working');
    setResultUrl(null);
    setMessage('Preparing the outfit…');
    try{
      const garmentRes=await fetch(product.image);
      if(!garmentRes.ok) throw new Error('Could not load this product image.');

      const form=new FormData();
      form.append('garment',await garmentRes.blob(),`${product.id}.jpg`);

      setMessage('Dressing you in this outfit…');
      const startRes=await fetch(`${API}/me`,{method:'POST',body:form,credentials:'include'});
      if(startRes.status===401) throw new Error('Please sign in to try on outfits.');
      if(startRes.status===409) throw new Error('Add your full-body photo first.');
      if(!startRes.ok) throw new Error('Could not start the try-on.');
      const {id}=await startRes.json() as {id:string};

      // Poll for up to about 90 seconds
      for(let i=0;i<60;i++){
        await new Promise(r=>setTimeout(r,1500));
        if(cancelled.current) return;
        const statusRes=await fetch(`${API}/${id}`);
        if(!statusRes.ok) throw new Error('Could not check the try-on status.');
        const job=await statusRes.json() as {status:string};
        if(job.status==='succeeded'){
          setResultUrl(`${API}/${id}/result`);
          setPhase('done');
          setMessage('');
          return;
        }
        if(job.status==='failed') throw new Error('The try-on failed. Please try again.');
      }
      throw new Error('This is taking too long. Please try again.');
    }catch(err){
      if(cancelled.current) return;
      setPhase('error');
      setMessage(err instanceof Error?err.message:'Something went wrong.');
    }
  }

  return(
    <div className="try-on-modal" role="dialog" aria-modal="true" aria-label={`Try on ${product.name}`}>
      <div className="try-on-card">
        <button className="try-on-close" onClick={onClose} aria-label="Close try-on">×</button>
        <h2>{product.name}</h2>
        <p className="try-on-hint">Uses the full-body photo saved in your account.</p>

        <div className="try-on-image">
          {resultUrl
            ? <img src={resultUrl} alt={`You wearing ${product.name}`}/>
            : savedPhoto
              ? <img src={savedPhoto} alt="Your saved photo"/>
              : <div className="try-on-empty">
                  {photoState==='loading'?'Loading your photo…':'No photo yet'}
                </div>}
        </div>

        <div className="try-on-actions">
          {photoState==='ready'&&(
            <button className="primary" onClick={runTryOn} disabled={phase==='working'}>
              {resultUrl?'Try again':'Try on'}
            </button>
          )}
        </div>

        {phase==='working'&&<p role="status">{message}</p>}
        {phase==='error'&&<p role="alert">{message}</p>}
        {photoState==='missing'&&<p>Add your full-body photo in your account to try outfits on.</p>}
        {photoState==='signed-out'&&<p>Sign in to try on outfits with your photo.</p>}
      </div>
    </div>
  );
}