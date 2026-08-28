/// <reference types="vite/client" />
/**
 * P4 / Day 2 go/no-go: does Firebase phone OTP actually deliver to a real
 * Indian mobile number?
 *
 * THROWAWAY TEST HARNESS - Track A. Delete once the go/no-go is decided.
 *
 * This is deliberately NOT the login screen. Track B owns the login screen and
 * builds it on Day 2 in the app's visual language; this page exists only to
 * answer one question with a yes or a no, and it lives outside src/ so that it
 * cannot be mistaken for product code.
 *
 * Reachable at http://localhost:3000/otp-test.html
 */

import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';

const env = import.meta.env;

const config: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const $ = (id: string) => document.getElementById(id)!;
const log = (msg: string, kind: 'info' | 'ok' | 'err' = 'info') => {
  const line = document.createElement('div');
  line.className = `line ${kind}`;
  line.textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
  $('log').prepend(line);
};

/**
 * The whole point of the harness. Firebase's error codes distinguish the
 * failure modes the plan treats differently, and "it didn't work" is not a
 * go/no-go answer. Each code below maps to a specific next action.
 */
const DIAGNOSIS: Record<string, string> = {
  'auth/billing-not-enabled':
    'P4 IS NOT DONE. Phone auth requires a billing account on the Firebase project, even inside free-tier quota. Enable it, then re-run. This is not an SMS routing problem.',
  // NOTE: auth/operation-not-allowed is overloaded. It means EITHER the phone
  // provider is disabled OR the destination country is not in the SMS region
  // allowlist, and only the message text distinguishes them. report() checks
  // for "region" before falling back to this entry.
  'auth/operation-not-allowed':
    'Phone provider is not enabled. Firebase console -> Authentication -> Sign-in method -> Phone -> Enable. Not a billing or routing problem.',
  'auth/unauthorized-domain':
    'This origin is not in the authorized-domains list. Console -> Authentication -> Settings -> Authorized domains. localhost is there by default, so if you see this on localhost the config points at a different project than you think.',
  'auth/invalid-phone-number':
    'Number rejected as malformed. It must be full E.164: +91 followed by 10 digits, no spaces or dashes.',
  'auth/too-many-requests':
    'Throttled by Firebase abuse protection. This is NOT a no-go - it means requests were accepted. Wait, or add the number as a test number in the console.',
  'auth/quota-exceeded':
    'SMS quota exhausted for the project. Capability works; volume is capped. Not an architecture problem.',
  'auth/captcha-check-failed':
    'reCAPTCHA failed to verify. Usually a domain or config mismatch rather than an SMS problem.',
  'auth/invalid-app-credential':
    'Server returned INVALID_APP_CREDENTIAL: it did not accept the reCAPTCHA token. Read the [raw] recaptchaToken line above - ABSENT means the widget produced nothing (a client problem); a real token means the server rejected a valid-looking one (a project-config problem). Ruled out already: API key validity, referrer restrictions, authorized domains, reCAPTCHA Enterprise enforcement. Not an SMS delivery failure - no SMS is attempted at this stage.',
  'auth/invalid-verification-code':
    'Delivery WORKED - the code was simply wrong or expired. For the go/no-go this counts as a YES on delivery.',
  'auth/code-expired':
    'Delivery WORKED, the code expired before submission. Counts as a YES on delivery.',
};

/**
 * Surface the raw Identity Toolkit request and response.
 *
 * The SDK's mapped codes are lossy - auth/invalid-app-credential covers
 * several unrelated server errors - and the server's own message names the
 * actual cause. Installed before Firebase makes any call.
 */
const originalFetch = window.fetch.bind(window);
window.fetch = async (...args: Parameters<typeof fetch>) => {
  const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
  const res = await originalFetch(...args);

  if (url.includes('identitytoolkit')) {
    const endpoint = url.split('?')[0].split('/').pop() ?? 'identitytoolkit';
    // Match on substring: the real path segment is "accounts:sendVerificationCode",
    // so an equality check against "sendVerificationCode" never fires.
    if (url.includes('sendVerificationCode')) {
      const body = typeof args[1]?.body === 'string' ? args[1].body : '';
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(body); } catch { /* not JSON */ }

      const token = typeof parsed.recaptchaToken === 'string' ? parsed.recaptchaToken : '';
      log(
        `[raw] request fields: ${Object.keys(parsed).join(', ') || '(none parsed)'}`,
        'info'
      );
      log(
        `[raw] recaptchaToken: ${token ? `${token.length} chars, starts ${token.slice(0, 12)}…` : 'ABSENT OR EMPTY — no token reached the server'}`,
        token ? 'info' : 'err'
      );
    }
    res.clone().text().then((t) => {
      log(`[raw ${endpoint} HTTP ${res.status}] ${t.slice(0, 500)}`, res.ok ? 'info' : 'err');
    }).catch(() => { /* body already consumed */ });
  }

  return res;
};

let confirmation: ConfirmationResult | null = null;
let verifier: RecaptchaVerifier | null = null;
let firebaseApp: FirebaseApp | null = null;

/**
 * initializeApp() throws app/duplicate-app if called twice for the same name,
 * so the app is created once and reused across attempts.
 */
function ensureAuth() {
  if (!firebaseApp) firebaseApp = initializeApp(config);
  const auth = getAuth(firebaseApp);
  auth.useDeviceLanguage();
  return auth;
}

/**
 * Mount a fresh VISIBLE reCAPTCHA.
 *
 * Back to visible from invisible deliberately, for diagnosis: with a checkbox
 * the user has demonstrably produced a token, so if the server still rejects
 * the request we know the problem is the token's acceptance rather than its
 * existence. Invisible hides that distinction.
 *
 * A token is single-use, so the widget is remounted after every attempt and
 * has to be ticked again before the next one.
 */
async function mountRecaptcha(note?: string) {
  const auth = ensureAuth();
  if (verifier) {
    try { verifier.clear(); } catch { /* already torn down */ }
    verifier = null;
  }
  $('recaptcha').innerHTML = '';
  const v = new RecaptchaVerifier(auth, 'recaptcha', { size: 'normal' });
  await v.render();
  verifier = v;
  if (note) log(note, 'info');
}

function checkConfig(): boolean {
  const missing = Object.entries(config)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    $('config').innerHTML =
      `<b class="err">Missing config:</b> ${missing.join(', ')}<br>` +
      'Add the VITE_FIREBASE_* values to .env (see .env.example), then restart the dev server. ' +
      'Vite only reads .env at startup, so an edit without a restart will look like the values are still missing.';
    return false;
  }
  $('config').innerHTML =
    `<b class="ok">Config loaded.</b> project: <code>${config.projectId}</code>`;
  return true;
}

function report(err: unknown) {
  const code = (err as { code?: string })?.code ?? 'unknown';
  const message = (err as { message?: string })?.message ?? String(err);
  log(`FAILED  code=${code}`, 'err');
  log(message, 'err');
  // Disambiguate the overloaded code before the table lookup.
  const hint =
    code === 'auth/operation-not-allowed' && /region/i.test(message)
      ? 'SMS REGION POLICY, not the provider toggle. New Firebase projects default to allowing NO regions, so India is blocked until it is allowlisted. Console -> Authentication -> Settings -> SMS region policy -> Allow -> add India (IN). This is a config setting, NOT an SMS delivery failure, so it is not a no-go.'
      : DIAGNOSIS[code];

  if (hint) log(`> ${hint}`, 'err');
  else log('> Unmapped error code. Record it verbatim in the go/no-go notes.', 'err');
}

async function sendCode() {
  if (!checkConfig()) return;
  const phone = ($('phone') as HTMLInputElement).value.trim();

  if (!/^\+91\d{10}$/.test(phone)) {
    log(`"${phone}" is not +91 followed by exactly 10 digits.`, 'err');
    return;
  }

  if (!verifier) {
    log('reCAPTCHA is not mounted yet. Reload the page.', 'err');
    return;
  }

  try {
    const auth = ensureAuth();

    log(`Requesting OTP for ${phone} ...`);
    const t0 = performance.now();
    confirmation = await signInWithPhoneNumber(auth, phone, verifier);
    const ms = Math.round(performance.now() - t0);

    log(`Firebase ACCEPTED the request in ${ms}ms.`, 'ok');
    log('That is acceptance, NOT delivery. The go/no-go turns on whether the SMS actually arrives on the handset.', 'info');
    ($('verify-block') as HTMLElement).style.display = 'block';
  } catch (err) {
    report(err);
  } finally {
    // The token just used is spent either way.
    await mountRecaptcha('reCAPTCHA reset — tick it again before retrying.');
  }
}

async function verifyCode() {
  if (!confirmation) {
    log('Request a code first.', 'err');
    return;
  }
  const code = ($('code') as HTMLInputElement).value.trim();
  try {
    const cred = await confirmation.confirm(code);
    const token = await cred.user.getIdToken();

    log('SIGN-IN SUCCEEDED. This is a GO.', 'ok');
    log(`uid: ${cred.user.uid}`, 'ok');
    log(`phone: ${cred.user.phoneNumber}`, 'ok');
    log(`ID token (${token.length} chars): ${token.slice(0, 40)}...`, 'ok');
    log('That ID token is what Track A requireAuth will verify with the Admin SDK on Day 2.', 'info');
  } catch (err) {
    report(err);
  }
}

$('send').addEventListener('click', () => void sendCode());
$('verify').addEventListener('click', () => void verifyCode());

if (checkConfig()) {
  void mountRecaptcha().catch((e) => {
    log(`reCAPTCHA failed to mount: ${e?.message ?? e}`, 'err');
  });
}
