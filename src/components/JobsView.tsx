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
  Booking,
  BookingStatus,
  JOB_BADGE,
  JobBadge,
  JobItem,
  JobState,
  SupportedLanguage,
  SyncState,
} from '../types';
import { ApiError, type TransitionOptions } from '../lib/api';
import { formatSlot } from '../lib/bookingFormat';
import { getServerFlags } from '../lib/serverFlags';
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

/**
 * PRESET WINDOWS, NOT A FREE TIME PICKER.
 *
 * A worker committing to "morning" on a phone, in a hurry, with one thumb, is
 * the whole design constraint. Two free time fields would be four taps and a
 * scroll wheel each, and would let somebody commit to 03:00-03:05 by accident -
 * which the server would accept, because it is a legal slot.
 *
 * Two hours wide because that is the honest granularity of the promise. Nobody
 * arrives at a minute, and a window the worker can actually keep is worth more
 * than a precise one they cannot.
 */
type SlotWindowKey = 'morning' | 'afternoon' | 'evening' | 'demo';

/**
 * The DEMO window: starts two minutes from the tap and lasts one minute.
 *
 * Offered only when the server reports bookingDemoSlots (BOOKING_DEMO_SLOTS and
 * BOOKINGS_ENABLED both on). It exists so the LATE state can be shown on stage
 * in minutes rather than hours - see bookingDemoSlotsEnabled() on the server.
 * It needs no day: it is always "now", which is also why it is labelled as a
 * demo on screen rather than passed off as a normal slot.
 */
const DEMO_SLOT_LEAD_MS = 2 * 60_000;
const DEMO_SLOT_LENGTH_MS = 60_000;

const SLOT_WINDOWS: Array<{ key: SlotWindowKey; startHour: number; endHour: number }> = [
  { key: 'morning', startHour: 9, endHour: 11 },
  { key: 'afternoon', startHour: 13, endHour: 15 },
  { key: 'evening', startHour: 17, endHour: 19 },
];

/** Booking states in which nothing further can be done. */
const BOOKING_TERMINAL: BookingStatus[] = [
  'COMPLETED', 'NO_SHOW', 'EXPIRED', 'DECLINED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_KAARIGAR',
];


/** YYYY-MM-DD in LOCAL time, for the date input's min. Never toISOString: that shifts to UTC. */
function localDateValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Turn the picked day and window into two instants, in the WORKER'S OWN
 * timezone.
 *
 * Built from local components rather than parsed from a string, for the same
 * reason utils/date.ts builds calendar days that way: "9am on the 18th" means
 * 9am where the worker is standing, and a UTC round-trip turns that into 2:30pm
 * for half the country.
 */
function slotInstants(dateValue: string, window: SlotWindowKey): { start: Date; end: Date } | null {
  if (window === 'demo') {
    const start = new Date(Date.now() + DEMO_SLOT_LEAD_MS);
    return { start, end: new Date(start.getTime() + DEMO_SLOT_LENGTH_MS) };
  }
  const [year, month, day] = dateValue.split('-').map(Number);
  const preset = SLOT_WINDOWS.find((w) => w.key === window);
  if (!preset || !year || !month || !day) return null;
  return {
    start: new Date(year, month - 1, day, preset.startHour, 0, 0, 0),
    end: new Date(year, month - 1, day, preset.endHour, 0, 0, 0),
  };
}

interface JobsViewProps {
  jobs: JobItem[];
  /** Shown in the share text the customer receives, so it names a person. */
  workerName: string;
  currentLanguage: SupportedLanguage;
  onAddJobVoice: () => void;
  onOpenQuote: () => void;
  onTransitionJob?: (jobId: string, state: JobState, options?: TransitionOptions) => Promise<void>;
  /**
   * The appointment behind each job, keyed by JOB id.
   *
   * A MISS IS THE NORMAL LEGACY CASE, never an error. This map is empty when
   * BOOKINGS_ENABLED is off, and a job is simply absent from it when it has no
   * booking - the worker's own jobs, and everything created before the flag was
   * turned on. Those keep the one-tap lifecycle they have always had, so every
   * branch below must fall through to the existing controls when the lookup
   * comes back undefined.
   */
  bookingsByJob: Record<string, Booking>;
  /**
   * Propose a new slot on a job already committed to one. Absent when jobs are
   * not API-backed, which also hides the button - there is nothing to propose to.
   */
  onRescheduleBooking?: (bookingId: string, slotStart: string, slotEnd: string, reason?: string) => Promise<void>;
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
  bookingsByJob,
  onRescheduleBooking,
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
   * Which card has a panel open, and what is half-typed in it. One id each
   * rather than a set: two open slot pickers on one screen is a way to commit
   * to the wrong job, and a worker doing this on a phone is looking at one card
   * at a time anyway.
   */
  const [slotJobId, setSlotJobId] = useState<string | null>(null);
  const [slotDate, setSlotDate] = useState('');
  const [slotWindow, setSlotWindow] = useState<SlotWindowKey | null>(null);
  const [slotMode, setSlotMode] = useState<'commit' | 'reschedule'>('commit');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [otpJobId, setOtpJobId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState('');
  const [confirmJobId, setConfirmJobId] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<'cancel' | 'decline'>('cancel');

  /**
   * The refusal from the last action, remembered PER JOB.
   *
   * Per job rather than one banner for the screen, because every one of these
   * is about a specific card - a wrong arrival code belongs beside the code
   * box, not at the top of a list of twelve jobs.
   */
  const [bookingError, setBookingError] = useState<Record<string, string>>({});

  /**
   * A one-minute tick, so the countdowns move.
   *
   * PRESENTATION ONLY. It re-renders; it never fetches, never transitions and
   * never decides anything. The deadlines themselves live on the server as
   * dates and are applied when a route reads them or the sweeper runs - a
   * client timer could not be trusted with them anyway, since the device clock
   * is the one thing a worker can change.
   *
   * A minute is enough: every window here is measured in hours, and a
   * per-second tick on a cheap phone would cost battery to show nothing new.
   */
  /** Whether to offer the demo-only slot. Off until the server says otherwise. */
  const [demoSlots, setDemoSlots] = useState(false);
  React.useEffect(() => {
    let active = true;
    void getServerFlags().then((flags) => { if (active) setDemoSlots(flags.bookingDemoSlots); });
    return () => { active = false; };
  }, []);

  const [, setTick] = useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  /**
   * Paused while a transition is in flight or a quote is half-typed. A poll
   * landing mid-edit would swap the job list under a price box the worker is
   * still filling in - and a quote box that clears itself is the kind of thing
   * that makes someone stop trusting the screen.
   */
  const live = useLivePolling({
    onTick: onRefreshJobs ?? (async () => {}),
    /**
     * Also paused while a slot picker, an arrival-code box or a confirmation is
     * open. A poll landing mid-action would swap the job list under a worker who
     * is halfway through committing to a time or reading four digits off a
     * customer's phone - the same reason a half-typed quote pauses it.
     */
    paused:
      transitioningJobId !== null ||
      slotJobId !== null ||
      otpJobId !== null ||
      confirmJobId !== null ||
      Object.values(quoteDrafts).some((d) => d.trim() !== ''),
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

  /**
   * A server refusal, in the worker's own language.
   *
   * MAPPED FROM THE ERROR CODE, NOT THE SERVER'S MESSAGE. Route messages are
   * written in English; rendering one on a Hindi screen is exactly the mixed
   * -language failure the copy tables exist to prevent. The code is the stable
   * contract - see the refusal table in KAARIGAR_RELIABILITY_FEATURE.md - and
   * the message is kept only as a fallback for a code this screen has not been
   * taught yet, where showing something imperfect beats showing nothing.
   */
  const describeRefusal = (error: unknown): string => {
    const b = copy.booking;
    if (!(error instanceof ApiError)) {
      return error instanceof Error ? error.message : copy.updateError;
    }
    switch (error.code) {
      case 'slot_required':            return b.slotRequired;
      case 'slot_in_past':             return b.slotInPast;
      case 'invalid_slot_order':       return b.slotOrder;
      case 'slot_too_long':            return b.slotTooLong;
      case 'slot_too_far':             return b.slotTooFar;
      case 'checkin_code_required':    return b.otpNeeded;
      case 'checkin_code_incorrect':   return b.otpWrong;
      case 'checkin_locked':           return b.otpLocked;
      case 'booking_request_expired':  return b.respondOverdue;
      case 'reschedule_limit_reached': return b.rescheduleUsed;
      case 'reschedule_too_late':      return b.rescheduleTooLate;
      case 'reschedule_already_pending': return b.reschedulePending;
      case 'no_reschedule_pending':    return b.conflict;
      case 'too_early':                return b.arriveOverdue;
      case 'booking_wrong_state':
      case 'booking_terminal':
      case 'booking_conflict':
      case 'concurrent_transition':    return b.conflict;
      default:                         return error.message || copy.updateError;
    }
  };

  const advanceJob = async (jobId: string, state: JobState, options?: TransitionOptions): Promise<boolean> => {
    if (!onTransitionJob) return false;
    setTransitioningJobId(jobId);
    setTransitionError('');
    setBookingError((prev) => ({ ...prev, [jobId]: '' }));
    try {
      await onTransitionJob(jobId, state, options);
      return true;
    } catch (error) {
      /**
       * A booking refusal goes on the CARD; anything else keeps the existing
       * screen-level banner. A worker who typed the wrong arrival code needs the
       * message next to the box they typed it into, not at the top of a list.
       */
      const local = describeRefusal(error);
      if (error instanceof ApiError && error.code !== 'request_failed') {
        setBookingError((prev) => ({ ...prev, [jobId]: local }));
      } else {
        setTransitionError(local);
      }
      return false;
    } finally {
      setTransitioningJobId(null);
    }
  };

  /** Time left, rounded down to the minute, or null once it has run out. */
  const timeLeft = (iso: string | undefined): string | null => {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const totalMinutes = Math.floor(ms / 60_000);
    return copy.booking.duration(Math.floor(totalMinutes / 60), totalMinutes % 60);
  };

  const closePanels = () => {
    setSlotJobId(null);
    setSlotWindow(null);
    setSlotDate('');
    setRescheduleReason('');
    setOtpJobId(null);
    setOtpValue('');
    setConfirmJobId(null);
  };

  /** Commit to a slot, or propose a new one - the picker is the same either way. */
  const submitSlot = async (job: JobItem, booking: Booking | undefined) => {
    if (!slotWindow || (slotWindow !== 'demo' && !slotDate)) {
      setBookingError((prev) => ({ ...prev, [job.id]: copy.booking.slotRequired }));
      return;
    }
    const instants = slotInstants(slotDate, slotWindow);
    if (!instants) {
      setBookingError((prev) => ({ ...prev, [job.id]: copy.booking.slotRequired }));
      return;
    }
    /**
     * Checked here as well as on the server. The server is the authority - this
     * is only so the worker is told before a round trip, on a connection that
     * may be slow enough for the difference to matter.
     */
    if (instants.start.getTime() <= Date.now()) {
      setBookingError((prev) => ({ ...prev, [job.id]: copy.booking.slotInPast }));
      return;
    }

    const slotStart = instants.start.toISOString();
    const slotEnd = instants.end.toISOString();

    if (slotMode === 'reschedule') {
      if (!onRescheduleBooking || !booking) return;
      setTransitioningJobId(job.id);
      setBookingError((prev) => ({ ...prev, [job.id]: '' }));
      try {
        await onRescheduleBooking(booking.id, slotStart, slotEnd, rescheduleReason.trim() || undefined);
        closePanels();
      } catch (error) {
        setBookingError((prev) => ({ ...prev, [job.id]: describeRefusal(error) }));
      } finally {
        setTransitioningJobId(null);
      }
      return;
    }

    if (await advanceJob(job.id, 'SCHEDULED', { slotStart, slotEnd })) closePanels();
  };

  /** The arrival code. Four digits, from the customer's screen. */
  const submitOtp = async (job: JobItem) => {
    const code = otpValue.trim();
    if (!/^\d{4}$/.test(code)) {
      setBookingError((prev) => ({ ...prev, [job.id]: copy.booking.otpNeeded }));
      return;
    }
    if (await advanceJob(job.id, 'IN_PROGRESS', { otp: code })) {
      closePanels();
    } else {
      // Keep the panel open and clear only the digits, so a mistyped code is
      // one correction away rather than a re-opened panel.
      setOtpValue('');
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
    await advanceJob(jobId, 'QUOTED', { quotedPrice: price });
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

            /**
             * THE LEGACY FORK, and everything below it depends on this one line.
             *
             * `undefined` means this job has no appointment - a worker's own
             * job, or anything from before BOOKINGS_ENABLED was turned on - and
             * every booking branch is skipped so the card renders exactly as it
             * did before this feature existed. No slot, no arrival code, no
             * countdown, one-tap lifecycle.
             */
            const booking = bookingsByJob[job.id];
            const bk = copy.booking;
            const cardError = bookingError[job.id];
            const canAct = Boolean(onTransitionJob) && syncState === 'synced' && !isTransitioning;

            const respondLeft = booking?.status === 'REQUESTED' ? timeLeft(booking.acceptBy) : null;
            const scheduleLeft = booking?.status === 'RESPONDED' ? timeLeft(booking.scheduleBy) : null;
            const arriveLeft = booking?.status === 'COMMITTED' ? timeLeft(booking.arriveBy) : null;

            /**
             * Whether Change-the-time is even offered, and if not, why.
             *
             * EVERY REASON IS COMPUTED HERE RATHER THAN LEARNED FROM A 409.
             * CLAUDE.md's rule: a gate that exists on the route but not on the
             * screen leaves a button whose only possible outcome is an error.
             * The route refuses a spent allowance, a proposal already pending,
             * and anything inside the notice period; so the button is absent in
             * all three cases and the card says which one it is.
             *
             * The notice period is hardcoded to 12h to match
             * RESCHEDULE_MIN_NOTICE_H. The server is the authority - if it is
             * configured differently the refusal still arrives and is rendered -
             * but the common case should not need a round trip to discover.
             */
            const reschedulePending = Boolean(booking?.pendingReschedule);
            const rescheduleSpent = (booking?.rescheduleCount ?? 0) >= 1;
            const rescheduleTooLate = Boolean(
              booking?.slotStart && new Date(booking.slotStart).getTime() - Date.now() < 12 * 3_600_000
            );
            const canReschedule = Boolean(
              booking?.status === 'COMMITTED' &&
              onRescheduleBooking &&
              !reschedulePending && !rescheduleSpent && !rescheduleTooLate
            );

            /**
             * A cancel this close to the slot costs the worker a LATE_CANCEL, so
             * the warning is shown BEFORE the tap, not reported after it.
             */
            const cancelWouldBeLate = Boolean(
              booking?.status === 'COMMITTED' && rescheduleTooLate
            );
            const bookingIsTerminal = Boolean(booking && BOOKING_TERMINAL.includes(booking.status));

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

              {/*
                THE APPOINTMENT. Renders nothing at all for a job with no
                booking, which is what keeps every legacy card byte-identical.
              */}
              {booking && (
                <div id={`booking-${job.id}`} className="space-y-2 pt-2 border-t border-gray-100">
                  {/* The one banner that has to be impossible to miss. */}
                  {booking.status === 'LATE' && (
                    <p
                      id={`booking-late-${job.id}`}
                      role="alert"
                      className="flex items-start gap-2 text-xs font-extrabold text-red-800 bg-red-50 border-2 border-red-300 rounded-2xl px-4 py-3"
                    >
                      <Clock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{bk.lateBanner}</span>
                    </p>
                  )}

                  {booking.status === 'NO_SHOW' && (
                    <p className="text-xs font-extrabold text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-2.5">
                      {bk.noShowNotice}
                    </p>
                  )}
                  {booking.status === 'EXPIRED' && (
                    <p className="text-xs font-extrabold text-gray-600 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5">
                      {bk.expiredNotice}
                    </p>
                  )}
                  {booking.status === 'DECLINED' && (
                    <p className="text-xs font-extrabold text-gray-600 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5">
                      {bk.declinedNotice}
                    </p>
                  )}
                  {(booking.status === 'CANCELLED_BY_CUSTOMER' || booking.status === 'CANCELLED_BY_KAARIGAR') && (
                    <p className="text-xs font-extrabold text-gray-600 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5">
                      {bk.cancelledNotice} · {bk.state[booking.status]}
                    </p>
                  )}

                  {/* The commitment itself, and how long is left to keep it. */}
                  {booking.slotStart && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        id={`booking-slot-${job.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-extrabold text-gray-800 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5"
                      >
                        <Calendar className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                        {bk.slotAgreed(formatSlot(booking.slotStart, booking.slotEnd, currentLanguage))}
                      </span>
                      {arriveLeft && (
                        <span
                          id={`booking-arriveby-${job.id}`}
                          className="text-xs font-extrabold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5"
                        >
                          {bk.arriveBy(arriveLeft)}
                        </span>
                      )}
                      {booking.status === 'COMMITTED' && !arriveLeft && (
                        <span className="text-xs font-extrabold text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1.5">
                          {bk.arriveOverdue}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Countdowns on the two states that have a deadline running. */}
                  {booking.status === 'REQUESTED' && (
                    <span
                      id={`booking-respondby-${job.id}`}
                      className={`inline-block text-xs font-extrabold rounded-full px-3 py-1.5 border ${
                        respondLeft
                          ? 'text-amber-700 bg-amber-50 border-amber-200'
                          : 'text-red-700 bg-red-50 border-red-200'
                      }`}
                    >
                      {respondLeft ? bk.respondBy(respondLeft) : bk.respondOverdue}
                    </span>
                  )}
                  {booking.status === 'RESPONDED' && booking.scheduleBy && (
                    <span
                      id={`booking-scheduleby-${job.id}`}
                      className={`inline-block text-xs font-extrabold rounded-full px-3 py-1.5 border ${
                        scheduleLeft
                          ? 'text-amber-700 bg-amber-50 border-amber-200'
                          : 'text-red-700 bg-red-50 border-red-200'
                      }`}
                    >
                      {scheduleLeft ? bk.scheduleBy(scheduleLeft) : bk.scheduleOverdue}
                    </span>
                  )}

                  {/* A proposal the customer has not answered yet. */}
                  {reschedulePending && booking.pendingReschedule && (
                    <p
                      id={`booking-reschedule-pending-${job.id}`}
                      className="text-xs font-extrabold text-sky-700 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-2.5"
                    >
                      {bk.reschedulePending}
                      {' · '}
                      {formatSlot(booking.pendingReschedule.slotStart, booking.pendingReschedule.slotEnd, currentLanguage)}
                    </p>
                  )}

                  {/*
                    Why Change-the-time is not on offer. Shown instead of the
                    button, never alongside it - a reason next to a live button
                    reads as a warning rather than an explanation.
                  */}
                  {(booking.status === 'COMMITTED' || booking.status === 'LATE') && !canReschedule && !reschedulePending && (
                    <p id={`booking-no-reschedule-${job.id}`} className="text-[11px] font-bold text-gray-500">
                      {rescheduleSpent ? bk.rescheduleUsed : bk.rescheduleTooLate}
                    </p>
                  )}

                  {/* The last refusal for THIS card. */}
                  {cardError && (
                    <p
                      id={`booking-error-${job.id}`}
                      role="alert"
                      className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-2.5"
                    >
                      {cardError}
                    </p>
                  )}

                  {/* ---- The slot picker, for committing and for rescheduling ---- */}
                  {slotJobId === job.id && (
                    <div id={`slot-picker-${job.id}`} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
                      <p className="text-xs font-extrabold text-gray-900">
                        {slotMode === 'reschedule' ? bk.rescheduleTitle : bk.slotTitle}
                      </p>

                      <div>
                        <label htmlFor={`slot-date-${job.id}`} className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                          {bk.slotDate}
                        </label>
                        <input
                          id={`slot-date-${job.id}`}
                          type="date"
                          value={slotDate}
                          min={localDateValue(new Date())}
                          onChange={(e) => setSlotDate(e.target.value)}
                          className="w-full h-11 rounded-xl border border-gray-300 px-3 text-sm font-bold text-gray-900 bg-white"
                        />
                      </div>

                      <div>
                        <span className="block text-[10px] font-bold uppercase text-gray-400 mb-1">{bk.slotWindow}</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {/*
                            Demo-only, and labelled as such. Rendered first and
                            full-width so it cannot be mistaken for one of the
                            three real windows during a rehearsal.
                          */}
                          {demoSlots && slotMode === 'commit' && (
                            <button
                              id={`slot-window-demo-${job.id}`}
                              type="button"
                              onClick={() => setSlotWindow('demo')}
                              className={`sm:col-span-3 min-h-11 px-3 py-2 rounded-xl text-xs font-extrabold border border-dashed transition-colors ${
                                slotWindow === 'demo'
                                  ? 'bg-gray-900 text-white border-gray-900'
                                  : 'bg-white text-gray-700 border-gray-400 hover:bg-gray-100'
                              }`}
                            >
                              {bk.slotDemo}
                            </button>
                          )}
                          {SLOT_WINDOWS.map((w) => (
                            <button
                              key={w.key}
                              id={`slot-window-${w.key}-${job.id}`}
                              type="button"
                              onClick={() => setSlotWindow(w.key)}
                              className={`min-h-11 px-3 py-2 rounded-xl text-xs font-extrabold border transition-colors ${
                                slotWindow === w.key
                                  ? 'bg-gray-900 text-white border-gray-900'
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                              }`}
                            >
                              {w.key === 'morning' ? bk.slotMorning : w.key === 'afternoon' ? bk.slotAfternoon : bk.slotEvening}
                            </button>
                          ))}
                        </div>
                      </div>

                      {slotMode === 'reschedule' && (
                        <div>
                          <label htmlFor={`reschedule-reason-${job.id}`} className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                            {bk.rescheduleReason}
                          </label>
                          <input
                            id={`reschedule-reason-${job.id}`}
                            type="text"
                            value={rescheduleReason}
                            onChange={(e) => setRescheduleReason(e.target.value)}
                            maxLength={140}
                            className="w-full h-11 rounded-xl border border-gray-300 px-3 text-sm text-gray-900 bg-white"
                          />
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          id={`slot-confirm-${job.id}`}
                          type="button"
                          onClick={() => void submitSlot(job, booking)}
                          disabled={!canAct || !slotWindow || (slotWindow !== 'demo' && !slotDate)}
                          className="flex-1 min-h-11 px-4 py-2 rounded-full bg-gray-900 text-white text-xs font-extrabold disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] transition"
                        >
                          {isTransitioning ? copy.updating : slotMode === 'reschedule' ? bk.rescheduleSend : bk.slotConfirm}
                        </button>
                        <button
                          type="button"
                          onClick={closePanels}
                          className="min-h-11 px-4 py-2 rounded-full bg-white border border-gray-300 text-gray-700 text-xs font-extrabold hover:bg-gray-100 transition-colors"
                        >
                          {bk.slotCancel}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ---- The arrival code ---- */}
                  {otpJobId === job.id && (
                    <div id={`otp-panel-${job.id}`} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
                      <p className="text-xs font-extrabold text-gray-900">{bk.otpTitle}</p>
                      <p className="text-[11px] text-gray-500">{bk.otpHint}</p>
                      <label className="sr-only" htmlFor={`otp-${job.id}`}>{bk.otpTitle}</label>
                      <input
                        id={`otp-${job.id}`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={4}
                        value={otpValue}
                        onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder={bk.otpPlaceholder}
                        className="w-full h-14 rounded-xl border border-gray-300 px-3 text-center text-2xl font-black tracking-[0.5em] text-gray-900 bg-white"
                      />
                      <div className="flex gap-2">
                        <button
                          id={`otp-submit-${job.id}`}
                          type="button"
                          onClick={() => void submitOtp(job)}
                          disabled={!canAct || otpValue.length !== 4}
                          className="flex-1 min-h-11 px-4 py-2 rounded-full bg-gray-900 text-white text-xs font-extrabold disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] transition"
                        >
                          {isTransitioning ? copy.updating : bk.otpSubmit}
                        </button>
                        <button
                          type="button"
                          onClick={closePanels}
                          className="min-h-11 px-4 py-2 rounded-full bg-white border border-gray-300 text-gray-700 text-xs font-extrabold hover:bg-gray-100 transition-colors"
                        >
                          {bk.otpCancel}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ---- Confirmations. The late-cancel warning lands HERE, before the tap. ---- */}
                  {confirmJobId === job.id && (
                    <div
                      id={`confirm-panel-${job.id}`}
                      className={`rounded-2xl p-4 space-y-3 border ${
                        confirmKind === 'cancel' && cancelWouldBeLate
                          ? 'bg-red-50 border-red-300'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <p className={`text-xs font-extrabold ${confirmKind === 'cancel' && cancelWouldBeLate ? 'text-red-800' : 'text-gray-900'}`}>
                        {confirmKind === 'decline'
                          ? bk.declineConfirm
                          : cancelWouldBeLate
                            ? bk.lateCancelWarning
                            : bk.cancelConfirm}
                      </p>
                      <div className="flex gap-2">
                        <button
                          id={`confirm-yes-${job.id}`}
                          type="button"
                          onClick={async () => {
                            if (await advanceJob(job.id, 'CANCELLED')) closePanels();
                          }}
                          disabled={!canAct}
                          className="flex-1 min-h-11 px-4 py-2 rounded-full bg-red-600 text-white text-xs font-extrabold disabled:opacity-45 active:scale-[0.98] transition"
                        >
                          {isTransitioning
                            ? copy.updating
                            : confirmKind === 'decline'
                              ? bk.declineYes
                              : cancelWouldBeLate
                                ? bk.lateCancelConfirm
                                : bk.cancelCta}
                        </button>
                        <button
                          type="button"
                          onClick={closePanels}
                          className="min-h-11 px-4 py-2 rounded-full bg-white border border-gray-300 text-gray-700 text-xs font-extrabold hover:bg-gray-100 transition-colors"
                        >
                          {confirmKind === 'decline' ? bk.declineNo : bk.lateCancelKeep}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  {copy.lifecycle}: <span className="font-extrabold text-gray-800">{copy.state[job.status]}</span>
                  {booking && (
                    <>
                      {' · '}
                      <span id={`booking-state-${job.id}`} className="font-extrabold text-gray-600">
                        {bk.state[booking.status]}
                      </span>
                    </>
                  )}
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
                    {/*
                      DECLINE. Offered only when there is a booking, because it
                      is the booking that makes a prompt "no" worth something:
                      declining answers the response deadline and costs nothing,
                      while silence expires the request and counts against the
                      worker's response rate. Without a booking there is no
                      deadline to answer and this is just a cancel.
                    */}
                    {booking?.status === 'REQUESTED' && (
                      <button
                        id={`decline-${job.id}`}
                        type="button"
                        onClick={() => { setConfirmKind('decline'); setConfirmJobId(job.id); }}
                        disabled={!canAct}
                        className="inline-flex items-center justify-center min-h-10 px-4 py-2 rounded-full bg-white border border-gray-300 text-gray-700 text-xs font-extrabold disabled:opacity-45 hover:bg-gray-100 transition-colors"
                      >
                        {bk.declineCta}
                      </button>
                    )}
                  </div>
                ) : job.customerId && job.status === 'QUOTED' ? (
                  <p className="text-xs font-extrabold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
                    {copy.quotedAwaiting}
                    {typeof job.quotedPrice === 'number' && <> · ₹{job.quotedPrice}</>}
                  </p>
                ) : bookingIsTerminal ? (
                  /*
                    Nothing left to do. The notice above already says what
                    happened - expired, declined, cancelled, or never arrived -
                    and every edge the server would accept from here is closed,
                    so offering any button would be offering a 409.
                  */
                  null
                ) : booking && job.status === 'ACCEPTED' ? (
                  /*
                    THE COMMITMENT STEP. The price is agreed and the server now
                    REQUIRES slotStart and slotEnd on this edge - so the one-tap
                    "Schedule job" button is replaced by something that can
                    actually supply them. A bare advance here would be a
                    guaranteed slot_required 400.
                  */
                  <button
                    id={`pick-time-${job.id}`}
                    type="button"
                    onClick={() => { setSlotMode('commit'); setSlotJobId(job.id); setSlotWindow(null); setSlotDate(''); }}
                    disabled={!canAct}
                    className="inline-flex items-center justify-center gap-1.5 min-h-10 px-4 py-2 rounded-full bg-gray-900 text-white text-xs font-extrabold disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] transition"
                    title={!onTransitionJob ? copy.apiOnly : syncState !== 'synced' ? copy.waitForSync : undefined}
                  >
                    <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                    {bk.scheduleCta}
                  </button>
                ) : booking && job.status === 'SCHEDULED' ? (
                  /*
                    THE ARRIVAL STEP, in both COMMITTED and LATE - a late worker
                    can still check in, and §1 keeps that door open deliberately.
                    The server requires the customer's 4-digit code on this edge,
                    so again the one-tap "Start work" is replaced rather than
                    left to fail.
                  */
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      id={`arrived-${job.id}`}
                      type="button"
                      onClick={() => { setOtpJobId(job.id); setOtpValue(''); }}
                      disabled={!canAct}
                      className={`inline-flex items-center justify-center gap-1.5 min-h-10 px-4 py-2 rounded-full text-white text-xs font-extrabold disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.98] transition ${
                        booking.status === 'LATE' ? 'bg-red-600' : 'bg-gray-900'
                      }`}
                      title={!onTransitionJob ? copy.apiOnly : syncState !== 'synced' ? copy.waitForSync : undefined}
                    >
                      <CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      {bk.arrivedCta}
                    </button>

                    {/* Absent, not disabled, when any of the three rules forbids it. */}
                    {canReschedule && (
                      <button
                        id={`reschedule-${job.id}`}
                        type="button"
                        onClick={() => { setSlotMode('reschedule'); setSlotJobId(job.id); setSlotWindow(null); setSlotDate(''); setRescheduleReason(''); }}
                        disabled={!canAct}
                        className="inline-flex items-center justify-center min-h-10 px-4 py-2 rounded-full bg-white border border-gray-300 text-gray-700 text-xs font-extrabold disabled:opacity-45 hover:bg-gray-100 transition-colors"
                      >
                        {bk.rescheduleCta}
                      </button>
                    )}

                    <button
                      id={`cancel-${job.id}`}
                      type="button"
                      onClick={() => { setConfirmKind('cancel'); setConfirmJobId(job.id); }}
                      disabled={!canAct}
                      className="inline-flex items-center justify-center min-h-10 px-4 py-2 rounded-full bg-white border border-gray-300 text-gray-700 text-xs font-extrabold disabled:opacity-45 hover:bg-gray-100 transition-colors"
                    >
                      {bk.cancelCta}
                    </button>
                  </div>
                ) : job.customerId && job.status === 'COMPLETED' ? (
                  /*
                    The same shape one step later, and it was missing until the
                    worker rehearsal went looking. COMPLETED is the worker's
                    CLAIM; SETTLED and DISPUTED are the customer's answer, and
                    the transition route refuses both for a customer-linked job.
                    Without this branch the screen fell through to the one-tap
                    control below and offered "Mark payment received" - a button
                    whose only possible outcome was a 403, on the one screen a
                    worker is most likely to be looking at money on.
                  */
                  <p className="text-xs font-extrabold text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-3 py-1.5">
                    {copy.completedAwaiting}
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
