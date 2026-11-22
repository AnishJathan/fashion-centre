import { useEffect, useRef } from 'react';
import { WEB_CLIENT_ID, loadGis } from './socialAuth';

export function GoogleWebButton({ onToken, disabled }: {
  onToken: (idToken: string) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const handler = useRef(onToken);
  handler.current = onToken;

  useEffect(() => {
    if (!WEB_CLIENT_ID || !ref.current) return;
    let cancelled = false;
    loadGis().then(() => {
      if (cancelled || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: WEB_CLIENT_ID,
        callback: (r: { credential?: string }) => {
          if (r.credential) handler.current(r.credential);
        },
      });
      window.google.accounts.id.renderButton(ref.current, {
        type: 'standard', size: 'large', text: 'continue_with', width: 320,
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return <div ref={ref} aria-disabled={disabled} style={{ display: 'flex', justifyContent: 'center' }} />;
}