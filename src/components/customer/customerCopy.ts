import type { SupportedLanguage } from '../../types';

/**
 * Every trade the seeded directory contains.
 *
 * This list and the seed must stay in step. A trade missing here renders as
 * the raw English string in a Hindi demo - getCustomerTrade falls back rather
 * than throwing, so the failure is quiet and only visible on screen.
 */
type Trade =
  | 'Electrician'
  | 'Plumber'
  | 'Carpenter'
  | 'Painter'
  | 'Mason'
  | 'AC & Appliance Technician';

export interface CustomerCopy {
  appName: string;
  customer: string;
  back: string;
  language: string;
  signOut: string;
  browse: string;
  requests: string;
  notice: string;
  directory: {
    loading: string; unavailable: string; loadError: string; jobs: string;
    areaLabel: string; sameArea: string;
    /** Area names are keyed by the canonical value in lib/areas.ts. */
    areas: Record<'Chandigarh' | 'Mohali' | 'Panchkula' | 'Zirakpur', string>;
  };
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
    timelineShow: string; timelineHide: string; timelineBy: (isYou: boolean) => string; call: string;
    done: string; confirm: string; confirming: string; confirmError: string;
    dispute: string; disputing: string; disputeError: string; disputed: string; disputeConfirm: string;
    counter: string; counterCancel: string; counterLabel: string; counterPlaceholder: string;
    counterSend: string; countering: string; counterError: string; counterInvalid: string;
    countered: (price: number) => string;
    live: string; liveOn: string; liveOff: string;
  };
  trades: Record<Trade, string>;
}

const CUSTOMER_COPY: Record<SupportedLanguage, CustomerCopy> = {
  en: {
    appName: 'Kaarigar', customer: 'Customer demo · Neha Sharma', back: 'Back to role selection', language: 'Change language', signOut: 'Sign out', browse: 'Find a Kaarigar', requests: 'My requests',
    notice: 'Demo login: 0123456789. Use the separate customer demo code supplied by the presenter. No SMS is sent. Payment is not verified anywhere in this demo — a settled job records that the work was agreed and confirmed, never that money changed hands.',
    directory: { loading: 'Loading…', unavailable: 'No kaarigar is available yet.', loadError: 'Could not load kaarigars.', jobs: 'jobs',
      areaLabel: 'Your area', sameArea: 'Same area',
      areas: { Chandigarh: 'Chandigarh', Mohali: 'Mohali', Panchkula: 'Panchkula', Zirakpur: 'Zirakpur' } },
    form: { back: 'Back', notFound: 'This kaarigar was not found.', loadError: 'Could not load this kaarigar.', workLabel: 'What work do you need?', workPlaceholder: 'For example: the fan is not working', nameLabel: 'Your name', namePlaceholder: 'For example: Neha Sharma', locationLabel: 'Address', locationPlaceholder: 'For example: Sector 35, Chandigarh', estimateLabel: 'Estimated amount (₹)', notesLabel: 'Anything else to share?', sending: 'Sending…', submit: 'Send request', sendError: 'Could not send the request.' },
    requestList: { loading: 'Loading…', loadError: 'Could not load requests.', count: (count) => `${count} request${count === 1 ? '' : 's'}`, refresh: 'Refresh', empty: 'No requests yet.', find: 'Find a Kaarigar', quote: "Kaarigar's quote:", accepting: 'Accepting…', accept: 'Accept this price', agreed: 'Agreed price:', acceptError: 'Could not accept the price.',
      decline: 'Ask for another price', declining: 'Sending…', declineError: 'Could not decline the price.', declined: 'You asked for another price. Waiting for the kaarigar.',
      cancel: 'Cancel request', cancelling: 'Cancelling…', cancelError: 'Could not cancel the request.', cancelConfirm: 'Cancel this request? The kaarigar will be told it is no longer needed.',
      timelineShow: 'Show progress', timelineHide: 'Hide progress', timelineBy: (isYou) => (isYou ? 'by you' : 'by the kaarigar'), call: 'Call',
      done: 'The kaarigar says this work is done.', confirm: 'Yes, it is done', confirming: 'Confirming…', confirmError: 'Could not confirm.',
      dispute: 'No, it is not done', disputing: 'Sending…', disputeError: 'Could not send that.', disputed: 'You said this is not done. The kaarigar can return and finish it.', disputeConfirm: 'Tell the kaarigar this work is not done?',
      counter: 'Offer a different price', counterCancel: 'Never mind', counterLabel: 'Your price', counterPlaceholder: 'Price ₹',
      counterSend: 'Send my price', countering: 'Sending…', counterError: 'Could not send your price.', counterInvalid: 'Enter a price greater than zero.',
      countered: (price) => `You asked for ₹${price}. Waiting for the kaarigar to reply.`,
      live: 'Live', liveOn: 'Updates arrive on their own. Tap to stop.', liveOff: 'Tap to let updates arrive on their own.' },
    trades: { Electrician: 'Electrician', Plumber: 'Plumber', Carpenter: 'Carpenter', Painter: 'Painter', Mason: 'Mason', 'AC & Appliance Technician': 'AC & Appliance Technician' },
  },
  hi: {
    appName: 'कारीगर', customer: 'ग्राहक डेमो · नेहा शर्मा', back: 'भूमिका चयन पर वापस जाएँ', language: 'भाषा बदलें', signOut: 'साइन आउट', browse: 'कारीगर खोजें', requests: 'मेरे अनुरोध',
    notice: 'डेमो लॉगिन: 0123456789। प्रस्तुतकर्ता से मिला अलग ग्राहक डेमो कोड डालें। SMS नहीं भेजा जाता। इस डेमो में भुगतान कहीं भी सत्यापित नहीं होता — तय और पूरा हुआ काम दर्ज होता है, पैसा मिलना नहीं।',
    directory: { loading: 'लोड हो रहा है…', unavailable: 'अभी कोई कारीगर उपलब्ध नहीं है।', loadError: 'कारीगर लोड नहीं हो सके।', jobs: 'काम',
      areaLabel: 'आपका इलाका', sameArea: 'इसी इलाके में',
      areas: { Chandigarh: 'चंडीगढ़', Mohali: 'मोहाली', Panchkula: 'पंचकूला', Zirakpur: 'ज़ीरकपुर' } },
    form: { back: 'वापस', notFound: 'यह कारीगर नहीं मिला।', loadError: 'कारीगर लोड नहीं हो सका।', workLabel: 'काम क्या है?', workPlaceholder: 'जैसे: पंखा नहीं चल रहा', nameLabel: 'आपका नाम', namePlaceholder: 'जैसे: नेहा शर्मा', locationLabel: 'पता', locationPlaceholder: 'जैसे: सेक्टर 35, चंडीगढ़', estimateLabel: 'अनुमानित रकम (₹)', notesLabel: 'और कुछ बताना है?', sending: 'भेजा जा रहा है…', submit: 'अनुरोध भेजें', sendError: 'अनुरोध नहीं भेजा जा सका।' },
    requestList: { loading: 'लोड हो रहा है…', loadError: 'अनुरोध लोड नहीं हो सके।', count: (count) => `${count} अनुरोध`, refresh: 'ताज़ा करें', empty: 'अभी तक कोई अनुरोध नहीं।', find: 'कारीगर खोजें', quote: 'कारीगर का दाम:', accepting: 'भेज रहे हैं…', accept: 'यह दाम स्वीकार करें', agreed: 'तय दाम:', acceptError: 'दाम स्वीकार नहीं हो सका।',
      decline: 'दूसरा दाम बताने को कहें', declining: 'भेज रहे हैं…', declineError: 'दाम अस्वीकार नहीं हो सका।', declined: 'आपने दूसरा दाम माँगा है। कारीगर के जवाब का इंतज़ार है।',
      cancel: 'अनुरोध रद्द करें', cancelling: 'रद्द कर रहे हैं…', cancelError: 'अनुरोध रद्द नहीं हो सका।', cancelConfirm: 'यह अनुरोध रद्द करें? कारीगर को बता दिया जाएगा कि अब ज़रूरत नहीं है।',
      timelineShow: 'प्रगति देखें', timelineHide: 'प्रगति छिपाएँ', timelineBy: (isYou) => (isYou ? 'आपके द्वारा' : 'कारीगर द्वारा'), call: 'कॉल करें',
      done: 'कारीगर का कहना है कि यह काम पूरा हो गया है।', confirm: 'हाँ, काम पूरा हुआ', confirming: 'पुष्टि हो रही है…', confirmError: 'पुष्टि नहीं हो सकी।',
      dispute: 'नहीं, काम पूरा नहीं हुआ', disputing: 'भेज रहे हैं…', disputeError: 'यह भेजा नहीं जा सका।', disputed: 'आपने कहा कि काम पूरा नहीं हुआ। कारीगर लौटकर इसे पूरा कर सकता है।', disputeConfirm: 'कारीगर को बताएँ कि यह काम पूरा नहीं हुआ?',
      counter: 'अपना दाम बताएँ', counterCancel: 'रहने दें', counterLabel: 'आपका दाम', counterPlaceholder: 'दाम ₹',
      counterSend: 'मेरा दाम भेजें', countering: 'भेज रहे हैं…', counterError: 'आपका दाम नहीं भेजा जा सका।', counterInvalid: 'शून्य से बड़ा दाम डालें।',
      countered: (price) => `आपने ₹${price} माँगा है। कारीगर के जवाब का इंतज़ार है।`,
      live: 'लाइव', liveOn: 'अपडेट अपने आप आते हैं। रोकने के लिए दबाएँ।', liveOff: 'अपडेट अपने आप पाने के लिए दबाएँ।' },
    trades: { Electrician: 'इलेक्ट्रीशियन', Plumber: 'प्लंबर', Carpenter: 'बढ़ई', Painter: 'पेंटर', Mason: 'राजमिस्त्री', 'AC & Appliance Technician': 'एसी और उपकरण तकनीशियन' },
  },
  pa: {
    appName: 'ਕਾਰੀਗਰ', customer: 'ਗਾਹਕ ਡੈਮੋ · ਨੇਹਾ ਸ਼ਰਮਾ', back: 'ਭੂਮਿਕਾ ਚੋਣ ਉੱਤੇ ਵਾਪਸ ਜਾਓ', language: 'ਭਾਸ਼ਾ ਬਦਲੋ', signOut: 'ਸਾਈਨ ਆਊਟ', browse: 'ਕਾਰੀਗਰ ਲੱਭੋ', requests: 'ਮੇਰੀਆਂ ਬੇਨਤੀਆਂ',
    notice: 'ਡੈਮੋ ਲੌਗਇਨ: 0123456789। ਪੇਸ਼ਕਰਤਾ ਤੋਂ ਮਿਲਿਆ ਵੱਖਰਾ ਗਾਹਕ ਡੈਮੋ ਕੋਡ ਵਰਤੋ। SMS ਨਹੀਂ ਭੇਜਿਆ ਜਾਂਦਾ। ਇਸ ਡੈਮੋ ਵਿੱਚ ਭੁਗਤਾਨ ਕਿਤੇ ਵੀ ਤਸਦੀਕ ਨਹੀਂ ਹੁੰਦਾ — ਤੈਅ ਅਤੇ ਮੁਕੰਮਲ ਹੋਇਆ ਕੰਮ ਦਰਜ ਹੁੰਦਾ ਹੈ, ਪੈਸੇ ਦਾ ਮਿਲਣਾ ਨਹੀਂ।',
    directory: { loading: 'ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…', unavailable: 'ਹਾਲੇ ਕੋਈ ਕਾਰੀਗਰ ਉਪਲਬਧ ਨਹੀਂ ਹੈ।', loadError: 'ਕਾਰੀਗਰ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕੇ।', jobs: 'ਕੰਮ',
      areaLabel: 'ਤੁਹਾਡਾ ਇਲਾਕਾ', sameArea: 'ਇਸੇ ਇਲਾਕੇ ਵਿੱਚ',
      areas: { Chandigarh: 'ਚੰਡੀਗੜ੍ਹ', Mohali: 'ਮੋਹਾਲੀ', Panchkula: 'ਪੰਚਕੂਲਾ', Zirakpur: 'ਜ਼ੀਰਕਪੁਰ' } },
    form: { back: 'ਵਾਪਸ', notFound: 'ਇਹ ਕਾਰੀਗਰ ਨਹੀਂ ਮਿਲਿਆ।', loadError: 'ਕਾਰੀਗਰ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕਿਆ।', workLabel: 'ਕਿਹੜਾ ਕੰਮ ਚਾਹੀਦਾ ਹੈ?', workPlaceholder: 'ਜਿਵੇਂ: ਪੱਖਾ ਕੰਮ ਨਹੀਂ ਕਰ ਰਿਹਾ', nameLabel: 'ਤੁਹਾਡਾ ਨਾਮ', namePlaceholder: 'ਜਿਵੇਂ: ਨੇਹਾ ਸ਼ਰਮਾ', locationLabel: 'ਪਤਾ', locationPlaceholder: 'ਜਿਵੇਂ: ਸੈਕਟਰ 35, ਚੰਡੀਗੜ੍ਹ', estimateLabel: 'ਅੰਦਾਜ਼ਨ ਰਕਮ (₹)', notesLabel: 'ਹੋਰ ਕੁਝ ਦੱਸਣਾ ਹੈ?', sending: 'ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ…', submit: 'ਬੇਨਤੀ ਭੇਜੋ', sendError: 'ਬੇਨਤੀ ਨਹੀਂ ਭੇਜੀ ਜਾ ਸਕੀ।' },
    requestList: { loading: 'ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…', loadError: 'ਬੇਨਤੀਆਂ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕੀਆਂ।', count: (count) => `${count} ਬੇਨਤੀਆਂ`, refresh: 'ਤਾਜ਼ਾ ਕਰੋ', empty: 'ਹਾਲੇ ਕੋਈ ਬੇਨਤੀ ਨਹੀਂ ਹੈ।', find: 'ਕਾਰੀਗਰ ਲੱਭੋ', quote: 'ਕਾਰੀਗਰ ਦੀ ਕੀਮਤ:', accepting: 'ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ…', accept: 'ਇਹ ਕੀਮਤ ਮਨਜ਼ੂਰ ਕਰੋ', agreed: 'ਤੈਅ ਕੀਮਤ:', acceptError: 'ਕੀਮਤ ਮਨਜ਼ੂਰ ਨਹੀਂ ਹੋ ਸਕੀ।',
      decline: 'ਹੋਰ ਕੀਮਤ ਦੱਸਣ ਲਈ ਕਹੋ', declining: 'ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ…', declineError: 'ਕੀਮਤ ਨਾਮਨਜ਼ੂਰ ਨਹੀਂ ਹੋ ਸਕੀ।', declined: 'ਤੁਸੀਂ ਹੋਰ ਕੀਮਤ ਮੰਗੀ ਹੈ। ਕਾਰੀਗਰ ਦੇ ਜਵਾਬ ਦੀ ਉਡੀਕ ਹੈ।',
      cancel: 'ਬੇਨਤੀ ਰੱਦ ਕਰੋ', cancelling: 'ਰੱਦ ਕੀਤੀ ਜਾ ਰਹੀ ਹੈ…', cancelError: 'ਬੇਨਤੀ ਰੱਦ ਨਹੀਂ ਹੋ ਸਕੀ।', cancelConfirm: 'ਇਹ ਬੇਨਤੀ ਰੱਦ ਕਰਨੀ ਹੈ? ਕਾਰੀਗਰ ਨੂੰ ਦੱਸ ਦਿੱਤਾ ਜਾਵੇਗਾ ਕਿ ਹੁਣ ਲੋੜ ਨਹੀਂ ਹੈ।',
      timelineShow: 'ਤਰੱਕੀ ਵੇਖੋ', timelineHide: 'ਤਰੱਕੀ ਲੁਕਾਓ', timelineBy: (isYou) => (isYou ? 'ਤੁਹਾਡੇ ਵੱਲੋਂ' : 'ਕਾਰੀਗਰ ਵੱਲੋਂ'), call: 'ਕਾਲ ਕਰੋ',
      done: 'ਕਾਰੀਗਰ ਦਾ ਕਹਿਣਾ ਹੈ ਕਿ ਇਹ ਕੰਮ ਮੁਕੰਮਲ ਹੋ ਗਿਆ ਹੈ।', confirm: 'ਹਾਂ, ਕੰਮ ਪੂਰਾ ਹੋ ਗਿਆ', confirming: 'ਪੁਸ਼ਟੀ ਹੋ ਰਹੀ ਹੈ…', confirmError: 'ਪੁਸ਼ਟੀ ਨਹੀਂ ਹੋ ਸਕੀ।',
      dispute: 'ਨਹੀਂ, ਕੰਮ ਪੂਰਾ ਨਹੀਂ ਹੋਇਆ', disputing: 'ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ…', disputeError: 'ਇਹ ਭੇਜਿਆ ਨਹੀਂ ਜਾ ਸਕਿਆ।', disputed: 'ਤੁਸੀਂ ਕਿਹਾ ਕਿ ਕੰਮ ਪੂਰਾ ਨਹੀਂ ਹੋਇਆ। ਕਾਰੀਗਰ ਵਾਪਸ ਆ ਕੇ ਇਸਨੂੰ ਪੂਰਾ ਕਰ ਸਕਦਾ ਹੈ।', disputeConfirm: 'ਕਾਰੀਗਰ ਨੂੰ ਦੱਸਣਾ ਹੈ ਕਿ ਇਹ ਕੰਮ ਪੂਰਾ ਨਹੀਂ ਹੋਇਆ?',
      counter: 'ਆਪਣੀ ਕੀਮਤ ਦੱਸੋ', counterCancel: 'ਰਹਿਣ ਦਿਓ', counterLabel: 'ਤੁਹਾਡੀ ਕੀਮਤ', counterPlaceholder: 'ਕੀਮਤ ₹',
      counterSend: 'ਮੇਰੀ ਕੀਮਤ ਭੇਜੋ', countering: 'ਭੇਜਿਆ ਜਾ ਰਿਹਾ ਹੈ…', counterError: 'ਤੁਹਾਡੀ ਕੀਮਤ ਨਹੀਂ ਭੇਜੀ ਜਾ ਸਕੀ।', counterInvalid: 'ਸ਼ੂਨ ਤੋਂ ਵੱਡੀ ਕੀਮਤ ਪਾਓ।',
      countered: (price) => `ਤੁਸੀਂ ₹${price} ਮੰਗਿਆ ਹੈ। ਕਾਰੀਗਰ ਦੇ ਜਵਾਬ ਦੀ ਉਡੀਕ ਹੈ।`,
      live: 'ਲਾਈਵ', liveOn: 'ਅੱਪਡੇਟ ਆਪਣੇ ਆਪ ਆਉਂਦੇ ਹਨ। ਰੋਕਣ ਲਈ ਦਬਾਓ।', liveOff: 'ਅੱਪਡੇਟ ਆਪਣੇ ਆਪ ਪਾਉਣ ਲਈ ਦਬਾਓ।' },
    trades: { Electrician: 'ਇਲੈਕਟ੍ਰੀਸ਼ੀਅਨ', Plumber: 'ਪਲੰਬਰ', Carpenter: 'ਤਰਖਾਣ', Painter: 'ਪੇਂਟਰ', Mason: 'ਰਾਜ ਮਿਸਤਰੀ', 'AC & Appliance Technician': 'ਏਸੀ ਤੇ ਉਪਕਰਣ ਤਕਨੀਸ਼ੀਅਨ' },
  },
  kn: {
    appName: 'ಕಾರಿಗಾರ', customer: 'ಗ್ರಾಹಕ ಡೆಮೊ · ನೇಹಾ ಶರ್ಮಾ', back: 'ಪಾತ್ರ ಆಯ್ಕೆಗೆ ಹಿಂದಿರುಗಿ', language: 'ಭಾಷೆ ಬದಲಿಸಿ', signOut: 'ಸೈನ್ ಔಟ್', browse: 'ಕಾರಿಗಾರರನ್ನು ಹುಡುಕಿ', requests: 'ನನ್ನ ವಿನಂತಿಗಳು',
    notice: 'ಡೆಮೊ ಲಾಗಿನ್: 0123456789. ನಿರೂಪಕರಿಂದ ಪಡೆದ ಪ್ರತ್ಯೇಕ ಗ್ರಾಹಕ ಡೆಮೊ ಕೋಡ್ ಬಳಸಿ. SMS ಕಳುಹಿಸಲಾಗುವುದಿಲ್ಲ. ಈ ಡೆಮೋನಲ್ಲಿ ಪಾವತಿಯನ್ನು ಎಲ್ಲಿಯೂ ಪರಿಶೀಲಿಸುವುದಿಲ್ಲ — ಮುಗಿದ ಕೆಲಸ ದಾಖಲಾಗುತ್ತದೆ, ಹಣ ಸಂದಾಯವಾದದ್ದಲ್ಲ.',
    directory: { loading: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…', unavailable: 'ಈಗ ಯಾವುದೇ ಕಾರಿಗಾರ ಲಭ್ಯವಿಲ್ಲ.', loadError: 'ಕಾರಿಗಾರರನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.', jobs: 'ಕೆಲಸಗಳು' ,
      areaLabel: 'ನಿಮ್ಮ ಪ್ರದೇಶ', sameArea: 'ಇದೇ ಪ್ರದೇಶದಲ್ಲಿ',
      areas: { Chandigarh: 'ಚಂಡೀಗಢ', Mohali: 'ಮೊಹಾಲಿ', Panchkula: 'ಪಂಚಕುಲಾ', Zirakpur: 'ಜಿರಕ್‌ಪುರ' } },
    form: { back: 'ಹಿಂದೆ', notFound: 'ಈ ಕಾರಿಗಾರ ಸಿಗಲಿಲ್ಲ.', loadError: 'ಈ ಕಾರಿಗಾರರನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.', workLabel: 'ಯಾವ ಕೆಲಸ ಬೇಕು?', workPlaceholder: 'ಉದಾಹರಣೆ: ಫ್ಯಾನ್ ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲ', nameLabel: 'ನಿಮ್ಮ ಹೆಸರು', namePlaceholder: 'ಉದಾಹರಣೆ: ನೇಹಾ ಶರ್ಮಾ', locationLabel: 'ವಿಳಾಸ', locationPlaceholder: 'ಉದಾಹರಣೆ: ಸೆಕ್ಟರ್ 35, ಚಂಡೀಗಢ', estimateLabel: 'ಅಂದಾಜು ಮೊತ್ತ (₹)', notesLabel: 'ಇನ್ನೇನಾದರೂ ಹೇಳಬೇಕೆ?', sending: 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…', submit: 'ವಿನಂತಿ ಕಳುಹಿಸಿ', sendError: 'ವಿನಂತಿಯನ್ನು ಕಳುಹಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.' },
    requestList: { loading: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…', loadError: 'ವಿನಂತಿಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.', count: (count) => `${count} ವಿನಂತಿಗಳು`, refresh: 'ರಿಫ್ರೆಶ್ ಮಾಡಿ', empty: 'ಇನ್ನೂ ಯಾವುದೇ ವಿನಂತಿಗಳಿಲ್ಲ.', find: 'ಕಾರಿಗಾರರನ್ನು ಹುಡುಕಿ', quote: 'ಕಾರಿಗಾರರ ದರ:', accepting: 'ಸ್ವೀಕರಿಸಲಾಗುತ್ತಿದೆ…', accept: 'ಈ ದರ ಒಪ್ಪಿಕೊಳ್ಳಿ', agreed: 'ಒಪ್ಪಿದ ದರ:', acceptError: 'ದರವನ್ನು ಒಪ್ಪಿಕೊಳ್ಳಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.',
      decline: 'ಬೇರೆ ದರ ತಿಳಿಸಲು ಕೇಳಿ', declining: 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…', declineError: 'ದರವನ್ನು ನಿರಾಕರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.', declined: 'ನೀವು ಬೇರೆ ದರ ಕೇಳಿದ್ದೀರಿ. ಕಾರಿಗಾರರ ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ.',
      cancel: 'ವಿನಂತಿ ರದ್ದುಗೊಳಿಸಿ', cancelling: 'ರದ್ದುಗೊಳಿಸಲಾಗುತ್ತಿದೆ…', cancelError: 'ವಿನಂತಿಯನ್ನು ರದ್ದುಗೊಳಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.', cancelConfirm: 'ಈ ವಿನಂತಿಯನ್ನು ರದ್ದುಗೊಳಿಸಬೇಕೇ? ಇನ್ನು ಅಗತ್ಯವಿಲ್ಲ ಎಂದು ಕಾರಿಗಾರರಿಗೆ ತಿಳಿಸಲಾಗುವುದು.',
      timelineShow: 'ಪ್ರಗತಿ ನೋಡಿ', timelineHide: 'ಪ್ರಗತಿ ಮರೆಮಾಡಿ', timelineBy: (isYou) => (isYou ? 'ನಿಮ್ಮಿಂದ' : 'ಕಾರಿಗಾರರಿಂದ'), call: 'ಕರೆ ಮಾಡಿ',
      done: 'ಈ ಕೆಲಸ ಮುಗಿದಿದೆ ಎಂದು ಕಾರಿಗಾರರು ಹೇಳಿದ್ದಾರೆ.', confirm: 'ಹೌದು, ಮುಗಿದಿದೆ', confirming: 'ದೃಢೀಕರಿಸಲಾಗುತ್ತಿದೆ…', confirmError: 'ದೃಢೀಕರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.',
      dispute: 'ಇಲ್ಲ, ಮುಗಿದಿಲ್ಲ', disputing: 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…', disputeError: 'ಅದನ್ನು ಕಳುಹಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.', disputed: 'ಕೆಲಸ ಮುಗಿದಿಲ್ಲ ಎಂದು ನೀವು ಹೇಳಿದ್ದೀರಿ. ಕಾರಿಗಾರರು ಮರಳಿ ಬಂದು ಪೂರ್ಣಗೊಳಿಸಬಹುದು.', disputeConfirm: 'ಈ ಕೆಲಸ ಮುಗಿದಿಲ್ಲ ಎಂದು ಕಾರಿಗಾರರಿಗೆ ತಿಳಿಸಬೇಕೇ?',
      counter: 'ನಿಮ್ಮ ದರ ತಿಳಿಸಿ', counterCancel: 'ಬೇಡ', counterLabel: 'ನಿಮ್ಮ ದರ', counterPlaceholder: 'ದರ ₹',
      counterSend: 'ನನ್ನ ದರ ಕಳುಹಿಸಿ', countering: 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…', counterError: 'ನಿಮ್ಮ ದರ ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ.', counterInvalid: 'ಸೊನ್ನೆಗಿಂತ ದೊಡ್ಡ ದರ ನಮೂದಿಸಿ.',
      countered: (price) => `ನೀವು ₹${price} ಕೇಳಿದ್ದೀರಿ. ಕಾರಿಗಾರರ ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ.`,
      live: 'ಲೈವ್', liveOn: 'ನವೀಕರಣಗಳು ತಾನಾಗಿಯೇ ಬರುತ್ತವೆ. ನಿಲ್ಲಿಸಲು ಒತ್ತಿ.', liveOff: 'ನವೀಕರಣಗಳು ತಾನಾಗಿಯೇ ಬರಲು ಒತ್ತಿ.' },
    trades: { Electrician: 'ವಿದ್ಯುತ್ ತಂತ್ರಜ್ಞ', Plumber: 'ಪ್ಲಂಬರ್', Carpenter: 'ಬಡಗಿ', Painter: 'ಪೇಂಟರ್', Mason: 'ಗಾರೆ ಕೆಲಸಗಾರ', 'AC & Appliance Technician': 'ಎಸಿ ಮತ್ತು ಉಪಕರಣ ತಂತ್ರಜ್ಞ' },
  },
  mr: {
    appName: 'कारागीर', customer: 'ग्राहक डेमो · नेहा शर्मा', back: 'भूमिका निवडीकडे परत जा', language: 'भाषा बदला', signOut: 'साइन आउट', browse: 'कारागीर शोधा', requests: 'माझ्या विनंत्या',
    notice: 'डेमो लॉगिन: 0123456789. सादरकर्त्याकडून मिळालेला वेगळा ग्राहक डेमो कोड वापरा. SMS पाठवला जात नाही. या डेमोमध्ये पेमेंट कुठेही पडताळली जात नाही — ठरलेले आणि पूर्ण झालेले काम नोंदवले जाते, पैसे मिळाल्याचे नाही.',
    directory: { loading: 'लोड होत आहे…', unavailable: 'सध्या कोणताही कारागीर उपलब्ध नाही.', loadError: 'कारागीर लोड करता आले नाहीत.', jobs: 'कामे' ,
      areaLabel: 'तुमचा परिसर', sameArea: 'याच परिसरात',
      areas: { Chandigarh: 'चंदीगड', Mohali: 'मोहाली', Panchkula: 'पंचकुला', Zirakpur: 'झिरकपूर' } },
    form: { back: 'मागे', notFound: 'हा कारागीर सापडला नाही.', loadError: 'हा कारागीर लोड करता आला नाही.', workLabel: 'कोणते काम हवे आहे?', workPlaceholder: 'उदा.: पंखा चालत नाही', nameLabel: 'तुमचे नाव', namePlaceholder: 'उदा.: नेहा शर्मा', locationLabel: 'पत्ता', locationPlaceholder: 'उदा.: सेक्टर 35, चंदीगड', estimateLabel: 'अंदाजे रक्कम (₹)', notesLabel: 'आणखी काही सांगायचे आहे का?', sending: 'पाठवत आहे…', submit: 'विनंती पाठवा', sendError: 'विनंती पाठवता आली नाही.' },
    requestList: { loading: 'लोड होत आहे…', loadError: 'विनंत्या लोड करता आल्या नाहीत.', count: (count) => `${count} विनंत्या`, refresh: 'रीफ्रेश करा', empty: 'अजून कोणतीही विनंती नाही.', find: 'कारागीर शोधा', quote: 'कारागिराचा दर:', accepting: 'स्वीकारत आहे…', accept: 'हा दर स्वीकारा', agreed: 'ठरलेला दर:', acceptError: 'दर स्वीकारता आला नाही.',
      decline: 'दुसरा दर सांगण्यास सांगा', declining: 'पाठवत आहे…', declineError: 'दर नाकारता आला नाही.', declined: 'तुम्ही दुसरा दर मागितला आहे. कारागिराच्या उत्तराची वाट पाहत आहोत.',
      cancel: 'विनंती रद्द करा', cancelling: 'रद्द करत आहे…', cancelError: 'विनंती रद्द करता आली नाही.', cancelConfirm: 'ही विनंती रद्द करायची? आता गरज नाही असे कारागिराला कळवले जाईल.',
      timelineShow: 'प्रगती पहा', timelineHide: 'प्रगती लपवा', timelineBy: (isYou) => (isYou ? 'तुमच्याकडून' : 'कारागिराकडून'), call: 'कॉल करा',
      done: 'हे काम पूर्ण झाले आहे असे कारागीर सांगतात.', confirm: 'होय, काम पूर्ण झाले', confirming: 'पुष्टी करत आहे…', confirmError: 'पुष्टी करता आली नाही.',
      dispute: 'नाही, काम पूर्ण झाले नाही', disputing: 'पाठवत आहे…', disputeError: 'ते पाठवता आले नाही.', disputed: 'तुम्ही सांगितले की काम पूर्ण झाले नाही. कारागीर परत येऊन ते पूर्ण करू शकतो.', disputeConfirm: 'हे काम पूर्ण झाले नाही असे कारागिराला कळवायचे?',
      counter: 'तुमचा दर सांगा', counterCancel: 'नको', counterLabel: 'तुमचा दर', counterPlaceholder: 'दर ₹',
      counterSend: 'माझा दर पाठवा', countering: 'पाठवत आहे…', counterError: 'तुमचा दर पाठवता आला नाही.', counterInvalid: 'शून्यापेक्षा मोठा दर टाका.',
      countered: (price) => `तुम्ही ₹${price} मागितले आहेत. कारागिराच्या उत्तराची वाट पाहत आहोत.`,
      live: 'लाइव्ह', liveOn: 'अपडेट आपोआप येतात. थांबवण्यासाठी दाबा.', liveOff: 'अपडेट आपोआप मिळवण्यासाठी दाबा.' },
    trades: { Electrician: 'इलेक्ट्रिशियन', Plumber: 'प्लंबर', Carpenter: 'सुतार', Painter: 'रंगारी', Mason: 'गवंडी', 'AC & Appliance Technician': 'एसी व उपकरण तंत्रज्ञ' },
  },
};

export function getCustomerCopy(language: SupportedLanguage): CustomerCopy {
  return CUSTOMER_COPY[language] ?? CUSTOMER_COPY.en;
}

export function getCustomerTrade(language: SupportedLanguage, trade: string): string {
  const copy = getCustomerCopy(language);
  /**
   * Falls back to the raw trade string for anything not in the table, so a
   * worker who typed their own trade still renders - as English, but present.
   * Prefer adding it to Trade above: a trade shown in English inside a Hindi
   * screen looks like a bug to the person reading it, and nothing here warns.
   */
  return (copy.trades as Record<string, string | undefined>)[trade] ?? trade;
}
