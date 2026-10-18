import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { readStored, withStorageLock, writeStored } from './browserStorage';
import { parseTheme, resolveTheme, THEME_KEY, type ThemePreference } from './themePreference';

const readPreference = () => readStored(THEME_KEY, parseTheme, 'system');
const ThemeContext = createContext<{
  preference: ThemePreference; resolved: 'light' | 'dark'; message: string;
  choose: (preference: ThemePreference) => Promise<void>;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const [message, setMessage] = useState('');
  const resolved = resolveTheme(preference, systemDark);
  useLayoutEffect(() => { document.documentElement.dataset.theme = resolved; }, [resolved]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const syncSystem = () => setSystemDark(media.matches);
    const syncStored = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) {
        setPreference(readPreference()); setMessage('Appearance updated from browser settings.');
      }
    };
    media.addEventListener('change', syncSystem); syncSystem();
    addEventListener('storage', syncStored);
    return () => { media.removeEventListener('change', syncSystem); removeEventListener('storage', syncStored); };
  }, []);
  async function choose(next: ThemePreference) {
    // Apply immediately so native radio/keyboard interaction stays in sync while the lock is acquired.
    setPreference(next); setMessage('');
    try {
      await withStorageLock(THEME_KEY, () => writeStored(THEME_KEY, next));
      setMessage('Appearance saved in this browser.');
    } catch {
      setMessage('Appearance changed for this tab only. Browser storage could not be saved safely. Reload before trying to save again.');
    }
  }
  return <ThemeContext.Provider value={{ preference, resolved, choose, message }}>{children}</ThemeContext.Provider>;
}
function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('ThemeProvider is required');
  return theme;
}
export function ThemeSettings() {
  const { preference, resolved, choose, message } = useTheme();
  return <section className="commerce-panel theme-settings" aria-labelledby="appearance-heading"><h2 id="appearance-heading">Appearance</h2><p>Choose your look. Your device setting is used until you choose a theme.</p><fieldset><legend>Colour theme</legend><div className="theme-options">{(['light', 'dark', 'system'] as const).map(value => <label key={value}><input type="radio" name="theme" value={value} checked={preference === value} onChange={() => void choose(value)}/>{value === 'system' ? 'Use device' : value === 'light' ? 'Light' : 'Dark'}</label>)}</div></fieldset><p className="fine">Currently {resolved}. Photos keep their original colours.</p>{message && <p role="status">{message}</p>}</section>;
}
