import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import {AuthProvider} from './auth/AuthProvider';
import {primePassportOrigin} from './lib/passportLink';
import './index.css';

// Ask the server which origin it publishes, so Share and the QR cannot
// disagree. Fire-and-forget: it must never delay first paint, and the fallback
// is correct until it resolves.
void primePassportOrigin();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
