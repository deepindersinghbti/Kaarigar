import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  Volume2,
  Edit3,
  Check,
  RotateCcw,
  Globe,
  X,
  Sparkles,
  User,
  Briefcase,
  Calendar,
  CheckCircle2,
  ArrowRight,
  IndianRupee,
  MapPin,
  HelpCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  SupportedLanguage,
  AssistantContext,
  WorkerProfile,
  JobItem,
  KamaiEntry,
} from '../types';
import { TRANSLATIONS } from '../data/translations';
import {
  VoiceRecognizer,
  speakText,
  stopSpeaking,
  sfx,
  isSpeechRecognitionSupported,
} from '../utils/speech';
import { uuidv7 } from '../lib/ids';
import { todayIso } from '../utils/date';
import { authHeader } from '../lib/authToken';

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: AssistantContext;
  currentLanguage: SupportedLanguage;
  onChangeLanguage: () => void;
  workerProfile: WorkerProfile;
  onSaveProfile: (profile: WorkerProfile) => void;
  onSaveJob: (job: JobItem) => void;
  onSaveKamai: (kamai: KamaiEntry[]) => void;
  onOpenPassport: () => void;
}

export const VoiceAssistantModal: React.FC<VoiceAssistantModalProps> = ({
  isOpen,
  onClose,
  context,
  currentLanguage,
  onChangeLanguage,
  workerProfile,
  onSaveProfile,
  onSaveJob,
  onSaveKamai,
  onOpenPassport,
}) => {
  const t = TRANSLATIONS[currentLanguage];

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [assistantMessage, setAssistantMessage] = useState('');
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [isPassportReady, setIsPassportReady] = useState(false);

  // Extracted data buffer
  const [draftProfile, setDraftProfile] = useState<Partial<WorkerProfile>>({
    name: workerProfile.name || 'Ramesh Kumar',
    trade: '',
    experienceYears: 0,
    skills: [],
    certifications: [],
  });
  const [draftJob, setDraftJob] = useState<Partial<JobItem> | null>(null);
  const [draftKamai, setDraftKamai] = useState<{
    total: number;
    entries: Array<{ desc: string; amount: number }>;
  } | null>(null);

  const recognizerRef = useRef<VoiceRecognizer | null>(null);
  const lastSpokenMessageRef = useRef<string>('');

  // Initialize Speech Recognizer
  useEffect(() => {
    recognizerRef.current = new VoiceRecognizer();
    return () => {
      stopSpeaking();
      if (recognizerRef.current) recognizerRef.current.stop();
    };
  }, []);

  // Initialize flow when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setTranscript('');
      setInterimText('');
      setRequiresConfirmation(false);
      setIsPassportReady(false);
      setShowManualEdit(false);

      let initialPrompt = '';
      if (context === 'onboarding') {
        initialPrompt = t.onboardingQuestions.welcome(workerProfile.name);
        setDraftProfile({
          name: workerProfile.name || 'Ramesh Kumar',
          trade: '',
          experienceYears: 0,
          skills: [],
          certifications: [],
        });
      } else if (context === 'add_job') {
        initialPrompt = t.jobQuestions.prompt;
        setDraftJob(null);
      } else if (context === 'add_kamai') {
        initialPrompt = t.kamaiQuestions.prompt;
        setDraftKamai(null);
      } else {
        initialPrompt = t.onboardingQuestions.welcome(workerProfile.name);
      }

      setAssistantMessage(initialPrompt);
      lastSpokenMessageRef.current = initialPrompt;

      // Speak welcome message
      setIsSpeaking(true);
      speakText(initialPrompt, currentLanguage, () => {
        setIsSpeaking(false);
      });
    } else {
      stopSpeaking();
      if (recognizerRef.current) recognizerRef.current.stop();
      setIsListening(false);
      setIsSpeaking(false);
    }
  }, [isOpen, context, currentLanguage]);

  // Handle start/stop listening
  const toggleListening = () => {
    if (isListening) {
      if (recognizerRef.current) recognizerRef.current.stop();
      setIsListening(false);
    } else {
      stopSpeaking();
      setIsSpeaking(false);
      setInterimText('');

      if (!isSpeechRecognitionSupported()) {
        // Speech recognition not directly supported in this browser, provide friendly guidance
        alert(
          'Speech recognition is not supported in this browser environment. You can use the quick demo voice buttons below to test the full voice assistant flow!'
        );
        return;
      }

      recognizerRef.current?.start({
        language: currentLanguage,
        onStart: () => setIsListening(true),
        onEnd: () => setIsListening(false),
        onInterimResult: (text) => setInterimText(text),
        onFinalResult: (finalText) => {
          setIsListening(false);
          setTranscript(finalText);
          processUserInput(finalText);
        },
        onError: (err) => {
          console.warn('Recognition error:', err);
          setIsListening(false);
        },
      });
    }
  };

  // Process text through Backend (Gemini API / Fallback)
  const processUserInput = async (inputText: string) => {
    if (!inputText.trim()) return;
    setIsProcessing(true);
    stopSpeaking();

    try {
      const response = await fetch('/api/assistant/process', {
        method: 'POST',
        // The endpoint requires auth: every successful turn ends in an
        // owner-scoped write. authHeader() is the seam - when AuthProvider
        // lands, only src/lib/authToken.ts changes, not this call.
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          userInput: inputText,
          language: currentLanguage,
          context,
          currentStep,
          workerName: workerProfile.name || 'Ramesh',
          pendingData: {
            ...draftProfile,
            job: draftJob,
            kamai: draftKamai,
          },
        }),
      });

      const data = await response.json();

      if (data.extractedData) {
        if (context === 'onboarding') {
          setDraftProfile((prev) => ({
            ...prev,
            trade: data.extractedData.trade || prev.trade,
            experienceYears:
              data.extractedData.experienceYears || prev.experienceYears,
            skills: data.extractedData.skills || prev.skills,
            certifications:
              data.extractedData.certifications || prev.certifications,
          }));
        } else if (context === 'add_job' && data.extractedData.job) {
          setDraftJob(data.extractedData.job);
        } else if (context === 'add_kamai' && data.extractedData.kamai) {
          setDraftKamai(data.extractedData.kamai);
        }
      }

      if (data.replyText) {
        setAssistantMessage(data.replyText);
        lastSpokenMessageRef.current = data.replyText;
        setIsSpeaking(true);
        speakText(data.replyText, currentLanguage, () => {
          setIsSpeaking(false);
        });
      }

      if (data.requiresConfirmation) {
        setRequiresConfirmation(true);
      }

      if (typeof data.nextStep === 'number') {
        setCurrentStep(data.nextStep);
      }
    } catch (error) {
      console.error('Error processing speech:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // "Hear Again" / "Dobara bolo"
  const handleHearAgain = () => {
    if (assistantMessage) {
      setIsSpeaking(true);
      speakText(assistantMessage, currentLanguage, () => {
        setIsSpeaking(false);
      });
    }
  };

  // Quick Demo Trigger Prompts
  const handleQuickDemoClick = (text: string) => {
    setTranscript(text);
    setInterimText('');
    processUserInput(text);
  };

  // Confirm and Save Data
  const handleConfirm = () => {
    sfx.playSuccessChime();

    if (context === 'onboarding') {
      const updated: WorkerProfile = {
        ...workerProfile,
        trade: draftProfile.trade || 'Electrician',
        experienceYears: draftProfile.experienceYears || 18,
        skills:
          draftProfile.skills && draftProfile.skills.length > 0
            ? draftProfile.skills
            : [
                'House Wiring',
                'Fan Installation',
                'MCB & Switchboard Installation',
              ],
        certifications:
          draftProfile.certifications &&
          draftProfile.certifications.length > 0
            ? draftProfile.certifications
            : ['ITI Electrician Certified'],
      };

      onSaveProfile(updated);
      setIsPassportReady(true);

      // Launch celebratory confetti
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#10b981', '#3b82f6', '#ec4899'],
      });

      const passportAnnouncement =
        t.onboardingQuestions.passportReadyAnnouncement(workerProfile.name);
      setAssistantMessage(passportAnnouncement);
      setIsSpeaking(true);
      speakText(passportAnnouncement, currentLanguage, () => {
        setIsSpeaking(false);
      });
    } else if (context === 'add_job') {
      const newJob: JobItem = {
        id: uuidv7(),
        kaarigarId: workerProfile.userId,
        title: draftJob?.title || 'Fan Installation',
        customerName: draftJob?.customerName || 'Neha Sharma',
        location: draftJob?.location || 'Sector 35, Chandigarh',
        amount: draftJob?.amount || 1100,
        // Payment is logged separately after the job reaches COMPLETED. Keeping
        // it pending here prevents voice entry from asserting both work and
        // earnings before the lifecycle provides evidence for either.
        paymentMethod: 'pending',
        status: 'REQUESTED',
        stateHistory: [
          { state: 'REQUESTED', at: new Date().toISOString(), by: workerProfile.userId },
        ],
        syncState: 'pending',
        date: todayIso(),
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        skillsTagged: [draftJob?.title || 'Fan Installation'],
      };

      onSaveJob(newJob);
      confetti({ particleCount: 60, spread: 60 });
      onClose();
    } else if (context === 'add_kamai') {
      const entries: KamaiEntry[] =
        draftKamai?.entries && draftKamai.entries.length > 0
          ? draftKamai.entries.map((e, idx) => ({
              id: uuidv7(),
              profileId: workerProfile.id,
              direction: 'in' as const,
              syncState: 'pending' as const,
              date: todayIso(),
              amount: e.amount,
              description: e.desc,
              paymentType: 'cash' as const,
            }))
          : [
              {
                id: uuidv7(),
                profileId: workerProfile.id,
                direction: 'in' as const,
                syncState: 'pending' as const,
                date: todayIso(),
                amount: draftKamai?.total || 2700,
                description: "Today's work",
                paymentType: 'cash' as const,
              },
            ];

      onSaveKamai(entries);
      confetti({ particleCount: 60, spread: 60 });
      onClose();
    }
  };

  // "Change something" / "Kuch badalna hai"
  const handleChangeSomething = () => {
    setRequiresConfirmation(false);
    const askChange = t.whatToChange;
    setAssistantMessage(askChange);
    setIsSpeaking(true);
    speakText(askChange, currentLanguage, () => {
      setIsSpeaking(false);
    });
  };

  if (!isOpen) return null;

  return (
    <div
      id="voice-assistant-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-gray-900/80 backdrop-blur-md overflow-y-auto"
    >
      <motion.div
        id="voice-assistant-card"
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 30 }}
        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
        className="w-full max-w-xl bg-[#F3F4F6] rounded-3xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col my-auto"
      >
        {/* Header with Assistant Branding & Language Switcher */}
        <div className="bg-white px-6 py-4 text-gray-900 flex items-center justify-between border-b border-gray-200 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-500 text-white flex items-center justify-center font-bold text-xl shadow-md shadow-orange-200">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-xl tracking-tight text-gray-900">
                  {t.assistantName}
                </h2>
                <span className="bg-orange-100 text-orange-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  AI Dost
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                {context === 'onboarding'
                  ? 'आवाज़ से प्रोफाइल बनाएं'
                  : context === 'add_job'
                  ? 'बोलकर काम जोड़ें'
                  : context === 'add_kamai'
                  ? 'बोलकर कमाई जोड़ें'
                  : 'आपका बोलकर चलने वाला साथी'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="assistant-change-lang-btn"
              onClick={onChangeLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-all border border-gray-200"
            >
              <Globe className="w-4 h-4 text-orange-500" />
              <span>{t.changeLanguage}</span>
            </button>
            <button
              id="close-voice-assistant"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Passport Ready Celebration Screen */}
        {isPassportReady ? (
          <div className="p-6 text-center space-y-6 bg-white">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 12 }}
              className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-green-500 to-emerald-400 text-white flex items-center justify-center shadow-xl shadow-green-200"
            >
              <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
            </motion.div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black text-gray-900">
                {workerProfile.name} जी, आपका पासपोर्ट तैयार है! 🎉
              </h3>
              <p className="text-gray-600 text-sm max-w-md mx-auto">
                Your digital passport is ready. Government certificate verification is not connected in this demo.
              </p>
            </div>

            {/* Passport Quick Preview Card */}
            <div className="bg-gray-900 text-white rounded-3xl p-6 text-left border-2 border-orange-400 shadow-xl space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl" />
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
                    Passport preview
                  </div>
                  <div className="text-lg font-bold text-white">
                    {workerProfile.id.toUpperCase()}
                  </div>
                </div>
                <span className="bg-green-500/20 text-green-400 text-xs font-bold px-2.5 py-1 rounded-full border border-green-500/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Demo only
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-gray-800">
                <div>
                  <span className="text-gray-400 block">Trade</span>
                  <span className="font-bold text-gray-200 text-sm">
                    {draftProfile.trade || 'Electrician'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block">Experience</span>
                  <span className="font-bold text-gray-200 text-sm">
                    {draftProfile.experienceYears || 18} Years
                  </span>
                </div>
              </div>

              <div>
                <span className="text-gray-400 text-xs block mb-1">
                  Skills listed by worker
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(draftProfile.skills && draftProfile.skills.length > 0
                    ? draftProfile.skills
                    : ['House Wiring', 'Fan Installation', 'MCB & Switchboard']
                  ).map((s, idx) => (
                    <span
                      key={idx}
                      className="bg-gray-800 text-orange-300 text-[11px] px-2.5 py-0.5 rounded-lg font-medium border border-gray-700"
                    >
                      ✓ {s}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-amber-200/80">
                DigiLocker sandbox/mock: demo only. This preview is not a government verification.
              </p>
            </div>

            <button
              id="view-passport-now-btn"
              onClick={() => {
                onClose();
                onOpenPassport();
              }}
              className="w-full py-4 px-6 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-lg shadow-xl shadow-orange-200 flex items-center justify-center gap-3 transition-all hover:scale-[1.01]"
            >
              <span>{t.viewPassport}</span>
              <ArrowRight className="w-6 h-6 stroke-[3]" />
            </button>
          </div>
        ) : (
          /* Main Conversational Voice Screen */
          <div className="p-5 sm:p-6 space-y-5">
            {/* Assistant Speech Bubble (Matching Sleek Interface Spec) */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-gray-100 flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl shrink-0 font-black">
                🤖
              </div>
              <div className="flex-1 space-y-2">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  {t.assistantName}
                </div>
                <div className="text-gray-800 font-bold text-lg sm:text-xl leading-relaxed whitespace-pre-line">
                  {assistantMessage}
                </div>
                {/* Hear Again audio replay button */}
                <button
                  id="hear-again-btn"
                  onClick={handleHearAgain}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-colors"
                >
                  <Volume2 className="w-4 h-4 text-orange-500" />
                  <span>{t.hearAgain} (दोबारा सुनो)</span>
                </button>
              </div>
            </div>

            {/* Active Voice Visualization & Live Transcript Container (Sleek Interface orange box) */}
            <div className="bg-orange-50 border-2 border-orange-200 rounded-3xl p-6 flex flex-col items-center justify-center space-y-5 relative overflow-hidden shadow-sm">
              <div className="absolute top-4 right-4 flex gap-1">
                <div className="w-2.5 h-2.5 bg-orange-400 rounded-full animate-bounce"></div>
                <div className="w-2.5 h-2.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                <div className="w-2.5 h-2.5 bg-orange-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
              </div>

              <div className="text-orange-800 font-bold uppercase tracking-widest text-xs">
                {isListening ? t.listening : 'Aapki Awaaz Sun Rahe Hain...'}
              </div>

              {/* Huge Pulsing Mic Button */}
              <div className="relative">
                {isListening && (
                  <>
                    <motion.div
                      animate={{ scale: [1, 1.35, 1.7], opacity: [0.7, 0.3, 0] }}
                      transition={{
                        repeat: Infinity,
                        duration: 1.6,
                        ease: 'easeOut',
                      }}
                      className="absolute inset-0 rounded-full bg-orange-500"
                    />
                  </>
                )}

                <button
                  id="primary-mic-button"
                  onClick={toggleListening}
                  className={`relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center text-white shadow-2xl transition-all duration-300 transform active:scale-95 border-8 border-white ${
                    isListening
                      ? 'bg-gradient-to-tr from-red-500 to-rose-600 shadow-rose-300 scale-105'
                      : 'bg-orange-500 hover:bg-orange-600 shadow-orange-300 hover:scale-105'
                  }`}
                  aria-label={isListening ? 'Stop listening' : 'Start listening'}
                >
                  <Mic
                    className={`w-10 h-10 sm:w-12 sm:h-12 ${
                      isListening ? 'animate-pulse' : ''
                    }`}
                  />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider mt-1">
                    {isListening ? 'Listening...' : t.speak}
                  </span>
                </button>
              </div>

              <div className="text-center px-4">
                <p className="text-lg font-medium text-gray-700 italic">
                  "{interimText || transcript || 'Speak now in your language...'}"
                </p>
                <span className="text-xs text-orange-600 font-bold mt-1 block">
                  {isListening ? 'Bolte rahiye, hum sun rahe hain...' : '🎙️ Tap microphone to speak'}
                </span>
              </div>
            </div>

            {/* Structured Profile Confirmation Card (Sleek Interface spec) */}
            {requiresConfirmation && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-6 sm:p-7 shadow-xl border-4 border-orange-100 relative space-y-4"
              >
                <div className="absolute -top-3.5 left-6 sm:left-8 bg-orange-500 text-white px-3.5 py-0.5 rounded-full text-xs font-bold shadow-md flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Extracted Details</span>
                </div>

                {context === 'onboarding' && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">
                        Kaam (Trade)
                      </span>
                      <p className="text-xl font-bold text-blue-600">
                        {draftProfile.trade || 'Electrician'}
                      </p>
                    </div>

                    <div>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">
                        Anubhav (Experience)
                      </span>
                      <p className="text-xl font-bold text-blue-600">
                        {draftProfile.experienceYears || 18} Saal
                      </p>
                    </div>

                    <div className="col-span-2">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
                        Khaas Hunar (Skills)
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(draftProfile.skills && draftProfile.skills.length > 0
                          ? draftProfile.skills
                          : [
                              'House Wiring',
                              'Fan Installation',
                              'MCB & Switchboard',
                            ]
                        ).map((sk, idx) => (
                          <span
                            key={idx}
                            className="bg-green-100 text-green-700 px-3.5 py-1.5 rounded-full font-bold text-xs sm:text-sm flex items-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            {sk}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {context === 'add_job' && draftJob && (
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">
                          Kaam Ka Naam
                        </span>
                        <p className="text-xl font-bold text-blue-600">
                          {draftJob.title || 'Fan Installation'}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">
                          Amount
                        </span>
                        <p className="text-2xl font-black text-green-600">
                          ₹{(draftJob.amount || 1100).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-2xl border border-gray-100">
                      <div>
                        <span className="text-gray-400 block font-bold">Customer</span>
                        <span className="font-bold text-gray-800">
                          {draftJob.customerName || 'Neha Sharma'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block font-bold">Location</span>
                        <span className="font-bold text-gray-800">
                          {draftJob.location || 'Sector 35, Chandigarh'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {context === 'add_kamai' && draftKamai && (
                  <div className="space-y-3 pt-2">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">
                      Earnings Breakdown
                    </span>
                    <div className="space-y-1.5">
                      {draftKamai.entries.map((entry, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between text-sm font-semibold bg-gray-50 p-2.5 rounded-xl border border-gray-100"
                        >
                          <span>{entry.desc}</span>
                          <span className="font-bold text-gray-900">
                            ₹{entry.amount.toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                      <span className="font-bold text-gray-700">Total:</span>
                      <span className="text-2xl font-black text-green-600">
                        ₹{draftKamai.total.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Confirm & Change Buttons */}
                <div className="space-y-2.5 pt-2">
                  <button
                    id="confirm-assistant-action-btn"
                    onClick={handleConfirm}
                    className="w-full bg-green-500 hover:bg-green-600 text-white py-3.5 sm:py-4 rounded-2xl font-extrabold text-base sm:text-lg shadow-lg shadow-green-100 flex items-center justify-center gap-3 transition-all"
                  >
                    <Check className="w-5 h-5 stroke-[3]" />
                    <span>{t.yesCorrect} (हाँ, सब सही है)</span>
                  </button>

                  <button
                    id="change-assistant-action-btn"
                    onClick={handleChangeSomething}
                    className="w-full bg-white border-2 border-gray-200 py-3 rounded-2xl font-bold text-gray-600 flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors text-sm"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>{t.changeSomething} (कुछ बदलना है)</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* Quick Demo Prompts for Easy Hackathon Testing & Demonstration */}
            <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  ⚡ Quick Voice Demo Prompts
                </span>
                <button
                  id="toggle-manual-input-btn"
                  onClick={() => setShowManualEdit(!showManualEdit)}
                  className="text-xs text-orange-600 hover:text-orange-700 font-bold flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{showManualEdit ? 'Hide Text' : 'Type / Edit'}</span>
                </button>
              </div>

              {showManualEdit && (
                <div className="flex gap-2">
                  <input
                    id="manual-voice-input-field"
                    type="text"
                    placeholder="Type what worker would say in Hindi/English..."
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && manualInput) {
                        handleQuickDemoClick(manualInput);
                        setManualInput('');
                      }
                    }}
                    className="flex-1 px-4 py-2.5 rounded-2xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    onClick={() => {
                      if (manualInput) {
                        handleQuickDemoClick(manualInput);
                        setManualInput('');
                      }
                    }}
                    className="px-5 py-2.5 bg-orange-500 text-white rounded-2xl font-bold text-sm hover:bg-orange-600"
                  >
                    Send
                  </button>
                </div>
              )}

              {/* Contextual Quick Speech Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {context === 'onboarding' && (
                  <>
                    <button
                      id="demo-speech-trade"
                      onClick={() =>
                        handleQuickDemoClick('Main electrician hoon.')
                      }
                      className="p-3 rounded-2xl bg-gray-50 hover:bg-orange-50 text-gray-800 text-xs font-bold text-left border border-gray-200 hover:border-orange-200 transition-colors flex items-center gap-2"
                    >
                      <span>🗣️</span>
                      <span>"Main electrician hoon."</span>
                    </button>
                    <button
                      id="demo-speech-exp"
                      onClick={() => handleQuickDemoClick('18 saal.')}
                      className="p-3 rounded-2xl bg-gray-50 hover:bg-orange-50 text-gray-800 text-xs font-bold text-left border border-gray-200 hover:border-orange-200 transition-colors flex items-center gap-2"
                    >
                      <span>🗣️</span>
                      <span>"18 saal."</span>
                    </button>
                    <button
                      id="demo-speech-skills"
                      onClick={() =>
                        handleQuickDemoClick(
                          'Ghar ki wiring, pankhe lagana aur switchboard ka kaam.'
                        )
                      }
                      className="p-3 rounded-2xl bg-gray-50 hover:bg-orange-50 text-gray-800 text-xs font-bold text-left border border-gray-200 hover:border-orange-200 transition-colors flex items-center gap-2"
                    >
                      <span>🗣️</span>
                      <span>"Ghar ki wiring, fan aur switchboard..."</span>
                    </button>
                    <button
                      id="demo-speech-allinone"
                      onClick={() =>
                        handleQuickDemoClick(
                          'Main pichle 18 saal se electrician ka kaam kar raha hoon. Ghar ki wiring karta hoon, pankhe lagata hoon aur MCB ka kaam bhi karta hoon.'
                        )
                      }
                      className="p-3 rounded-2xl bg-green-50 hover:bg-green-100 text-green-900 text-xs font-bold text-left border border-green-300 transition-colors flex items-center gap-2 sm:col-span-2"
                    >
                      <span>⚡ Full Speech:</span>
                      <span className="truncate">
                        "Main pichle 18 saal se electrician ka kaam kar raha
                        hoon..."
                      </span>
                    </button>
                  </>
                )}

                {context === 'add_job' && (
                  <>
                    <button
                      id="demo-job-fan"
                      onClick={() =>
                        handleQuickDemoClick(
                          'Sector 35 mein fan lagaya. Customer Neha Sharma. 1100 rupaye mile.'
                        )
                      }
                      className="p-3 rounded-2xl bg-gray-50 hover:bg-orange-50 text-gray-800 text-xs font-bold text-left border border-gray-200 hover:border-orange-200 transition-colors flex items-center gap-2 sm:col-span-2"
                    >
                      <span>🗣️</span>
                      <span>
                        "Sector 35 mein fan lagaya. Customer Neha Sharma. 1100
                        rupaye mile."
                      </span>
                    </button>
                    <button
                      id="demo-job-mcb"
                      onClick={() =>
                        handleQuickDemoClick(
                          'Sector 22 mein Rajesh Gupta ka MCB change kiya, 1500 rupaye.'
                        )
                      }
                      className="p-3 rounded-2xl bg-gray-50 hover:bg-orange-50 text-gray-800 text-xs font-bold text-left border border-gray-200 hover:border-orange-200 transition-colors flex items-center gap-2 sm:col-span-2"
                    >
                      <span>🗣️</span>
                      <span>
                        "Sector 22 mein Rajesh Gupta ka MCB change kiya, 1500
                        rupaye."
                      </span>
                    </button>
                  </>
                )}

                {context === 'add_kamai' && (
                  <>
                    <button
                      id="demo-kamai-twojobs"
                      onClick={() =>
                        handleQuickDemoClick(
                          'Aj do kaam kiye. Pehla 1500 ka aur doosra 1200 ka.'
                        )
                      }
                      className="p-3 rounded-2xl bg-gray-50 hover:bg-orange-50 text-gray-800 text-xs font-bold text-left border border-gray-200 hover:border-orange-200 transition-colors flex items-center gap-2 sm:col-span-2"
                    >
                      <span>🗣️</span>
                      <span>
                        "Aj do kaam kiye. Pehla 1500 ka aur doosra 1200 ka."
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
