import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/* Self-hosted variable fonts, bundled from npm. Imported before the design
   tokens so the faces are registered before first paint and there is no
   fallback flash. Weights 200–800 come from the single variable file. */
import '@fontsource-variable/sora';
import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';

import App from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/animations.css';
import './styles/pages.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
