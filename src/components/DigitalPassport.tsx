import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  QrCode,
  Award,
  Star,
  CheckCircle,
  Share2,
  Download,
  Mic,
  Calendar,
  Phone,
  MapPin,
  Heart,
  RefreshCw,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { WorkerProfile, SupportedLanguage } from '../types';
import { TRANSLATIONS } from '../data/translations';
import { passportUrl } from '../lib/passportLink';

interface DigitalPassportProps {
  profile: WorkerProfile;
  currentLanguage: SupportedLanguage;
  onAddWorkVoice: () => void;
}

export const DigitalPassport: React.FC<DigitalPassportProps> = ({
  profile,
  currentLanguage,
  onAddWorkVoice,
}) => {
  const t = TRANSLATIONS[currentLanguage];
  const [isFlipped, setIsFlipped] = useState(false);
  const [copied, setCopied] = useState(false);

  /**
   * Share the PUBLIC passport page.
   *
   * Both branches were wrong before this. The clipboard branch copied
   * `https://kaarigar.app/passport/{id}` - a domain this project never serves,
   * keyed by the internal profile id rather than the public handle - so the one
   * thing a worker could hand a customer led nowhere. The navigator.share branch
   * sent window.location.href, which is the in-app route (/passport) and needs a
   * login to open, so a customer received a link to a screen they cannot reach.
   *
   * Both now send the same URL the QR encodes, built by passportUrl() from the
   * origin the server reported. They cannot diverge, which matters because the
   * QR may end up printed.
   */
  const handleShare = () => {
    const url = passportUrl(profile.passportHandle);

    if (navigator.share) {
      navigator
        .share({
          title: `${profile.name} - Verified Digital Kaarigar Passport`,
          text: `View ${profile.name}'s verified ${profile.trade} work history and reviews.`,
          url,
        })
        .catch(() => {});
      return;
    }

    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="digital-passport-container" className="space-y-6 max-w-2xl mx-auto pb-8">
      {/* Header & Quick Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-green-700">
              Government & Industry Aligned
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {t.digitalPassport}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500">
            QR-सत्यापित कार्य पहचान पत्र • Instant Trust for Every Homeowner
          </p>
        </div>

        {/* Voice Add Work Trigger */}
        <button
          id="passport-add-work-voice-btn"
          onClick={onAddWorkVoice}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-orange-200 transition-all active:scale-95"
        >
          <Mic className="w-4 h-4" />
          <span>{t.addWork} (बोलकर)</span>
        </button>
      </div>

      {/* Main Official Passport Badge Card */}
      <motion.div
        layout
        className="relative bg-gray-900 text-white rounded-3xl p-6 sm:p-8 shadow-2xl border-2 border-orange-400/80 overflow-hidden"
      >
        {/* Decorative Watermark & Gold Crest */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header of Passport */}
        <div className="relative z-10 flex items-start justify-between border-b border-orange-500/30 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center font-bold text-2xl shadow-lg shadow-orange-200">
              <ShieldCheck className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-[10px] font-extrabold tracking-widest text-orange-400 uppercase">
                National Kaarigar Identity
              </div>
              <div className="text-base sm:text-lg font-extrabold tracking-tight text-white flex items-center gap-2">
                <span>DIGITAL KAARIGAR PASSPORT</span>
                <span className="text-xs bg-orange-400 text-gray-950 font-black px-1.5 py-0.2 rounded">
                  PRO
                </span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-flex items-center gap-1 bg-green-500/20 text-green-400 text-xs font-black px-3 py-1 rounded-full border border-green-500/40">
              <CheckCircle className="w-3.5 h-3.5 stroke-[3]" /> VERIFIED
            </span>
            <div className="text-[10px] text-gray-400 font-mono mt-1">
              ID: {profile.id.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Worker Core Profile Bio Block */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
          {/* Avatar & Trust Score */}
          <div className="flex sm:flex-col items-center gap-4 sm:text-center">
            <div className="relative">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-orange-500 p-1 shadow-xl shadow-orange-500/20">
                <div className="w-full h-full bg-gray-900 rounded-[14px] flex items-center justify-center text-3xl font-black text-orange-400 border border-orange-400/30">
                  {profile.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </div>
              </div>
              <div className="absolute -bottom-2 -right-2 bg-green-500 text-gray-950 text-[10px] font-extrabold px-2 py-0.5 rounded-full border-2 border-gray-950 flex items-center gap-0.5">
                <span>★</span> {profile.rating}
              </div>
            </div>

            <div>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white leading-tight">
                {profile.name}
              </h3>
              <p className="text-orange-400 font-bold text-sm">
                {profile.trade}
              </p>
              <div className="text-xs text-gray-400 font-medium mt-0.5 flex items-center sm:justify-center gap-1">
                <MapPin className="w-3 h-3 text-orange-500" />
                <span>{profile.location}</span>
              </div>
            </div>
          </div>

          {/* Stats & Key Details */}
          <div className="sm:col-span-2 space-y-4">
            <div className="grid grid-cols-3 gap-2 bg-gray-900/90 rounded-2xl p-3 border border-gray-800 text-center">
              <div>
                <span className="text-[10px] text-gray-400 block uppercase font-bold">
                  Experience
                </span>
                <span className="text-base sm:text-lg font-black text-orange-400">
                  {profile.experienceYears} Years
                </span>
              </div>
              <div className="border-x border-gray-800">
                <span className="text-[10px] text-gray-400 block uppercase font-bold">
                  Jobs Done
                </span>
                <span className="text-base sm:text-lg font-black text-green-400">
                  {profile.totalJobsCount}+
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase font-bold">
                  Rating
                </span>
                <span className="text-base sm:text-lg font-black text-orange-300 flex items-center justify-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-orange-300 text-orange-300" />
                  {profile.rating}
                </span>
              </div>
            </div>

            {/* Verified Skills */}
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Verified Skills (सत्यापित हुनर)</span>
                <span className="text-[10px] text-orange-400">AI Verified</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="bg-gray-900/90 border border-orange-400/40 text-orange-200 text-xs px-2.5 py-1 rounded-xl font-semibold flex items-center gap-1 shadow-sm"
                  >
                    <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Certifications */}
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Accreditations & Training
              </div>
              <div className="space-y-1">
                {profile.certifications.map((cert, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs text-gray-300 bg-gray-900/60 p-2 rounded-xl border border-gray-800"
                  >
                    <Award className="w-4 h-4 text-orange-400 shrink-0" />
                    <span className="font-medium truncate">{cert}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer with QR Code & Security Stamp */}
        <div className="relative z-10 mt-6 pt-5 border-t border-gray-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Real Visual QR Code simulation */}
            <div className="bg-white p-2 rounded-2xl shadow-md shrink-0 flex items-center justify-center">
              <QrCode className="w-14 h-14 text-gray-950" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                Scan to Verify Work History
              </div>
              <div className="text-[11px] text-gray-400">
                Instant digital proof for builders, homeowners & companies.
              </div>
              <div className="text-[10px] text-orange-400 font-mono mt-0.5">
                Blood Group: {profile.bloodGroup || 'O+'} • Joined {profile.joinedDate}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              id="share-passport-btn"
              onClick={handleShare}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold border border-gray-700 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{copied ? 'Link Copied!' : 'Share'}</span>
            </button>
            <button
              id="download-passport-btn"
              onClick={() => alert('Digital Passport ID Card downloaded as PDF!')}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold shadow-md shadow-orange-500/20 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download ID</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Trust Guarantee & Benefits for Blue Collar Workers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-gray-900 text-xs sm:text-sm">
              Direct Client Trust
            </h4>
            <p className="text-gray-500 text-xs mt-0.5">
              100% verified work history boosts customer confidence.
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-gray-900 text-xs sm:text-sm">
              Voice-Updated Portfolio
            </h4>
            <p className="text-gray-500 text-xs mt-0.5">
              Speak after every job to automatically update your passport.
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-gray-900 text-xs sm:text-sm">
              Better Rates & Loans
            </h4>
            <p className="text-gray-500 text-xs mt-0.5">
              Verified income proof helps unlock micro-credit & bank loans.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
