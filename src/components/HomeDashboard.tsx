import React from 'react';
import { motion } from 'motion/react';
import {
  Mic,
  ShieldCheck,
  TrendingUp,
  Briefcase,
  Award,
  Sparkles,
  ArrowRight,
  PhoneCall,
  CheckCircle2,
  Calendar,
  IndianRupee,
  Star,
  Globe,
  PlusCircle,
  HelpCircle,
} from 'lucide-react';
import {
  WorkerProfile,
  JobItem,
  KamaiEntry,
  SupportedLanguage,
  AssistantContext,
} from '../types';
import { TRANSLATIONS } from '../data/translations';
import { todayIso } from '../utils/date';

interface HomeDashboardProps {
  profile: WorkerProfile;
  jobs: JobItem[];
  kamaiList: KamaiEntry[];
  currentLanguage: SupportedLanguage;
  onChangeLanguage: () => void;
  onOpenVoiceAssistant: (context: AssistantContext) => void;
  onNavigateTab: (tab: string) => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  profile,
  jobs,
  kamaiList,
  currentLanguage,
  onChangeLanguage,
  onOpenVoiceAssistant,
  onNavigateTab,
}) => {
  const t = TRANSLATIONS[currentLanguage];
  const identityLabel = profile.verifiedStatus === 'verified'
    ? 'Identity verified'
    : profile.verifiedStatus === 'pending'
      ? 'Verification pending'
      : 'Profile not verified';
  const identityClass = profile.verifiedStatus === 'verified'
    ? 'bg-green-100 text-green-700'
    : 'bg-gray-100 text-gray-600';

  const todayStr = todayIso();
  const todayKamai = kamaiList
    .filter((k) => k.date === todayStr)
    .reduce((sum, k) => sum + k.amount, 0);

  const recentJobs = jobs.slice(0, 2);

  return (
    <div id="home-dashboard" className="space-y-6 max-w-2xl mx-auto pb-12">
      {/* Top Welcome Banner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-13 h-13 rounded-2xl bg-orange-500 p-0.5 shadow-lg shadow-orange-200">
            <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center text-orange-600 font-extrabold text-xl">
              {profile.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 leading-tight">
                नमस्ते {profile.name.split(' ')[0]} जी 👋
              </h1>
              <span className={`${identityClass} text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1`}>
                <CheckCircle2 className="w-3 h-3 stroke-[3]" /> {identityLabel}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium">
              {profile.trade} • {profile.location}
            </p>
          </div>
        </div>

        {/* Change Language Button */}
        <button
          id="home-lang-switch-btn"
          onClick={onChangeLanguage}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold border border-gray-200 shadow-xs transition-all active:scale-95"
        >
          <Globe className="w-4 h-4 text-orange-500" />
          <span>{t.changeLanguage}</span>
        </button>
      </div>

      {/* PROMINENT HERO: 🎙️ TAP TO SPEAK (Main Assistant Trigger) */}
      <div className="relative bg-orange-50 border-2 border-orange-200 rounded-3xl p-6 sm:p-8 text-gray-900 shadow-sm overflow-hidden">
        {/* Animated subtle background elements */}
        <div className="absolute top-4 right-4 flex gap-1">
          <div className="w-2.5 h-2.5 bg-orange-400 rounded-full animate-bounce"></div>
          <div className="w-2.5 h-2.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
          <div className="w-2.5 h-2.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-extrabold shadow-xs">
              <Sparkles className="w-4 h-4 text-orange-600" />
              <span>{t.assistantName}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 leading-tight">
              बोलिए, हम आपका काम आसान बनाएंगे!
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 font-medium max-w-sm">
              कुछ भी टाइप करने की ज़रूरत नहीं है। बस माइक दबाइए और बोलिए।
            </p>
          </div>

          {/* Huge Pulsing 🎙️ TAP TO SPEAK Button */}
          <div className="relative shrink-0">
            <motion.div
              animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.15, 0.5] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-full bg-orange-300 blur-md"
            />
            <button
              id="hero-tap-to-speak-btn"
              onClick={() => onOpenVoiceAssistant('onboarding')}
              className="relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-orange-500 hover:bg-orange-600 text-white shadow-2xl shadow-orange-300 flex flex-col items-center justify-center gap-1 group transition-all duration-300 transform active:scale-95 border-8 border-white"
            >
              <Mic className="w-8 h-8 group-hover:scale-110 transition-transform" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-white">
                {t.tapToSpeak}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Voice-First Action Grid */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Add Job */}
        <button
          id="action-add-job-btn"
          onClick={() => onOpenVoiceAssistant('add_job')}
          className="p-5 rounded-3xl bg-white hover:bg-orange-50/50 border border-gray-200 hover:border-orange-300 shadow-sm transition-all text-left flex flex-col justify-between group active:scale-[0.98]"
        >
          <div className="w-11 h-11 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform font-bold">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-extrabold uppercase text-orange-600 block">
              Jobs
            </span>
            <span className="text-base font-extrabold text-gray-900 leading-snug block">
              {t.addJobByVoice}
            </span>
            <span className="text-[11px] text-gray-500 block mt-0.5">
              "पंखा लगाया, ₹1100 मिले..."
            </span>
          </div>
        </button>

        {/* Add Kamai */}
        <button
          id="action-add-kamai-btn"
          onClick={() => onOpenVoiceAssistant('add_kamai')}
          className="p-5 rounded-3xl bg-white hover:bg-green-50/50 border border-gray-200 hover:border-green-300 shadow-sm transition-all text-left flex flex-col justify-between group active:scale-[0.98]"
        >
          <div className="w-11 h-11 rounded-2xl bg-green-100 text-green-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform font-bold">
            <IndianRupee className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-extrabold uppercase text-green-600 block">
              Kamai
            </span>
            <span className="text-base font-extrabold text-gray-900 leading-snug block">
              {t.addEarnings} (बोलकर)
            </span>
            <span className="text-[11px] text-gray-500 block mt-0.5">
              "आज 2 काम, 1500 और 1200..."
            </span>
          </div>
        </button>

        {/* Digital Passport */}
        <button
          id="action-view-passport-btn"
          onClick={() => onNavigateTab('passport')}
          className="p-5 rounded-3xl bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 shadow-sm transition-all text-left flex flex-col justify-between group active:scale-[0.98]"
        >
          <div className="w-11 h-11 rounded-2xl bg-gray-900 text-orange-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-extrabold uppercase text-gray-400 block">
              Passport
            </span>
            <span className="text-base font-extrabold text-gray-900 leading-snug block">
              {t.digitalPassport}
            </span>
            <span className="text-[11px] text-gray-500 block mt-0.5">
              QR सत्यापित पहचान पत्र
            </span>
          </div>
        </button>

        {/* Update Profile */}
        <button
          id="action-update-profile-btn"
          onClick={() => onOpenVoiceAssistant('update_profile')}
          className="p-5 rounded-3xl bg-white hover:bg-blue-50/50 border border-gray-200 hover:border-blue-300 shadow-sm transition-all text-left flex flex-col justify-between group active:scale-[0.98]"
        >
          <div className="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform font-bold">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-extrabold uppercase text-blue-600 block">
              Profile
            </span>
            <span className="text-base font-extrabold text-gray-900 leading-snug block">
              {t.updateProfile} (बोलकर)
            </span>
            <span className="text-[11px] text-gray-500 block mt-0.5">
              हुनर या रेट कार्ड अपडेट करें
            </span>
          </div>
        </button>
      </div>

      {/* Quick Summary Cards (Today's Kamai & passport evidence snapshot) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Today's Kamai Widget */}
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-green-100 text-green-700 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-gray-800 text-sm">
                {t.todayEarnings}
              </span>
            </div>
            <button
              onClick={() => onNavigateTab('kamai')}
              className="text-xs font-bold text-green-700 hover:underline flex items-center gap-0.5"
            >
              <span>खाता देखें</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black text-green-600">
              ₹{todayKamai.toLocaleString('en-IN')}
            </span>
            <span className="text-xs font-bold text-gray-400">
              {jobs.filter((j) => j.date === todayStr).length} काम आज पूरे
            </span>
          </div>
        </div>

        {/* Passport Trust Widget */}
        <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center">
                <Star className="w-4 h-4 fill-orange-500 text-orange-500" />
              </div>
              <span className="font-extrabold text-gray-800 text-sm">
                कारीगर रेटिंग व विश्वास
              </span>
            </div>
            <button
              onClick={() => onNavigateTab('passport')}
              className="text-xs font-bold text-orange-600 hover:underline flex items-center gap-0.5"
            >
              <span>पासपोर्ट</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-black text-gray-900">
                {profile.rating}
              </span>
              <span className="text-xs text-gray-500 font-semibold">
                ({profile.totalJobsCount}+ recorded jobs)
              </span>
            </div>
            <span className="bg-green-50 text-green-700 border border-green-200 text-xs font-extrabold px-3 py-1 rounded-full">
              Evidence snapshot
            </span>
          </div>
        </div>
      </div>

      {/* Recent Work / Jobs Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-gray-900 text-base">
            {t.recentJobs}
          </h3>
          <button
            onClick={() => onNavigateTab('jobs')}
            className="text-xs font-bold text-orange-600 hover:underline"
          >
            सभी देखें ({jobs.length})
          </button>
        </div>

        <div className="space-y-2.5">
          {recentJobs.map((job) => (
            <div
              key={job.id}
              className="bg-white p-4 sm:p-5 rounded-3xl border border-gray-200 shadow-sm flex items-center justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm sm:text-base text-gray-900">
                    {job.title}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {job.customerName} • {job.location}
                </div>
              </div>

              <div className="text-right">
                <div className="text-base sm:text-lg font-black text-green-600">
                  ₹{job.amount.toLocaleString('en-IN')}
                </div>
                <span className="text-[10px] text-gray-400 font-medium">
                  {job.date}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hackathon Demo Quick Bar */}
      <div className="p-5 bg-white rounded-3xl border border-gray-200 shadow-sm space-y-3 text-xs">
        <div className="font-extrabold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange-500" />
          <span>Hackathon Demo Showcase (1-Tap Scenarios):</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onOpenVoiceAssistant('onboarding')}
            className="px-3.5 py-2 rounded-2xl bg-orange-50 hover:bg-orange-100 border border-orange-200 font-bold text-orange-900 transition-colors"
          >
            🎙️ 1. Complete AI Profile Builder Demo
          </button>
          <button
            onClick={() => onOpenVoiceAssistant('add_job')}
            className="px-3.5 py-2 rounded-2xl bg-orange-50 hover:bg-orange-100 border border-orange-200 font-bold text-orange-900 transition-colors"
          >
            🎙️ 2. "Sector 35 fan..." Job Demo
          </button>
          <button
            onClick={() => onOpenVoiceAssistant('add_kamai')}
            className="px-3.5 py-2 rounded-2xl bg-orange-50 hover:bg-orange-100 border border-orange-200 font-bold text-orange-900 transition-colors"
          >
            🎙️ 3. "Aj 2 kaam..." Kamai Demo
          </button>
        </div>
      </div>
    </div>
  );
};
