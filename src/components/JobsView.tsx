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
import { todayIso } from '../utils/date';

const JOB_BADGE_PRESENTATION: Record<JobBadge, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'text-blue-700 bg-blue-50 border-blue-200' },
  in_progress: { label: 'In progress', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  completed: { label: 'Completed', className: 'text-green-700 bg-green-50 border-green-200' },
  cancelled: { label: 'Cancelled', className: 'text-red-700 bg-red-50 border-red-200' },
};

const JOB_STATE_LABEL: Record<JobState, string> = {
  REQUESTED: 'Requested',
  QUOTED: 'Quoted',
  ACCEPTED: 'Accepted',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  SETTLED: 'Payment settled',
  REVIEWED: 'Reviewed',
  CANCELLED: 'Cancelled',
  DISPUTED: 'Disputed',
};

/** The single judge-demo path. Cancellation remains available through the API. */
const HAPPY_PATH_NEXT: Partial<Record<JobState, JobState>> = {
  REQUESTED: 'QUOTED',
  QUOTED: 'ACCEPTED',
  ACCEPTED: 'SCHEDULED',
  SCHEDULED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
  COMPLETED: 'SETTLED',
};

const NEXT_ACTION_LABEL: Partial<Record<JobState, string>> = {
  QUOTED: 'Mark quote sent',
  ACCEPTED: 'Customer accepted',
  SCHEDULED: 'Schedule job',
  IN_PROGRESS: 'Start work',
  COMPLETED: 'Mark work completed',
  SETTLED: 'Mark payment received',
};

const PAYMENT_PRESENTATION: Record<
  JobItem['paymentMethod'],
  { label: string; className: string }
> = {
  upi: { label: '⚡ UPI', className: 'bg-purple-100 text-purple-800' },
  cash: { label: '💵 Cash', className: 'bg-green-100 text-green-800' },
  pending: { label: 'Payment pending', className: 'bg-amber-100 text-amber-800' },
};

interface JobsViewProps {
  jobs: JobItem[];
  /** Shown in the share text the customer receives, so it names a person. */
  workerName: string;
  currentLanguage: SupportedLanguage;
  onAddJobVoice: () => void;
  onOpenQuote: () => void;
  onTransitionJob?: (jobId: string, state: JobState) => Promise<void>;
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
}) => {
  const t = TRANSLATIONS[currentLanguage];
  const [filter, setFilter] = useState<'all' | 'today' | 'week'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [transitioningJobId, setTransitioningJobId] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState('');

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

  const advanceJob = async (jobId: string, state: JobState) => {
    if (!onTransitionJob) return;
    setTransitioningJobId(jobId);
    setTransitionError('');
    try {
      await onTransitionJob(jobId, state);
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : 'Could not update the job.');
    } finally {
      setTransitioningJobId(null);
    }
  };

  return (
    <div id="jobs-view-container" className="space-y-6 max-w-2xl mx-auto pb-10">
      {/* Header with Huge Voice Action Banner */}
      <div className="bg-orange-50 border-2 border-orange-200 rounded-3xl p-6 sm:p-8 text-gray-900 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-5 relative overflow-hidden">
        <div className="space-y-2 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-extrabold shadow-xs">
            <Sparkles className="w-4 h-4 text-orange-600" />
            <span>AI Voice Job Logger</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            {t.navJobs}
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 font-medium max-w-sm">
            बस बोलिए — "सेक्टर 35 में पंखा लगाया, ₹1100 मिले" और काम दर्ज हो
            जाएगा!
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
            Create itemised quote
          </button>
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
            सभी काम ({jobs.length})
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
            आज (Today)
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
            इस हफ्ते
          </button>
        </div>

        {/* Total stats pill */}
        <div className="text-right text-xs font-semibold text-gray-600 bg-white px-4 py-2.5 rounded-full border border-gray-200 shadow-xs flex items-center justify-between sm:justify-end gap-2">
          <span>कुल राशि (Total):</span>
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
          placeholder="ग्राहक, जगह या काम खोजें (Search customer or location)..."
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
              कोई काम नहीं मिला
            </h4>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              माइक बटन दबाकर अपना पहला काम बोलकर जोड़ें!
            </p>
            <button
              onClick={onAddJobVoice}
              className="px-5 py-2.5 bg-orange-500 text-white rounded-full text-xs font-extrabold hover:bg-orange-600 shadow-sm transition-all"
            >
              🎙️ बोलकर काम जोड़ें
            </button>
          </div>
        ) : (
          filteredJobs.map((job) => {
            const nextState = HAPPY_PATH_NEXT[job.status];
            const syncState = syncStateOf(job.id);
            const payment = PAYMENT_PRESENTATION[job.paymentMethod];
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
                      {JOB_BADGE_PRESENTATION[JOB_BADGE[job.status]].label}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">
                      {job.date} • {job.time || '11:00 AM'}
                    </span>
                    <SyncBadge state={syncState} currentLanguage={currentLanguage} compact />
                  </div>
                  <h3 className="font-extrabold text-base sm:text-lg text-gray-900">
                    {job.title}
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
                      Customer
                    </span>
                    <span className="font-extrabold text-gray-800">
                      {job.customerName}
                    </span>
                  </div>
                  {job.customerPhone && (
                    <a
                      href={`tel:${job.customerPhone}`}
                      className="w-8 h-8 rounded-xl bg-green-500 text-white flex items-center justify-center hover:bg-green-600 shadow-sm transition-colors"
                      title="Call Customer"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-start gap-2 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                  <div>
                    <span className="text-gray-400 block text-[10px] font-bold uppercase">
                      Location
                    </span>
                    <span className="font-extrabold text-gray-800 truncate">
                      {job.location}
                    </span>
                  </div>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      job.location
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors"
                    title="View on Map"
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
                      🏷️ {st}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Lifecycle: <span className="font-extrabold text-gray-800">{JOB_STATE_LABEL[job.status]}</span>
                </p>
                {nextState && (
                  <button
                    type="button"
                    onClick={() => void advanceJob(job.id, nextState)}
                    disabled={!canTransition || isTransitioning}
                    className="inline-flex items-center justify-center gap-1.5 min-h-10 px-4 py-2 rounded-full bg-gray-900 text-white text-xs font-extrabold disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] transition"
                    title={
                      !onTransitionJob
                        ? 'Enable API demo mode to use lifecycle controls.'
                        : syncState !== 'synced'
                          ? 'Wait for this job to sync before changing its state.'
                          : undefined
                    }
                  >
                    {isTransitioning ? 'Updating…' : NEXT_ACTION_LABEL[nextState]}
                    {!isTransitioning && <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />}
                  </button>
                )}
              </div>

              {/* Renders nothing unless the job is COMPLETED or SETTLED. */}
              <SendReviewLink
                job={job}
                workerName={workerName}
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
