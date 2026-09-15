import React from 'react';
import { Radio } from 'lucide-react';

interface LiveToggleProps {
  enabled: boolean;
  onToggle: () => void;
  /** Accessible name and visible label, e.g. "Live". */
  label: string;
  /** Announced state, e.g. "Updates arrive on their own." */
  title: string;
}

/**
 * The opt-in switch for live updates, shared by both list screens so a worker
 * and a customer are looking at the same control.
 *
 * A button with aria-pressed rather than a checkbox: it performs an action on
 * this screen rather than collecting a value to be submitted, and it sits in a
 * row of buttons next to Refresh.
 *
 * The dot is filled only when polling is on. Deliberately quiet - this is a
 * setting, not a status the user needs to monitor, and a pulsing indicator next
 * to real job states would compete with them for attention.
 */
export const LiveToggle: React.FC<LiveToggleProps> = ({ enabled, onToggle, label, title }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={enabled}
    title={title}
    className={[
      'h-10 px-3 rounded-xl border font-bold text-sm flex items-center gap-1.5 active:scale-[0.98] transition',
      enabled
        ? 'border-orange-300 bg-orange-50 text-orange-700'
        : 'border-gray-200 bg-white text-gray-500',
    ].join(' ')}
  >
    <Radio className={`w-4 h-4 ${enabled ? '' : 'opacity-50'}`} />
    {label}
  </button>
);
