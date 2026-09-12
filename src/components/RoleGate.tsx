import React, { useEffect, useState } from 'react';
import { ArrowLeft, Globe, Hammer, Search } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { isLanguageSelectable, SUPPORTED_LANGUAGES } from '../data/translations';
import type { SupportedLanguage } from '../types';
import { LanguageSelectorModal } from './LanguageSelectorModal';
import { LoginScreen } from './LoginScreen';

const COPY = {
  en: {
    heading: 'Who are you?', subtitle: 'Choose how you want to use Kaarigar.',
    worker: 'I am a Kaarigar', workerHint: 'Manage your work and earnings',
    customer: 'I need a Kaarigar', soon: 'Customer demo',
    language: 'Change language', back: 'Back to role selection',
  },
  hi: {
    heading: 'आप कौन हैं?', subtitle: 'चुनें कि आप कारीगर का उपयोग कैसे करना चाहते हैं।',
    worker: 'मैं कारीगर हूँ', workerHint: 'अपना काम और कमाई दर्ज करें',
    customer: 'मुझे कारीगर चाहिए', soon: 'ग्राहक डेमो',
    language: 'भाषा बदलें', back: 'भूमिका चयन पर वापस जाएँ',
  },
  pa: {
    heading: 'ਤੁਸੀਂ ਕੌਣ ਹੋ?', subtitle: 'ਚੁਣੋ ਕਿ ਤੁਸੀਂ ਕਾਰੀਗਰ ਦੀ ਵਰਤੋਂ ਕਿਵੇਂ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹੋ।',
    worker: 'ਮੈਂ ਕਾਰੀਗਰ ਹਾਂ', workerHint: 'ਆਪਣਾ ਕੰਮ ਅਤੇ ਕਮਾਈ ਦਰਜ ਕਰੋ',
    customer: 'ਮੈਨੂੰ ਕਾਰੀਗਰ ਚਾਹੀਦਾ ਹੈ', soon: 'ਗਾਹਕ ਡੈਮੋ',
    language: 'ਭਾਸ਼ਾ ਬਦਲੋ', back: 'ਭੂਮਿਕਾ ਚੋਣ ਉੱਤੇ ਵਾਪਸ ਜਾਓ',
  },
};

function savedLanguage(): SupportedLanguage {
  const saved = localStorage.getItem('kaarigar_lang') as SupportedLanguage | null;
  return saved && isLanguageSelectable(saved) ? saved : 'hi';
}

/** Entry choice precedes authentication; all existing worker routes stay intact. */
export const RoleGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [language, setLanguage] = useState<SupportedLanguage>(savedLanguage);
  const [languageOpen, setLanguageOpen] = useState(false);

  /**
   * Keep the entry step in browser history. Previously this was only React
   * state, so a phone Back gesture from the worker login screen could leave
   * the site instead of returning to role selection.
   *
   * The pathname is preserved so a deep link such as /jobs can still resume
   * at that page after authentication.
   */
  const workerSelected = new URLSearchParams(location.search).get('entry') === 'worker';

  const selectWorker = () => {
    const params = new URLSearchParams(location.search);
    params.set('entry', 'worker');
    navigate({ pathname: location.pathname, search: '?' + params.toString() });
  };

  const returnToRoleSelection = () => {
    const params = new URLSearchParams(location.search);
    params.delete('entry');
    const search = params.toString();
    // This explicit button should always return in-app, even if the login URL
    // was opened directly without a previous same-origin history entry.
    navigate({ pathname: location.pathname, search: search ? '?' + search : '' }, { replace: true });
  };

  useEffect(() => {
    // Remove the entry marker after authentication so the worker starts on
    // the actual app route and a later sign-out begins cleanly.
    if (status === 'authenticated' && new URLSearchParams(location.search).has('entry')) {
      const params = new URLSearchParams(location.search);
      params.delete('entry');
      const search = params.toString();
      navigate({ pathname: location.pathname, search: search ? '?' + search : '' }, { replace: true });
    }
    // App may have changed language before signing out.
    if (status === 'unauthenticated') setLanguage(savedLanguage());
    setLanguageOpen(false);
  }, [status, location.pathname, location.search, navigate]);

  if (status === 'loading') return <div className="min-h-screen bg-[#F3F4F6]" />;
  if (status === 'authenticated' && !user?.roles.includes('kaarigar')) return <Navigate to="/customer" replace />;
  if (status === 'authenticated') return <>{children}</>;

  const copy = COPY[language as keyof typeof COPY] ?? COPY.hi;
  const languageName = SUPPORTED_LANGUAGES.find((item) => item.code === language)?.nativeName;

  return (
    <>
      {workerSelected ? (
        <>
          <div className="bg-[#F3F4F6] px-4 pt-4">
            <button type="button" onClick={returnToRoleSelection}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-bold text-gray-700 focus-visible:outline-2 focus-visible:outline-orange-500">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />{copy.back}
            </button>
          </div>
          <LoginScreen currentLanguage={language} onChangeLanguage={() => setLanguageOpen(true)} />
        </>
      ) : (
        <div lang={language} className="relative flex min-h-dvh flex-col bg-[#F3F4F6] text-gray-900">
          <header className="flex justify-end px-4 py-4 sm:px-8 sm:py-6">
            <button id="entry-language-button" type="button" onClick={() => setLanguageOpen(true)} aria-label={copy.language}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-gray-200 bg-white px-5 text-sm font-bold text-gray-700 shadow-sm hover:border-orange-300 focus-visible:outline-2 focus-visible:outline-orange-500">
              <Globe className="h-5 w-5 text-orange-500" aria-hidden="true" />{languageName}
            </button>
          </header>
          <main className="flex flex-1 items-center justify-center px-5 pb-24">
            <div className="w-full max-w-md">
              <h1 className="mb-2 text-center text-xl font-extrabold">{copy.heading}</h1>
              <p className="mb-6 text-center text-sm text-gray-500">{copy.subtitle}</p>
              <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                <button id="entry-kaarigar-button" type="button" onClick={selectWorker}
                  className="flex flex-col items-center gap-3 rounded-3xl border border-gray-200 bg-white px-4 py-6 transition hover:border-orange-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-orange-500 active:scale-[0.98]">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600"><Hammer className="h-7 w-7" aria-hidden="true" /></span>
                  <span className="font-extrabold">{copy.worker}</span>
                  <span className="text-center text-xs text-gray-500">{copy.workerHint}</span>
                </button>
                <button id="entry-customer-button" type="button" onClick={() => navigate('/customer')}
                  className="flex flex-col items-center gap-3 rounded-3xl border border-gray-200 bg-white px-4 py-6 transition hover:border-orange-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-orange-500 active:scale-[0.98]">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600"><Search className="h-7 w-7" aria-hidden="true" /></span>
                  <span className="font-extrabold">{copy.customer}</span>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-center text-xs font-semibold text-gray-500">{copy.soon}</span>
                </button>
              </div>
            </div>
          </main>
        </div>
      )}
      <LanguageSelectorModal isOpen={languageOpen} onClose={() => setLanguageOpen(false)} currentLanguage={language}
        onSelectLanguage={(next) => {
          if (!isLanguageSelectable(next)) return;
          localStorage.setItem('kaarigar_lang', next);
          setLanguage(next);
        }} />
    </>
  );
};
