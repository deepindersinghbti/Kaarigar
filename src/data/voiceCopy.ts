import type { SupportedLanguage } from '../types';

const en = {
  hold: 'Hold to speak', release: 'Release to send',
  starting: 'Starting microphone…', reconnecting: 'Reconnecting… keep holding',
  finishing: 'Finishing your words…', listening: 'Listening… release when finished',
  permission: 'Microphone access was denied. Allow microphone access for this site, then try again.',
  network: 'The browser could not reach its speech recognition service. Check your connection, or try this page in Chrome.',
  device: 'The browser could not capture microphone audio. Check your microphone and Windows microphone permissions.',
  unsupported: 'Speech recognition is unavailable in this browser. Try Chrome or use Type / edit.',
  empty: 'No words were recognised. Hold the microphone, speak, then release.',
  cancelled: 'Recording cancelled. Hold the microphone again to retry.',
  failed: 'Speech recognition stopped unexpectedly. Try again or use Type / edit.',
  assistant: 'Kaarigar Saathi could not process that message. Please try again or use Type / edit.',
};
const hi: typeof en = {
  hold: 'दबाकर बोलें', release: 'भेजने के लिए छोड़ें',
  starting: 'माइक शुरू हो रहा है…', reconnecting: 'फिर से जुड़ रहे हैं… दबाकर रखें',
  finishing: 'आपकी बात पूरी कर रहे हैं…', listening: 'सुन रहे हैं… बात पूरी होने पर छोड़ें',
  permission: 'माइक की अनुमति नहीं मिली। इस साइट को माइक की अनुमति देकर फिर कोशिश करें।',
  network: 'ब्राउज़र की आवाज़ पहचान सेवा से संपर्क नहीं हुआ। इंटरनेट जाँचें या यह पेज Chrome में खोलें।',
  device: 'माइक से आवाज़ नहीं मिली। माइक और Windows में माइक की अनुमति जाँचें।',
  unsupported: 'इस ब्राउज़र में आवाज़ पहचान उपलब्ध नहीं है। Chrome में खोलें या टाइप / बदलें का उपयोग करें।',
  empty: 'कोई शब्द पहचाना नहीं गया। माइक दबाकर बोलें, फिर छोड़ें।',
  cancelled: 'रिकॉर्डिंग रद्द हुई। फिर कोशिश करने के लिए माइक दबाकर रखें।',
  failed: 'आवाज़ पहचान अचानक रुक गई। फिर कोशिश करें या टाइप / बदलें का उपयोग करें।',
  assistant: 'कारीगर साथी आपकी बात समझ नहीं पाया। फिर कोशिश करें या टाइप / बदलें का उपयोग करें।',
};
const pa: typeof en = {
  hold: 'ਦਬਾ ਕੇ ਬੋਲੋ', release: 'ਭੇਜਣ ਲਈ ਛੱਡੋ',
  starting: 'ਮਾਈਕ ਸ਼ੁਰੂ ਹੋ ਰਿਹਾ ਹੈ…', reconnecting: 'ਮੁੜ ਜੁੜ ਰਹੇ ਹਾਂ… ਦਬਾ ਕੇ ਰੱਖੋ',
  finishing: 'ਤੁਹਾਡੀ ਗੱਲ ਪੂਰੀ ਕਰ ਰਹੇ ਹਾਂ…', listening: 'ਸੁਣ ਰਹੇ ਹਾਂ… ਗੱਲ ਪੂਰੀ ਹੋਣ ਤੇ ਛੱਡੋ',
  permission: 'ਮਾਈਕ ਦੀ ਇਜਾਜ਼ਤ ਨਹੀਂ ਮਿਲੀ। ਇਸ ਸਾਈਟ ਨੂੰ ਮਾਈਕ ਦੀ ਇਜਾਜ਼ਤ ਦੇ ਕੇ ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
  network: 'ਬ੍ਰਾਊਜ਼ਰ ਦੀ ਆਵਾਜ਼ ਪਛਾਣ ਸੇਵਾ ਨਾਲ ਸੰਪਰਕ ਨਹੀਂ ਹੋਇਆ। ਇੰਟਰਨੈੱਟ ਜਾਂਚੋ ਜਾਂ ਇਹ ਪੇਜ Chrome ਵਿੱਚ ਖੋਲ੍ਹੋ।',
  device: 'ਮਾਈਕ ਤੋਂ ਆਵਾਜ਼ ਨਹੀਂ ਮਿਲੀ। ਮਾਈਕ ਅਤੇ Windows ਵਿੱਚ ਮਾਈਕ ਦੀ ਇਜਾਜ਼ਤ ਜਾਂਚੋ।',
  unsupported: 'ਇਸ ਬ੍ਰਾਊਜ਼ਰ ਵਿੱਚ ਆਵਾਜ਼ ਪਛਾਣ ਉਪਲਬਧ ਨਹੀਂ। Chrome ਵਿੱਚ ਖੋਲ੍ਹੋ ਜਾਂ ਲਿਖੋ / ਬਦਲੋ ਵਰਤੋ।',
  empty: 'ਕੋਈ ਸ਼ਬਦ ਪਛਾਣਿਆ ਨਹੀਂ ਗਿਆ। ਮਾਈਕ ਦਬਾ ਕੇ ਬੋਲੋ, ਫਿਰ ਛੱਡੋ।',
  cancelled: 'ਰਿਕਾਰਡਿੰਗ ਰੱਦ ਹੋਈ। ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰਨ ਲਈ ਮਾਈਕ ਦਬਾ ਕੇ ਰੱਖੋ।',
  failed: 'ਆਵਾਜ਼ ਪਛਾਣ ਅਚਾਨਕ ਰੁਕ ਗਈ। ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰੋ ਜਾਂ ਲਿਖੋ / ਬਦਲੋ ਵਰਤੋ।',
  assistant: 'ਕਾਰੀਗਰ ਸਾਥੀ ਤੁਹਾਡੀ ਗੱਲ ਸਮਝ ਨਹੀਂ ਸਕਿਆ। ਮੁੜ ਕੋਸ਼ਿਸ਼ ਕਰੋ ਜਾਂ ਲਿਖੋ / ਬਦਲੋ ਵਰਤੋ।',
};
export const getVoiceCopy = (language: SupportedLanguage) =>
  language === 'pa' ? pa : language === 'hi' ? hi : en;

export function voiceErrorMessage(code: string, language: SupportedLanguage) {
  const copy = getVoiceCopy(language);
  if (code === 'network') return copy.network;
  if (code === 'not-allowed' || code === 'service-not-allowed') return copy.permission;
  if (code === 'audio-capture') return copy.device;
  if (code === 'unsupported' || code === 'language-not-supported') return copy.unsupported;
  if (code === 'empty') return copy.empty;
  if (code === 'cancelled') return copy.cancelled;
  if (code === 'assistant') return copy.assistant;
  return copy.failed;
}
