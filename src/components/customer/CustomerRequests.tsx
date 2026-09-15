import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, IndianRupee, Calendar, RefreshCw, ChevronDown, ChevronUp, Check, Phone } from 'lucide-react';
import { api, ApiError, type CustomerJobItem } from '../../lib/api';
import { useAuth } from '../../auth/AuthProvider';
import { JOB_BADGE, type JobState, type SupportedLanguage } from '../../types';
import { JOB_BADGE_PRESENTATION } from '../JobsView';
import { getScreenCopy } from '../../data/uiCopy';
import { getCustomerCopy, getCustomerTrade } from './customerCopy';
import { LiveToggle } from '../LiveToggle';
import { useLivePolling } from '../../hooks/useLivePolling';

/** Which control on a row is mid-flight. One row, one action at a time. */
type PendingAction = 'accept' | 'decline' | 'cancel' | 'confirm' | 'dispute' | 'counter';

/**
 * Mirrors CUSTOMER_CANCELLABLE in server/routes/customer.ts, which is the
 * authority - this list only decides whether to DRAW the button.
 *
 * Deliberately not derived from JOB_TRANSITIONS: the table permits CANCELLED
 * from SCHEDULED and IN_PROGRESS too, and the customer's narrower rule is a
 * product decision the server owns. If the two ever drift, the server refuses
 * with a 409 that `act` already surfaces and reloads behind - the failure mode
 * is an honest error, not a bad write.
 */
const CUSTOMER_CANCELLABLE: JobState[] = ['REQUESTED', 'QUOTED', 'ACCEPTED'];

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
 * Refresh is a button FIRST and a poll only on request. The demo has the
 * kaarigar accepting on a second device, and an interval that happened to fire
 * at the right moment would make it impossible to tell a working end-to-end
 * loop from a lucky one - so live updates stay off until somebody switches them
 * on, and the button never goes away. Pressing it proves the loop; the toggle
 * then shows the same loop running unattended, which is a second demonstration
 * rather than a replacement for the first.
 */
export const CustomerRequests: React.FC<CustomerRequestsProps> = ({ currentLanguage }) => {
  const [jobs, setJobs] = useState<CustomerJobItem[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<{ id: string; action: PendingAction } | null>(null);
  const [openTimelineId, setOpenTimelineId] = useState<string | null>(null);
  // Which row has its counter-offer form open, and what is typed in it. One at
  // a time: the form is a disclosure on a single quote, not a per-row draft
  // worth preserving while the customer looks at another request.
  const [counteringId, setCounteringId] = useState<string | null>(null);
  const [counterDraft, setCounterDraft] = useState('');

  const { user } = useAuth();
  const stateLabel = getScreenCopy(currentLanguage).jobs.state;
  const copy = getCustomerCopy(currentLanguage);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setJobs(await api.listCustomerJobs());
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setError(copy.requestList.loadError);
    } finally {
      setRefreshing(false);
    }
  }, [copy.requestList.loadError]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Paused while the customer is mid-action: a poll landing during a counter
   * they are typing, or between pressing Accept and the server answering, would
   * replace the row underneath them. The toggle stays on throughout - this only
   * skips ticks, so polling resumes by itself the moment they are done.
   */
  const live = useLivePolling({
    onTick: load,
    paused: pending !== null || counteringId !== null,
    storageKey: 'kaarigar_live_customer_requests',
  });

  /**
   * Every answer a customer can give, all through one path: accept, decline or
   * counter a quote; confirm or dispute a completion claim; cancel outright.
   *
   * ONLY ONE OF THEM SENDS A PRICE, and it is the one that agrees to nothing.
   * Accept copies the stored quotedPrice server-side, decline clears it, cancel
   * ends the job, confirm and dispute answer a completion claim - none of those
   * carry a number. Counter does, and may: counterPrice is a PROPOSAL. It binds
   * nobody until the kaarigar re-quotes at some figure of their own and the
   * customer accepts THAT, which is the only path to agreedPrice.
   *
   * Keeping them in one helper is what makes that asymmetry visible at a glance
   * instead of spread over six near-identical functions that could quietly
   * drift apart - and it is why `price` is a parameter here rather than
   * something each branch reaches for on its own.
   *
   * The returned job replaces the row in place rather than triggering a reload:
   * the response IS the authoritative job, and re-listing would show the same
   * thing one round trip later.
   *
   * A server-side refusal (409 on a job that moved on) is shown as its own
   * message and followed by a reload, because at that point the row on screen
   * is known to be stale and the error is about a job the customer can no
   * longer see correctly.
   */
  const act = async (jobId: string, action: PendingAction, price?: number) => {
    setPending({ id: jobId, action });
    setError('');
    try {
      const updated = action === 'counter'
        ? await api.counterQuote(jobId, price!)
        : await {
            accept: api.acceptQuote,
            decline: api.declineQuote,
            cancel: api.cancelRequest,
            confirm: api.confirmCompletion,
            dispute: api.disputeCompletion,
          }[action](jobId);
      setJobs((prev) => (prev ?? []).map((j) => (j.id === updated.id ? updated : j)));
      setCounteringId(null);
      setCounterDraft('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      /**
       * 409 covers both a job that moved on and counter_limit_reached. In both
       * cases the server's own message is the useful one and the row on screen
       * is stale, so it is shown verbatim and the list reloaded. The counter
       * form closes too: whatever the customer was about to send, the state it
       * was aimed at no longer holds.
       */
      if (e instanceof ApiError && e.status === 409) {
        setError(e.message);
        setCounteringId(null);
        setCounterDraft('');
        void load();
        return;
      }
      setError({
        accept: copy.requestList.acceptError,
        decline: copy.requestList.declineError,
        cancel: copy.requestList.cancelError,
        confirm: copy.requestList.confirmError,
        dispute: copy.requestList.disputeError,
        counter: copy.requestList.counterError,
      }[action]);
    } finally {
      setPending(null);
    }
  };

  /**
   * Validated here as well as on the server, because the two checks answer
   * different questions. This one stops a customer sending an empty or
   * nonsensical box and waiting for a round trip to be told; the server's is
   * the one that actually governs what gets written.
   */
  const submitCounter = async (jobId: string) => {
    const price = Number(counterDraft);
    if (!counterDraft.trim() || !Number.isFinite(price) || price <= 0) {
      setError(copy.requestList.counterInvalid);
      return;
    }
    await act(jobId, 'counter', price);
  };

  /**
   * Cancel is the only one that asks first. Accept and decline both leave the
   * job alive and reversible by the other side; cancel is terminal - CANCELLED
   * lists no onward transition - so a misplaced tap cannot be undone from here.
   */
  const confirmCancel = (jobId: string) => {
    if (!window.confirm(copy.requestList.cancelConfirm)) return;
    void act(jobId, 'cancel');
  };

  /**
   * Disputing asks first for the same reason cancelling does, though not
   * because it is terminal - DISPUTED goes back to IN_PROGRESS. It asks because
   * it tells another person their work was not good enough, and that is not
   * something to do by mis-tapping a button next to "Yes, it is done".
   */
  const confirmDispute = (jobId: string) => {
    if (!window.confirm(copy.requestList.disputeConfirm)) return;
    void act(jobId, 'dispute');
  };

  if (jobs === null && !error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <div className="w-10 h-10 rounded-2xl bg-orange-500 animate-pulse" />
        <p className="text-sm font-bold text-gray-500">{copy.requestList.loading}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-extrabold text-gray-500">
          {copy.requestList.count(jobs?.length ?? 0)}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="h-10 px-3 rounded-xl border border-gray-200 bg-white text-gray-600 font-bold text-sm flex items-center gap-1.5 active:scale-[0.98] transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {copy.requestList.refresh}
        </button>
        <LiveToggle
          enabled={live.enabled}
          onToggle={live.toggle}
          label={copy.requestList.live}
          title={live.enabled ? copy.requestList.liveOn : copy.requestList.liveOff}
        />
      </div>

      {error && (
        <p className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-2xl px-3 py-2.5">
          {error}
        </p>
      )}

      {jobs?.length === 0 && (
        <div className="bg-white rounded-3xl border border-gray-200 p-6 text-center space-y-3">
          <p className="text-sm font-bold text-gray-500">{copy.requestList.empty}</p>
          <Link
            to="/customer"
            className="inline-flex h-12 px-5 items-center rounded-2xl bg-orange-500 text-white font-extrabold"
          >
            {copy.requestList.find}
          </Link>
        </div>
      )}

      {jobs?.map((job) => (
        <div key={job.id} id={`job-${job.id}`} className="bg-white rounded-3xl border border-gray-200 p-4">
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

          {/*
            Who this request went to. The phone arrives only once the job is
            ACCEPTED or later - see CONTACT_VISIBLE_STATES on the server - so
            the call link is driven by the field being present rather than by
            the client re-deciding the rule.
          */}
          {job.kaarigar && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-extrabold text-gray-700">{job.kaarigar.name}</span>
              {job.kaarigar.trade && (
                <span className="text-xs font-semibold text-gray-400">{getCustomerTrade(currentLanguage, job.kaarigar.trade)}</span>
              )}
              {job.kaarigar.phone && (
                <a
                  href={`tel:${job.kaarigar.phone}`}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-700 active:scale-[0.98] transition"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {copy.requestList.call}
                </a>
              )}
            </div>
          )}

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
                {copy.requestList.quote} <span className="font-extrabold">₹{job.quotedPrice}</span>
              </p>
              <button
                type="button"
                onClick={() => void act(job.id, 'accept')}
                disabled={pending?.id === job.id}
                className="w-full min-h-12 rounded-2xl bg-orange-500 text-white font-extrabold disabled:opacity-50 active:scale-[0.98] transition"
              >
                {pending?.id === job.id && pending.action === 'accept' ? copy.requestList.accepting : copy.requestList.accept}
              </button>
              {/*
                Decline sits under Accept and is deliberately quieter: it is the
                secondary answer, and it does not end the job - the request goes
                back to REQUESTED and the kaarigar can quote again.
              */}
              <button
                type="button"
                onClick={() => void act(job.id, 'decline')}
                disabled={pending?.id === job.id}
                className="w-full min-h-12 rounded-2xl border border-amber-300 bg-white text-amber-900 font-extrabold disabled:opacity-50 active:scale-[0.98] transition"
              >
                {pending?.id === job.id && pending.action === 'decline' ? copy.requestList.declining : copy.requestList.decline}
              </button>

              {/*
                Countering is a third answer, folded behind a disclosure rather
                than shown as a third button. Accept and decline are one tap
                each; naming a figure needs an input, and three equal-weight
                controls would bury the two that end the exchange.
              */}
              {counteringId === job.id ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); void submitCounter(job.id); }}
                  className="flex items-center gap-2 pt-1"
                >
                  <label className="sr-only" htmlFor={`counter-${job.id}`}>{copy.requestList.counterLabel}</label>
                  <input
                    id={`counter-${job.id}`}
                    type="number"
                    inputMode="numeric"
                    min="1"
                    autoFocus
                    value={counterDraft}
                    onChange={(e) => setCounterDraft(e.target.value)}
                    placeholder={copy.requestList.counterPlaceholder}
                    disabled={pending?.id === job.id}
                    className="h-12 w-28 rounded-2xl border border-amber-300 px-3 text-sm font-bold text-gray-900 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={pending?.id === job.id}
                    className="flex-1 min-h-12 rounded-2xl bg-amber-600 text-white font-extrabold disabled:opacity-50 active:scale-[0.98] transition"
                  >
                    {pending?.id === job.id && pending.action === 'counter' ? copy.requestList.countering : copy.requestList.counterSend}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCounteringId(null); setCounterDraft(''); }}
                    className="min-h-12 px-3 rounded-2xl text-amber-900 font-bold text-xs"
                  >
                    {copy.requestList.counterCancel}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => { setCounteringId(job.id); setCounterDraft(''); setError(''); }}
                  disabled={pending?.id === job.id}
                  className="w-full min-h-12 rounded-2xl text-amber-900 font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition"
                >
                  {copy.requestList.counter}
                </button>
              )}
            </div>
          )}

          {/*
            A REQUESTED job carrying counterPrice is one the customer sent back
            with a figure. The kaarigar has not answered yet - taking QUOTED is
            what clears it - so this is the customer's own ask still standing.
            Checked before the plain declined-notice below, which would
            otherwise claim the weaker thing about the same row.
          */}
          {job.status === 'REQUESTED' && typeof job.counterPrice === 'number' && (
            <p className="mt-3 text-sm font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
              {copy.requestList.countered(job.counterPrice)}
            </p>
          )}

          {/*
            The kaarigar's completion claim, and the customer's answer to it.
            Deliberately worded as a claim - "the kaarigar says this work is
            done" - because until one of these buttons is pressed that is
            exactly what it is, and the job's own badge already reads
            "completed" either way.
          */}
          {job.status === 'COMPLETED' && (
            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 space-y-2">
              <p className="text-sm font-bold text-sky-900">{copy.requestList.done}</p>
              <button
                type="button"
                onClick={() => void act(job.id, 'confirm')}
                disabled={pending?.id === job.id}
                className="w-full min-h-12 rounded-2xl bg-orange-500 text-white font-extrabold disabled:opacity-50 active:scale-[0.98] transition"
              >
                {pending?.id === job.id && pending.action === 'confirm' ? copy.requestList.confirming : copy.requestList.confirm}
              </button>
              <button
                type="button"
                onClick={() => confirmDispute(job.id)}
                disabled={pending?.id === job.id}
                className="w-full min-h-12 rounded-2xl border border-sky-300 bg-white text-sky-900 font-extrabold disabled:opacity-50 active:scale-[0.98] transition"
              >
                {pending?.id === job.id && pending.action === 'dispute' ? copy.requestList.disputing : copy.requestList.dispute}
              </button>
            </div>
          )}

          {job.status === 'DISPUTED' && (
            <p className="mt-3 text-sm font-bold text-sky-900 bg-sky-50 border border-sky-200 rounded-2xl px-3 py-2">
              {copy.requestList.disputed}
            </p>
          )}

          {/*
            A request that has been quoted at least once and is back at
            REQUESTED was declined. stateHistory is the only way to tell that
            apart from a brand-new request, since decline clears quotedPrice.
          */}
          {job.status === 'REQUESTED' && typeof job.counterPrice !== 'number' && job.stateHistory?.some((t) => t.state === 'QUOTED') && (
            <p className="mt-3 text-sm font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-2xl px-3 py-2">
              {copy.requestList.declined}
            </p>
          )}

          {/* Once agreed, the figure is shown as settled fact, with no control. */}
          {typeof job.agreedPrice === 'number' && job.status !== 'QUOTED' && (
            <p className="mt-3 text-sm font-bold text-green-800 bg-green-50 border border-green-200 rounded-2xl px-3 py-2">
              {copy.requestList.agreed} <span className="font-extrabold">₹{job.agreedPrice}</span>
            </p>
          )}

          <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setOpenTimelineId((prev) => (prev === job.id ? null : job.id))}
              aria-expanded={openTimelineId === job.id}
              className="h-10 px-3 rounded-xl text-gray-600 font-bold text-xs flex items-center gap-1.5 active:scale-[0.98] transition"
            >
              {openTimelineId === job.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {openTimelineId === job.id ? copy.requestList.timelineHide : copy.requestList.timelineShow}
            </button>

            {/*
              Cancel is offered only for the states the server actually accepts
              it from. Past ACCEPTED the kaarigar has committed time, the route
              answers 409, and a button here would only produce that error - so
              the control is absent rather than disabled-with-an-explanation.
            */}
            {CUSTOMER_CANCELLABLE.includes(job.status) && (
              <button
                type="button"
                onClick={() => confirmCancel(job.id)}
                disabled={pending?.id === job.id}
                className="ml-auto h-10 px-3 rounded-xl border border-gray-200 bg-white text-red-700 font-bold text-xs disabled:opacity-50 active:scale-[0.98] transition"
              >
                {pending?.id === job.id && pending.action === 'cancel' ? copy.requestList.cancelling : copy.requestList.cancel}
              </button>
            )}
          </div>

          {/*
            The timeline is stateHistory rendered straight, oldest first. It is
            the customer's evidence of who moved the job and when - `by` is a
            uid, so the only thing worth saying about it is whether it was them
            or the kaarigar, which is exactly what makes ACCEPTED different from
            a state the worker asserted alone.
          */}
          {openTimelineId === job.id && (
            <ol className="mt-1 space-y-1.5">
              {(job.stateHistory ?? []).map((t, i) => (
                <li key={`${t.state}-${t.at}-${i}`} className="flex items-start gap-2 text-xs">
                  <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                  <span className="font-extrabold text-gray-700">{stateLabel[t.state]}</span>
                  <span className="text-gray-400 font-semibold">
                    {new Date(t.at).toLocaleString()} · {copy.requestList.timelineBy(t.by === user?.uid)}
                  </span>
                </li>
              ))}
              {(job.stateHistory ?? []).length === 0 && (
                <li className="text-xs text-gray-400 font-semibold">—</li>
              )}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
};
