import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Route, Routes} from 'react-router-dom';
import App from './App.tsx';
import {CustomerApp} from './components/customer/CustomerApp';
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
        {/*
          The customer tree is a SIBLING of App, not a route inside it.

          App loads the worker's dashboard the moment anyone authenticates, and
          the first call it makes is GET /api/passport/me - which CREATES a
          kaarigar passport if the caller has none. Mounting the customer
          screens inside App would therefore mint a stub passport for every
          customer who signed in, and each one would show up in the very browse
          list they were using. Splitting here means App never mounts for a
          customer and that load never runs.
        */}
        <Routes>
          <Route path="/customer/*" element={<CustomerApp />} />
          {/*
            RoleGate stands in front of App only. A direct visit to /customer is
            an explicit choice and is never second-guessed.
          */}
          <Route path="/*" element={<RoleGate><App /></RoleGate>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
