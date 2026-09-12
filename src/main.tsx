import {lazy, StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Route, Routes} from 'react-router-dom';
import App from './App.tsx';
import {RoleGate} from './components/RoleGate';
import {AuthProvider} from './auth/AuthProvider';
import {primePassportOrigin} from './lib/passportLink';
import './index.css';

const CustomerApp = lazy(() => import('./components/customer/CustomerApp').then(({CustomerApp}) => ({default: CustomerApp})));

// Ask the server which origin it publishes, so Share and the QR cannot
// disagree. Fire-and-forget: it must never delay first paint, and the fallback
// is correct until it resolves.
void primePassportOrigin();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/customer/*" element={
            <Suspense fallback={<div className="min-h-screen bg-[#F3F4F6]" />}><CustomerApp /></Suspense>
          } />
          {/* All worker screens retain their existing routes behind the entry gate. */}
          <Route path="/*" element={<RoleGate><App /></RoleGate>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
