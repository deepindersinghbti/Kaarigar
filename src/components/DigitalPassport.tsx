import React, { useEffect, useState } from 'react';
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
import { getScreenCopy, localizeDisplayValue, localizeWorkerName } from '../data/uiCopy';
import { passportUrl } from '../lib/passportLink';
import { api, type WorkerReliability } from '../lib/api';
import QRCode from 'qrcode';

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
  const copy = getScreenCopy(currentLanguage).passport;
  const displayName = localizeWorkerName(profile.name, currentLanguage);
  const [isFlipped, setIsFlipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  /**
   * The booked-visit record beside the rubric (§9.1 D4). Null is NORMAL: it is
   * what comes back when BOOKINGS_ENABLED is off, when the passport is not on
   * the API, or when the request fails - and in every one of those cases the
   * right screen is the one without this card, not one with an error on it.
   */
  const [reliability, setReliability] = useState<WorkerReliability | null>(null);

  const publicPassportUrl = passportUrl(profile.passportHandle);
  const verificationLabel =
    profile.verifiedStatus === 'verified'
      ? copy.identityVerified
      : profile.verifiedStatus === 'pending'
        ? copy.verificationPending
        : copy.profileNotVerified;
  // Credential claims are deliberately separate from phone identity. This
  // prototype has no authorised government lookup, so listed certificates
  // never become verified merely because a worker entered them.
  const credentialStatus = copy.notLinked;
  const credentialDemoStatus = copy.sandboxDemo;
  const trustRows = profile.trustScore
    ? [
        { label: copy.trustRows[0], value: profile.trustScore.components.identityVerification, max: 20 },
        { label: copy.trustRows[1], value: profile.trustScore.components.skillCredentials, max: 15 },
        { label: copy.trustRows[2], value: profile.trustScore.components.verifiedWorkHistory, max: 25 },
        { label: copy.trustRows[3], value: profile.trustScore.components.customerRatings, max: 25 },
        { label: copy.trustRows[4], value: profile.trustScore.components.reliabilityRecord, max: 0 },
        { label: copy.trustRows[5], value: profile.trustScore.components.skillingEngagement, max: 5 },
      ]
    : [];

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(publicPassportUrl, {
      errorCorrectionLevel: 'Q',
      margin: 1,
      width: 128,
    }).then((dataUrl) => {
      if (active) setQrDataUrl(dataUrl);
    }).catch(() => {
      if (active) setQrDataUrl('');
    });
    return () => { active = false; };
  }, [publicPassportUrl]);

  /**
   * Re-read whenever the trust score is recomputed. App refreshes the profile
   * after every job transition, and a check-in or a no-show moves both numbers
   * at once - keying on computedAt keeps this card from showing yesterday's
   * record under today's score.
   */
  const trustComputedAt = profile.trustScore?.computedAt;
  useEffect(() => {
    let active = true;
    if (!profile.passportHandle) {
      setReliability(null);
      return;
    }
    api.getWorkerReliability(profile.passportHandle)
      .then((result) => { if (active) setReliability(result); })
      .catch(() => { if (active) setReliability(null); });
    return () => { active = false; };
  }, [profile.passportHandle, trustComputedAt]);

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
    const url = publicPassportUrl;

    if (navigator.share) {
      navigator
        .share({
          title: `${displayName} - ${copy.passportTitle}`,
          text: copy.scanDescription,
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
              {copy.governmentAligned}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {t.digitalPassport}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500">
            {copy.subtitle}
          </p>
        </div>

        {/* Voice Add Work Trigger */}
        <button
          id="passport-add-work-voice-btn"
          onClick={onAddWorkVoice}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-orange-200 transition-all active:scale-95"
        >
          <Mic className="w-4 h-4" />
          <span>{copy.addWorkVoice}</span>
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
                {copy.nationalIdentity}
              </div>
              <div className="text-base sm:text-lg font-extrabold tracking-tight text-white flex items-center gap-2">
                <span>{copy.passportTitle}</span>
                <span className="text-xs bg-orange-400 text-gray-950 font-black px-1.5 py-0.2 rounded">
                  PRO
                </span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-flex items-center gap-1 bg-green-500/20 text-green-400 text-xs font-black px-3 py-1 rounded-full border border-green-500/40">
              <CheckCircle className="w-3.5 h-3.5 stroke-[3]" /> {verificationLabel}
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
                  {displayName
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
                {displayName}
              </h3>
              <p className="text-orange-400 font-bold text-sm">
                {localizeDisplayValue(profile.trade, currentLanguage)}
              </p>
              <div className="text-xs text-gray-400 font-medium mt-0.5 flex items-center sm:justify-center gap-1">
                <MapPin className="w-3 h-3 text-orange-500" />
                <span>{localizeDisplayValue(profile.location, currentLanguage)}</span>
              </div>
            </div>
          </div>

          {/* Stats & Key Details */}
          <div className="sm:col-span-2 space-y-4">
            <div className="grid grid-cols-3 gap-2 bg-gray-900/90 rounded-2xl p-3 border border-gray-800 text-center">
              <div>
                <span className="text-[10px] text-gray-400 block uppercase font-bold">
                  {copy.experience}
                </span>
                <span className="text-base sm:text-lg font-black text-orange-400">
                  {profile.experienceYears} {copy.years}
                </span>
              </div>
              <div className="border-x border-gray-800">
                <span className="text-[10px] text-gray-400 block uppercase font-bold">
                  {copy.jobsDone}
                </span>
                <span className="text-base sm:text-lg font-black text-green-400">
                  {profile.totalJobsCount}+
                </span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block uppercase font-bold">
                  {copy.rating}
                </span>
                <span className="text-base sm:text-lg font-black text-orange-300 flex items-center justify-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-orange-300 text-orange-300" />
                  {profile.rating}
                </span>
              </div>
            </div>

            {/* Skills listed by worker */}
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>{copy.skillsListed}</span>
                <span className="text-[10px] text-orange-400">{copy.evidenceBuilds}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="bg-gray-900/90 border border-orange-400/40 text-orange-200 text-xs px-2.5 py-1 rounded-xl font-semibold flex items-center gap-1 shadow-sm"
                  >
                    <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />
                    {localizeDisplayValue(skill, currentLanguage)}
                  </span>
                ))}
              </div>
            </div>

            {/* Certifications */}
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                {copy.credentialsListed}
              </div>
              <div className="space-y-1">
                {profile.certifications.map((cert, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs text-gray-300 bg-gray-900/60 p-2 rounded-xl border border-gray-800"
                  >
                    <Award className="w-4 h-4 text-orange-400 shrink-0" />
                    <span className="font-medium truncate">{localizeDisplayValue(cert, currentLanguage)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div id="passport-credential-status" className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                    {copy.credentialLink}
                  </div>
                  <div className="text-xs font-bold text-gray-200 mt-0.5">
                    {copy.credentialStatus}: {credentialStatus}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[10px] font-black text-amber-200">
                DigiLocker: {credentialDemoStatus}
                </span>
              </div>
              <p className="text-[11px] text-amber-100/80 mt-2">
                {copy.credentialNotice}
              </p>
            </div>
          </div>
        </div>

        {/* Footer with QR Code & Security Stamp */}
        <div className="relative z-10 mt-6 pt-5 border-t border-gray-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Real Visual QR Code simulation */}
              <div className="bg-white p-2 rounded-2xl shadow-md shrink-0 flex items-center justify-center w-[76px] h-[76px]">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt={copy.scanAlt} className="w-full h-full" />
                ) : (
                  <QrCode className="w-14 h-14 text-gray-950" />
                )}
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                {copy.scanTitle}
              </div>
              <div className="text-[11px] text-gray-400">
                {copy.scanDescription}
              </div>
              <div className="text-[10px] text-orange-400 font-mono mt-0.5">
                {copy.joined(new Date(profile.joinedDate).toLocaleDateString('en-IN'))}
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
              <span>{copied ? copy.linkCopied : copy.share}</span>
            </button>
            <button
              id="download-passport-btn"
              onClick={() => alert(copy.downloadNotice)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold shadow-md shadow-orange-500/20 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{copy.downloadId}</span>
            </button>
          </div>
        </div>
      </motion.div>

      {profile.trustScore && (
        <div id="passport-trust-score" className="bg-white p-5 sm:p-6 rounded-3xl border border-gray-200 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-gray-900">{copy.trustEvidence}</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-xl">
                {copy.trustDescription}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-3xl font-black text-orange-500">{profile.trustScore.value}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{copy.outOf100}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {trustRows.map((row) => {
              const positiveMax = row.max || 10;
              const positiveValue = Math.max(0, row.value);
              const width = Math.min(100, Math.round((positiveValue / positiveMax) * 100));
              const isPenalty = row.value < 0;
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-gray-600">
                    <span>{row.label}</span>
                    <span className={isPenalty ? 'text-red-500' : 'text-gray-500'}>
                      {row.value}{row.max ? ` / ${row.max}` : ''}
                    </span>
                  </div>
                  <div className="h-1.5 mt-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${isPenalty ? 'bg-red-400' : 'bg-orange-400'}`} style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/*
        RELIABILITY. Sits under the rubric it feeds, as its own card rather than a
        seventh rubric row: the rubric is points out of 100, this is a record of
        visits, and mixing the two units in one list invites reading one as the
        other.

        NO PERCENTAGE WITHOUT A RECORD. A worker with no booked visit is still at
        the 0.8 prior, and printing that as "80%" would state something the
        evidence does not show - in either direction. `recordedEvents` is what
        tells the two apart.
      */}
      {reliability && (() => {
        const rc = copy.reliability;
        const hasRecord = reliability.recordedEvents > 0;
        const percent = Math.max(0, Math.min(100, Math.round(reliability.stats.reliability * 100)));
        const responsePercent = Math.round(reliability.stats.responseRate * 100);
        const tiles = [
          { id: 'ontime', label: rc.onTime, value: reliability.stats.onTime, className: 'text-green-600' },
          { id: 'late', label: rc.late, value: reliability.stats.late, className: 'text-amber-600' },
          { id: 'noshow', label: rc.noShow, value: reliability.stats.noShow, className: 'text-red-600' },
        ];
        return (
          <div id="passport-reliability" className="bg-white p-5 sm:p-6 rounded-3xl border border-gray-200 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-gray-900">{rc.title}</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-xl">{rc.description}</p>
              </div>
              {hasRecord && (
                <div className="text-right shrink-0">
                  <div id="passport-reliability-percent" className="text-3xl font-black text-orange-500">{percent}%</div>
                </div>
              )}
            </div>

            {hasRecord ? (
              <div className="h-1.5 mt-4 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-orange-400" style={{ width: `${percent}%` }} />
              </div>
            ) : (
              <p id="passport-reliability-empty" className="mt-4 text-xs font-bold text-gray-500">{rc.empty}</p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              {tiles.map((tile) => (
                <div key={tile.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-3 text-center">
                  <div id={`passport-reliability-${tile.id}`} className={`text-lg font-black ${tile.className}`}>{tile.value}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mt-0.5">{tile.label}</div>
                </div>
              ))}
            </div>

            <p id="passport-response-rate" className="mt-3 text-xs font-bold text-gray-600">
              {reliability.requestCount > 0 ? rc.responseRate(responsePercent) : rc.responseEmpty}
            </p>
          </div>
        );
      })()}

      {/* Trust Guarantee & Benefits for Blue Collar Workers */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-gray-900 text-xs sm:text-sm">
              {copy.benefits[0].title}
            </h4>
            <p className="text-gray-500 text-xs mt-0.5">
              {copy.benefits[0].description}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-gray-900 text-xs sm:text-sm">
              {copy.benefits[1].title}
            </h4>
            <p className="text-gray-500 text-xs mt-0.5">
              {copy.benefits[1].description}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-gray-900 text-xs sm:text-sm">
              {copy.benefits[2].title}
            </h4>
            <p className="text-gray-500 text-xs mt-0.5">
              {copy.benefits[2].description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
