import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Phone, ArrowRight, Loader2, AlertCircle, Languages } from 'lucide-react';
import type { SupportedLanguage } from '../types';
import { useAuth } from '../auth/AuthProvider';

/**
 * Phone + OTP sign-in. The first screen an unauthenticated worker sees.
 *
 * Owner: Track B.
 *
 * SECTION 4H IS THE SPEC HERE, NOT DECORATION. Every control is at least 48dp,
 * the numerals are oversized, contrast is high enough for direct sunlight, and
 * the whole flow is two steps with one field each. This user group abandons an
 * app at the first screen that assumes literacy or patience, and a login is the
 * one screen nobody can skip.
 *
 * NO PASSWORD FIELD, EVER. Section 6 of the stack table: passwords are a
 * barrier for this cohort, and OTP is the norm they already understand.
 *
 * COPY LIVES HERE, not in data/translations.ts. That file is 400 lines shared
 * across every screen and is edited constantly by Track B; adding five more
 * languages' worth of login strings to it creates a merge surface for no
 * benefit, because nothing outside this screen will ever read them.
 */

type Step = 'phone' | 'code';

interface Copy {
  title: string;
  subtitle: string;
  phoneLabel: string;
  phoneHint: string;
  sendCode: string;
  codeLabel: string;
  codeHint: (phone: string) => string;
  verify: string;
  changeNumber: string;
  resend: string;
  trust: string;
}

const COPY: Record<SupportedLanguage, Copy> = {
  hi: {
    title: 'कारीगर साथी',
    subtitle: 'अपना मोबाइल नंबर डालें',
    phoneLabel: 'मोबाइल नंबर',
    phoneHint: '10 अंकों का नंबर',
    sendCode: 'कोड भेजें',
    codeLabel: '6 अंकों का कोड',
    codeHint: (p) => `${p} पर भेजा गया`,
    verify: 'आगे बढ़ें',
    changeNumber: 'नंबर बदलें',
    resend: 'दोबारा भेजें',
    trust: 'आपका डेटा आपका है। कोई कमीशन नहीं।',
  },
  pa: {
    title: 'ਕਾਰੀਗਰ ਸਾਥੀ',
    subtitle: 'ਆਪਣਾ ਮੋਬਾਈਲ ਨੰਬਰ ਪਾਓ',
    phoneLabel: 'ਮੋਬਾਈਲ ਨੰਬਰ',
    phoneHint: '10 ਅੰਕਾਂ ਦਾ ਨੰਬਰ',
    sendCode: 'ਕੋਡ ਭੇਜੋ',
    codeLabel: '6 ਅੰਕਾਂ ਦਾ ਕੋਡ',
    codeHint: (p) => `${p} 'ਤੇ ਭੇਜਿਆ ਗਿਆ`,
    verify: 'ਅੱਗੇ ਵਧੋ',
    changeNumber: 'ਨੰਬਰ ਬਦਲੋ',
    resend: 'ਦੁਬਾਰਾ ਭੇਜੋ',
    trust: 'ਤੁਹਾਡਾ ਡਾਟਾ ਤੁਹਾਡਾ ਹੈ। ਕੋਈ ਕਮਿਸ਼ਨ ਨਹੀਂ।',
  },
  kn: {
    title: 'ಕಾರೀಗರ್ ಸಾಥಿ',
    subtitle: 'ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ',
    phoneLabel: 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ',
    phoneHint: '10 ಅಂಕಿಗಳ ಸಂಖ್ಯೆ',
    sendCode: 'ಕೋಡ್ ಕಳುಹಿಸಿ',
    codeLabel: '6 ಅಂಕಿಗಳ ಕೋಡ್',
    codeHint: (p) => `${p} ಗೆ ಕಳುಹಿಸಲಾಗಿದೆ`,
    verify: 'ಮುಂದುವರಿಯಿರಿ',
    changeNumber: 'ಸಂಖ್ಯೆ ಬದಲಾಯಿಸಿ',
    resend: 'ಮತ್ತೆ ಕಳುಹಿಸಿ',
    trust: 'ನಿಮ್ಮ ಡೇಟಾ ನಿಮ್ಮದು. ಯಾವುದೇ ಕಮಿಷನ್ ಇಲ್ಲ.',
  },
  mr: {
    title: 'कारागीर साथी',
    subtitle: 'तुमचा मोबाईल नंबर टाका',
    phoneLabel: 'मोबाईल नंबर',
    phoneHint: '10 अंकी नंबर',
    sendCode: 'कोड पाठवा',
    codeLabel: '6 अंकी कोड',
    codeHint: (p) => `${p} वर पाठवला`,
    verify: 'पुढे जा',
    changeNumber: 'नंबर बदला',
    resend: 'पुन्हा पाठवा',
    trust: 'तुमचा डेटा तुमचा आहे. कोणतेही कमिशन नाही.',
  },
  en: {
    title: 'Kaarigar Saathi',
    subtitle: 'Enter your mobile number',
    phoneLabel: 'Mobile number',
    phoneHint: '10-digit number',
    sendCode: 'Send code',
    codeLabel: '6-digit code',
    codeHint: (p) => `Sent to ${p}`,
    verify: 'Continue',
    changeNumber: 'Change number',
    resend: 'Send again',
    trust: 'Your data is yours. Zero commission.',
  },
};

interface LoginScreenProps {
  currentLanguage: SupportedLanguage;
  onChangeLanguage: () => void;
  customerDemo?: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  currentLanguage,
  onChangeLanguage,
  customerDemo = false,
}) => {
  const { requestOtp, verifyOtp } = useAuth();
  const base = COPY[currentLanguage] ?? COPY.en;
  const demo = {
    en: { title: 'Neha · Customer demo', subtitle: 'Enter your demo identifier', phoneLabel: 'Demo identifier', phoneHint: '0123456789 · not an SMS number', sendCode: 'Continue to demo code', codeHint: () => 'Enter the customer demo code. No SMS is sent.' },
    hi: { title: 'नेहा · ग्राहक डेमो', subtitle: 'अपनी डेमो पहचान डालें', phoneLabel: 'डेमो पहचान', phoneHint: '0123456789 · SMS नंबर नहीं है', sendCode: 'डेमो कोड पर जाएँ', codeHint: () => 'ग्राहक डेमो कोड डालें। SMS नहीं भेजा जाता।' },
    pa: { title: 'ਨੇਹਾ · ਗਾਹਕ ਡੈਮੋ', subtitle: 'ਆਪਣੀ ਡੈਮੋ ਪਛਾਣ ਭਰੋ', phoneLabel: 'ਡੈਮੋ ਪਛਾਣ', phoneHint: '0123456789 · SMS ਨੰਬਰ ਨਹੀਂ ਹੈ', sendCode: 'ਡੈਮੋ ਕੋਡ ਵੱਲ ਜਾਓ', codeHint: () => 'ਗਾਹਕ ਡੈਮੋ ਕੋਡ ਭਰੋ। SMS ਨਹੀਂ ਭੇਜਿਆ ਜਾਂਦਾ।' },
    kn: { title: 'ನೇಹಾ · ಗ್ರಾಹಕ ಡೆಮೊ', subtitle: 'ನಿಮ್ಮ ಡೆಮೊ ಗುರುತನ್ನು ನಮೂದಿಸಿ', phoneLabel: 'ಡೆಮೊ ಗುರುತು', phoneHint: '0123456789 · SMS ಸಂಖ್ಯೆ ಅಲ್ಲ', sendCode: 'ಡೆಮೊ ಕೋಡ್‌ಗೆ ಮುಂದುವರಿಯಿರಿ', codeHint: () => 'ಗ್ರಾಹಕ ಡೆಮೊ ಕೋಡ್ ನಮೂದಿಸಿ. SMS ಕಳುಹಿಸಲಾಗುವುದಿಲ್ಲ.' },
    mr: { title: 'नेहा · ग्राहक डेमो', subtitle: 'तुमची डेमो ओळख टाका', phoneLabel: 'डेमो ओळख', phoneHint: '0123456789 · SMS नंबर नाही', sendCode: 'डेमो कोडकडे जा', codeHint: () => 'ग्राहक डेमो कोड टाका. SMS पाठवला जात नाही.' },
  };
  const t = customerDemo ? { ...base, ...(demo[currentLanguage as keyof typeof demo] ?? demo.en) } : base;

  const [step, setStep] = useState<Step>('phone');
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const codeInput = useRef<HTMLInputElement>(null);

  const phoneE164 = `+91${digits}`;
  const phoneReady = /^\d{10}$/.test(digits);
  const codeReady = /^\d{6}$/.test(code);

  useEffect(() => {
    if (step === 'code') codeInput.current?.focus();
  }, [step]);

  async function handleSend() {
    if (!phoneReady || busy) return;
    setBusy(true);
    setError('');
    try {
      const challenge = await requestOtp(phoneE164);
      setChallengeId(challenge.challengeId);
      setDevCode(challenge.devCode);
      setCode('');
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    if (!codeReady || busy) return;
    setBusy(true);
    setError('');
    try {
      await verifyOtp(challengeId, code);
      // On success the provider flips status to 'authenticated' and App swaps
      // this screen out. Nothing to navigate.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work.');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center px-5 py-10 font-sans antialiased">
      <div className="w-full max-w-sm">
        {/* Language switch stays reachable before sign-in - a worker who cannot
            read this screen cannot get past it. */}
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={onChangeLanguage}
            className="flex items-center gap-2 h-12 px-4 rounded-full bg-white border border-gray-200 text-gray-700 text-sm font-bold shadow-sm active:scale-95 transition"
          >
            <Languages className="w-4 h-4 text-orange-500" />
            <span>{currentLanguage.toUpperCase()}</span>
          </button>
        </div>

        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
          <div className="flex flex-col items-center text-center mb-7">
            <div className="w-16 h-16 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-200 mb-4">
              <ShieldCheck className="w-9 h-9 stroke-[2.5]" />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">{t.title}</h1>
            <p className="text-sm text-gray-500 mt-1">{t.subtitle}</p>
          </div>

          {step === 'phone' ? (
            <div>
              <label htmlFor="login-phone" className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                {t.phoneLabel}
              </label>
              <div className="flex items-center gap-2 rounded-2xl border-2 border-gray-200 focus-within:border-orange-400 bg-gray-50 px-3 h-16 transition-colors">
                <Phone className="w-5 h-5 text-orange-500 shrink-0" />
                <span className="text-xl font-black text-gray-500 tabular-nums select-none">+91</span>
                <input
                  id="login-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  autoFocus
                  placeholder={customerDemo ? '0123456789' : '9876543210'}
                  aria-describedby="login-phone-hint"
                  value={digits}
                  onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onKeyDown={(e) => e.key === 'Enter' && void handleSend()}
                  className="flex-1 min-w-0 bg-transparent outline-none text-2xl font-black tracking-wider tabular-nums text-gray-900 placeholder:text-gray-300 placeholder:font-bold"
                />
              </div>
              <p id="login-phone-hint" className="text-xs text-gray-400 mt-2">{t.phoneHint}</p>

              {error && <ErrorNote message={error} />}

              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!phoneReady || busy}
                className="mt-5 w-full h-14 rounded-2xl bg-orange-500 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-orange-200 disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                <span>{t.sendCode}</span>
              </button>
            </div>
          ) : (
            <div>
              <label htmlFor="login-code" className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                {t.codeLabel}
              </label>
              <input
                id="login-code"
                ref={codeInput}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && void handleVerify()}
                className="w-full h-16 rounded-2xl border-2 border-gray-200 focus:border-orange-400 bg-gray-50 outline-none text-center text-3xl font-black tracking-[0.4em] tabular-nums text-gray-900 placeholder:text-gray-300 transition-colors"
              />
              <p className="text-xs text-gray-400 mt-2">{t.codeHint(phoneE164)}</p>

              {/* Local convenience only: identity-svc omits devCode when
                  NODE_ENV is production, so this cannot render on the deploy. */}
              {devCode && (
                <p className="mt-2 text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                  Dev code: <span className="tabular-nums tracking-widest">{devCode}</span>
                </p>
              )}

              {error && <ErrorNote message={error} />}

              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={!codeReady || busy}
                className="mt-5 w-full h-14 rounded-2xl bg-orange-500 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-orange-200 disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                <span>{t.verify}</span>
              </button>

              <div className="flex items-center justify-between mt-4">
                <button
                  type="button"
                  onClick={() => { setStep('phone'); setError(''); setDevCode(undefined); }}
                  className="h-12 px-2 text-sm font-bold text-gray-500 active:scale-95 transition"
                >
                  {t.changeNumber}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={busy}
                  className="h-12 px-2 text-sm font-bold text-orange-600 disabled:opacity-40 active:scale-95 transition"
                >
                  {t.resend}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-5 px-4 leading-relaxed">{t.trust}</p>
      </div>
    </div>
  );
};

/**
 * Errors are shown with an icon and the server's own wording. The API names the
 * offending field on every validation failure, and "Too many attempts. Request
 * a new code." tells the worker what to do next in a way that "Login failed"
 * never does.
 */
const ErrorNote: React.FC<{ message: string }> = ({ message }) => (
  <div
    role="alert"
    className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"
  >
    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
    <span className="font-semibold">{message}</span>
  </div>
);
