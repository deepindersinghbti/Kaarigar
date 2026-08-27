export type SupportedLanguage = 'hi' | 'pa' | 'kn' | 'mr' | 'en';

export interface LanguageOption {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  sampleGreeting: string;
}

export interface WorkerProfile {
  id: string;
  name: string;
  trade: string;
  experienceYears: number;
  location: string;
  phone: string;
  skills: string[];
  certifications: string[];
  rating: number;
  totalJobsCount: number;
  totalEarnings: number;
  verifiedStatus: 'verified' | 'pending' | 'unverified';
  qrCodeUrl?: string;
  joinedDate: string;
  photoUrl?: string;
  bloodGroup?: string;
  dailyRate?: number;
  bio?: string;
}

export interface JobItem {
  id: string;
  title: string;
  customerName: string;
  customerPhone?: string;
  location: string;
  amount: number;
  paymentMethod: 'cash' | 'upi' | 'pending';
  status: 'completed' | 'in_progress' | 'scheduled';
  date: string;
  time?: string;
  notes?: string;
  skillsTagged?: string[];
}

export interface KamaiEntry {
  id: string;
  date: string;
  amount: number;
  description: string;
  customerName?: string;
  paymentType: 'cash' | 'upi';
  jobId?: string;
}

export type AssistantContext = 
  | 'onboarding'
  | 'add_job'
  | 'add_kamai'
  | 'update_profile'
  | 'general_chat';

export interface AssistantMessage {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
  spokenAudioText?: string;
  timestamp: string;
  extractedData?: {
    type: 'profile' | 'job' | 'kamai';
    profile?: Partial<WorkerProfile>;
    job?: Partial<JobItem>;
    kamai?: {
      total: number;
      entries: Array<{ desc: string; amount: number }>;
    };
  };
  requiresConfirmation?: boolean;
}

export interface VoiceAssistantSession {
  context: AssistantContext;
  currentStep: number;
  messages: AssistantMessage[];
  pendingData: any;
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  interimTranscript: string;
}
