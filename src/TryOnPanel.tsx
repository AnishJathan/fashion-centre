import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Product } from './domain';
import './try-on.css';

const API = '/api/try-on';
const PHOTO_API = '/api/users/me/photo';
const POLL_INTERVAL_MS = 1_500;
const TRY_ON_TIMEOUT_MS = 90_000;

type Phase = 'idle' | 'working' | 'error' | 'uncertain';
type PhotoState = 'loading' | 'ready' | 'missing' | 'signed-out' | 'unavailable';

function waitForNextPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const interval = window.setTimeout(() => {
      signal.removeEventListener('abort', stopWaiting);
      resolve();
    }, POLL_INTERVAL_MS);
    function stopWaiting() {
      window.clearTimeout(interval);
      reject(signal.reason);
    }
    signal.addEventListener('abort', stopWaiting, { once: true });
  });
}

export function TryOnPanel({ product, onClose }: { product: Product; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [savedPhoto, setSavedPhoto] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<PhotoState>('loading');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');

  function cancelRequest() {
    const controller = request.current;
    request.current = null;
    controller?.abort();
  }

  useLayoutEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => {
      cancelRequest();
      node?.close();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;

    async function loadSavedPhoto() {
      try {
        const response = await fetch(PHOTO_API, {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          setPhotoState(response.status === 401 ? 'signed-out' : response.status === 404 ? 'missing' : 'unavailable');
          return;
        }
        const image = await response.blob();
        controller.signal.throwIfAborted();
        url = URL.createObjectURL(image);
        setSavedPhoto(url);
        setPhotoState('ready');
      } catch {
        if (!controller.signal.aborted) setPhotoState('unavailable');
      }
    }

    void loadSavedPhoto();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  function close() {
    cancelRequest();
    onClose();
  }

  async function runTryOn() {
    if (request.current || photoState !== 'ready' || phase === 'uncertain') return;

    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    const fetchOptions = { credentials: 'include' as const, cache: 'no-store' as const, signal };
    const deadline = window.setTimeout(() => controller.abort(new Error('The try-on timed out.')), TRY_ON_TIMEOUT_MS);
    let providerMayHaveStarted = false;

    setPhase('working');
    setResultUrl(null);
    setMessage('Preparing the outfit…');
    try {
      const garment = await fetch(product.image, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!garment.ok) throw new Error('Could not load this product image.');

      const form = new FormData();
      form.append('garment', await garment.blob(), 'garment.jpg');
      signal.throwIfAborted();

      setMessage('Dressing you in this outfit…');
      providerMayHaveStarted = true;
      const start = await fetch(API + '/me', { ...fetchOptions, method: 'POST', body: form });
      if (!start.ok) {
        if (start.status >= 400 && start.status < 500 && start.status !== 408) providerMayHaveStarted = false;
        if (start.status === 401) throw new Error('Please sign in to try on outfits.');
        if (start.status === 409) throw new Error('Add your full-body photo first.');
        throw new Error('Could not start the try-on.');
      }
      const id: unknown = (await start.json()).id;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) {
        throw new Error('Could not identify the try-on.');
      }
      const statusUrl = API + '/' + id;

      for (;;) {
        await waitForNextPoll(signal);
        const response = await fetch(statusUrl, fetchOptions);
        if (!response.ok) throw new Error('Could not check the try-on status.');
        const { status } = await response.json();
        signal.throwIfAborted();
        if (status === 'succeeded') {
          setResultUrl(statusUrl + '/result');
          setPhase('idle');
          setMessage('');
          return;
        }
        if (status === 'failed' || status === 'canceled') {
          providerMayHaveStarted = false;
          throw new Error('The try-on did not finish. Please try again.');
        }
      }
    } catch (error) {
      if (request.current !== controller) return;
      setPhase(providerMayHaveStarted ? 'uncertain' : 'error');
      setMessage(providerMayHaveStarted
        ? 'The try-on may still be processing. Submitting again could start another generation.'
        : error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      window.clearTimeout(deadline);
      if (request.current === controller) request.current = null;
    }
  }

  return (
    <dialog
      className="try-on-card"
      aria-label={`Try on ${product.name}`}
      ref={dialog}
      onCancel={event => {
        event.preventDefault();
        close();
      }}
    >
      <button className="try-on-close" onClick={close} aria-label="Close try-on">×</button>
      <h2>{product.name}</h2>
      <p className="try-on-hint">Uses the full-body photo saved in your account.</p>

      <div className="try-on-image">
        {resultUrl ? <img src={resultUrl} alt={`You wearing ${product.name}`} />
          : savedPhoto ? <img src={savedPhoto} alt="Your saved photo" />
          : <div className="try-on-empty">{photoState === 'loading' ? 'Loading your photo…' : 'Photo unavailable'}</div>}
      </div>

      {photoState === 'ready' && phase !== 'uncertain' && (
        <div className="try-on-actions">
          <button className="primary" onClick={() => void runTryOn()} disabled={phase === 'working'}>
            {resultUrl ? 'Try again' : 'Try on'}
          </button>
        </div>
      )}

      {phase === 'working' && <p role="status">{message}</p>}
      {(phase === 'error' || phase === 'uncertain') && <p role="alert">{message}</p>}
      {photoState === 'missing' && <p>Add your full-body photo in your account to try outfits on.</p>}
      {photoState === 'signed-out' && <p>Sign in to try on outfits with your photo.</p>}
      {photoState === 'unavailable' && <p role="alert">Could not load your saved photo. Reopen try-on to retry.</p>}
    </dialog>
  );
}
