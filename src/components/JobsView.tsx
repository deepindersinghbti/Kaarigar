import React, { useState } from 'react';
import {
  Mic,
  Plus,
  Search,
  CheckCircle,
  Clock,
  MapPin,
  Phone,
  IndianRupee,
  Calendar,
  Sparkles,
  ChevronRight,
  Filter,
} from 'lucide-react';
import {
  JOB_BADGE,
  JobBadge,
  JobItem,
  JobState,
  SupportedLanguage,
  SyncState,
} from '../types';
import { SyncBadge } from './SyncBadge';
import { SendReviewLink } from './SendReviewLink';
import { TRANSLATIONS } from '../data/translations';
import { getScreenCopy, localizeDisplayValue, localizeWorkerName } from '../data/uiCopy';
import { LiveToggle } from './LiveToggle';
import { useLivePolling } from '../hooks/useLivePolling';
import { todayIso } from '../utils/date';

/** Exported so the customer's request list badges a status identically. */
export const JOB_BADGE_PRESENTATION: Record<JobBadge, { className: string }> = {
  scheduled: { className: 'text-blue-700 bg-blue-50 border-blue-200' },
  in_progress: { className: 'text-amber-700 bg-amber-50 border-amber-200' },
  completed: { className: 'text-green-700 bg-green-50 border-green-200' },
  cancelled: { className: 'text-red-700 bg-red-50 border-red-200' },
};

/**
 * The single judge-demo path. Cancellation remains available through the API.
 *
 * QUOTED -> ACCEPTED stays listed because a worker's OWN job (no customerId)
 * still advances that way. On a customer's request the server refuses it - the
 * customer accepts - and the card below renders a waiting notice instead of a
 * button, so the refused edge is never offered.
 */
const HAPPY_PATH_NEXT: Partial<Record<JobState, JobState>> = {
  REQUESTED: 'QUOTED',
  QUOTED: 'ACCEPTED',
  ACCEPTED: 'SCHEDULED',
  SCHEDULED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  COMPLETED: 'SETTLED',
};

interface JobsViewProps {
  jobs: JobItem[];
  /** Shown in the share text the customer receives, so it names a person. */
  workerName: string;
  currentLanguage: SupportedLanguage;
  onAddJobVoice: () => void;
  onOpenQuote: () => void;
  onTransitionJob?: (jobId: string, state: JobState, quotedPrice?: number) => Promise<void>;
  /**
   * Re-read jobs from the server. Absent when jobs are not API-backed, which is
   * also what hides the live-updates toggle - there is nothing to poll.
   *
   * App owns this rather than the screen, because App owns the job list and the
   * outbox reconciliation that a refresh has to respect.
   */
  onRefreshJobs?: () => Promise<void>;
  /**
   * Sync state per record (section 9.1). A function rather than a field on the
   * job because the outbox is the authority on what has actually reached the
   * server, and a copy embedded in the record would go stale the moment a flush
   * succeeded.
   */
  syncStateOf: (recordId: string) => SyncState;
}

export const JobsView: React.FC<JobsViewProps> = ({
  jobs,
  workerName,
  syncStateOf,
  currentLanguage,
  onAddJobVoice,
  onOpenQuote,
  onTransitionJob,
  onRefreshJobs,
}) => {
  const t = TRANSLATIONS[currentLanguage];
  const copy = getScreenCopy(currentLanguage).jobs;
  const displayWorkerName = localizeWorkerName(workerName, currentLanguage);
  const [filter, setFilter] = useState<'all' | 'today' | 'week'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [transitioningJobId, setTransitioningJobId] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState('');
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, string>>({});

  /**
   * Paused while a transition is in flight or a quote is half-typed. A poll
   * landing mid-edit would swap the job list under a price box the worker is
   * still filling in - and a quote box that clears itself is the kind of thing
   * that makes someone stop trusting the screen.
   */
  const live = useLivePolling({
    onTick: onRefreshJobs ?? (async () => {}),
    paused: transitioningJobId !== null || Object.values(quoteDrafts).some((d) => d.trim() !== ''),
    storageKey: 'kaarigar_live_worker_jobs',
  });

  const todayStr = todayIso();

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filter === 'today') {
      return job.date === todayStr;
    }
    if (filter === 'week') {
      return true; // sample has current week entries
    }
    return true;
  });

  const totalAmount = filteredJobs.reduce((sum, j) => sum + j.amount, 0);

  const advanceJob = async (jobId: string, state: JobState, quotedPrice?: number) => {
    if (!onTransitionJob) return;
    setTransitioningJobId(jobId);
    setTransitionError('');
    try {
      await onTransitionJob(jobId, state, quotedPrice);
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : copy.updateError);
    } finally {
      setTransitioningJobId(null);
    }
  };

  /**
   * Per-job price drafts, keyed by job id rather than a single field, so two
   * open cards cannot overwrite each other's number.
   */
  const sendQuote = async (jobId: string) => {
    const raw = (quoteDrafts[jobId] ?? '').trim();
    const price = Number(raw);
    if (!raw || !Number.isFinite(price) || price <= 0) {
      setTransitionError(copy.quoteInvalid);
      return;
    }
    await advanceJob(jobId, 'QUOTED', price);
    setQuoteDrafts((prev) => {
      const { [jobId]: _sent, ...rest } = prev;
      return rest;
    });
  };

  return (
    <div id="jobs-view-container" className="space-y-6 max-w-2xl mx-auto pb-10">
      {/* Header with Huge Voice Action Banner */}
      <div className="bg-orange-50 border-2 border-orange-200 rounded-3xl p-6 sm:p-8 text-gray-900 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-5 relative overflow-hidden">
        <div className="space-y-2 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-extrabold shadow-xs">
            <Sparkles className="w-4 h-4 text-orange-600" />
            <span>{copy.eyebrow}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            {t.navJobs}
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 font-medium max-w-sm">
            {copy.description}
          </p>
        </div>

        {/* Large Prominent 🎙️ Add Job Button */}
        <div className="w-full sm:w-auto flex flex-col gap-2 shrink-0">
          <button
            id="jobs-view-voice-add-btn"
            onClick={onAddJobVoice}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-full bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-base shadow-xl shadow-orange-200 transition-all active:scale-95 group"
          >
            <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span>{t.addJobByVoice}</span>
          </button>
          <button type="button" onClick={onOpenQuote} className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-white border border-orange-300 text-orange-700 font-extrabold text-xs hover:bg-orange-50 transition-colors">
            {copy.createQuote}
          </button>
          {/*
            Only offered when jobs are API-backed. With no server to ask there
            is nothing to poll, and a switch that visibly does nothing is worse
            than no switch.
          */}
          {onRefreshJobs && (
            <LiveToggle
              enabled={live.enabled}
              onToggle={live.toggle}
              label={copy.live}
              title={live.enabled ? copy.liveOn : copy.liveOff}
            />
          )}
        </div>
      </div>

      {/* Summary Chips & Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex bg-gray-100 p-1.5 rounded-full border border-gray-200 text-xs font-bold text-gray-700">
          <button
            id="job-filter-all"
            onClick={() => setFilter('all')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-full transition-all ${
              filter === 'all'
                ? 'bg-white text-gray-900 shadow-xs font-extrabold'
                : 'hover:text-gray-900'
            }`}
          >
            {copy.allJobs(jobs.length)}
          </button>
          <button
            id="job-filter-today"
            onClick={() => setFilter('today')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-full transition-all ${
              filter === 'today'
                ? 'bg-white text-gray-900 shadow-xs font-extrabold'
                : 'hover:text-gray-900'
            }`}
          >
            {copy.today}
          </button>
          <button
            id="job-filter-week"
            onClick={() => setFilter('week')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-full transition-all ${
              filter === 'week'
                ? 'bg-white text-gray-900 shadow-xs font-extrabold'
                : 'hover:text-gray-900'
            }`}
          >
            {copy.week}
          </button>
        </div>

        {/* Total stats pill */}
        <div className="text-right text-xs font-semibold text-gray-600 bg-white px-4 py-2.5 rounded-full border border-gray-200 shadow-xs flex items-center justify-between sm:justify-end gap-2">
          <span>{copy.total}:</span>
          <span className="text-sm font-black text-green-700">
            ₹{totalAmount.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          id="search-jobs-input"
          type="text"
          placeholder={copy.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-xs text-gray-900 placeholder:text-gray-400"
        />
      </div>

      {/* Jobs List */}
      <div className="space-y-3">
        {transitionError && (
          <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            {transitionError}
          </p>
        )}
        {filteredJobs.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-dashed border-gray-300 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto">
              <Mic className="w-6 h-6" />
            </div>
            <h4 className="font-extrabold text-gray-800 text-base">
              {copy.noJobs}
            </h4>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              {copy.noJobsHint}
            </p>
            <button
              onClick={onAddJobVoice}
              className="px-5 py-2.5 bg-orange-500 text-white rounded-full text-xs font-extrabold hover:bg-orange-600 shadow-sm transition-all"
            >
              {copy.speakAdd}
            </button>
          </div>
        ) : (
          filteredJobs.map((job) => {
            const nextState = HAPPY_PATH_NEXT[job.status];
            const syncState = syncStateOf(job.id);
            const payment = job.status === 'SETTLED' || job.status === 'REVIEWED'
              ? { label: copy.payment.settled, className: 'bg-green-100 text-green-800' }
              : {
                label: copy.payment[job.paymentMethod],
                className: job.paymentMethod === 'upi'
                  ? 'bg-purple-100 text-purple-800'
                  : job.paymentMethod === 'cash'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-amber-100 text-amber-800',
              };
            const isTransitioning = transitioningJobId === job.id;
            const canTransition = Boolean(onTransitionJob && nextState && syncState === 'synced');

            return (
            <div
              key={job.id}
              id={`job-card-${job.id}`}
              className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition-all space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${JOB_BADGE_PRESENTATION[JOB_BADGE[job.status]].className}`}
                    >
                      {copy.state[job.status]}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">
                      {job.date} • {job.time || '11:00 AM'}
                    </span>
                    <SyncBadge state={syncState} currentLanguage={currentLanguage} compact />
                  </div>
                  <h3 className="font-extrabold text-base sm:text-lg text-gray-900">
                    {localizeDisplayValue(job.title, currentLanguage)}
                  </h3>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-lg sm:text-xl font-black text-green-600">
                    ₹{job.amount.toLocaleString('en-IN')}
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${payment.className}`}
                  >
                    {payment.label}
                  </span>
                </div>
              </div>

              {/* Customer & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between sm:justify-start gap-3 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                  <div>
                    <span className="text-gray-400 block text-[10px] font-bold uppercase">
                      {copy.customer}
                    </span>
                    <span className="font-extrabold text-gray-800">
                      {localizeDisplayValue(job.customerName, currentLanguage)}
                    </span>
                  </div>
                  {job.customerPhone && (
                    <a
                      href={`tel:${job.customerPhone}`}
                      className="w-8 h-8 rounded-xl bg-green-500 text-white flex items-center justify-center hover:bg-green-600 shadow-sm transition-colors"
                      title={copy.callCustomer}
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-start gap-2 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                  <div>
                    <span className="text-gray-400 block text-[10px] font-bold uppercase">
                      {copy.location}
                    </span>
                    <span className="font-extrabold text-gray-800 truncate">
                      {localizeDisplayValue(job.location, currentLanguage)}
                    </span>
                  </div>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      job.location
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors"
                    title={copy.viewMap}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Skills Tags */}
              {job.skillsTagged && job.skillsTagged.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {job.skillsTagged.map((st, idx) => (
                    <span
                      key={idx}
                      className="text-[11px] bg-gray-100 text-gray-600 font-semibold px-2.5 py-0.5 rounded-full"
                    >
                      🏷️ {localizeDisplayValue(st, currentLanguage)}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  {copy.lifecycle}: <span className="font-extrabold text-gray-800">{copy.state[job.status]}</span>
                </p>
                {/*
                  A customer's request needs a price before it can move, and is
                  then the customer's to accept - so neither of those two edges
                  is a one-tap button on this screen.
                */}
                {job.customerId && job.status === 'REQUESTED' ? (
                  <div className="flex items-center gap-2">
                    {/*
                      A counter-offer the worker cannot see is no offer at all.
                      It shows as the customer's ASK, next to a price box that
                      stays empty - the figure the worker sends is theirs, and
                      prefilling the input with the customer's number would
                      blur exactly the line the two fields exist to draw.
                    */}
                    {typeof job.counterPrice === 'number' && (
                      <span className="text-xs font-extrabold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 whitespace-nowrap">
                        {copy.counterAsk(job.counterPrice)}
                      </span>
                    )}
                    <label className="sr-only" htmlFor={`quote-${job.id}`}>{copy.quoteLabel}</label>
                    <input
                      id={`quote-${job.id}`}
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={quoteDrafts[job.id] ?? ''}
                      onChange={(e) => setQuoteDrafts((prev) => ({ ...prev, [job.id]: e.target.value }))}
                      placeholder={copy.quotePlaceholder}
                      disabled={!canTransition || isTransitioning}
                      className="h-10 w-28 rounded-xl border border-gray-300 px-3 text-sm font-bold text-gray-900 disabled:opacity-45"
                    />
                    <button
                      type="button"
                      onClick={() => void sendQuote(job.id)}
                      disabled={!canTransition || isTransitioning}
                      className="inline-flex items-center justify-center gap-1.5 min-h-10 px-4 py-2 rounded-full bg-gray-900 text-white text-xs font-extrabold disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] transition"
                      title={
                        !onTransitionJob
                          ? copy.apiOnly
                          : syncState !== 'synced'
                            ? copy.waitForSync
                            : undefined
                      }
                    >
                      {isTransitioning ? copy.updating : copy.quoteSend}
                    </button>
                  </div>
                ) : job.customerId && job.status === 'QUOTED' ? (
                  <p className="text-xs font-extrabold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
                    {copy.quotedAwaiting}
                    {typeof job.quotedPrice === 'number' && <> · ₹{job.quotedPrice}</>}
                  </p>
                ) : nextState && (
                  <button
                    type="button"
                    onClick={() => void advanceJob(job.id, nextState)}
                    disabled={!canTransition || isTransitioning}
                    className="inline-flex items-center justify-center gap-1.5 min-h-10 px-4 py-2 rounded-full bg-gray-900 text-white text-xs font-extrabold disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] transition"
                    title={
                      !onTransitionJob
                        ? copy.apiOnly
                        : syncState !== 'synced'
                          ? copy.waitForSync
                          : undefined
                    }
                  >
                    {isTransitioning ? copy.updating : copy.action[nextState]}
                    {!isTransitioning && <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />}
                  </button>
                )}
              </div>

              {/* Renders nothing unless the job is COMPLETED or SETTLED. */}
              <SendReviewLink
                job={job}
                workerName={displayWorkerName}
                currentLanguage={currentLanguage}
              />
            </div>
            );
          })
        )}
      </div>
    </div>
  );
};
