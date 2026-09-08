import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, IndianRupee, Calendar, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { JOB_BADGE, type JobItem, type SupportedLanguage } from '../../types';
import { JOB_BADGE_PRESENTATION } from '../JobsView';
import { getScreenCopy } from '../../data/uiCopy';

interface CustomerRequestsProps {
  currentLanguage: SupportedLanguage;
}

/**
 * The customer's own requests and where each one has got to.
 *
 * Status text and colour are reused, not restated: JOB_BADGE maps the state to
 * a display bucket, JOB_BADGE_PRESENTATION colours it exactly as the worker's
 * job list does, and the label comes from the same uiCopy table. A customer and
 * a kaarigar looking at one job therefore read the same word for it.
 *
 * Refresh is a button, not a poll. The demo has the kaarigar accepting on a
 * second device, and an interval that happened to fire at the right moment
 * would make it impossible to tell a working end-to-end loop from a lucky one.
 */
export const CustomerRequests: React.FC<CustomerRequestsProps> = ({ currentLanguage }) => {
  const [jobs, setJobs] = useState<JobItem[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const stateLabel = getScreenCopy(currentLanguage).jobs.state;

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setJobs(await api.listCustomerJobs());
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setError(e instanceof Error ? e.message : 'अनुरोध लोड नहीं हो सके।');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (jobs === null && !error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <div className="w-10 h-10 rounded-2xl bg-orange-500 animate-pulse" />
        <p className="text-sm font-bold text-gray-500">लोड हो रहा है…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-extrabold text-gray-500">
          {jobs?.length ?? 0} अनुरोध
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="h-10 px-3 rounded-xl border border-gray-200 bg-white text-gray-600 font-bold text-sm flex items-center gap-1.5 active:scale-[0.98] transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          ताज़ा करें
        </button>
      </div>

      {error && (
        <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-2xl px-3 py-2.5">
          {error}
        </p>
      )}

      {jobs?.length === 0 && (
        <div className="bg-white rounded-3xl border border-gray-200 p-6 text-center space-y-3">
          <p className="text-sm font-bold text-gray-500">अभी तक कोई अनुरोध नहीं।</p>
          <Link
            to="/customer"
            className="inline-flex h-12 px-5 items-center rounded-2xl bg-orange-500 text-white font-extrabold"
          >
            कारीगर खोजें
          </Link>
        </div>
      )}

      {jobs?.map((job) => (
        <div key={job.id} className="bg-white rounded-3xl border border-gray-200 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="font-extrabold text-gray-900 flex-1 min-w-0">{job.title}</p>
            <span
              className={`text-xs font-extrabold px-2.5 py-1 rounded-full border shrink-0 ${
                JOB_BADGE_PRESENTATION[JOB_BADGE[job.status]].className
              }`}
            >
              {stateLabel[job.status]}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 font-semibold">
            {job.location && (
              <span className="flex items-center gap-1 min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{job.location}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <IndianRupee className="w-3.5 h-3.5" />
              {job.amount}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {job.date}
            </span>
          </div>

          {job.notes && <p className="mt-2 text-sm text-gray-600">{job.notes}</p>}
        </div>
      ))}
    </div>
  );
};
