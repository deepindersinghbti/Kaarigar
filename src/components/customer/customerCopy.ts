import type { SupportedLanguage } from '../../types';

type Trade = 'Electrician' | 'Plumber';

export interface CustomerCopy {
  appName: string;
  customer: string;
  back: string;
  language: string;
  signOut: string;
  browse: string;
  requests: string;
  notice: string;
  directory: { loading: string; unavailable: string; loadError: string; jobs: string };
  form: {
    back: string; notFound: string; loadError: string; workLabel: string; workPlaceholder: string;
    nameLabel: string; namePlaceholder: string; locationLabel: string; locationPlaceholder: string;
    estimateLabel: string; notesLabel: string; sending: string; submit: string; sendError: string;
  };
  requestList: {
    loading: string; loadError: string; count: (count: number) => string; refresh: string;
    empty: string; find: string; quote: string; accepting: string; accept: string;
    agreed: string; acceptError: string;
    decline: string; declining: string; declineError: string; declined: string;
    cancel: string; cancelling: string; cancelError: string; cancelConfirm: string;
    timelineShow: string; timelineHide: string; timelineBy: (isYou: boolean) => string;
  };
  trades: Record<Trade, string>;
}

const CUSTOMER_COPY: Record<SupportedLanguage, CustomerCopy> = {
  en: {
    appName: 'Kaarigar', customer: 'Customer demo · Neha Sharma', back: 'Back to role selection', language: 'Change language', signOut: 'Sign out', browse: 'Find a Kaarigar', requests: 'My requests',
    notice: 'Demo login: 0123456789. Use the separate customer demo code supplied by the presenter. No SMS is sent. Browse, request tracking, and quote acceptance are ready; completion confirmation and payment verification are not available yet.',
    directory: { loading: 'Loading…', unavailable: 'No kaarigar is available yet.', loadError: 'Could not load kaarigars.', jobs: 'jobs' },
    form: { back: 'Back', notFound: 'This kaarigar was not found.', loadError: 'Could not load this kaarigar.', workLabel: 'What work do you need?', workPlaceholder: 'For example: the fan is not working', nameLabel: 'Your name', namePlaceholder: 'For example: Neha Sharma', locationLabel: 'Address', locationPlaceholder: 'For example: Sector 35, Chandigarh', estimateLabel: 'Estimated amount (₹)', notesLabel: 'Anything else to share?', sending: 'Sending…', submit: 'Send request', sendError: 'Could not send the request.' },
    requestList: { loading: 'Loading…', loadError: 'Could not load requests.', count: (count) => `${count} request${count === 1 ? '' : 's'}`, refresh: 'Refresh', empty: 'No requests yet.', find: 'Find a Kaarigar', quote: "Kaarigar's quote:", accepting: 'Accepting…', accept: 'Accept this price', agreed: 'Agreed price:', acceptError: 'Could not accept the price.',
      decline: 'Ask for another price', declining: 'Sending…', declineError: 'Could not decline the price.', declined: 'You asked for another price. Waiting for the kaarigar.',
      cancel: 'Cancel request', cancelling: 'Cancelling…', cancelError: 'Could not cancel the request.', cancelConfirm: 'Cancel this request? The kaarigar will be told it is no longer needed.',
      timelineShow: 'Show progress', timelineHide: 'Hide progress', timelineBy: (isYou) => (isYou ? 'by you' : 'by the kaarigar') },
    trades: { Electrician: 'Electrician', Plumber: 'Plumber' },
  },
  hi: {
    appName: 'कारीगर', customer: 'ग्राहक डेमो · नेहा शर्मा', back: 'भूमिका चयन पर वापस जाएँ', language: 'भाषा बदलें', signOut: 'साइन आउट', browse: 'कारीगर खोजें', requests: 'मेरे अनुरोध',
    notice: 'डेमो लॉगिन: 0123456789। प्रस्तुतकर्ता से मिला अलग ग्राहक डेमो कोड डालें। SMS नहीं भेजा जाता। खोज, अनुरोध देखना और कोट स्वीकार करना उपलब्ध है; काम पूरा होने की पुष्टि और भुगतान सत्यापन अभी उपलब्ध नहीं हैं।',
    directory: { loading: 'लोड हो रहा है…', unavailable: 'अभी कोई कारीगर उपलब्ध नहीं है।', loadError: 'कारीगर लोड नहीं हो सके।', jobs: 'काम' },
    form: { back: 'वापस', notFound: 'यह कारीगर नहीं मिला।', loadError: 'कारीगर लोड नहीं हो सका।', workLabel: 'काम क्या है?', workPlaceholder: 'जैसे: पंखा नहीं चल रहा', nameLabel: 'आपका नाम', namePlaceholder: 'जैसे: नेहा शर्मा', locationLabel: 'पता', locationPlaceholder: 'जैसे: सेक्टर 35, चंडीगढ़', estimateLabel: 'अनुमानित रकम (₹)', notesLabel: 'और कुछ बताना है?', sending: 'भेजा जा रहा है…', submit: 'अनुरोध भेजें', sendError: 'अनुरोध नहीं भेजा जा सका।' },
    requestList: { loading: 'लोड हो रहा है…', loadError: 'अनुरोध लोड नहीं हो सके।', count: (count) => `${count} अनुरोध`, refresh: 'ताज़ा करें', empty: 'अभी तक कोई अनुरोध नहीं।', find: 'कारीगर खोजें', quote: 'कारीगर का दाम:', accepting: 'भेज रहे हैं…', accept: 'यह दाम स्वीकार करें', agreed: 'तय दाम:', acceptError: 'दाम स्वीकार नहीं हो सका।',
      decline: 'दूसरा दाम बताने को कहें', declining: 'भेज रहे हैं…', declineError: 'दाम अस्वीकार नहीं हो सका।', declined: 'आपने दूसरा दाम माँगा है। कारीगर के जवाब का इंतज़ार है।',
      cancel: 'अनुरोध रद्द करें', cancelling: 'रद्द कर रहे हैं…', cancelError: 'अनुरोध रद्द नहीं हो सका।', cancelConfirm: 'यह अनुरोध रद्द करें? कारीगर को बता दिया जाएगा कि अब ज़रूरत नहीं है।',
      timelineShow: 'प्रगति देखें', timelineHide: 'प्रगति छिपाएँ', timelineBy: (isYou) => (isYou ? 'आपके द्वारा' : 'कारीगर द्वारा') },
    trades: { Electrician: 'इलेक्ट्रीशियन', Plumber: 'प्लंबर' },
  },
  pa: {
    appName: 'ਕਾਰੀਗਰ', customer: 'ਗਾਹਕ ਡੈਮੋ · ਨੇਹਾ ਸ਼ਰਮਾ', back: 'ਭੂਮਿਕਾ ਚੋਣ ਉੱਤੇ ਵਾਪਸ ਜਾਓ', language: 'ਭਾਸ਼ਾ ਬਦਲੋ', signOut: 'ਸਾਈਨ ਆਊਟ', browse: 'ਕਾਰੀਗਰ ਲੱਭੋ', requests: 'ਮੇਰੀਆਂ ਬੇਨਤੀਆਂ',
    notice: 'ਡੈਮੋ ਲੌਗਇਨ: 0123456789। ਪੇਸ਼ਕਰਤਾ ਤੋਂ ਮਿਲਿਆ ਵੱਖਰਾ ਗਾਹਕ ਡੈਮੋ ਕੋਡ ਵਰਤੋ। SMS ਨਹੀਂ ਭੇਜਿਆ ਜਾਂਦਾ। ਖੋਜ, ਬੇਨਤੀ ਦੇਖਣਾ ਅਤੇ ਕੋਟ ਮਨਜ਼ੂਰ ਕਰਨਾ ਉਪਲਬਧ ਹੈ; ਕੰਮ ਮੁਕੰਮਲ ਹੋਣ ਦੀ ਪੁਸ਼ਟੀ ਅਤੇ ਭੁਗਤਾਨ ਤਸਦੀਕ ਹਾਲੇ ਉਪਲਬਧ ਨਹੀਂ ਹਨ।',
    directory: { loading: 'ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…', unavailable: 'ਹਾਲੇ ਕੋਈ ਕਾਰੀਗਰ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।', loadError: 'ਕਾਰੀਗਰ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕੇ।', jobs: 'ਕੰਮ' },
    form: { back: 'ਵਾਪਸ', notFound: 'ਇਹ ਕਾਰੀਗਰ ਨਹੀਂ ਮਿਲਿਆ।', loadError: 'ਕਾਰੀਗਰ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕਿਆ।', workLabel: 'ਕਿਹੜਾ ਕੰਮ ਚਾਹੀਦਾ ਹੈ?', workPlaceholder: 'ਜਿਵੇਂ: ਪੱਖਾ ਕੰਮ ਨਹੀਂ ਕਰ ਰਿਹਾ', nameLabel: 'ਤੁਹਾਡਾ ਨਾਮ', namePlaceholder: 'ਜਿਵੇਂ: ਨੇਹਾ ਸ਼ਰਮਾ', locationLabel: 'ਪਤਾ', locationPlaceholder: 'ਜਿਵੇਂ: ਸੈਕਟਰ 35, ਚੰਡੀਗੜ੍ਹ', estimateLabel: 'ਅੰਦਾਜ਼ਨ ਰਕਮ (₹)', notesLabel: 'ਹੋਰ ਕੁਝ ਦੱਸਣਾ ਹੈ?', sending: 'ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ…', submit: 'ਬੇਨਤੀ ਭੇਜੋ', sendError: 'ਬੇਨਤੀ ਨਹੀਂ ਭੇਜੀ ਜਾ ਸਕੀ।' },
    requestList: { loading: 'ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…', loadError: 'ਬੇਨਤੀਆਂ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕੀਆਂ।', count: (count) => `${count} ਬੇਨਤੀਆਂ`, refresh: 'ਤਾਜ਼ਾ ਕਰੋ', empty: 'ਹਾਲੇ ਕੋਈ ਬੇਨਤੀ ਨਹੀਂ ਹੈ।', find: 'ਕਾਰੀਗਰ ਲੱਭੋ', quote: 'ਕਾਰੀਗਰ ਦੀ ਕੀਮਤ:', accepting: 'ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ…', accept: 'ਇਹ ਕੀਮਤ ਮਨਜ਼ੂਰ ਕਰੋ', agreed: 'ਤੈਅ ਕੀਮਤ:', acceptError: 'ਕੀਮਤ ਮਨਜ਼ੂਰ ਨਹੀਂ ਹੋ ਸਕੀ।',
      decline: 'ਹੋਰ ਕੀਮਤ ਦੱਸਣ ਲਈ ਕਹੋ', declining: 'ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ…', declineError: 'ਕੀਮਤ ਨਾਮਨਜ਼ੂਰ ਨਹੀਂ ਹੋ ਸਕੀ।', declined: 'ਤੁਸੀਂ ਹੋਰ ਕੀਮਤ ਮੰਗੀ ਹੈ। ਕਾਰੀਗਰ ਦੇ ਜਵਾਬ ਦੀ ਉਡੀਕ ਹੈ।',
      cancel: 'ਬੇਨਤੀ ਰੱਦ ਕਰੋ', cancelling: 'ਰੱਦ ਕੀਤੀ ਜਾ ਰਹੀ ਹੈ…', cancelError: 'ਬੇਨਤੀ ਰੱਦ ਨਹੀਂ ਹੋ ਸਕੀ।', cancelConfirm: 'ਇਹ ਬੇਨਤੀ ਰੱਦ ਕਰਨੀ ਹੈ? ਕਾਰੀਗਰ ਨੂੰ ਦੱਸ ਦਿੱਤਾ ਜਾਵੇਗਾ ਕਿ ਹੁਣ ਲੋੜ ਨਹੀਂ ਹੈ।',
      timelineShow: 'ਤਰੱਕੀ ਵੇਖੋ', timelineHide: 'ਤਰੱਕੀ ਲੁਕਾਓ', timelineBy: (isYou) => (isYou ? 'ਤੁਹਾਡੇ ਵੱਲੋਂ' : 'ਕਾਰੀਗਰ ਵੱਲੋਂ') },
    trades: { Electrician: 'ਇਲੈਕਟ੍ਰੀਸ਼ੀਅਨ', Plumber: 'ਪਲੰਬਰ' },
  },
  kn: {
    appName: 'ಕಾರಿಗಾರ', customer: 'ಗ್ರಾಹಕ ಡೆಮೊ · ನೇಹಾ ಶರ್ಮಾ', back: 'ಪಾತ್ರ ಆಯ್ಕೆಗೆ ಹಿಂದಿರುಗಿ', language: 'ಭಾಷೆ ಬದಲಿಸಿ', signOut: 'ಸೈನ್ ಔಟ್', browse: 'ಕಾರಿಗಾರರನ್ನು ಹುಡುಕಿ', requests: 'ನನ್ನ ವಿನಂತಿಗಳು',
    notice: 'ಡೆಮೊ ಲಾಗಿನ್: 0123456789. ನಿರೂಪಕರಿಂದ ಪಡೆದ ಪ್ರತ್ಯೇಕ ಗ್ರಾಹಕ ಡೆಮೊ ಕೋಡ್ ಬಳಸಿ. SMS ಕಳುಹಿಸಲಾಗುವುದಿಲ್ಲ. ಹುಡುಕಾಟ, ವಿನಂತಿ ವೀಕ್ಷಣೆ ಮತ್ತು ಉಲ್ಲೇಖಿತ ದರ ಒಪ್ಪಿಗೆ ಸಿದ್ಧವಾಗಿದೆ; ಕೆಲಸ ಮುಕ್ತಾಯ ದೃಢೀಕರಣ ಮತ್ತು ಪಾವತಿ ಪರಿಶೀಲನೆ ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ.',
    directory: { loading: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…', unavailable: 'ಈಗ ಯಾವುದೇ ಕಾರಿಗಾರ ಲಭ್ಯವಿಲ್ಲ.', loadError: 'ಕಾರಿಗಾರರನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.', jobs: 'ಕೆಲಸಗಳು' },
    form: { back: 'ಹಿಂದೆ', notFound: 'ಈ ಕಾರಿಗಾರ ಸಿಗಲಿಲ್ಲ.', loadError: 'ಈ ಕಾರಿಗಾರರನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.', workLabel: 'ಯಾವ ಕೆಲಸ ಬೇಕು?', workPlaceholder: 'ಉದಾಹರಣೆ: ಫ್ಯಾನ್ ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲ', nameLabel: 'ನಿಮ್ಮ ಹೆಸರು', namePlaceholder: 'ಉದಾಹರಣೆ: ನೇಹಾ ಶರ್ಮಾ', locationLabel: 'ವಿಳಾಸ', locationPlaceholder: 'ಉದಾಹರಣೆ: ಸೆಕ್ಟರ್ 35, ಚಂಡೀಗಢ', estimateLabel: 'ಅಂದಾಜು ಮೊತ್ತ (₹)', notesLabel: 'ಇನ್ನೇನಾದರೂ ಹೇಳಬೇಕೆ?', sending: 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…', submit: 'ವಿನಂತಿ ಕಳುಹಿಸಿ', sendError: 'ವಿನಂತಿಯನ್ನು ಕಳುಹಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.' },
    requestList: { loading: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…', loadError: 'ವಿನಂತಿಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.', count: (count) => `${count} ವಿನಂತಿಗಳು`, refresh: 'ರಿಫ್ರೆಶ್ ಮಾಡಿ', empty: 'ಇನ್ನೂ ಯಾವುದೇ ವಿನಂತಿಗಳಿಲ್ಲ.', find: 'ಕಾರಿಗಾರರನ್ನು ಹುಡುಕಿ', quote: 'ಕಾರಿಗಾರರ ದರ:', accepting: 'ಸ್ವೀಕರಿಸಲಾಗುತ್ತಿದೆ…', accept: 'ಈ ದರ ಒಪ್ಪಿಕೊಳ್ಳಿ', agreed: 'ಒಪ್ಪಿದ ದರ:', acceptError: 'ದರವನ್ನು ಒಪ್ಪಿಕೊಳ್ಳಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.',
      decline: 'ಬೇರೆ ದರ ತಿಳಿಸಲು ಕೇಳಿ', declining: 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…', declineError: 'ದರವನ್ನು ನಿರಾಕರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.', declined: 'ನೀವು ಬೇರೆ ದರ ಕೇಳಿದ್ದೀರಿ. ಕಾರಿಗಾರರ ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ.',
      cancel: 'ವಿನಂತಿ ರದ್ದುಗೊಳಿಸಿ', cancelling: 'ರದ್ದುಗೊಳಿಸಲಾಗುತ್ತಿದೆ…', cancelError: 'ವಿನಂತಿಯನ್ನು ರದ್ದುಗೊಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.', cancelConfirm: 'ಈ ವಿನಂತಿಯನ್ನು ರದ್ದುಗೊಳಿಸಬೇಕೇ? ಇನ್ನು ಅಗತ್ಯವಿಲ್ಲ ಎಂದು ಕಾರಿಗಾರರಿಗೆ ತಿಳಿಸಲಾಗುವುದು.',
      timelineShow: 'ಪ್ರಗತಿ ನೋಡಿ', timelineHide: 'ಪ್ರಗತಿ ಮರೆಮಾಡಿ', timelineBy: (isYou) => (isYou ? 'ನಿಮ್ಮಿಂದ' : 'ಕಾರಿಗಾರರಿಂದ') },
    trades: { Electrician: 'ವಿದ್ಯುತ್ ತಂತ್ರಜ್ಞ', Plumber: 'ಪ್ಲಂಬರ್' },
  },
  mr: {
    appName: 'कारागीर', customer: 'ग्राहक डेमो · नेहा शर्मा', back: 'भूमिका निवडीकडे परत जा', language: 'भाषा बदला', signOut: 'साइन आउट', browse: 'कारागीर शोधा', requests: 'माझ्या विनंत्या',
    notice: 'डेमो लॉगिन: 0123456789. सादरकर्त्याकडून मिळालेला वेगळा ग्राहक डेमो कोड वापरा. SMS पाठवला जात नाही. शोध, विनंती पाहणे आणि कोट स्वीकारणे तयार आहे; काम पूर्ण झाल्याची पुष्टी व पेमेंट पडताळणी अजून उपलब्ध नाही.',
    directory: { loading: 'लोड होत आहे…', unavailable: 'सध्या कोणताही कारागीर उपलब्ध नाही.', loadError: 'कारागीर लोड करता आले नाहीत.', jobs: 'कामे' },
    form: { back: 'मागे', notFound: 'हा कारागीर सापडला नाही.', loadError: 'हा कारागीर लोड करता आला नाही.', workLabel: 'कोणते काम हवे आहे?', workPlaceholder: 'उदा.: पंखा चालत नाही', nameLabel: 'तुमचे नाव', namePlaceholder: 'उदा.: नेहा शर्मा', locationLabel: 'पत्ता', locationPlaceholder: 'उदा.: सेक्टर 35, चंदीगड', estimateLabel: 'अंदाजे रक्कम (₹)', notesLabel: 'आणखी काही सांगायचे आहे का?', sending: 'पाठवत आहे…', submit: 'विनंती पाठवा', sendError: 'विनंती पाठवता आली नाही.' },
    requestList: { loading: 'लोड होत आहे…', loadError: 'विनंत्या लोड करता आल्या नाहीत.', count: (count) => `${count} विनंत्या`, refresh: 'रीफ्रेश करा', empty: 'अजून कोणतीही विनंती नाही.', find: 'कारागीर शोधा', quote: 'कारागिराचा दर:', accepting: 'स्वीकारत आहे…', accept: 'हा दर स्वीकारा', agreed: 'ठरलेला दर:', acceptError: 'दर स्वीकारता आला नाही.',
      decline: 'दुसरा दर सांगण्यास सांगा', declining: 'पाठवत आहे…', declineError: 'दर नाकारता आला नाही.', declined: 'तुम्ही दुसरा दर मागितला आहे. कारागिराच्या उत्तराची वाट पाहत आहोत.',
      cancel: 'विनंती रद्द करा', cancelling: 'रद्द करत आहे…', cancelError: 'विनंती रद्द करता आली नाही.', cancelConfirm: 'ही विनंती रद्द करायची? आता गरज नाही असे कारागिराला कळवले जाईल.',
      timelineShow: 'प्रगती पहा', timelineHide: 'प्रगती लपवा', timelineBy: (isYou) => (isYou ? 'तुमच्याकडून' : 'कारागिराकडून') },
    trades: { Electrician: 'इलेक्ट्रिशियन', Plumber: 'प्लंबर' },
  },
};

export function getCustomerCopy(language: SupportedLanguage): CustomerCopy {
  return CUSTOMER_COPY[language] ?? CUSTOMER_COPY.en;
}

export function getCustomerTrade(language: SupportedLanguage, trade: string): string {
  const copy = getCustomerCopy(language);
  return trade === 'Electrician' || trade === 'Plumber' ? copy.trades[trade] : trade;
}
