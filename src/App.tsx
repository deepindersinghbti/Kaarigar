/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { HomeDashboard } from './components/HomeDashboard';
import { DigitalPassport } from './components/DigitalPassport';
import { JobsView } from './components/JobsView';
import { KamaiView } from './components/KamaiView';
import { ProfileView } from './components/ProfileView';
import { VoiceAssistantModal } from './components/VoiceAssistantModal';
import { LanguageSelectorModal } from './components/LanguageSelectorModal';
import { LoginScreen } from './components/LoginScreen';
import { useAuth } from './auth/AuthProvider';
import { api, ApiError } from './lib/api';
import { useApiForDomain, anyDomainOnApi } from './lib/dataSource';

import {
  WorkerProfile,
  JobItem,
  KamaiEntry,
  SupportedLanguage,
  AssistantContext,
} from './types';
import {
  INITIAL_PROFILE,
  INITIAL_JOBS,
  INITIAL_KAMAI,
} from './data/initialData';
import { uuidv7 } from './lib/ids';

export default function App() {
  const navigate = useNavigate();
  const { status } = useAuth();

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
        if (saved) return saved as SupportedLanguage;
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
          return JSON.parse(saved);
        } catch {
          // ignore
        }
      }
    }
    return INITIAL_PROFILE;
  });

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
        // Fetched together rather than in sequence: three round trips on 2G is
        // the difference between a usable open and an abandoned one.
        const [p, j, k] = await Promise.all([
          profileOnApi ? api.getProfile() : Promise.resolve(null),
          jobsOnApi ? api.listJobs() : Promise.resolve(null),
          kamaiOnApi ? api.listEntries() : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (p) setProfile(p);
        if (j) setJobs(j);
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
    setProfile(updatedProfile);
    if (!profileOnApi) return;

    void (async () => {
      try {
        // Only the server's patchable fields are sent; rating, totalJobsCount
        // and verifiedStatus are derived from verified events and a PATCH that
        // moved them would make the passport worthless as evidence.
        setProfile(await api.patchProfile(updatedProfile));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
        setProfile(previous);
        setDataError(e instanceof Error ? e.message : 'Could not save your profile.');
      }
    })();
  };

  const handleSaveJob = (newJob: JobItem) => {
    setJobs((prev) => [newJob, ...prev]);

    // Also automatically create corresponding Kamai entry as required by prompt!
    const newKamai: KamaiEntry = {
      id: uuidv7(),
      profileId: profile.id,
      direction: 'in',
      syncState: 'pending',
      date: newJob.date,
      amount: newJob.amount,
      description: `${newJob.title} (Customer: ${newJob.customerName})`,
      customerName: newJob.customerName,
      paymentType: newJob.paymentMethod === 'upi' ? 'upi' : 'cash',
      jobId: newJob.id,
    };
    setKamaiList((prev) => [newKamai, ...prev]);

    /**
     * Both writes carry the client-generated UUIDv7 already on the objects, and
     * both endpoints are idempotent on it, so a retry after a timeout returns
     * the existing record instead of creating a second one. That property is
     * what makes an optimistic write safe to repeat.
     *
     * The job is posted before its ledger entry - causal order (section 9.2),
     * so the entry never references a jobId the server has not seen.
     */
    void (async () => {
      try {
        if (jobsOnApi) await api.createJob(newJob);
        if (kamaiOnApi) await api.createEntry(newKamai);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
        if (jobsOnApi) setJobs((prev) => prev.filter((j) => j.id !== newJob.id));
        if (kamaiOnApi) setKamaiList((prev) => prev.filter((k) => k.id !== newKamai.id));
        setDataError(e instanceof Error ? e.message : 'Could not save this job.');
      }
    })();
  };

  const handleSaveKamai = (newEntries: KamaiEntry[]) => {
    setKamaiList((prev) => [...newEntries, ...prev]);
    if (!kamaiOnApi) return;

    void (async () => {
      try {
        // Sequential, not Promise.all: the ledger is append-only and ordered,
        // and firing a batch concurrently gives up the ordering for latency
        // nobody will notice on one or two entries.
        for (const entry of newEntries) await api.createEntry(entry);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
        const ids = new Set(newEntries.map((n) => n.id));
        setKamaiList((prev) => prev.filter((k) => !ids.has(k.id)));
        setDataError(e instanceof Error ? e.message : 'Could not save this entry.');
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
          onSelectLanguage={setCurrentLanguage}
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
                currentLanguage={currentLanguage}
                onAddJobVoice={() => handleOpenVoiceAssistant('add_job')}
              />
            }
          />
          <Route
            path="/kamai"
            element={
              <KamaiView
                kamaiList={kamaiList}
                currentLanguage={currentLanguage}
                onAddKamaiVoice={() => handleOpenVoiceAssistant('add_kamai')}
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
        onSelectLanguage={setCurrentLanguage}
      />
    </div>
  );
}
