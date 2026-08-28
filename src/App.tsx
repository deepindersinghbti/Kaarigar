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
import { uuidv7 } from './utils/uuid';

export default function App() {
  const navigate = useNavigate();

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

  // Sync to LocalStorage
  useEffect(() => {
    localStorage.setItem('kaarigar_lang', currentLanguage);
  }, [currentLanguage]);

  useEffect(() => {
    localStorage.setItem('kaarigar_profile_v2', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('kaarigar_jobs_v2', JSON.stringify(jobs));
  }, [jobs]);

  useEffect(() => {
    localStorage.setItem('kaarigar_kamai_v2', JSON.stringify(kamaiList));
  }, [kamaiList]);

  // Handlers for Voice Assistant
  const handleOpenVoiceAssistant = (
    context: AssistantContext = 'onboarding'
  ) => {
    setVoiceContext(context);
    setIsVoiceModalOpen(true);
  };

  const handleSaveProfile = (updatedProfile: WorkerProfile) => {
    setProfile(updatedProfile);
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
  };

  const handleSaveKamai = (newEntries: KamaiEntry[]) => {
    setKamaiList((prev) => [...newEntries, ...prev]);
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-gray-900 flex flex-col font-sans antialiased selection:bg-orange-200">
      {/* Navbar & Top Bar */}
      <Navbar
        currentLanguage={currentLanguage}
        onChangeLanguage={() => setIsLangModalOpen(true)}
        onOpenVoiceAssistant={() => handleOpenVoiceAssistant('onboarding')}
      />

      {/* Main App Content View Area */}
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
