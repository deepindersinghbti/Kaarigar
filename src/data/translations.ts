import { LanguageOption, SupportedLanguage } from '../types';

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिंदी',
    flag: '🇮🇳',
    sampleGreeting: 'नमस्ते! मैं कारीगर साथी हूँ।',
  },
  {
    code: 'pa',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    flag: '🇮🇳',
    sampleGreeting: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਕਾਰੀਗਰ ਸਾਥੀ ਹਾਂ।',
  },
  {
    code: 'kn',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    flag: '🇮🇳',
    sampleGreeting: 'ನಮಸ್ಕಾರ! ನಾನು ಕಾರೀಗರ್ ಸಾಥಿ.',
  },
  {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    flag: '🇮🇳',
    sampleGreeting: 'नमस्कार! मी कारागीर साथी आहे.',
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🌐',
    sampleGreeting: 'Namaste! I am Kaarigar Saathi.',
  },
];

export interface LanguageStrings {
  appName: string;
  assistantName: string;
  tagline: string;
  tapToSpeak: string;
  listening: string;
  gotIt: string;
  hearAgain: string;
  speak: string;
  edit: string;
  confirm: string;
  yesCorrect: string;
  changeSomething: string;
  whatToChange: string;
  changeLanguage: string;
  chooseLanguage: string;
  yourProfile: string;
  passportReady: string;
  digitalPassport: string;
  viewPassport: string;
  addJobByVoice: string;
  addEarnings: string;
  addWork: string;
  updateProfile: string;
  talkToAssistant: string;
  todayEarnings: string;
  thisMonth: string;
  totalJobs: string;
  recentJobs: string;
  verifiedPassport: string;
  yearsExperience: string;
  skills: string[];
  certifications: string;
  navHome: string;
  navPassport: string;
  navJobs: string;
  navKamai: string;
  navProfile: string;
  demoPromptHelp: string;
  onboardingQuestions: {
    welcome: (name: string) => string;
    tradeQuestion: (name: string) => string;
    experienceQuestion: () => string;
    skillsQuestion: () => string;
    certQuestion: (name: string) => string;
    summaryConfirmation: (name: string) => string;
    passportReadyAnnouncement: (name: string) => string;
  };
  jobQuestions: {
    prompt: string;
    confirm: (name: string) => string;
  };
  kamaiQuestions: {
    prompt: string;
    confirm: (total: number) => string;
  };
}

export const TRANSLATIONS: Record<SupportedLanguage, LanguageStrings> = {
  hi: {
    appName: 'कारीगर',
    assistantName: 'कारीगर साथी',
    tagline: 'आपका अपना बोलकर चलने वाला डिजिटल साथी',
    tapToSpeak: 'बोलने के लिए दबाएं',
    listening: 'सुन रहे हैं...',
    gotIt: 'समझ गए',
    hearAgain: 'दोबारा बोलो',
    speak: 'बोलिए',
    edit: 'बदलें',
    confirm: 'पुष्टि करें',
    yesCorrect: 'हाँ, सही है',
    changeSomething: 'कुछ बदलना है',
    whatToChange: 'क्या बदलना चाहते हैं?',
    changeLanguage: 'भाषा बदलें',
    chooseLanguage: 'अपनी भाषा चुनें',
    yourProfile: 'आपका प्रोफाइल',
    passportReady: 'आपका पासपोर्ट तैयार है!',
    digitalPassport: 'डिजिटल कारीगर पासपोर्ट',
    viewPassport: 'पासपोर्ट देखें',
    addJobByVoice: 'बोलकर काम जोड़ें',
    addEarnings: 'कमाई जोड़ें',
    addWork: 'काम जोड़ें',
    updateProfile: 'प्रोफाइल अपडेट करें',
    talkToAssistant: 'कारीगर साथी से बात करें',
    todayEarnings: 'आज की कमाई',
    thisMonth: 'इस महीने',
    totalJobs: 'कुल काम',
    recentJobs: 'हाल के काम',
    verifiedPassport: 'सत्यापित कारीगर',
    yearsExperience: 'साल का अनुभव',
    skills: ['हाउस वायरिंग', 'पंखा फिटिंग', 'MCB और स्विचबोर्ड', 'बिजली रिपेयर'],
    certifications: 'सर्टिफिकेट / ट्रेनिंग',
    navHome: 'होम',
    navPassport: 'पासपोर्ट',
    navJobs: 'काम (Jobs)',
    navKamai: 'कमाई (Kamai)',
    navProfile: 'प्रोफाइल',
    demoPromptHelp: 'या नीचे दिए डेमो वाक्य पर टैप करें:',
    onboardingQuestions: {
      welcome: (name) =>
        `नमस्ते ${name} जी 👋\nमैं कारीगर साथी हूँ।\nआपको कुछ टाइप करने की ज़रूरत नहीं है। बस मुझसे बात कीजिए, मैं आपका प्रोफाइल बना दूँगी।`,
      tradeQuestion: (name) => `${name} जी, आप क्या काम करते हैं?`,
      experienceQuestion: () => `आपको ये काम करते हुए कितने साल हो गए?`,
      skillsQuestion: () => `आप किस तरह का काम सबसे ज़्यादा करते हैं?`,
      certQuestion: (name) => `${name} जी, आपके पास कोई सर्टिफिकेट या ट्रेनिंग है?`,
      summaryConfirmation: (name) =>
        `${name} जी, मैंने ये डिटेल्स समझी हैं। सब सही है?`,
      passportReadyAnnouncement: (name) =>
        `बधाई हो ${name} जी! आपका डिजिटल कारीगर पासपोर्ट तैयार है 🎉`,
    },
    jobQuestions: {
      prompt: 'बोलिए, कहाँ क्या काम किया और कितने पैसे मिले?',
      confirm: (name) => `${name} जी, ये काम की डिटेल्स सही हैं?`,
    },
    kamaiQuestions: {
      prompt: 'आज के काम और पैसों का हिसाब बोलिए...',
      confirm: (total) => `आज की कुल कमाई ₹${total.toLocaleString('en-IN')} समझी गई है। जोड़ दें?`,
    },
  },
  pa: {
    appName: 'ਕਾਰੀਗਰ',
    assistantName: 'ਕਾਰੀਗਰ ਸਾਥੀ',
    tagline: 'ਤੁਹਾਡਾ ਆਪਣਾ ਬੋਲ ਕੇ ਚੱਲਣ ਵਾਲਾ ਡਿਜੀਟਲ ਸਾਥੀ',
    tapToSpeak: 'ਬੋਲਣ ਲਈ ਦਬਾਓ',
    listening: 'ਸੁਣ ਰਹੇ ਹਾਂ...',
    gotIt: 'ਸਮਝ ਗਏ',
    hearAgain: 'ਦੁਬਾਰਾ ਬੋਲੋ',
    speak: 'ਬੋਲੋ',
    edit: 'ਬਦਲੋ',
    confirm: 'ਪੱਕਾ ਕਰੋ',
    yesCorrect: 'ਹਾਂਜੀ, ਬਿਲਕੁਲ ਸਹੀ',
    changeSomething: 'ਕੁਝ ਬਦਲਣਾ ਹੈ',
    whatToChange: 'ਕੀ ਬਦਲਣਾ ਚਾਹੁੰਦੇ ਹੋ?',
    changeLanguage: 'ਭਾਸ਼ਾ ਬਦਲੋ',
    chooseLanguage: 'ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ',
    yourProfile: 'ਤੁਹਾਡਾ ਪ੍ਰੋਫਾਈਲ',
    passportReady: 'ਤੁਹਾਡਾ ਪਾਸਪੋਰਟ ਤਿਆਰ ਹੈ!',
    digitalPassport: 'ਡਿਜੀਟਲ ਕਾਰੀਗਰ ਪਾਸਪੋਰਟ',
    viewPassport: 'ਪਾਸਪੋਰਟ ਵੇਖੋ',
    addJobByVoice: 'ਬੋਲ ਕੇ ਕੰਮ ਜੋੜੋ',
    addEarnings: 'ਕਮਾਈ ਜੋੜੋ',
    addWork: 'ਕੰਮ ਜੋੜੋ',
    updateProfile: 'ਪ੍ਰੋਫਾਈਲ ਅਪਡੇਟ ਕਰੋ',
    talkToAssistant: 'ਕਾਰੀਗਰ ਸਾਥੀ ਨਾਲ ਗੱਲ ਕਰੋ',
    todayEarnings: 'ਅੱਜ ਦੀ ਕਮਾਈ',
    thisMonth: 'ਇਸ ਮਹੀਨੇ',
    totalJobs: 'ਕੁੱਲ ਕੰਮ',
    recentJobs: 'ਤਾਜ਼ਾ ਕੰਮ',
    verifiedPassport: 'ਤਸਦੀਕਸ਼ੁਦਾ ਕਾਰੀਗਰ',
    yearsExperience: 'ਸਾਲਾਂ ਦਾ ਤਜਰਬਾ',
    skills: ['ਹਾਊਸ ਵਾਇਰਿੰਗ', 'ਪੱਖਾ ਫਿਟਿੰਗ', 'ਸਵਿੱਚਬੋਰਡ ਕੰਮ', 'ਬਿਜਲੀ ਮੁਰੰਮਤ'],
    certifications: 'ਸਰਟੀਫਿਕੇਟ / ਸਿਖਲਾਈ',
    navHome: 'ਹੋਮ',
    navPassport: 'ਪਾਸਪੋਰਟ',
    navJobs: 'ਕੰਮ',
    navKamai: 'ਕਮਾਈ',
    navProfile: 'ਪ੍ਰੋਫਾਈਲ',
    demoPromptHelp: 'ਜਾਂ ਹੇਠਾਂ ਦਿੱਤੇ ਉਦਾਹਰਨ ਤੇ ਟੈਪ ਕਰੋ:',
    onboardingQuestions: {
      welcome: (name) =>
        `ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ${name} ਜੀ 👋\nਮੈਂ ਕਾਰੀਗਰ ਸਾਥੀ ਹਾਂ। ਤੁਹਾਨੂੰ ਕੁਝ ਵੀ ਟਾਈਪ ਕਰਨ ਦੀ ਲੋੜ ਨਹੀਂ। ਬੱਸ ਮੇਰੇ ਨਾਲ ਗੱਲ ਕਰੋ, ਮੈਂ ਤੁਹਾਡਾ ਪ੍ਰੋਫਾਈਲ ਬਣਾ ਦਿਆਂਗਾ।`,
      tradeQuestion: (name) => `${name} ਜੀ, ਤੁਸੀਂ ਕੀ ਕੰਮ ਕਰਦੇ ਹੋ?`,
      experienceQuestion: () => `ਤੁਹਾਨੂੰ ਇਹ ਕੰਮ ਕਰਦਿਆਂ ਕਿੰਨੇ ਸਾਲ ਹੋ ਗਏ ਹਨ?`,
      skillsQuestion: () => `ਤੁਸੀਂ ਕਿਹੜਾ ਕੰਮ ਸਭ ਤੋਂ ਜ਼ਿਆਦਾ ਕਰਦੇ ਹੋ?`,
      certQuestion: (name) => `${name} ਜੀ, ਤੁਹਾਡੇ ਕੋਲ ਕੋਈ ਸਰਟੀਫਿਕੇਟ ਜਾਂ ਟ੍ਰੇਨਿੰਗ ਹੈ?`,
      summaryConfirmation: (name) =>
        `${name} ਜੀ, ਮੈਂ ਇਹ ਸਾਰੀਆਂ ਗੱਲਾਂ ਸਮਝ ਲਈਆਂ ਹਨ। ਸਭ ਠੀਕ ਹੈ?`,
      passportReadyAnnouncement: (name) =>
        `ਮੁਬਾਰਕਾਂ ${name} ਜੀ! ਤੁਹਾਡਾ ਡਿਜੀਟਲ ਕਾਰੀਗਰ ਪਾਸਪੋਰਟ ਤਿਆਰ ਹੈ 🎉`,
    },
    jobQuestions: {
      prompt: 'ਦੱਸੋ, ਕਿੱਥੇ ਕੀ ਕੰਮ ਕੀਤਾ ਅਤੇ ਕਿੰਨੇ ਪੈਸੇ ਮਿਲੇ?',
      confirm: (name) => `${name} ਜੀ, ਕੀ ਇਹ ਕੰਮ ਦੀ ਜਾਣਕਾਰੀ ਸਹੀ ਹੈ?`,
    },
    kamaiQuestions: {
      prompt: 'ਅੱਜ ਦੇ ਕੰਮ ਅਤੇ ਕਮਾਈ ਦਾ ਹਿਸਾਬ ਬੋਲੋ...',
      confirm: (total) => `ਅੱਜ ਦੀ ਕੁੱਲ ਕਮਾਈ ₹${total.toLocaleString('en-IN')} ਹੈ। ਦਰਜ ਕਰੀਏ?`,
    },
  },
  kn: {
    appName: 'ಕಾರೀಗರ್',
    assistantName: 'ಕಾರೀಗರ್ ಸಾಥಿ',
    tagline: 'ನಿಮ್ಮ ಮಾತಿನಲ್ಲೇ ಕೆಲಸ ಮಾಡುವ ಡಿಜಿಟಲ್ ಸಹಾಯಕ',
    tapToSpeak: 'ಮಾತನಾಡಲು ಒತ್ತಿ',
    listening: 'ಕೇಳಿಸಿಕೊಳ್ಳುತ್ತಿದೆ...',
    gotIt: 'ಅರ್ಥವಾಯಿತು',
    hearAgain: 'ಮತ್ತೆ ಹೇಳಿ',
    speak: 'ಮಾತನಾಡಿ',
    edit: 'ಬದಲಾಯಿಸಿ',
    confirm: 'ದೃಢೀಕರಿಸಿ',
    yesCorrect: 'ಹೌದು, ಸರಿಯಾಗಿದೆ',
    changeSomething: 'ಏನಾದರೂ ಬದಲಾಯಿಸಬೇಕು',
    whatToChange: 'ಏನನ್ನು ಬದಲಾಯಿಸಬೇಕು?',
    changeLanguage: 'ಭಾಷೆ ಬದಲಾಯಿಸಿ',
    chooseLanguage: 'ನಿಮ್ಮ ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ',
    yourProfile: 'ನಿಮ್ಮ ಪ್ರೊಫೈಲ್',
    passportReady: 'ನಿಮ್ಮ ಪಾಸ್‌ಪೋರ್ಟ್ ಸಿದ್ಧವಾಗಿದೆ!',
    digitalPassport: 'ಡಿಜಿಟಲ್ ಕಾರೀಗರ್ ಪಾಸ್‌ಪೋರ್ಟ್',
    viewPassport: 'ಪಾಸ್‌ಪೋರ್ಟ್ ವೀಕ್ಷಿಸಿ',
    addJobByVoice: 'ಧ್ವನಿ ಮೂಲಕ ಕೆಲಸ ಸೇರಿಸಿ',
    addEarnings: 'ಗಳಿಕೆ ಸೇರಿಸಿ',
    addWork: 'ಕೆಲಸ ಸೇರಿಸಿ',
    updateProfile: 'ಪ್ರೊಫೈಲ್ ನವೀಕರಿಸಿ',
    talkToAssistant: 'ಕಾರೀಗರ್ ಸಾಥಿ ಜೊತೆ ಮಾತನಾಡಿ',
    todayEarnings: 'ಇಂದಿನ ಗಳಿಕೆ',
    thisMonth: 'ಈ ತಿಂಗಳು',
    totalJobs: 'ಒಟ್ಟು ಕೆಲಸಗಳು',
    recentJobs: 'ಇತ್ತೀಚಿನ ಕೆಲಸಗಳು',
    verifiedPassport: 'ದೃಢೀಕೃತ ಕಾರೀಗರ್',
    yearsExperience: 'ವರ್ಷಗಳ ಅನುಭವ',
    skills: ['ಮನೆ ವೈರಿಂಗ್', 'ಫ್ಯಾನ್ ಅಳವಡಿಕೆ', 'ಸ್ವಿಚ್‌ಬೋರ್ಡ್ ಕೆಲಸ', 'ವಿದ್ಯುತ್ ದುರಸ್ತಿ'],
    certifications: 'ಪ್ರಮಾಣಪತ್ರ / ತರಬೇತಿ',
    navHome: 'ಮುಖಪುಟ',
    navPassport: 'ಪಾಸ್‌ಪೋರ್ಟ್',
    navJobs: 'ಕೆಲಸಗಳು',
    navKamai: 'ಗಳಿಕೆ',
    navProfile: 'ಪ್ರೊಫೈಲ್',
    demoPromptHelp: 'ಅಥವಾ ಕೆಳಗಿನ ಮಾದರಿ ವಾಕ್ಯವನ್ನು ಒತ್ತಿ:',
    onboardingQuestions: {
      welcome: (name) =>
        `ನಮಸ್ಕಾರ ${name} ಅವರೇ 👋\nನಾನು ಕಾರೀಗರ್ ಸಾಥಿ. ನೀವು ಏನನ್ನೂ ಟೈಪ್ ಮಾಡಬೇಕಾಗಿಲ್ಲ. ನನ್ನೊಂದಿಗೆ ಮಾತನಾಡಿ, ನಾನು ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ರಚಿಸುತ್ತೇನೆ.`,
      tradeQuestion: (name) => `${name} ಅವರೇ, ನೀವು ಯಾವ ಕೆಲಸ ಮಾಡುತ್ತೀರಿ?`,
      experienceQuestion: () => `ಈ ಕೆಲಸದಲ್ಲಿ ನಿಮಗೆ ಎಷ್ಟು ವರ್ಷಗಳ ಅನುಭವವಿದೆ?`,
      skillsQuestion: () => `ನೀವು ಯಾವ ರೀತಿಯ ಕೆಲಸವನ್ನು ಹೆಚ್ಚು ಮಾಡುತ್ತೀರಿ?`,
      certQuestion: (name) => `${name} ಅವರೇ, ನಿಮ್ಮ ಬಳಿ ಯಾವುದೇ ಪ್ರಮಾಣಪತ್ರ ಅಥವಾ ತರಬೇತಿ ಇದೆಯೇ?`,
      summaryConfirmation: (name) =>
        `${name} ಅವರೇ, ನಾನು ಈ ವಿವರಗಳನ್ನು ಅರ್ಥಮಾಡಿಕೊಂಡಿದ್ದೇನೆ. ಎಲ್ಲವೂ ಸರಿಯಾಗಿದೆಯೇ?`,
      passportReadyAnnouncement: (name) =>
        `ಅಭಿನಂದನೆಗಳು ${name} ಅವರೇ! ನಿಮ್ಮ ಡಿಜಿಟಲ್ ಕಾರೀಗರ್ ಪಾಸ್‌ಪೋರ್ಟ್ ಸಿದ್ಧವಾಗಿದೆ 🎉`,
    },
    jobQuestions: {
      prompt: 'ಹೇಳಿ, ಎಲ್ಲಿ ಏನು ಕೆಲಸ ಮಾಡಿದಿರಿ ಮತ್ತು ಎಷ್ಟು ಹಣ ಸಿಕ್ಕಿತು?',
      confirm: (name) => `${name} ಅವರೇ, ಈ ಕೆಲಸದ ವಿವರಗಳು ಸರಿಯಾಗಿದೆಯೇ?`,
    },
    kamaiQuestions: {
      prompt: 'ಇಂದಿನ ಕೆಲಸ ಮತ್ತು ಹಣದ ಲೆಕ್ಕ ಹೇಳಿ...',
      confirm: (total) => `ಇಂದಿನ ಒಟ್ಟು ಗಳಿಕೆ ₹${total.toLocaleString('en-IN')} ಆಗಿದೆ. ಸೇರಿಸಲೇ?`,
    },
  },
  mr: {
    appName: 'कारागीर',
    assistantName: 'कारागीर साथी',
    tagline: 'तुमचा स्वतःचा बोलून चालणारा डिजिटल सोबती',
    tapToSpeak: 'बोलण्यासाठी दाबा',
    listening: 'ऐकत आहे...',
    gotIt: 'समजले',
    hearAgain: 'पुन्हा बोला',
    speak: 'बोला',
    edit: 'बदला',
    confirm: 'नक्की करा',
    yesCorrect: 'होय, बरोबर आहे',
    changeSomething: 'काही बदलायचे आहे',
    whatToChange: 'काय बदल करायचा आहे?',
    changeLanguage: 'भाषा बदला',
    chooseLanguage: 'तुमची भाषा निवडा',
    yourProfile: 'तुमचे प्रोफाईल',
    passportReady: 'तुमचा पासपोर्ट तयार आहे!',
    digitalPassport: 'डिजिटल कारागीर पासपोर्ट',
    viewPassport: 'पासपोर्ट पहा',
    addJobByVoice: 'बोलून काम जोडा',
    addEarnings: 'कमाई जोडा',
    addWork: 'काम जोडा',
    updateProfile: 'प्रोफाईल अपडेट करा',
    talkToAssistant: 'कारागीर साथीशी बोला',
    todayEarnings: 'आजची कमाई',
    thisMonth: 'या महिन्यात',
    totalJobs: 'एकूण कामे',
    recentJobs: 'नुकतीच झालेली कामे',
    verifiedPassport: 'प्रमाणित कारागीर',
    yearsExperience: 'वर्षांचा अनुभव',
    skills: ['घर वायरिंग', 'फॅन फिटिंग', 'स्विचबोर्ड काम', 'इलेक्ट्रिक रिपेअरिंग'],
    certifications: 'प्रमाणपत्र / प्रशिक्षण',
    navHome: 'होम',
    navPassport: 'पासपोर्ट',
    navJobs: 'कामे',
    navKamai: 'कमाई',
    navProfile: 'प्रोफाईल',
    demoPromptHelp: 'किंवा खालील उदाहरणावर टॅप करा:',
    onboardingQuestions: {
      welcome: (name) =>
        `नमस्कार ${name} जी 👋\nमी कारागीर साथी आहे. तुम्हाला काहीही टाईप करण्याची गरज नाही. फक्त माझ्याशी बोला, मी तुमचे प्रोफाइल तयार करून देईन.`,
      tradeQuestion: (name) => `${name} जी, तुम्ही काय काम करता?`,
      experienceQuestion: () => `तुम्हाला हे काम करताना किती वर्षे झाली आहेत?`,
      skillsQuestion: () => `तुम्ही सर्वात जास्त कोणत्या प्रकारचे काम करता?`,
      certQuestion: (name) => `${name} जी, तुमच्याकडे काही प्रमाणपत्र किंवा ट्रेनिंग आहे का?`,
      summaryConfirmation: (name) =>
        `${name} जी, मला हे सर्व समजले आहे. सर्व बरोबर आहे का?`,
      passportReadyAnnouncement: (name) =>
        `अभिनंदन ${name} जी! तुमचा डिजिटल कारागीर पासपोर्ट तयार झाला आहे 🎉`,
    },
    jobQuestions: {
      prompt: 'सांगा, कुठे काय काम केले आणि किती पैसे मिळाले?',
      confirm: (name) => `${name} जी, ही कामाची माहिती बरोबर आहे का?`,
    },
    kamaiQuestions: {
      prompt: 'आजच्या कामाची आणि पैशांची नोंद बोला...',
      confirm: (total) => `आजची एकूण कमाई ₹${total.toLocaleString('en-IN')} झाली आहे. जोडू का?`,
    },
  },
  en: {
    appName: 'Kaarigar',
    assistantName: 'Kaarigar Saathi',
    tagline: 'Your voice-first smart digital companion',
    tapToSpeak: 'Tap to Speak',
    listening: 'Listening...',
    gotIt: 'Got it',
    hearAgain: 'Hear Again',
    speak: 'Speak',
    edit: 'Edit',
    confirm: 'Confirm',
    yesCorrect: 'Yes, it is correct',
    changeSomething: 'Change something',
    whatToChange: 'What would you like to change?',
    changeLanguage: 'Change Language',
    chooseLanguage: 'Choose your language',
    yourProfile: 'Your Profile',
    passportReady: 'Your Passport is Ready!',
    digitalPassport: 'Digital Kaarigar Passport',
    viewPassport: 'View Passport',
    addJobByVoice: 'Add Job by Voice',
    addEarnings: 'Add Earnings',
    addWork: 'Add Work',
    updateProfile: 'Update Profile',
    talkToAssistant: 'Talk to Kaarigar Saathi',
    todayEarnings: "Today's Earnings",
    thisMonth: 'This Month',
    totalJobs: 'Total Jobs',
    recentJobs: 'Recent Jobs',
    verifiedPassport: 'Verified Kaarigar',
    yearsExperience: 'Years Experience',
    skills: ['House Wiring', 'Fan Installation', 'Switchboard & MCB', 'Electrical Repair'],
    certifications: 'Certificates / Training',
    navHome: 'Home',
    navPassport: 'Passport',
    navJobs: 'Jobs',
    navKamai: 'Kamai',
    navProfile: 'Profile',
    demoPromptHelp: 'Or tap any quick voice demo prompt:',
    onboardingQuestions: {
      welcome: (name) =>
        `Namaste ${name} ji 👋\nI am Kaarigar Saathi. You do not need to type anything. Just talk to me, and I will build your profile.`,
      tradeQuestion: (name) => `${name} ji, what trade or work do you do?`,
      experienceQuestion: () => `How many years have you been doing this work?`,
      skillsQuestion: () => `What specific work or tasks do you do the most?`,
      certQuestion: (name) => `${name} ji, do you have any certificates or ITI training?`,
      summaryConfirmation: (name) =>
        `${name} ji, I have captured these details. Is everything correct?`,
      passportReadyAnnouncement: (name) =>
        `Congratulations ${name} ji! Your Digital Kaarigar Passport is ready 🎉`,
    },
    jobQuestions: {
      prompt: 'Tell me where you worked, what you did, and how much you received...',
      confirm: (name) => `${name} ji, are these job details correct?`,
    },
    kamaiQuestions: {
      prompt: 'Speak your work and earnings for today...',
      confirm: (total) => `Total earnings of ₹${total.toLocaleString('en-IN')} calculated. Save this entry?`,
    },
  },
};
