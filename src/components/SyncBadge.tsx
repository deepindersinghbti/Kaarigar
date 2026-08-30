import React from 'react';
import { CloudOff, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import type { SupportedLanguage, SyncState } from '../types';

/**
 * The pending / synced / failed indicator on a single record.
 *
 * Owner: Track B.
 *
 * SECTION 9.1 MAKES THIS PART OF THE FEATURE, NOT POLISH: "Every record shows
 * pending / synced / failed with a simple icon. Hidden sync erodes trust in a
 * financial record; workers must be able to see that their money data is safe."
 *
 * An outbox without visible state is worse than no outbox, because the worker
 * cannot distinguish "saved and on its way" from "saved and silently stuck".
 *
 * ICON AND COLOUR CARRY THE MEANING, text only supports it (section 4H). The
 * label is short enough to read at a glance in sunlight, and the three states
 * are distinguishable by shape as well as colour, so this still works for a
 * red-green colourblind worker.
 */

const LABELS: Record<SyncState, Record<SupportedLanguage, string>> = {
  pending: { hi: 'भेजा जा रहा है', pa: 'ਭੇਜਿਆ ਜਾ ਰਿਹਾ', kn: 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ', mr: 'पाठवत आहे', en: 'Saving' },
  synced: { hi: 'सुरक्षित', pa: 'ਸੁਰੱਖਿਅਤ', kn: 'ಸುರಕ್ಷಿತ', mr: 'सुरक्षित', en: 'Saved' },
  failed: { hi: 'नहीं भेजा गया', pa: 'ਨਹੀਂ ਭੇਜਿਆ', kn: 'ಕಳುಹಿಸಲಾಗಿಲ್ಲ', mr: 'पाठवले नाही', en: 'Not sent' },
};

interface SyncBadgeProps {
  state: SyncState;
  currentLanguage: SupportedLanguage;
  /** Hide the word and show the icon alone, for dense rows. */
  compact?: boolean;
}

export const SyncBadge: React.FC<SyncBadgeProps> = ({ state, currentLanguage, compact }) => {
  const label = LABELS[state][currentLanguage] ?? LABELS[state].en;

  const style =
    state === 'synced'
      ? 'bg-green-50 text-green-700 border-green-200'
      : state === 'pending'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-red-50 text-red-700 border-red-200';

  const Icon = state === 'synced' ? Check : state === 'pending' ? CloudOff : AlertTriangle;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${style}`}
      // The visual state is an icon plus a colour; neither is available to a
      // screen reader, so the state is named here explicitly.
      role="status"
      aria-label={label}
      title={label}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {!compact && <span>{label}</span>}
    </span>
  );
};

/**
 * The whole-app sync summary, for the header.
 *
 * Renders nothing when everything is synced. A permanent "all saved" badge
 * becomes furniture within a day and stops being read; appearing only when
 * there is something to say is what keeps it meaningful.
 */
interface SyncSummaryProps {
  pending: number;
  failed: number;
  offline: boolean;
  currentLanguage: SupportedLanguage;
  onRetry: () => void;
}

export const SyncSummary: React.FC<SyncSummaryProps> = ({
  pending,
  failed,
  offline,
  currentLanguage,
  onRetry,
}) => {
  if (pending === 0 && failed === 0) return null;

  const t = {
    hi: { pending: 'भेजने बाकी', failed: 'नहीं भेजे गए', offline: 'ऑफ़लाइन', retry: 'फिर भेजें' },
    pa: { pending: 'ਭੇਜਣੇ ਬਾਕੀ', failed: 'ਨਹੀਂ ਭੇਜੇ', offline: 'ਆਫ਼ਲਾਈਨ', retry: 'ਫਿਰ ਭੇਜੋ' },
    kn: { pending: 'ಕಳುಹಿಸಬೇಕಿದೆ', failed: 'ಕಳುಹಿಸಿಲ್ಲ', offline: 'ಆಫ್‌ಲೈನ್', retry: 'ಮತ್ತೆ ಕಳುಹಿಸಿ' },
    mr: { pending: 'पाठवायचे', failed: 'पाठवले नाहीत', offline: 'ऑफलाइन', retry: 'पुन्हा पाठवा' },
    en: { pending: 'to send', failed: 'not sent', offline: 'Offline', retry: 'Retry' },
  }[currentLanguage] ?? { pending: 'to send', failed: 'not sent', offline: 'Offline', retry: 'Retry' };

  return (
    <div className="mx-4 mt-3 max-w-3xl w-full self-center flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
      <CloudOff className="w-4 h-4 shrink-0" />
      <span className="flex-1">
        {offline && <span className="mr-1">{t.offline} &middot;</span>}
        {pending > 0 && (
          <span>
            {pending} {t.pending}
          </span>
        )}
        {pending > 0 && failed > 0 && <span> &middot; </span>}
        {failed > 0 && (
          <span className="text-red-700">
            {failed} {t.failed}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 rounded-full bg-white border border-amber-300 px-3 h-9 active:scale-95 transition"
      >
        <RefreshCw className="w-3 h-3" />
        {t.retry}
      </button>
    </div>
  );
};
