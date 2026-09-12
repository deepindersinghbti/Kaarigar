import React, { useState } from 'react';
import { Routes, Route, Navigate, NavLink, Link, useNavigate } from 'react-router-dom';
import { Search, ClipboardList, LogOut, Globe } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { LoginScreen } from '../LoginScreen';
import { LanguageSelectorModal } from '../LanguageSelectorModal';
import { isLanguageSelectable } from '../../data/translations';
import type { SupportedLanguage } from '../../types';
import { CustomerBrowse } from './CustomerBrowse';
import { CustomerRequestForm } from './CustomerRequestForm';
import { CustomerRequests } from './CustomerRequests';
import { getCustomerCopy } from './customerCopy';

/**
 * The customer side of the app, mounted at /customer/* as a sibling of App.
 *
 * WHY IT IS NOT A ROUTE INSIDE App. App's data effect calls
 * GET /api/passport/me for anyone who authenticates, and that endpoint creates
 * a passport when the caller has none. A customer rendered inside App would
 * therefore be given a kaarigar passport named "Kaarigar" as a side effect of
 * signing in, and it would appear in the browse list on the next load. Keeping
 * the trees separate means that effect never runs for a customer.
 *
 * The auth gate, the language state and the modal below are the same three
 * pieces App uses, in the same order and for the same reasons - a signed-in
 * customer reopening the app must not flash the login form while the stored
 * session is restored.
 */
export const CustomerApp: React.FC = () => {
  const { status, user, signOut } = useAuth();
  const navigate = useNavigate();

  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kaarigar_lang');
      if (saved && isLanguageSelectable(saved as SupportedLanguage)) {
        return saved as SupportedLanguage;
      }
    }
    return 'hi';
  });
  const [isLangModalOpen, setIsLangModalOpen] = useState(false);
  const copy = getCustomerCopy(currentLanguage);

  const handleLanguageChange = (language: SupportedLanguage) => {
    if (!isLanguageSelectable(language)) return;
    setCurrentLanguage(language);
    localStorage.setItem('kaarigar_lang', language);
  };

  if (status === 'loading') {
    return <div className="min-h-screen bg-[#F3F4F6]" />;
  }

  if (status === 'unauthenticated') {
    return (
      <>
        <div className="bg-[#F3F4F6] px-4 pt-4">
          <Link to="/" className="inline-flex min-h-12 items-center rounded-full border border-gray-200 bg-white px-4 text-sm font-bold">{copy.back}</Link>
          <p className="mx-auto mt-4 max-w-md rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-gray-700">{copy.notice}</p>
        </div>
        <LoginScreen
          customerDemo
          currentLanguage={currentLanguage}
          onChangeLanguage={() => setIsLangModalOpen(true)}
        />
        <LanguageSelectorModal
          isOpen={isLangModalOpen}
          onClose={() => setIsLangModalOpen(false)}
          currentLanguage={currentLanguage}
          onSelectLanguage={handleLanguageChange}
        />
      </>
    );
  }

  if (!user?.roles.includes('customer')) return <Navigate to="/" replace />;

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex-1 flex items-center justify-center gap-2 h-12 rounded-2xl text-sm font-extrabold transition',
      isActive ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200',
    ].join(' ');

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-gray-900 flex flex-col font-sans antialiased selection:bg-orange-200">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-base font-extrabold leading-tight">{copy.appName}</p>
            <p className="text-xs text-gray-500 leading-tight">{copy.customer}</p>
          </div>
          <button type="button" onClick={() => setIsLangModalOpen(true)} aria-label={copy.language}
            className="h-10 px-3 rounded-xl border border-gray-200 text-gray-600 flex items-center gap-1.5">
            <Globe className="w-4 h-4" />{currentLanguage.toUpperCase()}
          </button>
          <button
            type="button"
            onClick={() => { signOut(); navigate('/', { replace: true }); }}
            className="h-10 px-3 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm flex items-center gap-1.5 active:scale-[0.98] transition"
          >
            <LogOut className="w-4 h-4" />
            {copy.signOut}
          </button>
        </div>
      </header>

      <nav className="max-w-3xl w-full mx-auto px-4 pt-4 flex gap-2">
        <NavLink to="/customer" end className={tabClass}>
          <Search className="w-4 h-4" />
          {copy.browse}
        </NavLink>
        <NavLink to="/customer/requests" className={tabClass}>
          <ClipboardList className="w-4 h-4" />
          {copy.requests}
        </NavLink>
      </nav>

      <main className="flex-1 px-4 pt-4 pb-10 max-w-3xl w-full mx-auto">
        <p className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-3 text-xs text-gray-700">{copy.notice}</p>
        <Routes>
          <Route
            index
            element={
              <CustomerBrowse
                currentLanguage={currentLanguage}
                onSelect={(handle) => navigate(`/customer/request/${encodeURIComponent(handle)}`)}
              />
            }
          />
          <Route
            path="request/:handle"
            element={<CustomerRequestForm currentLanguage={currentLanguage} onSent={() => navigate('/customer/requests')} />}
          />
          <Route
            path="requests"
            element={<CustomerRequests currentLanguage={currentLanguage} />}
          />
          <Route path="*" element={<Navigate to="/customer" replace />} />
        </Routes>
      </main>

      <LanguageSelectorModal
        isOpen={isLangModalOpen}
        onClose={() => setIsLangModalOpen(false)}
        currentLanguage={currentLanguage}
        onSelectLanguage={handleLanguageChange}
      />
    </div>
  );
};
