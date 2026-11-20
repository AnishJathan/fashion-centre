import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ThemeProvider } from './Appearance';
import './style.css';
import './commerce.css';
import './catalogue.css';
import './login.css';
import './theme.css';

const container = document.getElementById('app');
if (!container) throw new Error('Missing application mount element');

createRoot(container).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
