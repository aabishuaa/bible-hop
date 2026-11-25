import '@fontsource-variable/cormorant-garamond/wght.css';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import '@fontsource-variable/eb-garamond/wght.css';
import '@fontsource-variable/eb-garamond/wght-italic.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/400-italic.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/unifrakturmaguntia/400.css';
import '@fontsource-variable/fraunces/soft.css';
import '@fontsource-variable/fraunces/soft-italic.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { kraftTile } from './fx/paper.ts';
import { sound } from './fx/sound.ts';
import './prefs.ts';

document.documentElement.style.setProperty('--kraft-tile', `url(${kraftTile()})`);

// Sound can only begin from a touch or a key press; the first one anywhere wakes it.
for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, () => sound.unlock(), { passive: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
