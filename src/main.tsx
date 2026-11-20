import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ThemeProvider } from './Appearance';
import './style.css';
import './approved.css';
import './login.css';
import './commerce-base.css';
import './commerce.css';
import './commerce-controls.css';
import './checkout-confirmation.css';
import './live-catalogue.css';
import './quality.css';
import './mobile-navigation.css';
import './theme.css';

const container = document.getElementById('app');
if (!container) throw new Error('Missing application mount element');

createRoot(container).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
