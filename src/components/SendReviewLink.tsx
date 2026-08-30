import React, { useState } from 'react';
import { Star, Loader2, Check, AlertCircle, Share2 } from 'lucide-react';
import type { JobItem, SupportedLanguage } from '../types';
import { api, ApiError } from '../lib/api';

/**
 * "Ask for a review" — the control that hands a customer their review link.
 *
 * Owner: Track B.
 *
 * WHY THIS EXISTS. POST /api/reviews/link was built, tested and reachable, and
 * nothing in the app called it. The review flow therefore existed without being
 * demonstrable: a worker had no way to start it, which makes the customer half
 * of the section 14.1 loop unreachable in the product even though every
 * endpoint behind it works.
 *
 * WHY THE BUTTON ONLY APPEARS ON FINISHED WORK. Section 4D anchors reviews to a
 * job that provably happened, and the server enforces that - minting for a job
 * that is not COMPLETED or SETTLED answers 409. Showing the button anyway and
 * letting the worker discover the refusal would teach them the feature is
 * unreliable. The state check is duplicated here for the affordance; the server
 * remains the authority.
 */

/** The states in which reputation-svc will mint a link. Mirrors data/jobs.ts. */
const REVIEWABLE = new Set(['COMPLETED', 'SETTLED']);

const COPY: Record<SupportedLanguage, {
  ask: string; sending: string; copied: string; shareTitle: string; shareText: (n: string) => string;
}> = {
  hi: {
    ask: 'रिव्यू माँगें',
    sending: 'लिंक बन रहा है…',
    copied: 'लिंक कॉपी हो गया',
    shareTitle: 'अपना काम रेट कीजिए',
    shareText: (n) => `नमस्ते! ${n} के काम के बारे में अपनी राय दीजिए — बस इस लिंक पर टैप करें।`,
  },
  pa: {
    ask: 'ਰਿਵਿਊ ਮੰਗੋ',
    sending: 'ਲਿੰਕ ਬਣ ਰਿਹਾ ਹੈ…',
    copied: 'ਲਿੰਕ ਕਾਪੀ ਹੋ ਗਿਆ',
    shareTitle: 'ਆਪਣੇ ਕੰਮ ਨੂੰ ਰੇਟ ਕਰੋ',
    shareText: (n) => `ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ${n} ਦੇ ਕੰਮ ਬਾਰੇ ਆਪਣੀ ਰਾਏ ਦਿਓ — ਇਸ ਲਿੰਕ 'ਤੇ ਟੈਪ ਕਰੋ।`,
  },
  kn: {
    ask: 'ವಿಮರ್ಶೆ ಕೇಳಿ',
    sending: 'ಲಿಂಕ್ ಸಿದ್ಧವಾಗುತ್ತಿದೆ…',
    copied: 'ಲಿಂಕ್ ನಕಲಿಸಲಾಗಿದೆ',
    shareTitle: 'ಕೆಲಸಕ್ಕೆ ರೇಟಿಂಗ್ ನೀಡಿ',
    shareText: (n) => `ನಮಸ್ಕಾರ! ${n} ಅವರ ಕೆಲಸದ ಬಗ್ಗೆ ನಿಮ್ಮ ಅಭಿಪ್ರಾಯ ತಿಳಿಸಿ — ಈ ಲಿಂಕ್ ಒತ್ತಿ.`,
  },
  mr: {
    ask: 'रिव्ह्यू मागा',
    sending: 'लिंक तयार होत आहे…',
    copied: 'लिंक कॉपी झाली',
    shareTitle: 'कामाला रेटिंग द्या',
    shareText: (n) => `नमस्कार! ${n} यांच्या कामाबद्दल तुमचे मत द्या — या लिंकवर टॅप करा.`,
  },
  en: {
    ask: 'Ask for a review',
    sending: 'Creating link…',
    copied: 'Link copied',
    shareTitle: 'Rate the work',
    shareText: (n) => `Hello! Please rate the work ${n} did for you — just tap this link.`,
  },
};

interface SendReviewLinkProps {
  job: JobItem;
  workerName: string;
  currentLanguage: SupportedLanguage;
}

export const SendReviewLink: React.FC<SendReviewLinkProps> = ({
  job,
  workerName,
  currentLanguage,
}) => {
  const t = COPY[currentLanguage] ?? COPY.en;
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  if (!REVIEWABLE.has(job.status)) return null;

  async function handleAsk() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { url } = await api.createReviewLink(job.id);

      /**
       * navigator.share where it exists - this user group sends links through
       * WhatsApp, and the share sheet is the one-tap path to it. Clipboard is
       * the desktop fallback.
       *
       * The share is fired inside the same handler as the click, but AFTER an
       * await. Some browsers require a user gesture for share(); if that is
       * refused we still fall through to the clipboard rather than leaving the
       * worker with nothing.
       */
      const shared = await tryShare(url, t.shareTitle, t.shareText(workerName));
      if (!shared) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (e) {
      // The server names the reason - "already reviewed", "not finished yet" -
      // and those are exactly what the worker needs to hear. A generic failure
      // would leave them tapping a button that never explains itself.
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not create the link.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={() => void handleAsk()}
        disabled={busy}
        className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl bg-orange-50 border border-orange-200 text-orange-700 text-sm font-extrabold disabled:opacity-50 active:scale-[0.98] transition"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : copied ? (
          <Check className="w-4 h-4 text-green-600" />
        ) : (
          <Star className="w-4 h-4" />
        )}
        <span>{busy ? t.sending : copied ? t.copied : t.ask}</span>
        {!busy && !copied && <Share2 className="w-3.5 h-3.5 opacity-60" />}
      </button>

      {error && (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="font-semibold">{error}</span>
        </div>
      )}
    </div>
  );
};

/**
 * Share if the platform offers it, reporting whether it actually happened.
 *
 * Returns false both when share() is absent and when the user dismisses the
 * sheet, because in both cases the link has not reached anyone and the
 * clipboard fallback is still worth running. An AbortError from a dismissed
 * sheet is a normal outcome, not an error to surface.
 */
async function tryShare(url: string, title: string, text: string): Promise<boolean> {
  if (!navigator.share) return false;
  try {
    await navigator.share({ title, text, url });
    return true;
  } catch {
    return false;
  }
}
