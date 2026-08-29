import { Router } from 'express';
import type { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import type { AssistantFallbackReason } from '../../types';

/**
 * assistant - voice input processing (Architecture Amendment 2).
 *
 * Moved out of server.ts unchanged during the Day 1 route-module split.
 * Mounted at /api/assistant, so the public path /api/assistant/process is
 * identical to before the split.
 *
 * Owner: Track A.
 */

export const assistantRouter = Router();


/**
 * Why a request was served by the local keyword matcher instead of Gemini.
 * Defined once, in the frozen contract, because Track B reads this field.
 */
type FallbackReason = AssistantFallbackReason;

let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// API: Process Voice Input with Gemini 3.7 Flash + Robust Local Fallback
assistantRouter.post('/process', async (req: Request, res: Response) => {
  const {
    userInput = '',
    language = 'hi',
    context = 'onboarding',
    currentStep = 0,
    workerName = 'Ramesh',
    pendingData = {},
  } = req.body;

  // P1 discriminator. There are four distinct ways to end up on the local
  // fallback and, before this, all four returned a well-formed 200 that was
  // indistinguishable from a real Gemini extraction. `source` says which path
  // ran; `fallbackReason` says why, so a failure can be diagnosed from the
  // response instead of guessed at.
  let fallbackReason: FallbackReason | null = null;
  let fallbackDetail: string | null = null;

  try {
    const ai = getGenAI();

    if (!ai) {
      fallbackReason = 'no_api_key';
    } else {
      const systemInstruction = `
You are "Kaarigar Saathi", an empathetic, respectful, and voice-first AI assistant for blue-collar skilled workers in India (electricians, plumbers, carpenters, mechanics, etc.).
The user speaks to you in conversational ${language === 'hi' ? 'Hindi / Hinglish' : language === 'pa' ? 'Punjabi' : language === 'kn' ? 'Kannada' : language === 'mr' ? 'Marathi' : 'English'}.
Worker's name is "${workerName}".

Key rules:
1. Speak warmly and conversationally ("Namaste ${workerName} ji", "Bhaiya", etc.). Never use robotic or formal textbook Hindi (Avoid "कृपया व्यावसायिक अनुभव दर्ज करें").
2. Ask ONE simple question at a time.
3. Extract structured data accurately from whatever the user said.
4. Current context is "${context}", step: ${currentStep}.
5. Return clean JSON matching the requested schema.

Contexts:
- 'onboarding': Collect trade, experience, main skills, certifications/training. When enough info is collected, summarize and set requiresConfirmation=true.
- 'add_job': User speaks about a completed job (e.g. "Sector 35 mein fan lagaya. Customer Neha Sharma. 1100 rupaye mile."). Extract title, customerName, location, amount (numeric), paymentMethod. Set requiresConfirmation=true.
- 'add_kamai': User speaks about earnings (e.g. "Aj do kaam kiye. Pehla 1500 ka aur doosra 1200 ka."). Calculate total sum (e.g. 2700), list breakdown entries, and set requiresConfirmation=true.
- 'update_profile': Modify existing profile based on voice input.
`;

      const prompt = `
Current pending data: ${JSON.stringify(pendingData)}
User said: "${userInput}"
Language requested: ${language}
Context: ${context}
Step: ${currentStep}

Respond in valid JSON with:
{
  "replyText": "Natural spoken response for the worker in ${language}",
  "extractedData": {
    "trade": "string or null",
    "experienceYears": number or null,
    "skills": ["string"] or null,
    "certifications": ["string"] or null,
    "location": "string or null",
    "job": {
      "title": "string",
      "customerName": "string",
      "location": "string",
      "amount": number,
      "paymentMethod": "cash" | "upi"
    } or null,
    "kamai": {
      "total": number,
      "entries": [{"desc": "string", "amount": number}]
    } or null
  },
  "isComplete": boolean,
  "requiresConfirmation": boolean,
  "nextStep": number
}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      });

      if (!response.text) {
        // Gemini answered, but with nothing usable. Previously this fell
        // through with no error raised at all — the quietest of the four paths.
        fallbackReason = 'empty_response';
      } else {
        // Parsed in its own try so that malformed model output is reported as
        // 'invalid_json' rather than being swallowed by the outer catch and
        // mislabelled as an API error.
        try {
          const parsed = JSON.parse(response.text);
          return res.json({ ...parsed, source: 'gemini' as const });
        } catch (parseErr) {
          fallbackReason = 'invalid_json';
          fallbackDetail = parseErr instanceof Error ? parseErr.message : String(parseErr);
        }
      }
    }
  } catch (err) {
    fallbackReason = 'api_error';
    fallbackDetail = err instanceof Error ? err.message : String(err);
  }

  console.warn(
    `[assistant] serving local fallback — reason=${fallbackReason}` +
    (fallbackDetail ? ` detail=${fallbackDetail}` : '')
  );

  // Robust Rule-based Fallback & Demo Scenarios Processor
  const result = fallbackProcessVoiceInput(userInput, language, context, currentStep, workerName, pendingData);
  return res.json({
    ...result,
    source: 'fallback' as const,
    fallbackReason,
    // Error text can carry request and key metadata, so it is withheld in
    // production. The server log above always records it either way.
    ...(process.env.NODE_ENV !== 'production' && fallbackDetail ? { fallbackDetail } : {}),
  });
});

// Fallback rule-based conversational NLP extractor for seamless demo experience
function fallbackProcessVoiceInput(
  input: string,
  lang: string,
  context: string,
  step: number,
  workerName: string,
  pending: any
) {
  const lower = input.toLowerCase().trim();

  // 1. Onboarding Flow
  if (context === 'onboarding') {
    // Check for all-in-one utterance
    // e.g. "Main pichle 18 saal se electrician ka kaam kar raha hoon. Ghar ki wiring karta hoon, pankhe lagata hoon aur MCB ka kaam bhi karta hoon."
    const isElectrician = lower.includes('electrician') || lower.includes('इलेक्ट्रीशियन') || lower.includes('bijli') || lower.includes('बिजली');
    const isPlumber = lower.includes('plumber') || lower.includes('प्लंबर') || lower.includes('nal') || lower.includes('नल');
    const isCarpenter = lower.includes('carpenter') || lower.includes('बढ़ई') || lower.includes('lakdi') || lower.includes('wood');

    const yearsMatch = lower.match(/(\d+)\s*(saal|years?|साल|वर्ष)/i) || lower.match(/(\d+)/);
    const extractedYears = yearsMatch ? parseInt(yearsMatch[1], 10) : null;

    const skills: string[] = [];
    if (lower.includes('wiring') || lower.includes('वायरिंग')) skills.push('House Wiring');
    if (lower.includes('fan') || lower.includes('pankh') || lower.includes('पंखा') || lower.includes('पंखे')) skills.push('Fan Installation');
    if (lower.includes('mcb') || lower.includes('switchboard') || lower.includes('स्विच') || lower.includes('बोर्ड')) skills.push('MCB & Switchboard Installation');
    if (lower.includes('inverter') || lower.includes('इन्वर्टर')) skills.push('Inverter & Battery Wiring');
    if (lower.includes('pipe') || lower.includes('fitting') || lower.includes('leakage')) skills.push('Pipe Fitting & Leakage Fix');

    const certs: string[] = [];
    if (lower.includes('iti') || lower.includes('certificate') || lower.includes('सर्टिफिकेट') || lower.includes('training') || lower.includes('ट्रेनिंग')) {
      certs.push('ITI Certified National Trade Certificate');
    }

    // Step 0: Initial answer to "Aap kya kaam karte hain?"
    if (step === 0 || (!pending.trade && (isElectrician || isPlumber || isCarpenter))) {
      const trade = isElectrician ? 'Electrician' : isPlumber ? 'Plumber' : isCarpenter ? 'Carpenter' : 'Electrician';
      const updatedSkills = skills.length > 0 ? skills : ['House Wiring', 'Fan Installation', 'MCB & Switchboard Installation'];
      const exp = extractedYears || (lower.includes('18') ? 18 : null);

      if (exp && updatedSkills.length > 0) {
        // Multi-sentence input processed!
        return {
          replyText: lang === 'hi'
            ? `${workerName} ji, maine ye details samjhi hain: ${trade}, ${exp} saal ka anubhav, aur ${updatedSkills.join(', ')}. Sab sahi hai?`
            : `${workerName} ji, I captured: ${trade}, ${exp} years experience, and skills: ${updatedSkills.join(', ')}. Is everything correct?`,
          extractedData: {
            trade,
            experienceYears: exp,
            skills: updatedSkills,
            certifications: certs.length > 0 ? certs : ['ITI Electrician Certified'],
          },
          isComplete: true,
          requiresConfirmation: true,
          nextStep: 4,
        };
      }

      return {
        replyText: lang === 'hi'
          ? `Aapko ${trade} ka kaam karte hue kitne saal ho gaye?`
          : `How many years of experience do you have as an ${trade}?`,
        extractedData: {
          trade,
        },
        isComplete: false,
        requiresConfirmation: false,
        nextStep: 1,
      };
    }

    // Step 1: Experience question
    if (step === 1 || (!pending.experienceYears && extractedYears)) {
      const exp = extractedYears || 18;
      return {
        replyText: lang === 'hi'
          ? `Aap kis tarah ka kaam sabse zyada karte hain? Jaise house wiring, fan, ya switchboard?`
          : `What specific electrical or technical work do you do most often?`,
        extractedData: {
          experienceYears: exp,
        },
        isComplete: false,
        requiresConfirmation: false,
        nextStep: 2,
      };
    }

    // Step 2: Skills question
    if (step === 2 || (skills.length > 0 && !pending.skills)) {
      const finalSkills = skills.length > 0 ? skills : ['House Wiring', 'Fan Installation', 'MCB & Switchboard Installation'];
      return {
        replyText: lang === 'hi'
          ? `${workerName} ji, aapke paas koi certificate ya ITI training hai?`
          : `${workerName} ji, do you have any trade certificate or training?`,
        extractedData: {
          skills: finalSkills,
        },
        isComplete: false,
        requiresConfirmation: false,
        nextStep: 3,
      };
    }

    // Step 3: Certificate question & Final confirmation
    const finalCerts = certs.length > 0 ? certs : ['ITI Electrician Certified', 'Skill India Certified'];
    const trade = pending.trade || 'Electrician';
    const exp = pending.experienceYears || 18;
    const skillList = pending.skills || ['House Wiring', 'Fan Installation', 'MCB & Switchboard Installation'];

    return {
      replyText: lang === 'hi'
        ? `${workerName} ji, maine ye details samjhi hain:\n• Kaam: ${trade}\n• Anubhav: ${exp} saal\n• Skills: ${skillList.join(', ')}\nSab sahi hai?`
        : `${workerName} ji, I have verified these details:\n• Trade: ${trade}\n• Experience: ${exp} Years\n• Skills: ${skillList.join(', ')}\nIs everything correct?`,
      extractedData: {
        trade,
        experienceYears: exp,
        skills: skillList,
        certifications: finalCerts,
      },
      isComplete: true,
      requiresConfirmation: true,
      nextStep: 4,
    };
  }

  // 2. Add Job Flow (e.g. "Sector 35 mein fan lagaya. Customer Neha Sharma. 1100 rupaye mile.")
  if (context === 'add_job') {
    let customerName = 'Customer';
    const nameMatch = lower.match(/customer\s+([a-zA-Z\s]+?)(?=\.|\d|rupaye|rs|mein|$)/i) ||
                      lower.match(/grahak\s+([a-zA-Z\s]+)/i);
    if (nameMatch) {
      customerName = nameMatch[1].trim();
      customerName = customerName.charAt(0).toUpperCase() + customerName.slice(1);
    } else if (lower.includes('neha')) {
      customerName = 'Neha Sharma';
    } else if (lower.includes('rajesh')) {
      customerName = 'Rajesh Gupta';
    } else if (lower.includes('amit')) {
      customerName = 'Amit Verma';
    }

    let location = 'Chandigarh';
    if (lower.includes('sector 35') || lower.includes('35')) {
      location = 'Sector 35, Chandigarh';
    } else if (lower.includes('sector 22') || lower.includes('22')) {
      location = 'Sector 22, Chandigarh';
    } else if (lower.includes('mohali')) {
      location = 'Phase 7, Mohali';
    }

    let title = 'Fan Installation';
    if (lower.includes('fan') || lower.includes('pankh')) {
      title = 'Fan Installation';
    } else if (lower.includes('mcb') || lower.includes('switchboard')) {
      title = 'MCB & Switchboard Repair';
    } else if (lower.includes('wiring')) {
      title = 'House Wiring Maintenance';
    } else if (lower.includes('geyser')) {
      title = 'Geyser Power Connection';
    }

    let amount = 1100;
    const amountMatch = lower.match(/(\d+)\s*(rupaye|rs|inr|rupya|rupees)/i) || lower.match(/(\d+)/);
    if (amountMatch) {
      amount = parseInt(amountMatch[1], 10);
    }

    return {
      replyText: lang === 'hi'
        ? `${workerName} ji, maine ye kaam samjha hai:\n• Kaam: ${title}\n• Customer: ${customerName}\n• Location: ${location}\n• Rashi: ₹${amount.toLocaleString('en-IN')}\nYe details sahi hain?`
        : `${workerName} ji, I captured the job:\n• Work: ${title}\n• Customer: ${customerName}\n• Location: ${location}\n• Amount: ₹${amount.toLocaleString('en-IN')}\nAre these details correct?`,
      extractedData: {
        job: {
          title,
          customerName,
          location,
          amount,
          paymentMethod: 'cash',
          status: 'completed',
          date: new Date().toISOString().split('T')[0],
        },
      },
      isComplete: true,
      requiresConfirmation: true,
      nextStep: 1,
    };
  }

  // 3. Add Kamai Flow (e.g. "Aj do kaam kiye. Pehla 1500 ka aur doosra 1200 ka.")
  if (context === 'add_kamai') {
    const numbers = (lower.match(/\d+/g) || []).map((n: string) => parseInt(n, 10)).filter((n: number) => n > 50);
    let total = 2700;
    let entries: Array<{ desc: string; amount: number }> = [];

    if (numbers.length >= 2) {
      total = numbers.reduce((acc, curr) => acc + curr, 0);
      entries = numbers.map((amt, idx) => ({
        desc: `Kaam #${idx + 1}`,
        amount: amt,
      }));
    } else if (numbers.length === 1) {
      total = numbers[0];
      entries = [{ desc: 'Daily Work Earnings', amount: total }];
    } else {
      total = 2700;
      entries = [
        { desc: 'Pehla Kaam (First Job)', amount: 1500 },
        { desc: 'Doosra Kaam (Second Job)', amount: 1200 },
      ];
    }

    return {
      replyText: lang === 'hi'
        ? `Aaj ki kul kamai ₹${total.toLocaleString('en-IN')} samajh li gayi hai (${entries.map(e => `₹${e.amount}`).join(' + ')}). Kamai ledger mein add kar dein?`
        : `Total today's earnings calculated as ₹${total.toLocaleString('en-IN')} (${entries.map(e => `₹${e.amount}`).join(' + ')}). Confirm to add to ledger?`,
      extractedData: {
        kamai: {
          total,
          entries,
        },
      },
      isComplete: true,
      requiresConfirmation: true,
      nextStep: 1,
    };
  }

  // General fallback
  return {
    replyText: lang === 'hi'
      ? `Main Kaarigar Saathi hoon. Aap kya madad chahte hain?`
      : `I am Kaarigar Saathi. How can I help you today?`,
    extractedData: {},
    isComplete: false,
    requiresConfirmation: false,
    nextStep: 0,
  };
}
