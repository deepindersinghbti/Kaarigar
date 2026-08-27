import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Globe } from 'lucide-react';
import { SupportedLanguage } from '../types';
import { SUPPORTED_LANGUAGES, TRANSLATIONS } from '../data/translations';

interface LanguageSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLanguage: SupportedLanguage;
  onSelectLanguage: (lang: SupportedLanguage) => void;
}

export const LanguageSelectorModal: React.FC<LanguageSelectorModalProps> = ({
  isOpen,
  onClose,
  currentLanguage,
  onSelectLanguage,
}) => {
  const t = TRANSLATIONS[currentLanguage];

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          id="language-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            id="language-modal-card"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-orange-500 px-6 py-5 text-white flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                  <Globe className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg leading-tight">
                    {t.chooseLanguage}
                  </h3>
                  <p className="text-xs text-orange-100 font-medium">
                    Choose your language
                  </p>
                </div>
              </div>
              <button
                id="close-language-modal"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Language list */}
            <div className="p-4 space-y-2.5 max-h-[70vh] overflow-y-auto">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSelected = currentLanguage === lang.code;
                return (
                  <button
                    key={lang.code}
                    id={`lang-option-${lang.code}`}
                    onClick={() => {
                      onSelectLanguage(lang.code);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50/80 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">{lang.flag}</span>
                      <div>
                        <div className="text-xl font-bold text-gray-900">
                          {lang.nativeName}
                        </div>
                        <div className="text-xs text-gray-500 font-medium">
                          {lang.name} • {lang.sampleGreeting}
                        </div>
                      </div>
                    </div>

                    {isSelected ? (
                      <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white shadow-xs">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full border-2 border-gray-300" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer note */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 text-center text-xs text-gray-500">
              💡 You can change the language anytime by tapping 🌐
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
