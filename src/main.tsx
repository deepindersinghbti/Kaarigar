import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import App from './App.tsx';
import {RoleGate} from './components/RoleGate';
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
        {/* Customer access stays closed until its platform is released. */}
        <Routes>
          <Route path="/customer/*" element={<Navigate to="/" replace />} />
          {/* All worker screens retain their existing routes behind the entry gate. */}
          <Route path="/*" element={<RoleGate><App /></RoleGate>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
