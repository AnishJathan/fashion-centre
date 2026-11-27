
import { useEffect } from 'react';

import { createRoot } from 'react-dom/client';

import { App } from './App';

import { restoreShoppingStorage } from './browserStorage';

import { ThemeProvider } from './Appearance';

import './style.css';

import './commerce.css';

import './catalogue.css';

import './login.css';

import './theme.css';

import './desktop.css';

// Restore the originating studio before the account page consumes the OAuth result.
try {
  const url = new URL(location.href);
  const target = sessionStorage.getItem('fc.signin.try');

  if (
    url.searchParams.has('signin') &&
    target &&
    /^#\/try(?:\?brand=[a-z0-9-]+)?$/.test(target)
  ) {
    sessionStorage.removeItem('fc.signin.try');
    url.hash = target;
    history.replaceState(null, '', url);
  }
} catch {
  /* Session storage is optional. */
}

const container = document.getElementById('app');

if (!container) {
  throw new Error('Missing application mount element');
}

function LaunchComplete() {
  useEffect(() => {
    const launch = document.getElementById('launch-reveal');
    if (!launch) return;

    launch.classList.add('launch-ready');

    const finish = () => launch.remove();

    launch.addEventListener('animationend', event => {
      if (event.target === launch) finish();
    });

    const fallback = window.setTimeout(finish, 1300);

    return () => clearTimeout(fallback);
  }, []);

  return null;
}

const root = createRoot(container);
void restoreShoppingStorage().catch(() => {
  // Browsing still works when the browser blocks persistent storage.
}).then(() => {
  root.render(
    <ThemeProvider>
      <App />
      <LaunchComplete />
    </ThemeProvider>,
  );
});
