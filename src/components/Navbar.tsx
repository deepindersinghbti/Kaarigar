import React from 'react';
import {
  Home,
  ShieldCheck,
  Briefcase,
  IndianRupee,
  User,
  Mic,
  Globe,
  Sparkles,
} from 'lucide-react';
import { SupportedLanguage } from '../types';
import { TRANSLATIONS, SUPPORTED_LANGUAGES } from '../data/translations';

interface NavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  currentLanguage: SupportedLanguage;
  onChangeLanguage: () => void;
  onOpenVoiceAssistant: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  currentLanguage,
  onChangeLanguage,
  onOpenVoiceAssistant,
}) => {
  const t = TRANSLATIONS[currentLanguage];
  const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === currentLanguage);

  const navItems = [
    { id: 'home', label: t.navHome, icon: Home },
    { id: 'passport', label: t.navPassport, icon: ShieldCheck },
    { id: 'jobs', label: t.navJobs, icon: Briefcase },
    { id: 'kamai', label: t.navKamai, icon: IndianRupee },
    { id: 'profile', label: t.navProfile, icon: User },
  ];

  return (
    <>
      {/* Top Header */}
      <header
        id="app-top-header"
        className="sticky top-0 z-40 bg-white px-4 sm:px-8 py-3.5 sm:py-4 flex justify-between items-center border-b border-gray-200 shadow-xs"
      >
        <div className="max-w-3xl w-full mx-auto flex items-center justify-between">
          {/* Logo & Tagline */}
          <div
            className="flex items-center gap-3 sm:gap-4 cursor-pointer"
            onClick={() => onTabChange('home')}
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white font-extrabold text-xl sm:text-2xl shadow-lg shadow-orange-200">
              K
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-gray-900">
                  {t.appName}
                </h1>
                <span className="text-[10px] bg-orange-100 text-orange-700 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  AI Dost
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium hidden sm:block">
                Aapka Digital Dost • Voice-First Assistant
              </p>
            </div>
          </div>

          {/* Actions: Language Switch & Quick Mic */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="header-language-btn"
              onClick={onChangeLanguage}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full transition-all border border-gray-200 text-xs sm:text-sm font-bold text-gray-700"
            >
              <span className="text-base sm:text-lg">{langObj?.flag || '🌐'}</span>
              <span className="font-bold text-gray-700">{langObj?.nativeName || 'हिंदी'}</span>
              <span className="text-[10px] text-gray-400">▼</span>
            </button>

            <button
              id="header-voice-assistant-btn"
              onClick={onOpenVoiceAssistant}
              className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-orange-200 transition-all active:scale-95"
            >
              <Mic className="w-4 h-4 animate-pulse" />
              <span>साथी</span>
            </button>
          </div>
        </div>
      </header>

      {/* Bottom Floating Navigation for Mobile & Touch */}
      <nav
        id="app-bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-gray-200 px-3 py-2 shadow-2xl"
      >
        <div className="max-w-md mx-auto flex items-center justify-around relative">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-item-${item.id}`}
                onClick={() => onTabChange(item.id)}
                className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl transition-all ${
                  isActive
                    ? 'text-orange-600 font-black scale-105'
                    : 'text-gray-400 hover:text-gray-700 font-semibold'
                }`}
              >
                <div
                  className={`p-1.5 rounded-xl transition-colors ${
                    isActive ? 'bg-orange-100' : 'bg-transparent'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                </div>
                <span className="text-[10px] mt-0.5 whitespace-nowrap">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
