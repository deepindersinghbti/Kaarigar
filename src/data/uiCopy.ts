import type { BookingStatus, JobState, SupportedLanguage } from '../types';

/**
 * Copy for the screens that were added after the original translation table.
 * The existing table remains the source for the assistant and navigation; this
 * keeps the newer dashboard, jobs, Kamai and quote labels in the same language
 * as the selected UI instead of mixing Hindi and English in one screen.
 *
 * The MVP exposes complete Hindi, Punjabi and English surfaces. Marathi and
 * Kannada remain listed in the picker as coming soon and are not selectable.
 */
export interface QuoteCopy {
  eyebrow: string;
  title: string;
  description: string;
  trade: string;
  task: string;
  band: string;
  labour: string;
  materials: string;
  visitCharge: string;
  total: string;
  share: string;
  download: string;
  copied: string;
  downloaded: string;
  source: string;
  median: string;
  localObservations: (count: number) => string;
  noLocalObservations: string;
  loadingTasks: string;
  fallbackRates: string;
  noBand: string;
  aboveBandWarning: string;
  loadBandError: string;
  tradeNames: Record<string, string>;
  taskNames: Record<string, string>;
}

export interface HomeCopy {
  greeting: (name: string) => string;
  identityVerified: string;
  verificationPending: string;
  profileNotVerified: string;
  heroTitle: string;
  heroDescription: string;
  jobsCategory: string;
  jobsExample: string;
  kamaiCategory: string;
  kamaiExample: string;
  passportCategory: string;
  passportExample: string;
  profileCategory: string;
  profileExample: string;
  voiceSuffix: string;
  viewLedger: string;
  jobsToday: (count: number) => string;
  ratingTitle: string;
  passport: string;
  recordedJobs: (count: number) => string;
  evidenceSnapshot: string;
  seeAll: (count: number) => string;
  demoTitle: string;
  demoProfile: string;
  demoJob: string;
  demoKamai: string;
}

export interface JobsCopy {
  eyebrow: string;
  description: string;
  createQuote: string;
  allJobs: (count: number) => string;
  today: string;
  week: string;
  total: string;
  searchPlaceholder: string;
  noJobs: string;
  noJobsHint: string;
  speakAdd: string;
  customer: string;
  location: string;
  callCustomer: string;
  viewMap: string;
  lifecycle: string;
  updating: string;
  apiOnly: string;
  waitForSync: string;
  /** Naming a price on a customer's request, and waiting for their answer. */
  quoteLabel: string;
  quotePlaceholder: string;
  quoteSend: string;
  quoteInvalid: string;
  quotedAwaiting: string;
  /** A customer job the worker has marked done, awaiting their answer. */
  completedAwaiting: string;
  /** The customer has named a figure of their own on a re-quote. */
  counterAsk: (price: number) => string;
  /** The opt-in live-updates switch on the jobs list. */
  live: string;
  liveOn: string;
  liveOff: string;
  updateError: string;
  /**
   * Booking commitments (KAARIGAR_RELIABILITY_FEATURE.md §9.4).
   *
   * Every one of these renders ONLY on a job that has a booking. A worker's own
   * jobs, and everything from before BOOKINGS_ENABLED was turned on, never reach
   * this copy at all - they keep the one-tap wording above.
   */
  booking: {
    /** Time left to answer a new request, and what happens when it runs out. */
    respondBy: (left: string) => string;
    respondOverdue: string;
    declineCta: string;
    declineConfirm: string;
    declineYes: string;
    declineNo: string;
    /** Time left to name a slot once the customer has agreed the price. */
    scheduleBy: (left: string) => string;
    scheduleOverdue: string;
    scheduleCta: string;
    /** The slot picker. */
    slotTitle: string;
    slotDate: string;
    slotWindow: string;
    slotMorning: string;
    slotAfternoon: string;
    slotEvening: string;
    slotConfirm: string;
    slotCancel: string;
    slotAgreed: (when: string) => string;
    /** Arrival. */
    arriveBy: (left: string) => string;
    arriveOverdue: string;
    arrivedCta: string;
    otpTitle: string;
    otpHint: string;
    otpPlaceholder: string;
    otpSubmit: string;
    otpCancel: string;
    /** Refusals from the check-in route. */
    otpWrong: string;
    otpLocked: string;
    otpNeeded: string;
    /** Standing banners. */
    lateBanner: string;
    noShowNotice: string;
    expiredNotice: string;
    declinedNotice: string;
    cancelledNotice: string;
    /** Reschedule, and the three reasons it may be unavailable. */
    rescheduleCta: string;
    reschedulePending: string;
    rescheduleUsed: string;
    rescheduleTooLate: string;
    rescheduleTitle: string;
    rescheduleReason: string;
    rescheduleSend: string;
    /** Cancelling, and the warning that it will cost the worker. */
    cancelCta: string;
    lateCancelWarning: string;
    lateCancelConfirm: string;
    lateCancelKeep: string;
    cancelConfirm: string;
    /** Slot validation, mirrored from the server so the wording is local. */
    slotRequired: string;
    slotInPast: string;
    slotOrder: string;
    slotTooLong: string;
    slotTooFar: string;
    /** A state the screen and the server disagree about. */
    conflict: string;
    /** Relative durations: "2h 15m", "45m". */
    duration: (hours: number, minutes: number) => string;
    /** The booking's own status, for the small grey label. */
    state: Record<BookingStatus, string>;
  };
  state: Record<JobState, string>;
  action: Partial<Record<JobState, string>>;
  payment: Record<'upi' | 'cash' | 'pending' | 'settled', string>;
}

export interface KamaiCopy {
  eyebrow: string;
  titleSuffix: string;
  description: string;
  voiceSuffix: string;
  typePayment: string;
  incomePdf: string;
  addReceivedPayment: string;
  manualHint: string;
  amount: string;
  paymentMethod: string;
  ledgerEntriesToday: (count: number) => string;
  actual: string;
  cash: string;
  upiOnline: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  savePayment: string;
  cancel: string;
  week: string;
  month: string;
  weekCaption: string;
  monthCaption: string;
  paymentSplit: string;
  receivedThisMonth: string;
  actualLedger: string;
  outstanding: string;
  outstandingCaption: string;
  noEntries: string;
  shownAmount: string;
  correction: string;
  incomeReceived: string;
  settledOutgoing: string;
  outstandingOutgoing: string;
  enterAmount: string;
  describePayment: string;
}

export interface AssistantCopy {
  unsupportedSpeech: string;
  idleListening: string;
  transcriptPlaceholder: string;
  listeningHint: string;
  speakHint: string;
  extractedDetails: string;
  trade: string;
  experience: string;
  years: string;
  skills: string;
  jobName: string;
  amount: string;
  customer: string;
  location: string;
  earningsBreakdown: string;
  total: string;
  quickPrompts: string;
  hideText: string;
  typeEdit: string;
  manualPlaceholder: string;
  startListening: string;
  stopListening: string;
  passportReady: (name: string) => string;
  passportReadyDescription: string;
  passportPreview: string;
  demoOnly: string;
  defaultTrade: string;
  defaultSkills: string[];
  credentialDemoNotice: string;
}

export interface PassportCopy {
  governmentAligned: string;
  subtitle: string;
  addWorkVoice: string;
  nationalIdentity: string;
  passportTitle: string;
  identityVerified: string;
  verificationPending: string;
  profileNotVerified: string;
  experience: string;
  years: string;
  jobsDone: string;
  rating: string;
  skillsListed: string;
  evidenceBuilds: string;
  credentialsListed: string;
  credentialLink: string;
  credentialStatus: string;
  notLinked: string;
  sandboxDemo: string;
  credentialNotice: string;
  scanAlt: string;
  scanTitle: string;
  scanDescription: string;
  joined: (date: string) => string;
  linkCopied: string;
  share: string;
  downloadId: string;
  downloadNotice: string;
  trustEvidence: string;
  trustDescription: string;
  outOf100: string;
  trustRows: string[];
  benefits: Array<{ title: string; description: string }>;
  /**
   * The reliability line beside the trust rubric (KAARIGAR_RELIABILITY_FEATURE.md
   * §9.1 D4). Rendered ONLY when the server has booking stats to give - with
   * BOOKINGS_ENABLED off the stats route answers 404 and none of this appears.
   */
  reliability: {
    title: string;
    description: string;
    /** Shown instead of a percentage when there is no recorded visit to judge. */
    empty: string;
    onTime: string;
    late: string;
    noShow: string;
    responseRate: (percent: number) => string;
    responseEmpty: string;
  };
}

export interface ProfileCopy {
  identityVerified: string;
  verificationPending: string;
  profileNotVerified: string;
  yearsExperience: (years: number) => string;
  updateVoice: string;
  workerInformation: string;
  cancelEdit: string;
  editDetails: string;
  fullName: string;
  trade: string;
  experience: string;
  location: string;
  dailyRate: string;
  saveProfile: string;
  years: string;
  perDay: string;
  bloodGroup: string;
  skillsListed: string;
  trainingCertificates: string;
  credentialNotice: string;
}

export interface ScreenCopy {
  quote: QuoteCopy;
  home: HomeCopy;
  jobs: JobsCopy;
  kamai: KamaiCopy;
  assistant: AssistantCopy;
  passport: PassportCopy;
  profile: ProfileCopy;
}

const DISPLAY_VALUE_TRANSLATIONS: Record<string, Record<'hi' | 'pa', string>> = {
  Electrician: { hi: 'इलेक्ट्रीशियन', pa: 'ਇਲੈਕਟ੍ਰੀਸ਼ੀਅਨ' },
  Plumber: { hi: 'प्लंबर', pa: 'ਪਲੰਬਰ' },
  Carpenter: { hi: 'बढ़ई', pa: 'ਤਰਖਾਣ' },
  'House Wiring': { hi: 'घर की वायरिंग', pa: 'ਘਰ ਦੀ ਵਾਇਰਿੰਗ' },
  'Fan Installation': { hi: 'पंखा लगाना', pa: 'ਪੱਖਾ ਲਗਾਉਣਾ' },
  'MCB & Switchboard Installation': { hi: 'MCB और स्विचबोर्ड लगाना', pa: 'MCB ਅਤੇ ਸਵਿੱਚਬੋਰਡ ਲਗਾਉਣਾ' },
  'Inverter & Battery Wiring': { hi: 'इन्वर्टर और बैटरी वायरिंग', pa: 'ਇਨਵਰਟਰ ਅਤੇ ਬੈਟਰੀ ਵਾਇਰਿੰਗ' },
  'Appliance Earthing & Safety': { hi: 'उपकरण अर्थिंग और सुरक्षा', pa: 'ਉਪਕਰਨ ਅਰਥਿੰਗ ਅਤੇ ਸੁਰੱਖਿਆ' },
  'Earthing Check': { hi: 'अर्थिंग जांच', pa: 'ਅਰਥਿੰਗ ਜਾਂਚ' },
  'Ceiling Fan Installation': { hi: 'सीलिंग पंखा लगाना', pa: 'ਛੱਤ ਵਾਲਾ ਪੱਖਾ ਲਗਾਉਣਾ' },
  'Fan Repair': { hi: 'पंखा मरम्मत', pa: 'ਪੱਖਾ ਮੁਰੰਮਤ' },
  'Fault Diagnosis': { hi: 'खराबी की जांच', pa: 'ਖ਼ਰਾਬੀ ਦੀ ਜਾਂਚ' },
  'Geyser Point': { hi: 'गीजर पॉइंट', pa: 'ਗੀਜ਼ਰ ਪੁਆਇੰਟ' },
  'House Wiring Point': { hi: 'हाउस वायरिंग पॉइंट', pa: 'ਘਰ ਦੀ ਵਾਇਰਿੰਗ ਪੁਆਇੰਟ' },
  'Inverter Installation': { hi: 'इन्वर्टर लगाना', pa: 'ਇਨਵਰਟਰ ਲਗਾਉਣਾ' },
  'Light Fitting': { hi: 'लाइट फिटिंग', pa: 'ਲਾਈਟ ਫਿਟਿੰਗ' },
  'MCB Replacement': { hi: 'एमसीबी बदलना', pa: 'ਐਮਸੀਬੀ ਬਦਲਣਾ' },
  'Switchboard Installation': { hi: 'स्विचबोर्ड लगाना', pa: 'ਸਵਿੱਚਬੋਰਡ ਲਗਾਉਣਾ' },
  'ITI Electrician National Trade Certificate (NTC)': { hi: 'ITI इलेक्ट्रीशियन राष्ट्रीय ट्रेड प्रमाणपत्र (NTC)', pa: 'ITI ਇਲੈਕਟ੍ਰੀਸ਼ੀਅਨ ਰਾਸ਼ਟਰੀ ਟਰੇਡ ਸਰਟੀਫਿਕੇਟ (NTC)' },
  'Pradhan Mantri Kaushal Vikas Yojana (PMKVY) Level 4': { hi: 'प्रधानमंत्री कौशल विकास योजना (PMKVY) स्तर 4', pa: 'ਪ੍ਰਧਾਨ ਮੰਤਰੀ ਕੌਸ਼ਲ ਵਿਕਾਸ ਯੋਜਨਾ (PMKVY) ਪੱਧਰ 4' },
  'ITI Electrician Certified': { hi: 'ITI इलेक्ट्रीशियन प्रमाणित', pa: 'ITI ਇਲੈਕਟ੍ਰੀਸ਼ੀਅਨ ਪ੍ਰਮਾਣਿਤ' },
  'Fan Installation & Regulator Replacement': { hi: 'पंखा लगाना और रेगुलेटर बदलना', pa: 'ਪੱਖਾ ਲਗਾਉਣਾ ਅਤੇ ਰੈਗੂਲੇਟਰ ਬਦਲਣਾ' },
  'Main MCB Box Sparking & Repair': { hi: 'मुख्य MCB बॉक्स स्पार्किंग और मरम्मत', pa: 'ਮੁੱਖ MCB ਬਾਕਸ ਸਪਾਰਕਿੰਗ ਅਤੇ ਮੁਰੰਮਤ' },
  'Main MCB Box Repair': { hi: 'मुख्य MCB बॉक्स मरम्मत', pa: 'ਮੁੱਖ MCB ਬਾਕਸ ਮੁਰੰਮਤ' },
  '3-BHK Modular Switchboard Setup': { hi: '3-BHK मॉड्यूलर स्विचबोर्ड सेटअप', pa: '3-BHK ਮੋਡਿਊਲਰ ਸਵਿੱਚਬੋਰਡ ਸੈੱਟਅਪ' },
  'Geyser Heavy Load Power Point & Earthing': { hi: 'गीजर हेवी लोड पावर पॉइंट और अर्थिंग', pa: 'ਗੀਜ਼ਰ ਹੈਵੀ ਲੋਡ ਪਾਵਰ ਪੁਆਇੰਟ ਅਤੇ ਅਰਥਿੰਗ' },
  'Geyser Power Point & Earthing': { hi: 'गीजर पावर पॉइंट और अर्थिंग', pa: 'ਗੀਜ਼ਰ ਪਾਵਰ ਪੁਆਇੰਟ ਅਤੇ ਅਰਥਿੰਗ' },
  'Inverter Wiring & Battery Checkup': { hi: 'इन्वर्टर वायरिंग और बैटरी जांच', pa: 'ਇਨਵਰਟਰ ਵਾਇਰਿੰਗ ਅਤੇ ਬੈਟਰੀ ਜਾਂਚ' },
  'Neha Sharma': { hi: 'नेहा शर्मा', pa: 'ਨੇਹਾ ਸ਼ਰਮਾ' },
  'Rajesh Gupta': { hi: 'राजेश गुप्ता', pa: 'ਰਾਜੇਸ਼ ਗੁਪਤਾ' },
  'Amit Verma': { hi: 'अमित वर्मा', pa: 'ਅਮਿਤ ਵਰਮਾ' },
  'Pooja Mehra': { hi: 'पूजा मेहरा', pa: 'ਪੂਜਾ ਮਹਿਰਾ' },
  'Suresh Rana': { hi: 'सुरेश राणा', pa: 'ਸੁਰੇਸ਼ ਰਾਣਾ' },
  'Sector 35-C, Chandigarh': { hi: 'सेक्टर 35-C, चंडीगढ़', pa: 'ਸੈਕਟਰ 35-C, ਚੰਡੀਗੜ੍ਹ' },
  'Sector 35, Chandigarh': { hi: 'सेक्टर 35, चंडीगढ़', pa: 'ਸੈਕਟਰ 35, ਚੰਡੀਗੜ੍ਹ' },
  'Sector 22, Chandigarh': { hi: 'सेक्टर 22, चंडीगढ़', pa: 'ਸੈਕਟਰ 22, ਚੰਡੀਗੜ੍ਹ' },
  'Sector 44-B, Chandigarh': { hi: 'सेकਟਰ 44-B, ਚੰਡੀਗੜ੍ਹ' , pa: 'ਸੈਕਟਰ 44-B, ਚੰਡੀਗੜ੍ਹ' },
  'Phase 7, Mohali': { hi: 'फेज़ 7, मोहाली', pa: 'ਫੇਜ਼ 7, ਮੋਹਾਲੀ' },
};

const COMMON_LEDGER_PHRASES: Record<string, Record<'hi' | 'pa', string>> = {
  'daily work earnings': { hi: 'आज की काम की कमाई', pa: 'ਅੱਜ ਦੀ ਕੰਮ ਦੀ ਕਮਾਈ' },
  "today's work": { hi: 'आज का काम', pa: 'ਅੱਜ ਦਾ ਕੰਮ' },
  'received payment': { hi: 'मिला हुआ भुगतान', pa: 'ਮਿਲਿਆ ਭੁਗਤਾਨ' },
  'fan installation': { hi: 'पंखा लगाना', pa: 'ਪੱਖਾ ਲਗਾਉਣਾ' },
  'main mcb box repair': { hi: 'मुख्य एमसीबी बॉक्स मरम्मत', pa: 'ਮੁੱਖ ਐਮਸੀਬੀ ਬਾਕਸ ਮੁਰੰਮਤ' },
  'modular switchboard setup': { hi: 'मॉड्यूलर स्विचबोर्ड सेटअप', pa: 'ਮੋਡਿਊਲਰ ਸਵਿੱਚਬੋਰਡ ਸੈੱਟਅਪ' },
  'geyser power point': { hi: 'गीजर पावर पॉइंट', pa: 'ਗੀਜ਼ਰ ਪਾਵਰ ਪੁਆਇੰਟ' },
  'inverter wiring': { hi: 'इन्वर्टर वायरिंग', pa: 'ਇਨਵਰਟਰ ਵਾਇਰਿੰਗ' },
  'battery checkup': { hi: 'बैटरी जांच', pa: 'ਬੈਟਰੀ ਜਾਂਚ' },
  'switchboard installation': { hi: 'स्विचबोर्ड लगाना', pa: 'ਸਵਿੱਚਬੋਰਡ ਲਗਾਉਣਾ' },
  'house wiring': { hi: 'घर की वायरिंग', pa: 'ਘਰ ਦੀ ਵਾਇਰਿੰਗ' },
  'Customer': { hi: 'ग्राहक', pa: 'ਗਾਹਕ' },
  'payment': { hi: 'भुगतान', pa: 'ਭੁਗਤਾਨ' },
  'repair': { hi: 'मरम्मत', pa: 'ਮੁਰੰਮਤ' },
  'installation': { hi: 'लगाना', pa: 'ਲਗਾਉਣਾ' },
  'wiring': { hi: 'वायरिंग', pa: 'ਵਾਇਰਿੰਗ' },
  'checkup': { hi: 'जांच', pa: 'ਜਾਂਚ' },
  'earthing': { hi: 'अर्थिंग', pa: 'ਅਰਥਿੰਗ' },
  'earthing check': { hi: 'अर्थिंग जांच', pa: 'ਅਰਥਿੰਗ ਜਾਂਚ' },
  'ceiling fan installation': { hi: 'सीलिंग पंखा लगाना', pa: 'ਛੱਤ ਵਾਲਾ ਪੱਖਾ ਲਗਾਉਣਾ' },
  'fan repair': { hi: 'पंखा मरम्मत', pa: 'ਪੱਖਾ ਮੁਰੰਮਤ' },
  'fault diagnosis': { hi: 'खराबी की जांच', pa: 'ਖ਼ਰਾਬੀ ਦੀ ਜਾਂਚ' },
  'geyser point': { hi: 'गीजर पॉइंट', pa: 'ਗੀਜ਼ਰ ਪੁਆਇੰਟ' },
  'house wiring point': { hi: 'घर की वायरिंग पॉइंट', pa: 'ਘਰ ਦੀ ਵਾਇਰਿੰਗ ਪੁਆਇੰਟ' },
  'inverter install': { hi: 'इन्वर्टर लगाना', pa: 'ਇਨਵਰਟਰ ਲਗਾਉਣਾ' },
  'appliance fitting': { hi: 'उपकरण फिटिंग', pa: 'ਉਪਕਰਨ ਫਿਟਿੰਗ' },
  'mcb replacement': { hi: 'एमसीबी बदलना', pa: 'ਐਮਸੀਬੀ ਬਦਲਣਾ' },
  'tap leakage': { hi: 'नल का रिसाव', pa: 'ਨਲ ਦਾ ਰਿਸਾਅ' },
  'geyser plumbing': { hi: 'गीजर प्लंबिंग', pa: 'ਗੀਜ਼ਰ ਪਲੰਬਿੰਗ' },
  'pipe replacement': { hi: 'पाइप बदलना', pa: 'ਪਾਈਪ ਬਦਲਣਾ' },
  'tap replacement': { hi: 'नल बदलना', pa: 'ਨਲ ਬਦਲਣਾ' },
  'water tank cleaning': { hi: 'पानी की टंकी साफ करना', pa: 'ਪਾਣੀ ਦੀ ਟੈਂਕੀ ਸਾਫ਼ ਕਰਨਾ' },
  'motor install': { hi: 'मोटर लगाना', pa: 'ਮੋਟਰ ਲਗਾਉਣਾ' },
  'pipe replace metre': { hi: 'पाइप प्रति मीटर बदलना', pa: 'ਪਾਈਪ ਪ੍ਰਤੀ ਮੀਟਰ ਬਦਲਣਾ' },
  'unsupported task': { hi: 'असमर्थित काम', pa: 'ਅਸਮਰਥਿਤ ਕੰਮ' },
};

function translateKnownLedgerPhrases(value: string, language: 'hi' | 'pa'): string {
  return Object.entries({ ...DISPLAY_VALUE_TRANSLATIONS, ...COMMON_LEDGER_PHRASES })
    .sort(([left], [right]) => right.length - left.length)
    .reduce((text, [source, translations]) => {
      const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return text.replace(new RegExp(escaped, 'gi'), translations[language]);
    }, value);
}

function canonicalizeDisplayValue(value: string): string {
  const phrases = Object.entries({ ...DISPLAY_VALUE_TRANSLATIONS, ...COMMON_LEDGER_PHRASES })
    .sort(([, left], [, right]) => {
      const leftLength = Math.max(left.hi.length, left.pa.length);
      const rightLength = Math.max(right.hi.length, right.pa.length);
      return rightLength - leftLength;
    });
  const normalizedTerms = value.replace(/एमसीबी|ਐਮਸੀਬੀ/gi, 'MCB');
  return phrases.reduce((text, [source, translations]) => {
    const escapedHindi = translations.hi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedPunjabi = translations.pa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text
      .replace(new RegExp(escapedHindi, 'gi'), source)
      .replace(new RegExp(escapedPunjabi, 'gi'), source);
  }, normalizedTerms);
}

/** Translate known demo/canonical labels only at render time; raw user data stays intact. */
export function localizeDisplayValue(value: string, language: SupportedLanguage): string {
  const canonicalValue = canonicalizeDisplayValue(value);
  if (language === 'en') return canonicalValue;
  if (language !== 'hi' && language !== 'pa') return value;
  const technicalTerms = (text: string) => text.replace(/\bMCB\b/gi, language === 'hi' ? 'एमसीबी' : 'ਐਮਸੀਬੀ');
  const exact = DISPLAY_VALUE_TRANSLATIONS[canonicalValue]?.[language];
  if (exact) return technicalTerms(exact);

  // Some legacy/demo ledger rows store the job title and customer in one
  // display string. Translate both parts without changing the stored value.
  const customerSuffix = canonicalValue.match(/^(.*)\s*\((?:Customer|ग्राहक|ਗਾਹਕ):\s*([^)]*)\)$/i);
  if (customerSuffix) {
    const [, title, customer] = customerSuffix;
    return `${localizeDisplayValue(title.trim(), language)} (${language === 'hi' ? 'ग्राहक' : 'ਗਾਹਕ'}: ${localizeDisplayValue(customer.trim(), language)})`;
  }
  return technicalTerms(translateKnownLedgerPhrases(canonicalValue, language));
}

export function localizeWorkerName(name: string, language: SupportedLanguage): string {
  if (name.trim().toLowerCase() !== 'ramesh kumar') return name;
  if (language === 'hi') return 'रमेश कुमार';
  if (language === 'pa') return 'ਰਮੇਸ਼ ਕੁਮਾਰ';
  return name;
}

const tradeNamesHi: Record<string, string> = {
  electrician: 'इलेक्ट्रीशियन',
  plumber: 'प्लंबर',
};

const tradeNamesEn: Record<string, string> = {
  electrician: 'Electrician',
  plumber: 'Plumber',
};

const taskNamesHi: Record<string, string> = {
  fan_install: 'सीलिंग पंखा लगाना',
  fan_repair: 'पंखा रिपेयर',
  switchboard_install: 'स्विचबोर्ड लगाना',
  mcb_replace: 'एमसीबी बदलना',
  light_fitting: 'लाइट फिटिंग',
  tap_replace: 'नल बदलना',
  leak_repair: 'लीक रिपेयर',
  toilet_install: 'टॉयलेट लगाना',
  water_tank_clean: 'पानी की टंकी साफ करना',
  drain_unblock: 'नाली खोलना',
};

const taskNamesEn: Record<string, string> = {
  fan_install: 'Ceiling fan installation',
  fan_repair: 'Fan repair',
  switchboard_install: 'Switchboard installation',
  mcb_replace: 'MCB replacement',
  light_fitting: 'Light fitting',
  tap_replace: 'Tap replacement',
  leak_repair: 'Leak repair',
  toilet_install: 'Toilet installation',
  water_tank_clean: 'Water tank cleaning',
  drain_unblock: 'Drain unblocking',
};

const tradeNamesPa: Record<string, string> = {
  electrician: 'ਇਲੈਕਟ੍ਰੀਸ਼ੀਅਨ',
  plumber: 'ਪਲੰਬਰ',
};

const taskNamesPa: Record<string, string> = {
  fan_install: 'ਛੱਤ ਵਾਲਾ ਪੱਖਾ ਲਗਾਉਣਾ',
  fan_repair: 'ਪੱਖਾ ਮੁਰੰਮਤ',
  switchboard_install: 'ਸਵਿੱਚਬੋਰਡ ਲਗਾਉਣਾ',
  mcb_replace: 'ਐਮਸੀਬੀ ਬਦਲਣਾ',
  light_fitting: 'ਲਾਈਟ ਫਿਟਿੰਗ',
  tap_replace: 'ਨਲ ਬਦਲਣਾ',
  leak_repair: 'ਰਿਸਾਅ ਮੁਰੰਮਤ',
  toilet_install: 'ਟਾਇਲਟ ਲਗਾਉਣਾ',
  water_tank_clean: 'ਪਾਣੀ ਦੀ ਟੈਂਕੀ ਸਾਫ਼ ਕਰਨਾ',
  drain_unblock: 'ਨਾਲੀ ਖੋਲ੍ਹਣਾ',
};

const quoteHi: QuoteCopy = {
  eyebrow: 'मोल-भाव कोट',
  title: 'निष्पक्ष, मदवार कोट बनाएं',
  description: 'एक काम चुनें, संदर्भित उचित-दाम सीमा देखें और मज़दूरी, सामग्री व आने का शुल्क जोड़ें।',
  trade: 'काम का प्रकार',
  task: 'काम (प्रति जॉब)',
  band: 'संदर्भित उचित-दाम सीमा',
  labour: 'मज़दूरी',
  materials: 'सामग्री',
  visitCharge: 'आने का शुल्क',
  total: 'कुल कोट',
  share: 'कोट साझा करें',
  download: 'कोट डाउनलोड करें',
  copied: 'कोट कॉपी हो गया।',
  downloaded: 'कोट डाउनलोड हो गया।',
  source: 'स्रोत',
  median: 'मध्य दर',
  localObservations: (count) => `${count} स्थानीय ऑब्ज़र्वेशन`,
  noLocalObservations: 'संदर्भित स्रोत · स्थानीय ऑब्ज़र्वेशन अभी नहीं हैं',
  loadingTasks: 'कामों की सूची लोड हो रही है…',
  fallbackRates: 'संदर्भित रेट सूची ऑफ़लाइन दिखाई जा रही है।',
  noBand: 'इस काम के लिए अभी उचित-दाम सीमा उपलब्ध नहीं है। अनुभव के आधार पर कोट दें।',
  aboveBandWarning: 'यह कोट संदर्भित सीमा से 20% से अधिक ऊपर है। अतिरिक्त काम या सामग्री की पुष्टि करें।',
  loadBandError: 'संदर्भित दाम-सीमा लोड नहीं हो सकी।',
  tradeNames: tradeNamesHi,
  taskNames: taskNamesHi,
};

const quoteEn: QuoteCopy = {
  eyebrow: 'Mol-Bhav quote',
  title: 'Build a fair, itemised quote',
  description: 'Choose a supported job, compare the cited band, then add labour, materials and a visit charge.',
  trade: 'Trade',
  task: 'Task (per job)',
  band: 'Cited fair-price band',
  labour: 'Labour',
  materials: 'Materials',
  visitCharge: 'Visit charge',
  total: 'Quote total',
  share: 'Share quote',
  download: 'Download quote',
  copied: 'Quote copied to clipboard.',
  downloaded: 'Quote downloaded.',
  source: 'Source',
  median: 'median',
  localObservations: (count) => `${count} local observations`,
  noLocalObservations: 'Cited source · no local observations yet',
  loadingTasks: 'Loading supported jobs…',
  fallbackRates: 'Showing the cited rate list available on this device.',
  noBand: 'No fair-price band is available for this job yet. Quote from experience.',
  aboveBandWarning: 'This quote is more than 20% above the cited range. Please confirm the extra work or materials.',
  loadBandError: 'Could not load the cited rate band.',
  tradeNames: tradeNamesEn,
  taskNames: taskNamesEn,
};

const quotePa: QuoteCopy = {
  eyebrow: 'ਮੋਲ-ਭਾਵ ਕੋਟ',
  title: 'ਨਿਰਪੱਖ, ਵੇਰਵੇ ਵਾਲਾ ਕੋਟ ਬਣਾਓ',
  description: 'ਇੱਕ ਕੰਮ ਚੁਣੋ, ਦਿੱਤੀ ਉਚਿਤ-ਦਾਮ ਹੱਦ ਵੇਖੋ ਅਤੇ ਮਜ਼ਦੂਰੀ, ਸਮੱਗਰੀ ਤੇ ਆਉਣ ਦਾ ਖਰਚਾ ਜੋੜੋ।',
  trade: 'ਕੰਮ ਦੀ ਕਿਸਮ',
  task: 'ਕੰਮ (ਹਰ ਜੌਬ)',
  band: 'ਦਿੱਤੀ ਉਚਿਤ-ਦਾਮ ਹੱਦ',
  labour: 'ਮਜ਼ਦੂਰੀ',
  materials: 'ਸਮੱਗਰੀ',
  visitCharge: 'ਆਉਣ ਦਾ ਖਰਚਾ',
  total: 'ਕੁੱਲ ਕੋਟ',
  share: 'ਕੋਟ ਸਾਂਝਾ ਕਰੋ',
  download: 'ਕੋਟ ਡਾਊਨਲੋਡ ਕਰੋ',
  copied: 'ਕੋਟ ਕਲਿੱਪਬੋਰਡ ਵਿੱਚ ਕਾਪੀ ਹੋ ਗਿਆ।',
  downloaded: 'ਕੋਟ ਡਾਊਨਲੋਡ ਹੋ ਗਿਆ।',
  source: 'ਸਰੋਤ',
  median: 'ਮੱਧ ਦਰ',
  localObservations: (count) => String(count) + ' ਸਥਾਨਕ ਨਿਰੀਖਣ',
  noLocalObservations: 'ਦਿੱਤਾ ਸਰੋਤ · ਹਾਲੇ ਸਥਾਨਕ ਨਿਰੀਖਣ ਨਹੀਂ',
  loadingTasks: 'ਸਹਾਇਕ ਕੰਮਾਂ ਦੀ ਸੂਚੀ ਲੋਡ ਹੋ ਰਹੀ ਹੈ…',
  fallbackRates: 'ਇਸ ਡਿਵਾਈਸ ਤੇ ਉਪਲਬਧ ਦਿੱਤੀ ਰੇਟ ਸੂਚੀ ਦਿਖਾਈ ਜਾ ਰਹੀ ਹੈ।',
  noBand: 'ਇਸ ਕੰਮ ਲਈ ਹਾਲੇ ਉਚਿਤ-ਦਾਮ ਹੱਦ ਉਪਲਬਧ ਨਹੀਂ। ਤਜਰਬੇ ਅਨੁਸਾਰ ਕੋਟ ਦਿਓ।',
  aboveBandWarning: 'ਇਹ ਕੋਟ ਦਿੱਤੀ ਹੱਦ ਤੋਂ 20% ਤੋਂ ਵੱਧ ਹੈ। ਵਾਧੂ ਕੰਮ ਜਾਂ ਸਮੱਗਰੀ ਦੀ ਪੁਸ਼ਟੀ ਕਰੋ।',
  loadBandError: 'ਹਵਾਲੇ ਵਾਲਾ ਰੇਟ-ਬੈਂਡ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕਿਆ।',
  tradeNames: tradeNamesPa,
  taskNames: taskNamesPa,
};

const homeHi: HomeCopy = {
  greeting: (name) => `नमस्ते ${name} जी 👋`,
  identityVerified: 'पहचान सत्यापित',
  verificationPending: 'सत्यापन बाकी',
  profileNotVerified: 'प्रोफाइल सत्यापित नहीं',
  heroTitle: 'बोलिए, हम आपका काम आसान बनाएंगे!',
  heroDescription: 'कुछ भी टाइप करने की ज़रूरत नहीं है। बस माइक दबाइए और बोलिए।',
  jobsCategory: 'काम',
  jobsExample: '“पंखा लगाया, ₹1100 मिले…”',
  kamaiCategory: 'कमाई',
  kamaiExample: '“आज 2 काम, 1500 और 1200…”',
  passportCategory: 'पासपोर्ट',
  passportExample: 'QR सत्यापित पहचान पत्र',
  profileCategory: 'प्रोफाइल',
  profileExample: 'हुनर या रेट कार्ड अपडेट करें',
  voiceSuffix: ' (बोलकर)',
  viewLedger: 'खाता देखें',
  jobsToday: (count) => `${count} काम आज पूरे`,
  ratingTitle: 'कारीगर रेटिंग व विश्वास',
  passport: 'पासपोर्ट',
  recordedJobs: (count) => `(${count}+ दर्ज काम)`,
  evidenceSnapshot: 'सबूत का सार',
  seeAll: (count) => `सभी देखें (${count})`,
  demoTitle: 'डेमो (एक टैप वाले उदाहरण):',
  demoProfile: '🎙️ 1. AI प्रोफाइल बनाने का उदाहरण',
  demoJob: '🎙️ 2. “सेक्टर 35 में पंखा…” काम का उदाहरण',
  demoKamai: '🎙️ 3. “आज 2 काम…” कमाई का उदाहरण',
};

const homeEn: HomeCopy = {
  greeting: (name) => `Hello ${name} 👋`,
  identityVerified: 'Identity verified',
  verificationPending: 'Verification pending',
  profileNotVerified: 'Profile not verified',
  heroTitle: 'Speak, and we will make your work easier!',
  heroDescription: 'You do not need to type anything. Tap the microphone and speak.',
  jobsCategory: 'Jobs',
  jobsExample: '“Installed a fan, received ₹1100…”',
  kamaiCategory: 'Kamai',
  kamaiExample: '“Two jobs today, 1500 and 1200…”',
  passportCategory: 'Passport',
  passportExample: 'QR-verified identity card',
  profileCategory: 'Profile',
  profileExample: 'Update skills or rate card',
  voiceSuffix: ' (by voice)',
  viewLedger: 'View ledger',
  jobsToday: (count) => `${count} jobs completed today`,
  ratingTitle: 'Kaarigar rating and trust',
  passport: 'Passport',
  recordedJobs: (count) => `(${count}+ recorded jobs)`,
  evidenceSnapshot: 'Evidence snapshot',
  seeAll: (count) => `See all (${count})`,
  demoTitle: 'Hackathon demo (one-tap scenarios):',
  demoProfile: '🎙️ 1. Complete AI profile builder demo',
  demoJob: '🎙️ 2. “Sector 35 fan…” job demo',
  demoKamai: '🎙️ 3. “Two jobs…” Kamai demo',
};

const homePa: HomeCopy = {
  greeting: (name) => 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ' + name + ' ਜੀ 👋',
  identityVerified: 'ਪਛਾਣ ਦੀ ਪੁਸ਼ਟੀ ਹੋ ਗਈ',
  verificationPending: 'ਪੁਸ਼ਟੀ ਬਾਕੀ ਹੈ',
  profileNotVerified: 'ਪ੍ਰੋਫਾਈਲ ਦੀ ਪੁਸ਼ਟੀ ਨਹੀਂ ਹੋਈ',
  heroTitle: 'ਬੋਲੋ, ਅਸੀਂ ਤੁਹਾਡਾ ਕੰਮ ਸੌਖਾ ਬਣਾਵਾਂਗੇ!',
  heroDescription: 'ਕੁਝ ਵੀ ਲਿਖਣ ਦੀ ਲੋੜ ਨਹੀਂ। ਮਾਈਕ ਦਬਾਓ ਅਤੇ ਬੋਲੋ।',
  jobsCategory: 'ਕੰਮ',
  jobsExample: '“ਪੱਖਾ ਲਗਾਇਆ, ₹1100 ਮਿਲੇ…”',
  kamaiCategory: 'ਕਮਾਈ',
  kamaiExample: '“ਅੱਜ 2 ਕੰਮ, 1500 ਅਤੇ 1200…”',
  passportCategory: 'ਪਾਸਪੋਰਟ',
  passportExample: 'QR ਨਾਲ ਪੁਸ਼ਟੀ ਕੀਤਾ ਪਛਾਣ ਪੱਤਰ',
  profileCategory: 'ਪ੍ਰੋਫਾਈਲ',
  profileExample: 'ਹੁਨਰ ਜਾਂ ਰੇਟ ਕਾਰਡ ਅਪਡੇਟ ਕਰੋ',
  voiceSuffix: ' (ਬੋਲ ਕੇ)',
  viewLedger: 'ਲੇਜਰ ਵੇਖੋ',
  jobsToday: (count) => String(count) + ' ਕੰਮ ਅੱਜ ਪੂਰੇ ਹੋਏ',
  ratingTitle: 'ਕਾਰੀਗਰ ਦੀ ਰੇਟਿੰਗ ਅਤੇ ਭਰੋਸਾ',
  passport: 'ਪਾਸਪੋਰਟ',
  recordedJobs: (count) => '(' + String(count) + '+ ਦਰਜ ਕੀਤੇ ਕੰਮ)',
  evidenceSnapshot: 'ਸਬੂਤ ਦਾ ਸਾਰ',
  seeAll: (count) => 'ਸਾਰੇ ਵੇਖੋ (' + String(count) + ')',
  demoTitle: 'ਡੈਮੋ (ਇੱਕ ਟੈਪ ਵਾਲੇ ਉਦਾਹਰਨ):',
  demoProfile: '🎙️ 1. AI ਪ੍ਰੋਫਾਈਲ ਬਣਾਉਣ ਦਾ ਡੈਮੋ',
  demoJob: '🎙️ 2. “ਸੈਕਟਰ 35 ਵਿੱਚ ਪੱਖਾ…” ਕੰਮ ਦਾ ਡੈਮੋ',
  demoKamai: '🎙️ 3. “ਅੱਜ 2 ਕੰਮ…” ਕਮਾਈ ਦਾ ਡੈਮੋ',
};

const jobsHi: JobsCopy = {
  eyebrow: 'आवाज़ से काम दर्ज करें',
  description: 'बस बोलिए — “सेक्टर 35 में पंखा लगाया, ₹1100 मिले” और काम दर्ज हो जाएगा!',
  createQuote: 'मदवार कोट बनाएं',
  allJobs: (count) => `सभी काम (${count})`,
  today: 'आज',
  week: 'इस हफ्ते',
  total: 'कुल राशि',
  searchPlaceholder: 'ग्राहक, जगह या काम खोजें',
  noJobs: 'कोई काम नहीं मिला',
  noJobsHint: 'माइक बटन दबाकर अपना पहला काम बोलकर जोड़ें!',
  speakAdd: '🎙️ बोलकर काम जोड़ें',
  customer: 'ग्राहक',
  location: 'जगह',
  callCustomer: 'ग्राहक को कॉल करें',
  viewMap: 'नक्शे पर देखें',
  lifecycle: 'काम की स्थिति',
  updating: 'अपडेट हो रहा है…',
  apiOnly: 'लाइफसाइकल कंट्रोल API डेमो मोड में उपलब्ध है।',
  waitForSync: 'स्थिति बदलने से पहले काम के सुरक्षित होने तक रुकें।',
  quoteLabel: 'अपना दाम बताएं',
  quotePlaceholder: 'दाम ₹',
  quoteSend: 'दाम भेजें',
  quoteInvalid: 'दाम शून्य से बड़ा होना चाहिए।',
  quotedAwaiting: 'ग्राहक की मंज़ूरी का इंतज़ार है।',
  completedAwaiting: 'ग्राहक की पुष्टि का इंतज़ार है।',
  counterAsk: (price) => `ग्राहक ने ₹${price} माँगा है`,
  live: 'लाइव',
  liveOn: 'नए अनुरोध अपने आप दिखते हैं। रोकने के लिए दबाएँ।',
  liveOff: 'नए अनुरोध अपने आप पाने के लिए दबाएँ।',
  updateError: 'काम अपडेट नहीं हो सका।',
  booking: {
    respondBy: (left) => `${left} में जवाब दें`,
    respondOverdue: 'इस अनुरोध का जवाब देने का समय बीत चुका है।',
    declineCta: 'मना करें',
    declineConfirm: 'इस काम के लिए मना करें? ग्राहक को बता दिया जाएगा।',
    declineYes: 'हाँ, मना करें',
    declineNo: 'रहने दें',
    scheduleBy: (left) => `${left} में समय चुनें`,
    scheduleOverdue: 'समय चुनने की अवधि बीत चुकी है।',
    scheduleCta: 'समय चुनें',
    slotTitle: 'आप कब जाएँगे?',
    slotDate: 'दिन',
    slotWindow: 'समय',
    slotMorning: 'सुबह 9 - 11',
    slotAfternoon: 'दोपहर 1 - 3',
    slotEvening: 'शाम 5 - 7',
    slotConfirm: 'यही समय पक्का करें',
    slotCancel: 'वापस',
    slotAgreed: (when) => `तय समय: ${when}`,
    arriveBy: (left) => `${left} में पहुँचें`,
    arriveOverdue: 'तय समय निकल चुका है।',
    arrivedCta: 'मैं पहुँच गया - कोड डालें',
    otpTitle: 'पहुँचने का कोड',
    otpHint: 'ग्राहक की स्क्रीन पर दिख रहा 4 अंकों का कोड पूछें।',
    otpPlaceholder: '0000',
    otpSubmit: 'पहुँचना दर्ज करें',
    otpCancel: 'वापस',
    otpWrong: 'यह कोड सही नहीं है। ग्राहक से चारों अंक दोबारा पूछें।',
    otpLocked: 'बहुत बार गलत कोड डाला गया। कुछ मिनट बाद कोशिश करें।',
    otpNeeded: 'ग्राहक से मिला 4 अंकों का कोड डालें।',
    lateBanner: 'आपको देर हो रही है। ग्राहक के पास पहुँचें और उनका कोड डालें।',
    noShowNotice: 'दर्ज हुआ कि आप नहीं पहुँचे। इससे आपकी भरोसे की रेटिंग घटी है।',
    expiredNotice: 'जवाब देने से पहले ही यह अनुरोध खत्म हो गया।',
    declinedNotice: 'आपने इस अनुरोध के लिए मना कर दिया था।',
    cancelledNotice: 'यह काम रद्द हो गया।',
    rescheduleCta: 'समय बदलें',
    reschedulePending: 'ग्राहक के नया समय मानने का इंतज़ार है।',
    rescheduleUsed: 'आप एक बार समय बदल चुके हैं।',
    rescheduleTooLate: 'अब समय नहीं बदला जा सकता - तय समय बहुत पास है।',
    rescheduleTitle: 'नया समय माँगें',
    rescheduleReason: 'वजह (ग्राहक को दिखेगी)',
    rescheduleSend: 'नया समय भेजें',
    cancelCta: 'काम रद्द करें',
    lateCancelWarning: 'अभी रद्द करने से आपकी भरोसे की रेटिंग घटेगी।',
    lateCancelConfirm: 'फिर भी रद्द करें',
    lateCancelKeep: 'काम रहने दें',
    cancelConfirm: 'यह काम रद्द करें?',
    slotRequired: 'पहले दिन और समय चुनें।',
    slotInPast: 'यह समय बीत चुका है। आगे का समय चुनें।',
    slotOrder: 'खत्म होने का समय शुरू होने के बाद होना चाहिए।',
    slotTooLong: 'एक स्लॉट 12 घंटे से लंबा नहीं हो सकता।',
    slotTooFar: 'अगले 14 दिनों के अंदर का समय चुनें।',
    conflict: 'यह काम बदल गया है। रिफ्रेश करके दोबारा कोशिश करें।',
    duration: (hours, minutes) => (hours > 0 ? `${hours} घं ${minutes} मि` : `${minutes} मि`),
    state: {
      REQUESTED: 'आपके जवाब का इंतज़ार', RESPONDED: 'दाम भेजा', COMMITTED: 'समय तय',
      ARRIVED: 'आप पहुँचे', COMPLETED: 'काम पूरा', LATE: 'देर', NO_SHOW: 'नहीं पहुँचे',
      EXPIRED: 'खत्म', DECLINED: 'मना किया',
      CANCELLED_BY_CUSTOMER: 'ग्राहक ने रद्द किया', CANCELLED_BY_KAARIGAR: 'आपने रद्द किया',
    },
  },
  state: {
    REQUESTED: 'अनुरोध किया गया', QUOTED: 'कोट भेजा गया', ACCEPTED: 'स्वीकार किया गया',
    SCHEDULED: 'शेड्यूल किया गया', IN_PROGRESS: 'काम चल रहा है', COMPLETED: 'काम पूरा',
    SETTLED: 'भुगतान मिल गया', REVIEWED: 'रिव्यू हो गया', CANCELLED: 'रद्द', DISPUTED: 'विवादित',
  },
  action: {
    QUOTED: 'कोट भेजा', ACCEPTED: 'ग्राहक ने स्वीकार किया', SCHEDULED: 'काम शेड्यूल करें',
    IN_PROGRESS: 'काम शुरू करें', COMPLETED: 'काम पूरा करें', SETTLED: 'भुगतान मिला',
  },
  payment: { upi: '⚡ UPI', cash: '💵 नकद', pending: 'भुगतान बाकी', settled: 'भुगतान मिल गया' },
};

const jobsEn: JobsCopy = {
  eyebrow: 'AI voice job logger',
  description: 'Speak — “Installed a fan in Sector 35 and received ₹1100” — and the job will be recorded!',
  createQuote: 'Create itemised quote',
  allJobs: (count) => `All jobs (${count})`,
  today: 'Today',
  week: 'This week',
  total: 'Total',
  searchPlaceholder: 'Search customer, location or job',
  noJobs: 'No jobs found',
  noJobsHint: 'Tap the microphone to add your first job by voice!',
  speakAdd: '🎙️ Add job by voice',
  customer: 'Customer',
  location: 'Location',
  callCustomer: 'Call customer',
  viewMap: 'View on map',
  lifecycle: 'Lifecycle',
  updating: 'Updating…',
  apiOnly: 'Lifecycle controls require API demo mode.',
  waitForSync: 'Wait for this job to sync before changing its state.',
  quoteLabel: 'Name your price',
  quotePlaceholder: 'Price ₹',
  quoteSend: 'Send price',
  quoteInvalid: 'The price must be greater than zero.',
  quotedAwaiting: 'Waiting for the customer to accept.',
  completedAwaiting: 'Waiting for the customer to confirm the work is done.',
  counterAsk: (price) => `The customer asked for ₹${price}`,
  live: 'Live',
  liveOn: 'New requests appear on their own. Tap to stop.',
  liveOff: 'Tap to let new requests appear on their own.',
  updateError: 'Could not update the job.',
  booking: {
    respondBy: (left) => `Reply within ${left}`,
    respondOverdue: 'The time to reply to this request has passed.',
    declineCta: 'Decline',
    declineConfirm: 'Decline this request? The customer will be told you cannot take it.',
    declineYes: 'Yes, decline',
    declineNo: 'Keep it',
    scheduleBy: (left) => `Pick a time within ${left}`,
    scheduleOverdue: 'The time to pick a slot has passed.',
    scheduleCta: 'Pick a time',
    slotTitle: 'When will you go?',
    slotDate: 'Day',
    slotWindow: 'Time',
    slotMorning: 'Morning 9am - 11am',
    slotAfternoon: 'Afternoon 1pm - 3pm',
    slotEvening: 'Evening 5pm - 7pm',
    slotConfirm: 'Confirm this time',
    slotCancel: 'Back',
    slotAgreed: (when) => `Agreed time: ${when}`,
    arriveBy: (left) => `Reach within ${left}`,
    arriveOverdue: 'You are past the agreed time.',
    arrivedCta: 'I have arrived - enter code',
    otpTitle: 'Arrival code',
    otpHint: 'Ask the customer for the 4-digit code on their screen.',
    otpPlaceholder: '0000',
    otpSubmit: 'Confirm arrival',
    otpCancel: 'Back',
    otpWrong: 'That code is not right. Check the 4 digits with the customer.',
    otpLocked: 'Too many wrong codes. Wait a few minutes and try again.',
    otpNeeded: 'Enter the 4-digit code from the customer.',
    lateBanner: 'You are late. Reach the customer and enter their code.',
    noShowNotice: 'Marked as not arrived. This has lowered your reliability.',
    expiredNotice: 'This request expired before you replied.',
    declinedNotice: 'You declined this request.',
    cancelledNotice: 'This job was cancelled.',
    rescheduleCta: 'Change the time',
    reschedulePending: 'Waiting for the customer to accept the new time.',
    rescheduleUsed: 'You have already changed the time once.',
    rescheduleTooLate: 'The time can no longer be changed - it is too close to the slot.',
    rescheduleTitle: 'Ask for a new time',
    rescheduleReason: 'Reason (the customer will see this)',
    rescheduleSend: 'Send the new time',
    cancelCta: 'Cancel job',
    lateCancelWarning: 'Cancelling now will lower your reliability score.',
    lateCancelConfirm: 'Cancel anyway',
    lateCancelKeep: 'Keep the job',
    cancelConfirm: 'Cancel this job?',
    slotRequired: 'Pick a day and a time first.',
    slotInPast: 'That time has already passed. Pick a later one.',
    slotOrder: 'The end of the slot must be after its start.',
    slotTooLong: 'A slot cannot be longer than 12 hours.',
    slotTooFar: 'Pick a time within the next 14 days.',
    conflict: 'This job changed. Refresh and try again.',
    duration: (hours, minutes) => (hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`),
    state: {
      REQUESTED: 'Awaiting your reply', RESPONDED: 'Price sent', COMMITTED: 'Time agreed',
      ARRIVED: 'You arrived', COMPLETED: 'Work done', LATE: 'Late', NO_SHOW: 'Did not arrive',
      EXPIRED: 'Expired', DECLINED: 'Declined',
      CANCELLED_BY_CUSTOMER: 'Cancelled by customer', CANCELLED_BY_KAARIGAR: 'You cancelled',
    },
  },
  state: {
    REQUESTED: 'Requested', QUOTED: 'Quoted', ACCEPTED: 'Accepted', SCHEDULED: 'Scheduled',
    IN_PROGRESS: 'In progress', COMPLETED: 'Completed', SETTLED: 'Payment settled',
    REVIEWED: 'Reviewed', CANCELLED: 'Cancelled', DISPUTED: 'Disputed',
  },
  action: {
    QUOTED: 'Mark quote sent', ACCEPTED: 'Customer accepted', SCHEDULED: 'Schedule job',
    IN_PROGRESS: 'Start work', COMPLETED: 'Mark work completed', SETTLED: 'Mark payment received',
  },
  payment: { upi: '⚡ UPI', cash: '💵 Cash', pending: 'Payment pending', settled: 'Payment settled' },
};

const jobsPa: JobsCopy = {
  eyebrow: 'AI ਆਵਾਜ਼ ਨਾਲ ਕੰਮ ਦਰਜ ਕਰੋ',
  description: 'ਬੱਸ ਬੋਲੋ — “ਸੈਕਟਰ 35 ਵਿੱਚ ਪੱਖਾ ਲਗਾਇਆ, ₹1100 ਮਿਲੇ” — ਤੇ ਕੰਮ ਦਰਜ ਹੋ ਜਾਵੇਗਾ!',
  createQuote: 'ਵੇਰਵੇ ਵਾਲਾ ਕੋਟ ਬਣਾਓ',
  allJobs: (count) => 'ਸਾਰੇ ਕੰਮ (' + String(count) + ')',
  today: 'ਅੱਜ',
  week: 'ਇਸ ਹਫ਼ਤੇ',
  total: 'ਕੁੱਲ ਰਕਮ',
  searchPlaceholder: 'ਗਾਹਕ, ਥਾਂ ਜਾਂ ਕੰਮ ਲੱਭੋ',
  noJobs: 'ਕੋਈ ਕੰਮ ਨਹੀਂ ਮਿਲਿਆ',
  noJobsHint: 'ਪਹਿਲਾ ਕੰਮ ਬੋਲ ਕੇ ਜੋੜਨ ਲਈ ਮਾਈਕ ਦਬਾਓ!',
  speakAdd: '🎙️ ਬੋਲ ਕੇ ਕੰਮ ਜੋੜੋ',
  customer: 'ਗਾਹਕ',
  location: 'ਥਾਂ',
  callCustomer: 'ਗਾਹਕ ਨੂੰ ਕਾਲ ਕਰੋ',
  viewMap: 'ਨਕਸ਼ੇ ਤੇ ਵੇਖੋ',
  lifecycle: 'ਕੰਮ ਦੀ ਸਥਿਤੀ',
  updating: 'ਅਪਡੇਟ ਹੋ ਰਿਹਾ ਹੈ…',
  apiOnly: 'ਕੰਮ ਦੀ ਸਥਿਤੀ ਦਾ ਨਿਯੰਤਰਣ ਡੈਮੋ ਮੋਡ ਵਿੱਚ ਉਪਲਬਧ ਹੈ।',
  waitForSync: 'ਸਥਿਤੀ ਬਦਲਣ ਤੋਂ ਪਹਿਲਾਂ ਕੰਮ ਸੁਰੱਖਿਅਤ ਹੋਣ ਤੱਕ ਉਡੀਕ ਕਰੋ।',
  quoteLabel: 'ਆਪਣਾ ਮੁੱਲ ਦੱਸੋ',
  quotePlaceholder: 'ਮੁੱਲ ₹',
  quoteSend: 'ਮੁੱਲ ਭੇਜੋ',
  quoteInvalid: 'ਮੁੱਲ ਸਿਫ਼ਰ ਤੋਂ ਵੱਧ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।',
  quotedAwaiting: 'ਗਾਹਕ ਦੀ ਮਨਜ਼ੂਰੀ ਦੀ ਉਡੀਕ ਹੈ।',
  completedAwaiting: 'ਗਾਹਕ ਦੀ ਪੁਸ਼ਟੀ ਦੀ ਉਡੀਕ ਹੈ।',
  counterAsk: (price) => `ਗਾਹਕ ਨੇ ₹${price} ਮੰਗਿਆ ਹੈ`,
  live: 'ਲਾਈਵ',
  liveOn: 'ਨਵੀਆਂ ਬੇਨਤੀਆਂ ਆਪਣੇ ਆਪ ਦਿਖਦੀਆਂ ਹਨ। ਰੋਕਣ ਲਈ ਦਬਾਓ।',
  liveOff: 'ਨਵੀਆਂ ਬੇਨਤੀਆਂ ਆਪਣੇ ਆਪ ਪਾਉਣ ਲਈ ਦਬਾਓ।',
  updateError: 'ਕੰਮ ਅਪਡੇਟ ਨਹੀਂ ਹੋ ਸਕਿਆ।',
  booking: {
    respondBy: (left) => `${left} ਵਿੱਚ ਜਵਾਬ ਦਿਓ`,
    respondOverdue: 'ਇਸ ਬੇਨਤੀ ਦਾ ਜਵਾਬ ਦੇਣ ਦਾ ਸਮਾਂ ਲੰਘ ਚੁੱਕਾ ਹੈ।',
    declineCta: 'ਨਾਂਹ ਕਰੋ',
    declineConfirm: 'ਇਸ ਕੰਮ ਲਈ ਨਾਂਹ ਕਰਨੀ ਹੈ? ਗਾਹਕ ਨੂੰ ਦੱਸ ਦਿੱਤਾ ਜਾਵੇਗਾ।',
    declineYes: 'ਹਾਂ, ਨਾਂਹ ਕਰੋ',
    declineNo: 'ਰਹਿਣ ਦਿਓ',
    scheduleBy: (left) => `${left} ਵਿੱਚ ਸਮਾਂ ਚੁਣੋ`,
    scheduleOverdue: 'ਸਮਾਂ ਚੁਣਨ ਦੀ ਮਿਆਦ ਲੰਘ ਚੁੱਕੀ ਹੈ।',
    scheduleCta: 'ਸਮਾਂ ਚੁਣੋ',
    slotTitle: 'ਤੁਸੀਂ ਕਦੋਂ ਜਾਓਗੇ?',
    slotDate: 'ਦਿਨ',
    slotWindow: 'ਸਮਾਂ',
    slotMorning: 'ਸਵੇਰੇ 9 - 11',
    slotAfternoon: 'ਦੁਪਹਿਰੇ 1 - 3',
    slotEvening: 'ਸ਼ਾਮੀਂ 5 - 7',
    slotConfirm: 'ਇਹੀ ਸਮਾਂ ਪੱਕਾ ਕਰੋ',
    slotCancel: 'ਵਾਪਸ',
    slotAgreed: (when) => `ਤੈਅ ਸਮਾਂ: ${when}`,
    arriveBy: (left) => `${left} ਵਿੱਚ ਪਹੁੰਚੋ`,
    arriveOverdue: 'ਤੈਅ ਸਮਾਂ ਲੰਘ ਚੁੱਕਾ ਹੈ।',
    arrivedCta: 'ਮੈਂ ਪਹੁੰਚ ਗਿਆ - ਕੋਡ ਪਾਓ',
    otpTitle: 'ਪਹੁੰਚਣ ਦਾ ਕੋਡ',
    otpHint: 'ਗਾਹਕ ਦੀ ਸਕਰੀਨ ਉੱਤੇ ਦਿਸਦਾ 4 ਅੰਕਾਂ ਦਾ ਕੋਡ ਪੁੱਛੋ।',
    otpPlaceholder: '0000',
    otpSubmit: 'ਪਹੁੰਚਣਾ ਦਰਜ ਕਰੋ',
    otpCancel: 'ਵਾਪਸ',
    otpWrong: 'ਇਹ ਕੋਡ ਸਹੀ ਨਹੀਂ ਹੈ। ਗਾਹਕ ਤੋਂ ਚਾਰੇ ਅੰਕ ਦੁਬਾਰਾ ਪੁੱਛੋ।',
    otpLocked: 'ਕਈ ਵਾਰ ਗਲਤ ਕੋਡ ਪਾਇਆ ਗਿਆ। ਕੁਝ ਮਿੰਟਾਂ ਬਾਅਦ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
    otpNeeded: 'ਗਾਹਕ ਤੋਂ ਮਿਲਿਆ 4 ਅੰਕਾਂ ਦਾ ਕੋਡ ਪਾਓ।',
    lateBanner: 'ਤੁਹਾਨੂੰ ਦੇਰ ਹੋ ਰਹੀ ਹੈ। ਗਾਹਕ ਕੋਲ ਪਹੁੰਚੋ ਅਤੇ ਉਹਨਾਂ ਦਾ ਕੋਡ ਪਾਓ।',
    noShowNotice: 'ਦਰਜ ਹੋਇਆ ਕਿ ਤੁਸੀਂ ਨਹੀਂ ਪਹੁੰਚੇ। ਇਸ ਨਾਲ ਤੁਹਾਡੀ ਰੇਟਿੰਗ ਘਟੀ ਹੈ।',
    expiredNotice: 'ਜਵਾਬ ਦੇਣ ਤੋਂ ਪਹਿਲਾਂ ਹੀ ਇਹ ਬੇਨਤੀ ਮੁੱਕ ਗਈ।',
    declinedNotice: 'ਤੁਸੀਂ ਇਸ ਬੇਨਤੀ ਲਈ ਨਾਂਹ ਕਰ ਦਿੱਤੀ ਸੀ।',
    cancelledNotice: 'ਇਹ ਕੰਮ ਰੱਦ ਹੋ ਗਿਆ।',
    rescheduleCta: 'ਸਮਾਂ ਬਦਲੋ',
    reschedulePending: 'ਗਾਹਕ ਵੱਲੋਂ ਨਵਾਂ ਸਮਾਂ ਮੰਨਣ ਦੀ ਉਡੀਕ ਹੈ।',
    rescheduleUsed: 'ਤੁਸੀਂ ਇੱਕ ਵਾਰ ਸਮਾਂ ਬਦਲ ਚੁੱਕੇ ਹੋ।',
    rescheduleTooLate: 'ਹੁਣ ਸਮਾਂ ਨਹੀਂ ਬਦਲ ਸਕਦਾ - ਤੈਅ ਸਮਾਂ ਬਹੁਤ ਨੇੜੇ ਹੈ।',
    rescheduleTitle: 'ਨਵਾਂ ਸਮਾਂ ਮੰਗੋ',
    rescheduleReason: 'ਕਾਰਨ (ਗਾਹਕ ਨੂੰ ਦਿਸੇਗਾ)',
    rescheduleSend: 'ਨਵਾਂ ਸਮਾਂ ਭੇਜੋ',
    cancelCta: 'ਕੰਮ ਰੱਦ ਕਰੋ',
    lateCancelWarning: 'ਹੁਣ ਰੱਦ ਕਰਨ ਨਾਲ ਤੁਹਾਡੀ ਭਰੋਸੇ ਦੀ ਰੇਟਿੰਗ ਘਟੇਗੀ।',
    lateCancelConfirm: 'ਫਿਰ ਵੀ ਰੱਦ ਕਰੋ',
    lateCancelKeep: 'ਕੰਮ ਰਹਿਣ ਦਿਓ',
    cancelConfirm: 'ਇਹ ਕੰਮ ਰੱਦ ਕਰਨਾ ਹੈ?',
    slotRequired: 'ਪਹਿਲਾਂ ਦਿਨ ਅਤੇ ਸਮਾਂ ਚੁਣੋ।',
    slotInPast: 'ਇਹ ਸਮਾਂ ਲੰਘ ਚੁੱਕਾ ਹੈ। ਅੱਗੇ ਦਾ ਸਮਾਂ ਚੁਣੋ।',
    slotOrder: 'ਮੁੱਕਣ ਦਾ ਸਮਾਂ ਸ਼ੁਰੂ ਹੋਣ ਤੋਂ ਬਾਅਦ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।',
    slotTooLong: 'ਇੱਕ ਸਲਾਟ 12 ਘੰਟਿਆਂ ਤੋਂ ਲੰਮਾ ਨਹੀਂ ਹੋ ਸਕਦਾ।',
    slotTooFar: 'ਅਗਲੇ 14 ਦਿਨਾਂ ਦੇ ਅੰਦਰ ਦਾ ਸਮਾਂ ਚੁਣੋ।',
    conflict: 'ਇਹ ਕੰਮ ਬਦਲ ਗਿਆ ਹੈ। ਰਿਫ੍ਰੈਸ਼ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
    duration: (hours, minutes) => (hours > 0 ? `${hours} ਘੰ ${minutes} ਮਿ` : `${minutes} ਮਿ`),
    state: {
      REQUESTED: 'ਤੁਹਾਡੇ ਜਵਾਬ ਦੀ ਉਡੀਕ', RESPONDED: 'ਭਾਅ ਭੇਜਿਆ', COMMITTED: 'ਸਮਾਂ ਤੈਅ',
      ARRIVED: 'ਤੁਸੀਂ ਪਹੁੰਚੇ', COMPLETED: 'ਕੰਮ ਪੂਰਾ', LATE: 'ਦੇਰ', NO_SHOW: 'ਨਹੀਂ ਪਹੁੰਚੇ',
      EXPIRED: 'ਮੁੱਕ ਗਈ', DECLINED: 'ਨਾਂਹ ਕੀਤੀ',
      CANCELLED_BY_CUSTOMER: 'ਗਾਹਕ ਨੇ ਰੱਦ ਕੀਤਾ', CANCELLED_BY_KAARIGAR: 'ਤੁਸੀਂ ਰੱਦ ਕੀਤਾ',
    },
  },
  state: {
    REQUESTED: 'ਬੇਨਤੀ ਕੀਤੀ',
    QUOTED: 'ਕੋਟ ਭੇਜਿਆ',
    ACCEPTED: 'ਮਨਜ਼ੂਰ ਕੀਤਾ',
    SCHEDULED: 'ਤਹਿ ਕੀਤਾ',
    IN_PROGRESS: 'ਕੰਮ ਜਾਰੀ ਹੈ',
    COMPLETED: 'ਕੰਮ ਪੂਰਾ',
    SETTLED: 'ਭੁਗਤਾਨ ਮਿਲ ਗਿਆ',
    REVIEWED: 'ਸਮੀਖਿਆ ਹੋ ਗਈ',
    CANCELLED: 'ਰੱਦ',
    DISPUTED: 'ਵਿਵਾਦਿਤ',
  },
  action: {
    QUOTED: 'ਕੋਟ ਭੇਜੋ',
    ACCEPTED: 'ਗਾਹਕ ਨੇ ਮਨਜ਼ੂਰ ਕੀਤਾ',
    SCHEDULED: 'ਕੰਮ ਤਹਿ ਕਰੋ',
    IN_PROGRESS: 'ਕੰਮ ਸ਼ੁਰੂ ਕਰੋ',
    COMPLETED: 'ਕੰਮ ਪੂਰਾ ਕਰੋ',
    SETTLED: 'ਭੁਗਤਾਨ ਮਿਲਿਆ',
  },
  payment: { upi: '⚡ UPI', cash: '💵 ਨਕਦ', pending: 'ਭੁਗਤਾਨ ਬਾਕੀ', settled: 'ਭੁਗਤਾਨ ਮਿਲ ਗਿਆ' },
};

const kamaiHi: KamaiCopy = {
  eyebrow: 'वॉइस कमाई खाता',
  titleSuffix: ' (कमाई खाता)',
  description: 'बस बोलिए — “आज दो काम किए, पहला 1500 का और दूसरा 1200 का” और हिसाब तुरंत तैयार!',
  voiceSuffix: ' (बोलकर)',
  typePayment: 'भुगतान लिखकर जोड़ें',
  incomePdf: 'कमाई PDF',
  addReceivedPayment: 'मिला हुआ भुगतान जोड़ें',
  manualHint: 'वॉइस या इंटरनेट भरोसेमंद न हो तो यह तेज़ विकल्प है। यह आज की प्राप्त कमाई दर्ज करता है।',
  amount: 'राशि',
  paymentMethod: 'भुगतान का तरीका',
  ledgerEntriesToday: (count) => String(count) + ' लेजर एंट्री आज',
  actual: 'वास्तविक',
  cash: 'नकद',
  upiOnline: 'UPI / ऑनलाइन',
  descriptionLabel: 'काम या भुगतान का विवरण',
  descriptionPlaceholder: 'उदाहरण: पंखा लगाने का भुगतान',
  savePayment: 'भुगतान सेव करें',
  cancel: 'रद्द करें',
  week: '7 दिन',
  month: 'महीना',
  weekCaption: 'पिछले 7 दिनों की वास्तविक नेट राशि',
  monthCaption: 'कमाई में से खर्च घटाकर',
  paymentSplit: 'भुगतान माध्यम',
  receivedThisMonth: 'इस महीने मिली कमाई',
  actualLedger: 'वास्तविक लेजर डेटा',
  outstanding: 'इस महीने बाकी',
  outstandingCaption: 'बिना निपटान तारीख वाली उधारी / खर्च',
  noEntries: 'इस अवधि में कोई लेजर एंट्री नहीं है।',
  shownAmount: 'दिखाई गई राशि:',
  correction: 'सुधार',
  incomeReceived: 'कमाई मिली',
  settledOutgoing: 'निपटा हुआ खर्च',
  outstandingOutgoing: 'बाकी / खर्च',
  enterAmount: 'शून्य से बड़ी राशि डालें।',
  describePayment: 'काम या भुगतान का विवरण दें।',
};

const kamaiEn: KamaiCopy = {
  eyebrow: 'Voice Kamai ledger',
  titleSuffix: ' (earnings ledger)',
  description: 'Speak — “Two jobs today, one for 1500 and one for 1200” — and the ledger is ready!',
  voiceSuffix: ' (by voice)',
  typePayment: 'Type payment',
  incomePdf: 'Income PDF',
  addReceivedPayment: 'Add received payment',
  manualHint: 'A fast fallback when voice or venue internet is unreliable. This records income received today.',
  amount: 'Amount',
  paymentMethod: 'Payment method',
  ledgerEntriesToday: (count) => String(count) + ' ledger entries today',
  actual: 'Actual',
  cash: 'Cash',
  upiOnline: 'UPI / online',
  descriptionLabel: 'Work or payment description',
  descriptionPlaceholder: 'Example: Fan installation payment',
  savePayment: 'Save payment',
  cancel: 'Cancel',
  week: '7 days',
  month: 'Month',
  weekCaption: 'Actual net for the last 7 days',
  monthCaption: 'Income minus outgoing entries',
  paymentSplit: 'Payment method split',
  receivedThisMonth: 'Income received this month',
  actualLedger: 'Actual ledger data',
  outstanding: 'Outstanding this month',
  outstandingCaption: 'Outgoing / owed entries without a settlement date',
  noEntries: 'No ledger entries in this period.',
  shownAmount: 'Displayed amount:',
  correction: 'Correction',
  incomeReceived: 'Income received',
  settledOutgoing: 'Settled outgoing',
  outstandingOutgoing: 'Outstanding / outgoing',
  enterAmount: 'Enter an amount greater than zero.',
  describePayment: 'Describe the work or payment.',
};

const kamaiPa: KamaiCopy = {
  eyebrow: 'ਆਵਾਜ਼ ਵਾਲਾ ਕਮਾਈ ਲੇਜਰ',
  titleSuffix: ' (ਕਮਾਈ ਲੇਜਰ)',
  description: 'ਬੋਲੋ — “ਅੱਜ ਦੋ ਕੰਮ ਕੀਤੇ, ਇੱਕ 1500 ਦਾ ਤੇ ਇੱਕ 1200 ਦਾ” — ਅਤੇ ਲੇਜਰ ਤਿਆਰ!',
  voiceSuffix: ' (ਬੋਲ ਕੇ)',
  typePayment: 'ਭੁਗਤਾਨ ਲਿਖ ਕੇ ਜੋੜੋ',
  incomePdf: 'ਕਮਾਈ ਦਾ PDF',
  addReceivedPayment: 'ਮਿਲਿਆ ਭੁਗਤਾਨ ਜੋੜੋ',
  manualHint: 'ਜਦੋਂ ਆਵਾਜ਼ ਜਾਂ ਇੰਟਰਨੈੱਟ ਭਰੋਸੇਯੋਗ ਨਾ ਹੋਵੇ, ਇਹ ਤੇਜ਼ ਵਿਕਲਪ ਹੈ। ਇਹ ਅੱਜ ਮਿਲੀ ਕਮਾਈ ਦਰਜ ਕਰਦਾ ਹੈ।',
  amount: 'ਰਕਮ',
  paymentMethod: 'ਭੁਗਤਾਨ ਦਾ ਢੰਗ',
  ledgerEntriesToday: (count) => String(count) + ' ਲੇਜਰ ਐਂਟਰੀਆਂ ਅੱਜ',
  actual: 'ਅਸਲ',
  cash: 'ਨਕਦ',
  upiOnline: 'UPI / ਆਨਲਾਈਨ',
  descriptionLabel: 'ਕੰਮ ਜਾਂ ਭੁਗਤਾਨ ਦਾ ਵੇਰਵਾ',
  descriptionPlaceholder: 'ਉਦਾਹਰਨ: ਪੱਖਾ ਲਗਾਉਣ ਦਾ ਭੁਗਤਾਨ',
  savePayment: 'ਭੁਗਤਾਨ ਸੰਭਾਲੋ',
  cancel: 'ਰੱਦ ਕਰੋ',
  week: '7 ਦਿਨ',
  month: 'ਮਹੀਨਾ',
  weekCaption: 'ਪਿਛਲੇ 7 ਦਿਨਾਂ ਦੀ ਅਸਲ ਨੈੱਟ ਰਕਮ',
  monthCaption: 'ਆਮਦਨ ਵਿੱਚੋਂ ਖਰਚੇ ਘਟਾ ਕੇ',
  paymentSplit: 'ਭੁਗਤਾਨ ਦੇ ਢੰਗ',
  receivedThisMonth: 'ਇਸ ਮਹੀਨੇ ਮਿਲੀ ਕਮਾਈ',
  actualLedger: 'ਅਸਲ ਲੇਜਰ ਡਾਟਾ',
  outstanding: 'ਇਸ ਮਹੀਨੇ ਬਾਕੀ',
  outstandingCaption: 'ਨਿਪਟਾਰੇ ਦੀ ਤਾਰੀਖ ਤੋਂ ਬਿਨਾਂ ਬਕਾਇਆ / ਖਰਚੇ',
  noEntries: 'ਇਸ ਸਮੇਂ ਵਿੱਚ ਕੋਈ ਲੇਜਰ ਐਂਟਰੀ ਨਹੀਂ ਹੈ।',
  shownAmount: 'ਦਿਖਾਈ ਰਕਮ:',
  correction: 'ਸੁਧਾਰ',
  incomeReceived: 'ਕਮਾਈ ਮਿਲੀ',
  settledOutgoing: 'ਨਿਪਟਿਆ ਖਰਚਾ',
  outstandingOutgoing: 'ਬਾਕੀ / ਖਰਚਾ',
  enterAmount: 'ਜ਼ੀਰੋ ਤੋਂ ਵੱਧ ਰਕਮ ਦਿਓ।',
  describePayment: 'ਕੰਮ ਜਾਂ ਭੁਗਤਾਨ ਦਾ ਵੇਰਵਾ ਦਿਓ।',
};

const assistantHi: AssistantCopy = {
  unsupportedSpeech: 'इस ब्राउज़र में आवाज़ पहचान उपलब्ध नहीं है। नीचे दिए डेमो बटन से पूरा वॉइस फ्लो आज़मा सकते हैं।',
  idleListening: 'आपकी आवाज़ सुनने के लिए तैयार',
  transcriptPlaceholder: 'अपनी भाषा में बोलिए…',
  listeningHint: 'बोलते रहिए, हम सुन रहे हैं…',
  speakHint: '🎙️ बोलने के लिए माइक दबाकर रखें',
  extractedDetails: 'AI से समझी गई जानकारी',
  trade: 'काम',
  experience: 'अनुभव',
  years: 'साल',
  skills: 'खास हुनर',
  jobName: 'काम का नाम',
  amount: 'राशि',
  customer: 'ग्राहक',
  location: 'जगह',
  earningsBreakdown: 'कमाई का विवरण',
  total: 'कुल',
  quickPrompts: 'त्वरित वॉइस डेमो वाक्य',
  hideText: 'टेक्स्ट छिपाएं',
  typeEdit: 'टाइप / बदलें',
  manualPlaceholder: 'कारीगर की कही बात टाइप करें…',
  startListening: 'सुनना शुरू करें',
  stopListening: 'सुनना रोकें',
  passportReady: (name) => `${name} जी, आपका पासपोर्ट तैयार है! 🎉`,
  passportReadyDescription: 'आपका डिजिटल पासपोर्ट तैयार है। इस डेमो में सरकारी प्रमाणपत्र सत्यापन उपलब्ध नहीं है।',
  passportPreview: 'पासपोर्ट झलक',
  demoOnly: 'केवल डेमो',
  defaultTrade: 'इलेक्ट्रीशियन',
  defaultSkills: ['घर की वायरिंग', 'पंखा लगाना', 'MCB और स्विचबोर्ड'],
  credentialDemoNotice: 'DigiLocker सैंडबॉक्स/मॉक: केवल डेमो। यह सरकारी सत्यापन नहीं है।',
};

const assistantEn: AssistantCopy = {
  unsupportedSpeech: 'Speech recognition is not supported in this browser. Use the quick demo buttons below to try the full voice flow.',
  idleListening: 'Ready to hear your voice',
  transcriptPlaceholder: 'Speak in your language…',
  listeningHint: 'Keep speaking, we are listening…',
  speakHint: '🎙️ Press and hold the microphone to speak',
  extractedDetails: 'AI-extracted details',
  trade: 'Trade',
  experience: 'Experience',
  years: 'years',
  skills: 'Skills',
  jobName: 'Job name',
  amount: 'Amount',
  customer: 'Customer',
  location: 'Location',
  earningsBreakdown: 'Earnings breakdown',
  total: 'Total',
  quickPrompts: 'Quick voice demo prompts',
  hideText: 'Hide text',
  typeEdit: 'Type / edit',
  manualPlaceholder: 'Type what the worker would say…',
  startListening: 'Start listening',
  stopListening: 'Stop listening',
  passportReady: (name) => `${name}, your passport is ready! 🎉`,
  passportReadyDescription: 'Your digital passport is ready. Government certificate verification is not connected in this demo.',
  passportPreview: 'Passport preview',
  demoOnly: 'Demo only',
  defaultTrade: 'Electrician',
  defaultSkills: ['House wiring', 'Fan installation', 'MCB and switchboard'],
  credentialDemoNotice: 'DigiLocker sandbox/mock: demo only. This preview is not a government verification.',
};

const assistantPa: AssistantCopy = {
  unsupportedSpeech: 'ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਆਵਾਜ਼ ਪਛਾਣ ਉਪਲਬਧ ਨਹੀਂ। ਪੂਰਾ ਵੌਇਸ ਫ਼ਲੋ ਅਜ਼ਮਾਉਣ ਲਈ ਹੇਠਾਂ ਦਿੱਤੇ ਡੈਮੋ ਬਟਨ ਵਰਤੋ।',
  idleListening: 'ਤੁਹਾਡੀ ਆਵਾਜ਼ ਸੁਣਨ ਲਈ ਤਿਆਰ',
  transcriptPlaceholder: 'ਆਪਣੀ ਭਾਸ਼ਾ ਵਿੱਚ ਬੋਲੋ…',
  listeningHint: 'ਬੋਲਦੇ ਰਹੋ, ਅਸੀਂ ਸੁਣ ਰਹੇ ਹਾਂ…',
  speakHint: '🎙️ ਬੋਲਣ ਲਈ ਮਾਈਕ ਦਬਾ ਕੇ ਰੱਖੋ',
  extractedDetails: 'AI ਨੇ ਸਮਝੀ ਜਾਣਕਾਰੀ',
  trade: 'ਕੰਮ ਦੀ ਕਿਸਮ',
  experience: 'ਤਜਰਬਾ',
  years: 'ਸਾਲ',
  skills: 'ਹੁਨਰ',
  jobName: 'ਕੰਮ ਦਾ ਨਾਮ',
  amount: 'ਰਕਮ',
  customer: 'ਗਾਹਕ',
  location: 'ਥਾਂ',
  earningsBreakdown: 'ਕਮਾਈ ਦਾ ਵੇਰਵਾ',
  total: 'ਕੁੱਲ',
  quickPrompts: 'ਤੁਰੰਤ ਵੌਇਸ ਡੈਮੋ ਵਾਕ',
  hideText: 'ਲਿਖਤ ਲੁਕਾਓ',
  typeEdit: 'ਲਿਖੋ / ਬਦਲੋ',
  manualPlaceholder: 'ਕਾਰੀਗਰ ਜੋ ਕਹੇ, ਉਹ ਲਿਖੋ…',
  startListening: 'ਸੁਣਨਾ ਸ਼ੁਰੂ ਕਰੋ',
  stopListening: 'ਸੁਣਨਾ ਰੋਕੋ',
  passportReady: (name) => `${name} ਜੀ, ਤੁਹਾਡਾ ਪਾਸਪੋਰਟ ਤਿਆਰ ਹੈ! 🎉`,
  passportReadyDescription: 'ਤੁਹਾਡਾ ਡਿਜ਼ਿਟਲ ਪਾਸਪੋਰਟ ਤਿਆਰ ਹੈ। ਇਸ ਡੈਮੋ ਵਿੱਚ ਸਰਕਾਰੀ ਸਰਟੀਫਿਕੇਟ ਦੀ ਪੁਸ਼ਟੀ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।',
  passportPreview: 'ਪਾਸਪੋਰਟ ਝਲਕ',
  demoOnly: 'ਸਿਰਫ਼ ਡੈਮੋ',
  defaultTrade: 'ਇਲੈਕਟ੍ਰੀਸ਼ੀਅਨ',
  defaultSkills: ['ਘਰ ਦੀ ਵਾਇਰਿੰਗ', 'ਪੱਖਾ ਲਗਾਉਣਾ', 'MCB ਅਤੇ ਸਵਿੱਚਬੋਰਡ'],
  credentialDemoNotice: 'DigiLocker ਸੈਂਡਬਾਕਸ/ਮੌਕ: ਸਿਰਫ਼ ਡੈਮੋ। ਇਹ ਸਰਕਾਰੀ ਪੁਸ਼ਟੀ ਨਹੀਂ ਹੈ।',
};

const passportHi: PassportCopy = {
  governmentAligned: 'सरकार और उद्योग के अनुरूप', subtitle: 'QR-सत्यापित कार्य पहचान पत्र • हर घर के लिए तुरंत भरोसा', addWorkVoice: 'काम जोड़ें (बोलकर)', nationalIdentity: 'राष्ट्रीय कारीगर पहचान', passportTitle: 'डिजिटल कारीगर पासपोर्ट', identityVerified: 'पहचान सत्यापित', verificationPending: 'सत्यापन बाकी', profileNotVerified: 'प्रोफ़ाइल सत्यापित नहीं', experience: 'अनुभव', years: 'साल', jobsDone: 'पूरे काम', rating: 'रेटिंग', skillsListed: 'कारीगर द्वारा बताए हुनर', evidenceBuilds: 'समय के साथ प्रमाण बनते हैं', credentialsListed: 'कारीगर द्वारा बताए प्रमाणपत्र', credentialLink: 'सरकारी प्रमाणपत्र लिंक', credentialStatus: 'स्थिति', notLinked: 'लिंक नहीं है', sandboxDemo: 'सैंडबॉक्स डेमो', credentialNotice: 'केवल डेमो मॉक स्थिति। यहां सरकारी जांच या प्रमाणपत्र सत्यापन नहीं किया जाता।', scanAlt: 'सार्वजनिक पासपोर्ट खोलने के लिए स्कैन करें', scanTitle: 'कार्य इतिहास सत्यापित करने के लिए स्कैन करें', scanDescription: 'बिल्डर, घर-मालिक और कंपनियों के लिए तुरंत डिजिटल प्रमाण।', joined: (date) => `सार्वजनिक पासपोर्ट • जुड़े ${date}`, linkCopied: 'लिंक कॉपी हुआ!', share: 'साझा करें', downloadId: 'आईडी डाउनलोड करें', downloadNotice: 'डिजिटल पासपोर्ट आईडी कार्ड PDF के रूप में डाउनलोड हुआ!', trustEvidence: 'भरोसे के प्रमाण', trustDescription: 'फोन OTP, पूरे किए काम और ग्राहक प्रतिक्रिया पर आधारित स्पष्ट पैमाना। अधिकृत सत्यापन जुड़ने तक हुनर और प्रमाणपत्र कारीगर द्वारा बताए गए हैं।', outOf100: '100 में से', trustRows: ['फोन पहचान', 'हुनर प्रमाणपत्र', 'काम से जुड़ा इतिहास', 'ग्राहक रेटिंग', 'विश्वसनीयता रिकॉर्ड', 'कौशल-प्रशिक्षण भागीदारी'], benefits: [{ title: 'साथ चलने वाला प्रमाण', description: 'पूरे काम और ग्राहक प्रतिक्रिया से एक पोर्टेबल रिकॉर्ड बनता है।' }, { title: 'आवाज़ से दर्ज काम', description: 'काम के बाद बोलकर काम और भुगतान का विवरण दर्ज करें।' }, { title: 'उचित दाम और रिकॉर्ड', description: 'स्पष्ट दाम-सीमा और लेजर भविष्य की वित्तीय मदद करते हैं।' }],
  reliability: {
    title: 'भरोसेमंदी',
    description: 'बुक की गई विज़िट से अपने-आप तय होती है: समय पर पहुँचना, देर से पहुँचना, या न पहुँचना। पुरानी विज़िट कम गिनी जाती हैं।',
    empty: 'अभी तक कोई बुक की गई विज़िट दर्ज नहीं है।',
    onTime: 'समय पर',
    late: 'देर से',
    noShow: 'नहीं पहुँचे',
    responseRate: (percent) => `${percent}% अनुरोधों का जवाब दिया`,
    responseEmpty: 'अभी तक कोई अनुरोध नहीं।',
  },
};

const passportEn: PassportCopy = {
  governmentAligned: 'Government & industry aligned', subtitle: 'QR-verified work identity card • Instant trust for every homeowner', addWorkVoice: 'Add work (by voice)', nationalIdentity: 'National Kaarigar identity', passportTitle: 'Digital Kaarigar Passport', identityVerified: 'Identity verified', verificationPending: 'Verification pending', profileNotVerified: 'Profile not verified', experience: 'Experience', years: 'years', jobsDone: 'Jobs done', rating: 'Rating', skillsListed: 'Skills listed by worker', evidenceBuilds: 'Evidence builds over time', credentialsListed: 'Credentials listed by worker', credentialLink: 'Government credential link', credentialStatus: 'Status', notLinked: 'Not linked', sandboxDemo: 'Sandbox demo', credentialNotice: 'Demo-only mock state. No live government lookup or certificate verification is performed here.', scanAlt: 'Scan to open the public passport', scanTitle: 'Scan to verify work history', scanDescription: 'Instant digital proof for builders, homeowners and companies.', joined: (date) => `Public passport • Joined ${date}`, linkCopied: 'Link copied!', share: 'Share', downloadId: 'Download ID', downloadNotice: 'Digital Passport ID card downloaded as PDF!', trustEvidence: 'Trust evidence', trustDescription: 'A transparent rubric from phone OTP, completed jobs and customer feedback. Skills and certificates are worker-entered until authorised verification is linked.', outOf100: 'out of 100', trustRows: ['Phone identity', 'Skill credentials', 'Job-linked work history', 'Customer ratings', 'Reliability record', 'Skilling engagement'], benefits: [{ title: 'Evidence that travels', description: 'Completed jobs and customer feedback build a portable record.' }, { title: 'Voice-logged work', description: 'Speak after a job to record work and payment details.' }, { title: 'Fair rates and records', description: 'Transparent bands and a structured ledger support future finance.' }],
  reliability: {
    title: 'Reliability',
    description: 'Worked out automatically from booked visits: arriving on time, arriving late, or not arriving. Older visits count for less.',
    empty: 'No booked visits recorded yet.',
    onTime: 'On time',
    late: 'Late',
    noShow: 'Did not arrive',
    responseRate: (percent) => `Replies to ${percent}% of requests`,
    responseEmpty: 'No requests yet.',
  },
};

const passportPa: PassportCopy = {
  governmentAligned: 'ਸਰਕਾਰ ਅਤੇ ਉਦਯੋਗ ਦੇ ਅਨੁਕੂਲ', subtitle: 'QR ਨਾਲ ਪੁਸ਼ਟੀ ਕੀਤਾ ਕੰਮ ਪਛਾਣ ਪੱਤਰ • ਹਰ ਘਰ ਲਈ ਤੁਰੰਤ ਭਰੋਸਾ', addWorkVoice: 'ਕੰਮ ਜੋੜੋ (ਬੋਲ ਕੇ)', nationalIdentity: 'ਰਾਸ਼ਟਰੀ ਕਾਰੀਗਰ ਪਛਾਣ', passportTitle: 'ਡਿਜ਼ਿਟਲ ਕਾਰੀਗਰ ਪਾਸਪੋਰਟ', identityVerified: 'ਪਛਾਣ ਦੀ ਪੁਸ਼ਟੀ ਹੋ ਗਈ', verificationPending: 'ਪੁਸ਼ਟੀ ਬਾਕੀ ਹੈ', profileNotVerified: 'ਪ੍ਰੋਫਾਈਲ ਦੀ ਪੁਸ਼ਟੀ ਨਹੀਂ ਹੋਈ', experience: 'ਤਜਰਬਾ', years: 'ਸਾਲ', jobsDone: 'ਪੂਰੇ ਕੰਮ', rating: 'ਰੇਟਿੰਗ', skillsListed: 'ਕਾਰੀਗਰ ਵੱਲੋਂ ਦੱਸੇ ਹੁਨਰ', evidenceBuilds: 'ਸਮੇਂ ਨਾਲ ਸਬੂਤ ਬਣਦੇ ਹਨ', credentialsListed: 'ਕਾਰੀਗਰ ਵੱਲੋਂ ਦੱਸੇ ਪ੍ਰਮਾਣਪੱਤਰ', credentialLink: 'ਸਰਕਾਰੀ ਪ੍ਰਮਾਣਪੱਤਰ ਲਿੰਕ', credentialStatus: 'ਸਥਿਤੀ', notLinked: 'ਲਿੰਕ ਨਹੀਂ ਹੈ', sandboxDemo: 'ਸੈਂਡਬਾਕਸ ਡੈਮੋ', credentialNotice: 'ਸਿਰਫ਼ ਡੈਮੋ ਮੌਕ ਸਥਿਤੀ। ਇੱਥੇ ਸਰਕਾਰੀ ਜਾਂਚ ਜਾਂ ਪ੍ਰਮਾਣਪੱਤਰ ਪੁਸ਼ਟੀ ਨਹੀਂ ਕੀਤੀ ਜਾਂਦੀ।', scanAlt: 'ਸਾਰਵਜਨਿਕ ਪਾਸਪੋਰਟ ਖੋਲ੍ਹਣ ਲਈ ਸਕੈਨ ਕਰੋ', scanTitle: 'ਕੰਮ ਦਾ ਇਤਿਹਾਸ ਪੁਸ਼ਟ ਕਰਨ ਲਈ ਸਕੈਨ ਕਰੋ', scanDescription: 'ਬਿਲਡਰਾਂ, ਘਰ ਮਾਲਕਾਂ ਅਤੇ ਕੰਪਨੀਆਂ ਲਈ ਤੁਰੰਤ ਡਿਜ਼ਿਟਲ ਸਬੂਤ।', joined: (date) => `ਸਾਰਵਜਨਿਕ ਪਾਸਪੋਰਟ • ਸ਼ਾਮਲ ਹੋਏ ${date}`, linkCopied: 'ਲਿੰਕ ਕਾਪੀ ਹੋ ਗਿਆ!', share: 'ਸਾਂਝਾ ਕਰੋ', downloadId: 'ਆਈਡੀ ਡਾਊਨਲੋਡ ਕਰੋ', downloadNotice: 'ਡਿਜ਼ਿਟਲ ਪਾਸਪੋਰਟ ਆਈਡੀ ਕਾਰਡ PDF ਵਜੋਂ ਡਾਊਨਲੋਡ ਹੋਇਆ!', trustEvidence: 'ਭਰੋਸੇ ਦੇ ਸਬੂਤ', trustDescription: 'ਫੋਨ OTP, ਪੂਰੇ ਹੋਏ ਕੰਮਾਂ ਅਤੇ ਗਾਹਕ ਫੀਡਬੈਕ ਤੋਂ ਬਣਿਆ ਸਪਸ਼ਟ ਪੈਮਾਨਾ। ਅਧਿਕਾਰਤ ਪੁਸ਼ਟੀ ਜੁੜਨ ਤੱਕ ਹੁਨਰ ਅਤੇ ਸਰਟੀਫਿਕੇਟ ਕਾਰੀਗਰ ਵੱਲੋਂ ਦੱਸੇ ਗਏ ਹਨ।', outOf100: '100 ਵਿੱਚੋਂ', trustRows: ['ਫੋਨ ਪਛਾਣ', 'ਹੁਨਰ ਪ੍ਰਮਾਣਪੱਤਰ', 'ਕੰਮ ਨਾਲ ਜੁੜਿਆ ਇਤਿਹਾਸ', 'ਗਾਹਕ ਰੇਟਿੰਗ', 'ਭਰੋਸੇਯੋਗਤਾ ਰਿਕਾਰਡ', 'ਹੁਨਰ-ਸਿਖਲਾਈ ਭਾਗੀਦਾਰੀ'], benefits: [{ title: 'ਨਾਲ ਚੱਲਣ ਵਾਲਾ ਸਬੂਤ', description: 'ਪੂਰੇ ਕੰਮ ਅਤੇ ਗਾਹਕ ਫੀਡਬੈਕ ਇੱਕ ਪੋਰਟੇਬਲ ਰਿਕਾਰਡ ਬਣਾਉਂਦੇ ਹਨ।' }, { title: 'ਆਵਾਜ਼ ਨਾਲ ਦਰਜ ਕੰਮ', description: 'ਕੰਮ ਤੋਂ ਬਾਅਦ ਬੋਲ ਕੇ ਕੰਮ ਅਤੇ ਭੁਗਤਾਨ ਦਾ ਵੇਰਵਾ ਦਰਜ ਕਰੋ।' }, { title: 'ਸਹੀ ਰੇਟ ਅਤੇ ਰਿਕਾਰਡ', description: 'ਸਪਸ਼ਟ ਰੇਟ-ਬੈਂਡ ਅਤੇ ਲੇਜਰ ਭਵਿੱਖੀ ਵਿੱਤੀ ਮਦਦ ਕਰਦੇ ਹਨ।' }],
  reliability: {
    title: 'ਭਰੋਸੇਯੋਗਤਾ',
    description: 'ਬੁੱਕ ਕੀਤੀਆਂ ਵਿਜ਼ਿਟਾਂ ਤੋਂ ਆਪਣੇ-ਆਪ ਤੈਅ ਹੁੰਦੀ ਹੈ: ਸਮੇਂ ਸਿਰ ਪਹੁੰਚਣਾ, ਦੇਰ ਨਾਲ ਪਹੁੰਚਣਾ, ਜਾਂ ਨਾ ਪਹੁੰਚਣਾ। ਪੁਰਾਣੀਆਂ ਵਿਜ਼ਿਟਾਂ ਘੱਟ ਗਿਣੀਆਂ ਜਾਂਦੀਆਂ ਹਨ।',
    empty: 'ਹਾਲੇ ਤੱਕ ਕੋਈ ਬੁੱਕ ਕੀਤੀ ਵਿਜ਼ਿਟ ਦਰਜ ਨਹੀਂ ਹੈ।',
    onTime: 'ਸਮੇਂ ਸਿਰ',
    late: 'ਦੇਰ ਨਾਲ',
    noShow: 'ਨਹੀਂ ਪਹੁੰਚੇ',
    responseRate: (percent) => `${percent}% ਬੇਨਤੀਆਂ ਦਾ ਜਵਾਬ ਦਿੱਤਾ`,
    responseEmpty: 'ਹਾਲੇ ਤੱਕ ਕੋਈ ਬੇਨਤੀ ਨਹੀਂ।',
  },
};

const profileHi: ProfileCopy = {
  identityVerified: 'पहचान सत्यापित', verificationPending: 'सत्यापन बाकी', profileNotVerified: 'प्रोफ़ाइल सत्यापित नहीं', yearsExperience: (years) => `${years} साल का अनुभव`, updateVoice: 'प्रोफ़ाइल अपडेट करें (बोलकर)', workerInformation: 'कारीगर विवरण', cancelEdit: 'बदलाव रद्द करें', editDetails: 'विवरण बदलें', fullName: 'पूरा नाम', trade: 'काम', experience: 'अनुभव (साल)', location: 'जगह', dailyRate: 'दैनिक रेट (₹)', saveProfile: 'प्रोफ़ाइल सेव करें', years: 'साल', perDay: '/ दिन', bloodGroup: 'ब्लड ग्रुप', skillsListed: 'कारीगर द्वारा बताए हुनर', trainingCertificates: 'ट्रेनिंग और प्रमाणपत्र', credentialNotice: 'प्रमाणपत्र स्थिति: लिंक नहीं है · DigiLocker सैंडबॉक्स/मॉक: केवल डेमो। सरकारी सत्यापन उपलब्ध नहीं है।',
};
const profileEn: ProfileCopy = {
  identityVerified: 'Identity verified', verificationPending: 'Verification pending', profileNotVerified: 'Profile not verified', yearsExperience: (years) => `${years} years experience`, updateVoice: 'Update profile (by voice)', workerInformation: 'Worker information', cancelEdit: 'Cancel edit', editDetails: 'Edit details', fullName: 'Full name', trade: 'Trade', experience: 'Experience (years)', location: 'Location', dailyRate: 'Daily rate (₹)', saveProfile: 'Save profile', years: 'years', perDay: '/ day', bloodGroup: 'Blood group', skillsListed: 'Skills listed by worker', trainingCertificates: 'Training and certificates', credentialNotice: 'Credential status: Not linked · DigiLocker sandbox/mock: demo only. No live government verification is performed.',
};
const profilePa: ProfileCopy = {
  identityVerified: 'ਪਛਾਣ ਦੀ ਪੁਸ਼ਟੀ ਹੋ ਗਈ', verificationPending: 'ਪੁਸ਼ਟੀ ਬਾਕੀ ਹੈ', profileNotVerified: 'ਪ੍ਰੋਫਾਈਲ ਦੀ ਪੁਸ਼ਟੀ ਨਹੀਂ ਹੋਈ', yearsExperience: (years) => `${years} ਸਾਲ ਦਾ ਤਜਰਬਾ`, updateVoice: 'ਪ੍ਰੋਫਾਈਲ ਅਪਡੇਟ ਕਰੋ (ਬੋਲ ਕੇ)', workerInformation: 'ਕਾਰੀਗਰ ਵੇਰਵਾ', cancelEdit: 'ਬਦਲਾਅ ਰੱਦ ਕਰੋ', editDetails: 'ਵੇਰਵਾ ਬਦਲੋ', fullName: 'ਪੂਰਾ ਨਾਮ', trade: 'ਕੰਮ ਦੀ ਕਿਸਮ', experience: 'ਤਜਰਬਾ (ਸਾਲ)', location: 'ਥਾਂ', dailyRate: 'ਰੋਜ਼ਾਨਾ ਰੇਟ (₹)', saveProfile: 'ਪ੍ਰੋਫਾਈਲ ਸੰਭਾਲੋ', years: 'ਸਾਲ', perDay: '/ ਦਿਨ', bloodGroup: 'ਬਲੱਡ ਗਰੁੱਪ', skillsListed: 'ਕਾਰੀਗਰ ਵੱਲੋਂ ਦੱਸੇ ਹੁਨਰ', trainingCertificates: 'ਟ੍ਰੇਨਿੰਗ ਅਤੇ ਸਰਟੀਫਿਕੇਟ', credentialNotice: 'ਪ੍ਰਮਾਣਪੱਤਰ ਸਥਿਤੀ: ਲਿੰਕ ਨਹੀਂ ਹੈ · DigiLocker ਸੈਂਡਬਾਕਸ/ਮੌਕ: ਸਿਰਫ਼ ਡੈਮੋ। ਸਰਕਾਰੀ ਪੁਸ਼ਟੀ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।',
};

export function getScreenCopy(language: SupportedLanguage): ScreenCopy {
  if (language === 'en') {
    return { quote: quoteEn, home: homeEn, jobs: jobsEn, kamai: kamaiEn, assistant: assistantEn, passport: passportEn, profile: profileEn };
  }
  if (language === 'pa') {
    return { quote: quotePa, home: homePa, jobs: jobsPa, kamai: kamaiPa, assistant: assistantPa, passport: passportPa, profile: profilePa };
  }
  return { quote: quoteHi, home: homeHi, jobs: jobsHi, kamai: kamaiHi, assistant: assistantHi, passport: passportHi, profile: profileHi };
}
