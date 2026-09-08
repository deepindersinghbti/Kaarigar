import React, { useEffect, useState } from 'react';
import { MapPin, Star, Briefcase, ChevronRight, ShieldCheck } from 'lucide-react';
import { api, ApiError, type PublicKaarigar } from '../../lib/api';

interface CustomerBrowseProps {
  onSelect: (passportHandle: string) => void;
}

/**
 * The kaarigar directory.
 *
 * ORDER COMES FROM THE SERVER, which sorts by rating. Ramesh leads the list
 * because he is rated 4.9, not because anything here puts him there - a demo
 * that pins one row to the top stops being a demo of a marketplace.
 *
 * Every kaarigar in the list is shown the same way. Five of the six have no
 * login provisioned for the demo, and that is not represented here: a badge or
 * a disabled state would be inventing a distinction the product does not have.
 */
export const CustomerBrowse: React.FC<CustomerBrowseProps> = ({ onSelect }) => {
  const [kaarigars, setKaarigars] = useState<PublicKaarigar[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listKaarigars();
        if (!cancelled) setKaarigars(list);
      } catch (e) {
        if (cancelled) return;
        // A 401 has already signed the user out inside the API client; the
        // login screen is about to replace this one, so there is nothing worth
        // showing for it.
        if (e instanceof ApiError && e.status === 401) return;
        setError(e instanceof Error ? e.message : 'कारीगर लोड नहीं हो सके।');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="bg-white rounded-3xl border border-gray-200 p-6 text-center">
        <p className="text-sm font-bold text-red-700">{error}</p>
      </div>
    );
  }

  /**
   * An unloaded list and an empty list are pixel-identical and mean opposite
   * things, so they never share a rendering. null is "still loading".
   */
  if (kaarigars === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <div className="w-10 h-10 rounded-2xl bg-orange-500 animate-pulse" />
        <p className="text-sm font-bold text-gray-500">लोड हो रहा है…</p>
      </div>
    );
  }

  if (kaarigars.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-gray-200 p-6 text-center">
        <p className="text-sm font-bold text-gray-500">अभी कोई कारीगर उपलब्ध नहीं है।</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {kaarigars.map((k) => (
        <button
          key={k.passportHandle}
          type="button"
          onClick={() => onSelect(k.passportHandle)}
          className="w-full text-left bg-white rounded-3xl border border-gray-200 p-4 flex items-start gap-3 active:scale-[0.99] transition"
        >
          <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-extrabold text-lg shrink-0">
            {k.name.charAt(0)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-extrabold text-gray-900 truncate">{k.name}</p>
              {k.verifiedStatus === 'verified' && (
                <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
              )}
            </div>
            <p className="text-sm text-orange-600 font-bold">{k.trade}</p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 font-semibold">
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-500" />
                {k.rating}
              </span>
              <span className="flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5" />
                {k.totalJobsCount} काम
              </span>
              <span className="flex items-center gap-1 min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{k.location}</span>
              </span>
            </div>
          </div>

          <ChevronRight className="w-5 h-5 text-gray-400 shrink-0 mt-3" />
        </button>
      ))}
    </div>
  );
};
