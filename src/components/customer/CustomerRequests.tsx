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
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

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

  /**
   * Accepting sends no price. The server copies the figure it already stored, so
   * the only thing this can do is agree to the number already on screen.
   *
   * The returned job replaces the row in place rather than triggering a reload:
   * the response IS the authoritative job, and re-listing would show the same
   * thing one round trip later.
   */
  const accept = async (jobId: string) => {
    setAcceptingId(jobId);
    setError('');
    try {
      const updated = await api.acceptQuote(jobId);
      setJobs((prev) => (prev ?? []).map((j) => (j.id === updated.id ? updated : j)));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setError(e instanceof Error ? e.message : 'दाम स्वीकार नहीं हो सका।');
    } finally {
      setAcceptingId(null);
    }
  };

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

          {/*
            The quote and its Accept button. Only a QUOTED request offers this;
            the server refuses acceptance from any other state, so showing the
            button more widely would only manufacture a 409.
          */}
          {job.status === 'QUOTED' && typeof job.quotedPrice === 'number' && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-bold text-amber-900">
                कारीगर का दाम: <span className="font-extrabold">₹{job.quotedPrice}</span>
              </p>
              <button
                type="button"
                onClick={() => void accept(job.id)}
                disabled={acceptingId === job.id}
                className="w-full min-h-12 rounded-2xl bg-orange-500 text-white font-extrabold disabled:opacity-50 active:scale-[0.98] transition"
              >
                {acceptingId === job.id ? 'भेज रहे हैं…' : 'यह दाम स्वीकार करें'}
              </button>
            </div>
          )}

          {/* Once agreed, the figure is shown as settled fact, with no control. */}
          {typeof job.agreedPrice === 'number' && job.status !== 'QUOTED' && (
            <p className="mt-3 text-sm font-bold text-green-800 bg-green-50 border border-green-200 rounded-2xl px-3 py-2">
              तय दाम: <span className="font-extrabold">₹{job.agreedPrice}</span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
};
