/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { HomeDashboard } from './components/HomeDashboard';
import { DigitalPassport } from './components/DigitalPassport';
import { JobsView } from './components/JobsView';
import { KamaiView } from './components/KamaiView';
import { ProfileView } from './components/ProfileView';
import { QuoteBuilder } from './components/QuoteBuilder';
import { VoiceAssistantModal } from './components/VoiceAssistantModal';
import { LanguageSelectorModal } from './components/LanguageSelectorModal';
import { LoginScreen } from './components/LoginScreen';
import { useAuth } from './auth/AuthProvider';
import { api, ApiError, type TransitionOptions } from './lib/api';
import { useApiForDomain, anyDomainOnApi } from './lib/dataSource';
import { installAudioUnlock } from './utils/audioUnlock';
import { enqueue } from './lib/outbox';
import { mergeServerJobs } from './lib/mergeServerJobs';
import { uuidv7 } from './lib/ids';
import { useOutbox } from './hooks/useOutbox';
import { SyncSummary } from './components/SyncBadge';
import { todayIso } from './utils/date';

import {
  Booking,
  WorkerProfile,
  JobItem,
  KamaiEntry,
  JobState,
  SupportedLanguage,
  AssistantContext,
} from './types';
import {
  INITIAL_PROFILE,
  INITIAL_JOBS,
  INITIAL_KAMAI,
  addRameshPassportSkills,
} from './data/initialData';
import { isLanguageSelectable } from './data/translations';

export default function App() {
  const navigate = useNavigate();
  const { status } = useAuth();
  const outbox = useOutbox();

  /**
   * Tab ids are route paths now. Kept as a helper so child components can go on
   * passing 'passport' / 'kamai' rather than each learning the URL scheme.
   */
  const goToTab = (tab: string) => navigate(tab === 'home' ? '/' : `/${tab}`);

  // State: Language (Default Hindi)
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(
    () => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('kaarigar_lang');
        if (saved && isLanguageSelectable(saved as SupportedLanguage)) {
          return saved as SupportedLanguage;
        }
      }
      return 'hi';
    }
  );

  /**
   * localStorage keys carry a _v2 suffix because the types.ts freeze added
   * required fields and changed JobItem.status casing. Data written by an
   * earlier build would deserialise into an object that type-checks at compile
   * time and renders wrong at runtime - the worst failure shape. Bumping the
   * key retires it instead of migrating it; nothing here is a system of record
   * yet, and Mongo takes over on Day 3.
   */
  // State: Worker Profile
  const [profile, setProfile] = useState<WorkerProfile>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kaarigar_profile_v2');
      if (saved) {
        try {
          return addRameshPassportSkills(JSON.parse(saved));
        } catch {
          // ignore
        }
      }
    }
    return addRameshPassportSkills(INITIAL_PROFILE);
  });

  /**
   * Bless the shared <audio> element on the first tap anywhere in the app.
   *
   * HERE, at app mount, and not when the voice modal opens. On iOS the unlock
   * play() has to run inside a gesture's own call stack; by the time the modal
   * has mounted, the tap that opened it is already spent, the element is never
   * blessed, and every later play() rejects silently. The symptom is that
   * Punjabi simply never speaks on that device, with nothing in the console.
   *
   * Desktop browsers do not enforce this at all, so a regression here cannot
   * be caught by "npm run dev" - only on a real phone.
   */
  useEffect(() => installAudioUnlock(), []);

  // Older local demo sessions may have been saved before the electrician skill
  // catalogue was added. Enrich only the seeded Ramesh profile, preserving any
  // unrelated worker's actual declared skills.
  useEffect(() => {
    setProfile((current) => addRameshPassportSkills(current));
  }, []);

  // State: Jobs List
  const [jobs, setJobs] = useState<JobItem[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kaarigar_jobs_v2');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // ignore
        }
      }
    }
    return INITIAL_JOBS;
  });

  // State: Kamai List
  const [kamaiList, setKamaiList] = useState<KamaiEntry[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kaarigar_kamai_v2');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // ignore
        }
      }
    }
    return INITIAL_KAMAI;
  });

  // State: Modals
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [voiceContext, setVoiceContext] =
    useState<AssistantContext>('onboarding');
  const [isLangModalOpen, setIsLangModalOpen] = useState<boolean>(false);

  /**
   * USE_API wiring.
   *
   * Which domains are API-backed is fixed at BUILD time (Vite inlines the
   * flag), so these are read once into consts rather than state - they cannot
   * change while the app is running, and treating them as if they could would
   * invite an effect that re-runs and re-fetches for no reason.
   */
  const profileOnApi = useApiForDomain('profile');
  const jobsOnApi = useApiForDomain('jobs');
  const kamaiOnApi = useApiForDomain('kamai');

  /**
   * 'loading' until the first load settles.
   *
   * This is the whole reason the state exists. Rendering the localStorage seed
   * while a fetch is in flight shows a worker a plausible dashboard that is not
   * their data, and they cannot tell. An empty ledger and an unloaded ledger
   * look identical on screen and mean opposite things.
   */
  /**
   * The appointment behind each job, keyed by JOB id rather than booking id.
   *
   * Keyed that way because every consumer starts from a job: JobsView renders a
   * job card and needs to know whether it carries a commitment. A booking-id map
   * would make every card do its own lookup.
   *
   * EMPTY IS THE NORMAL LEGACY STATE, not a failure. It is empty when
   * BOOKINGS_ENABLED is off (the route 404s and the client reads that as "no
   * appointments"), and a job is simply absent from it when it has no booking -
   * a worker's own job, or anything created before the flag went on. Those keep
   * the one-tap path, so nothing here may treat a miss as an error.
   */
  const [bookingsByJob, setBookingsByJob] = useState<Record<string, Booking>>({});
  const [dataStatus, setDataStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    anyDomainOnApi() ? 'loading' : 'idle'
  );
  const [dataError, setDataError] = useState('');

  useEffect(() => {
    if (status !== 'authenticated' || !anyDomainOnApi()) return;

    let cancelled = false;
    setDataStatus('loading');
    setDataError('');

    (async () => {
      try {
        /**
         * A first-time worker has no server passport until getProfile() creates
         * it. The ledger endpoint correctly rejects reads without that owner
         * profile, so starting all three requests together made first sign-in
         * race: the ledger could win and turn a healthy onboarding into an
         * error screen. Create/read the profile first, then keep the independent
         * jobs and ledger reads parallel for the remaining two network trips.
         */
        const p = profileOnApi ? await api.getProfile() : null;
        const [j, k, b] = await Promise.all([
          jobsOnApi ? api.listJobs() : Promise.resolve(null),
          kamaiOnApi ? api.listEntries() : Promise.resolve(null),
          // Never fatal. listBookingsByJob swallows the 404 the route returns
          // when the feature is off; anything else degrades to the legacy path
          // rather than failing a load that otherwise succeeded.
          jobsOnApi ? api.listBookingsByJob().catch(() => ({})) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (p) setProfile(p);
        if (b) setBookingsByJob(b);
        // Merged for the same reason refreshJobs merges: a job queued in the
        // outbox is not on the server yet, and a restored session that replaced
        // the list would blank it until the next flush.
        if (j) setJobs((prev) => mergeServerJobs(j, prev, outbox.stateOf));
        if (k) setKamaiList(k);
        setDataStatus('ready');
      } catch (e) {
        if (cancelled) return;
        // A 401 has already triggered sign-out inside the API client; there is
        // no error worth showing for it because the login screen is about to
        // replace this one.
        if (e instanceof ApiError && e.status === 401) return;
        setDataError(e instanceof Error ? e.message : 'Could not load your data.');
        setDataStatus('error');
      }
    })();

    return () => { cancelled = true; };
  }, [status, profileOnApi, jobsOnApi, kamaiOnApi]);

  // Sync to LocalStorage
  useEffect(() => {
    localStorage.setItem('kaarigar_lang', currentLanguage);
  }, [currentLanguage]);

  const handleLanguageChange = (language: SupportedLanguage) => {
    if (isLanguageSelectable(language)) setCurrentLanguage(language);
  };

  /**
   * localStorage stops being written for a domain the moment it is API-backed.
   *
   * Keeping both would leave a stale shadow copy that silently becomes the
   * source of truth again if the flag is ever turned off, and "the app showed
   * me last week's earnings" is indistinguishable from data loss to the person
   * it happens to. One source at a time, deliberately.
   */
  useEffect(() => {
    if (profileOnApi) return;
    localStorage.setItem('kaarigar_profile_v2', JSON.stringify(profile));
  }, [profile, profileOnApi]);

  useEffect(() => {
    if (jobsOnApi) return;
    localStorage.setItem('kaarigar_jobs_v2', JSON.stringify(jobs));
  }, [jobs, jobsOnApi]);

  useEffect(() => {
    if (kamaiOnApi) return;
    localStorage.setItem('kaarigar_kamai_v2', JSON.stringify(kamaiList));
  }, [kamaiList, kamaiOnApi]);

  // Handlers for Voice Assistant
  const handleOpenVoiceAssistant = (
    context: AssistantContext = 'onboarding'
  ) => {
    setVoiceContext(context);
    setIsVoiceModalOpen(true);
  };

  /**
   * Optimistic local update, then write through.
   *
   * The UI must never block on the network for a local action (section 9.1), so
   * state moves first and the request follows. On failure the previous value is
   * restored and the error is surfaced - silently keeping a change the server
   * rejected is how a screen ends up disagreeing with the database.
   *
   * These are not the offline outbox. A failed write here is reported and
   * rolled back, not queued; queueing is Track B's next piece of work and needs
   * the pending/synced/failed badges to be honest about what it is doing.
   */
  const handleSaveProfile = (updatedProfile: WorkerProfile) => {
    const previous = profile;
    // Verification is server-derived evidence, never a side effect of the
    // voice onboarding confirmation. Older clients may still send
    // verifiedStatus: "verified" here, so clamp that attempted elevation at
    // the shared write boundary before it can reach local state or the API.
    const safeProfile =
      profile.verifiedStatus !== 'verified' && updatedProfile.verifiedStatus === 'verified'
        ? { ...updatedProfile, verifiedStatus: profile.verifiedStatus }
        : updatedProfile;
    setProfile(safeProfile);
    if (!profileOnApi) return;

    void (async () => {
      try {
        // Only the server's patchable fields are sent; rating, totalJobsCount
        // and verifiedStatus are derived from verified events and a PATCH that
        // moved them would make the passport worthless as evidence.
        setProfile(await api.patchProfile(safeProfile));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
        setProfile(previous);
        setDataError(e instanceof Error ? e.message : 'Could not save your profile.');
      }
    })();
  };

  /**
   * Re-read the worker's jobs from the server.
   *
   * MERGED, NOT REPLACED - see mergeServerJobs. A job recorded offline lives in
   * this state and in the outbox, not in the database, so overwriting the list
   * with the server's answer would take it off the screen while it was still
   * queued. The mount-time load above has the same shape and the same reason;
   * this is the version that runs repeatedly once live updates are on.
   *
   * Returns nothing and throws nothing: the poller treats a failed tick as a
   * tick that did not happen, and the next one tries again.
   */
  const refreshJobs = useCallback(async () => {
    if (!jobsOnApi) return;
    /**
     * Both lists in one tick. A poll that refreshed jobs without their bookings
     * would show a SCHEDULED job whose countdown and arrival code came from the
     * previous minute - and the server applies overdue rules on the jobs read
     * itself, so the two answers are generated against the same clock and must
     * be adopted together.
     *
     * Jobs are still MERGED, never replaced (see mergeServerJobs). Bookings are
     * replaced outright: unlike a job, a booking only ever exists server-side -
     * there is no offline booking in the outbox that a replace could discard.
     */
    const [server, bookings] = await Promise.all([
      api.listJobs(),
      api.listBookingsByJob().catch(() => ({})),
    ]);
    setJobs((prev) => mergeServerJobs(server, prev, outbox.stateOf));
    setBookingsByJob(bookings);
  }, [jobsOnApi, outbox.stateOf]);

  const handleSaveJob = (newJob: JobItem) => {
    setJobs((prev) => [newJob, ...prev]);

    /**
     * QUEUED, NOT POSTED. Section 9.1: job entry succeeds locally and must not
     * block on the network.
     *
     * This replaces an optimistic post that ROLLED BACK on failure. That was
     * correct online and wrong offline - it deleted a job the worker had just
     * recorded because the network happened to be absent, which is precisely
     * what a money record must never do. Nothing is removed now; the item sits
     * in the outbox with a visible badge until the server confirms it.
     *
     * Income is deliberately NOT created here. A new job starts at REQUESTED;
     * money is logged separately after completion, so neither work history nor
     * earnings can be manufactured by the creation action.
     */
    if (jobsOnApi) enqueue('job', newJob);
  };

  /**
   * State changes are never simulated locally. The server validates each edge
   * against JOB_TRANSITIONS and returns the authoritative updated history.
   */
  const handleTransitionJob = async (
    jobId: string,
    state: JobState,
    options: TransitionOptions = {}
  ): Promise<void> => {
    if (!jobsOnApi) {
      throw new Error('Job lifecycle controls require API demo mode.');
    }

    setDataError('');
    try {
      const updated = await api.transitionJob(jobId, state, options);
      setJobs((prev) => prev.map((job) => (job.id === updated.id ? updated : job)));

      /**
       * Re-read the appointment after every transition, because most of them
       * move it: quoting answers the response deadline, scheduling mints the
       * arrival code and starts the lateness clock, checking in closes it. The
       * job's own response says nothing about any of that, so a screen left
       * with the previous booking would offer the button for the step just
       * taken.
       */
      setBookingsByJob(await api.listBookingsByJob().catch(() => ({})));

      // Completed-work evidence affects the server-derived trust breakdown.
      // Refresh it after the authoritative transition so the passport does not
      // retain a stale score for the rest of the session.
      if (profileOnApi) {
        try {
          setProfile(await api.getProfile());
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) {
            setDataError(e instanceof Error ? e.message : 'Could not refresh the trust score.');
          }
        }
      }
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        setDataError(e instanceof Error ? e.message : 'Could not update the job.');
      }
      throw e;
    }
  };

  /**
   * Propose a new slot for a job already committed to one.
   *
   * Goes to the BOOKING, not the job: the job is still SCHEDULED throughout and
   * nothing about the price changes. The customer has to accept the new time
   * before it takes effect, so this only ever sets a pending proposal.
   */
  const handleRescheduleBooking = async (
    bookingId: string,
    slotStart: string,
    slotEnd: string,
    reason?: string
  ): Promise<void> => {
    setDataError('');
    try {
      await api.rescheduleBooking(bookingId, slotStart, slotEnd, reason);
      setBookingsByJob(await api.listBookingsByJob().catch(() => ({})));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) {
        setDataError(e instanceof Error ? e.message : 'Could not ask for a new time.');
      }
      throw e;
    }
  };

  const handleSaveKamai = (newEntries: KamaiEntry[]) => {
    setKamaiList((prev) => [...newEntries, ...prev]);
    if (!kamaiOnApi) return;

    // Queued in order. The ledger is append-only, and the outbox preserves the
    // order entries were created in rather than racing them.
    for (const entry of newEntries) enqueue('ledger_entry', entry);
  };

  const handleAddKamaiManual = (input: {
    amount: number;
    description: string;
    paymentType: 'cash' | 'upi';
  }) => {
    handleSaveKamai([{
      id: uuidv7(),
      profileId: profile.id,
      direction: 'in',
      syncState: 'pending',
      date: todayIso(),
      amount: input.amount,
      description: input.description,
      paymentType: input.paymentType,
    }]);
  };

  const handleDownloadIncomeStatement = () => {
    void (async () => {
      try {
        const blob = await api.downloadIncomeStatement(6);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'kaarigar-income-statement-6m.pdf';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
        setDataError(e instanceof Error ? e.message : 'Could not download the income statement.');
      }
    })();
  };

  /**
   * The auth gate.
   *
   * Placed here, after every hook above, because hook order must not change
   * between renders - returning early before them would break the rules of
   * hooks the moment `status` flips. The cost is that the app's state
   * initialisers run for a signed-out visitor too; they read localStorage and
   * nothing else, so that is free.
   *
   * 'loading' renders nothing rather than the login screen. A signed-in worker
   * reopening the app would otherwise see a flash of the login form before the
   * stored session is restored, which reads as "it logged me out" - the exact
   * impression a financial record must never give.
   */
  if (status === 'loading') {
    return <div className="min-h-screen bg-[#F3F4F6]" />;
  }

  if (status === 'unauthenticated') {
    return (
      <>
        <LoginScreen
          currentLanguage={currentLanguage}
          onChangeLanguage={() => setIsLangModalOpen(true)}
        />
        <LanguageSelectorModal
          isOpen={isLangModalOpen}
          onClose={() => setIsLangModalOpen(false)}
          currentLanguage={currentLanguage}
          onSelectLanguage={handleLanguageChange}
        />
      </>
    );
  }

  /**
   * Do not render screens over data that has not arrived.
   *
   * An empty ledger and an unloaded ledger are pixel-identical and mean
   * opposite things. Showing the second as the first tells a worker their
   * earnings are gone.
   */
  if (dataStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-orange-500 animate-pulse" />
        <p className="text-sm font-bold text-gray-500">लोड हो रहा है…</p>
      </div>
    );
  }

  if (dataStatus === 'error') {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center px-6 text-center">
        <div className="bg-white rounded-3xl border border-gray-200 p-7 max-w-sm">
          <p className="text-base font-extrabold text-gray-900 mb-1.5">आपका डेटा नहीं आ सका</p>
          <p className="text-sm text-gray-500 mb-5">{dataError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full h-14 rounded-2xl bg-orange-500 text-white font-extrabold active:scale-[0.98] transition"
          >
            दोबारा कोशिश करें
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-gray-900 flex flex-col font-sans antialiased selection:bg-orange-200">
      {/* Navbar & Top Bar */}
      <Navbar
        currentLanguage={currentLanguage}
        onChangeLanguage={() => setIsLangModalOpen(true)}
        onOpenVoiceAssistant={() => handleOpenVoiceAssistant('onboarding')}
      />

      {/* Main App Content View Area */}
      {/* Section 9.1: the queue must be VISIBLE. Renders nothing when there is
          nothing outstanding, so it stays meaningful rather than becoming
          furniture the worker stops reading. */}
      <SyncSummary
        pending={outbox.pending}
        failed={outbox.failed}
        offline={outbox.offline}
        currentLanguage={currentLanguage}
        onRetry={outbox.retry}
      />

      {/* A write failed after the app had already loaded. Not fatal - the rest
          of the app still works - but it must not be silent, because the screen
          has already rolled back and the worker needs to know why. */}
      {dataStatus === 'ready' && dataError && (
        <div className="mx-4 mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-3 py-2.5 max-w-3xl w-full self-center">
          <span className="font-semibold flex-1">{dataError}</span>
          <button
            type="button"
            onClick={() => setDataError('')}
            className="font-black px-2 shrink-0"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      <main className="flex-1 px-4 pt-4 pb-24 max-w-3xl w-full mx-auto">
        <Routes>
          <Route
            path="/"
            element={
              <HomeDashboard
                profile={profile}
                jobs={jobs}
                kamaiList={kamaiList}
                currentLanguage={currentLanguage}
                onChangeLanguage={() => setIsLangModalOpen(true)}
                onOpenVoiceAssistant={handleOpenVoiceAssistant}
                onNavigateTab={goToTab}
              />
            }
          />
          <Route
            path="/passport"
            element={
              <DigitalPassport
                profile={profile}
                currentLanguage={currentLanguage}
                onAddWorkVoice={() => handleOpenVoiceAssistant('add_job')}
              />
            }
          />
          <Route
            path="/jobs"
            element={
              <JobsView
                jobs={jobs}
                workerName={profile.name}
                syncStateOf={outbox.stateOf}
                currentLanguage={currentLanguage}
                onAddJobVoice={() => handleOpenVoiceAssistant('add_job')}
                onOpenQuote={() => goToTab('quote')}
                onTransitionJob={jobsOnApi ? handleTransitionJob : undefined}
                onRefreshJobs={jobsOnApi ? refreshJobs : undefined}
                bookingsByJob={bookingsByJob}
                onRescheduleBooking={jobsOnApi ? handleRescheduleBooking : undefined}
              />
            }
          />
          <Route path="/quote" element={<QuoteBuilder profile={profile} currentLanguage={currentLanguage} />} />
          <Route
            path="/kamai"
            element={
              <KamaiView
                kamaiList={kamaiList}
                syncStateOf={outbox.stateOf}
                currentLanguage={currentLanguage}
                onAddKamaiVoice={() => handleOpenVoiceAssistant('add_kamai')}
                onAddKamaiManual={handleAddKamaiManual}
                onDownloadIncomeStatement={handleDownloadIncomeStatement}
              />
            }
          />
          <Route
            path="/profile"
            element={
              <ProfileView
                profile={profile}
                currentLanguage={currentLanguage}
                onUpdateProfileVoice={() => handleOpenVoiceAssistant('update_profile')}
                onSaveProfile={handleSaveProfile}
              />
            }
          />
          {/* An unknown in-app path lands on the dashboard rather than a blank
              screen. Public SSR routes (/p/:handle, /r/:token) never reach the
              client router - Express answers them first. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Voice-First AI Assistant Modal */}
      <VoiceAssistantModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        context={voiceContext}
        currentLanguage={currentLanguage}
        onChangeLanguage={() => setIsLangModalOpen(true)}
        workerProfile={profile}
        onSaveProfile={handleSaveProfile}
        onSaveJob={handleSaveJob}
        onSaveKamai={handleSaveKamai}
        onOpenPassport={() => goToTab('passport')}
      />

      {/* Language Selector Modal */}
      <LanguageSelectorModal
        isOpen={isLangModalOpen}
        onClose={() => setIsLangModalOpen(false)}
        currentLanguage={currentLanguage}
        onSelectLanguage={handleLanguageChange}
      />
    </div>
  );
}
