import React, { useEffect, useState } from 'react';
import { MapPin, Star, Briefcase, ChevronRight, ShieldCheck } from 'lucide-react';
import { api, ApiError, type PublicKaarigar } from '../../lib/api';
import type { SupportedLanguage } from '../../types';
import { getCustomerCopy, getCustomerTrade } from './customerCopy';

interface CustomerBrowseProps {
  onSelect: (passportHandle: string) => void;
  currentLanguage: SupportedLanguage;
}

/** The customer MVP currently exposes only the two supported demo trades. */
const CUSTOMER_DEMO_TRADES = new Set(['Electrician', 'Plumber']);

function canonical(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isBlankPlaceholder(profile: PublicKaarigar): boolean {
  return profile.name.trim() === 'Kaarigar'
    && !profile.trade.trim()
    && !profile.location.trim()
    && Number(profile.rating) === 0
    && Number(profile.totalJobsCount) === 0;
}

function compareDirectoryProfiles(a: PublicKaarigar, b: PublicKaarigar): number {
  const ratingOrder = (Number(b.rating) || 0) - (Number(a.rating) || 0);
  if (ratingOrder !== 0) return ratingOrder;

  const jobsOrder = (Number(b.totalJobsCount) || 0) - (Number(a.totalJobsCount) || 0);
  if (jobsOrder !== 0) return jobsOrder;

  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/**
 * Duplicate seed/test passports must not produce duplicate choices for the
 * customer. The same named worker in the same trade keeps the stronger record:
 * rating first, then completed jobs, then a stable name tie-break. We do not
 * delete the lower record; it can still be corrected in worker data later.
 */
function uniqueDirectoryProfiles(profiles: PublicKaarigar[]): PublicKaarigar[] {
  const bestByWorker = new Map<string, PublicKaarigar>();
  for (const profile of profiles) {
    const key = `${canonical(profile.name)}|${canonical(profile.trade)}`;
    const existing = bestByWorker.get(key);
    if (!existing || compareDirectoryProfiles(profile, existing) < 0) {
      bestByWorker.set(key, profile);
    }
  }
  return [...bestByWorker.values()].sort(compareDirectoryProfiles);
}

/**
 * The kaarigar directory.
 *
 * A first worker login can create an empty default passport named "Kaarigar".
 * It is a valid setup state, but not a useful directory result, so only fully
 * blank placeholders are hidden. Nothing is deleted; completing the profile
 * makes it eligible automatically.
 *
 * The customer MVP exposes Electrician and Plumber only. Real profiles are
 * ranked by rating; a zero rating comes after every rated profile. Duplicate
 * seed/test records collapse to one strongest profile per worker and trade.
 *
 * Every kaarigar in the list is shown the same way. Five of the six have no
 * login provisioned for the demo, and that is not represented here: a badge or
 * a disabled state would be inventing a distinction the product does not have.
 */
export const CustomerBrowse: React.FC<CustomerBrowseProps> = ({ onSelect, currentLanguage }) => {
  const [kaarigars, setKaarigars] = useState<PublicKaarigar[] | null>(null);
  const [error, setError] = useState('');
  const copy = getCustomerCopy(currentLanguage);

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
        setError(copy.directory.loadError);
      }
    })();
    return () => { cancelled = true; };
  }, [copy.directory.loadError]);

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
        <p className="text-sm font-bold text-gray-500">{copy.directory.loading}</p>
      </div>
    );
  }

  const directory = uniqueDirectoryProfiles(
    kaarigars
      .filter((profile) => !isBlankPlaceholder(profile))
      .filter((profile) => CUSTOMER_DEMO_TRADES.has(profile.trade))
  );

  if (directory.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-gray-200 p-6 text-center">
        <p className="text-sm font-bold text-gray-500">{copy.directory.unavailable}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {directory.map((k) => (
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
            <p className="text-sm text-orange-600 font-bold">{getCustomerTrade(currentLanguage, k.trade)}</p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 font-semibold">
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-500" />
                {k.rating}
              </span>
              <span className="flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5" />
                {k.totalJobsCount} {copy.directory.jobs}
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
