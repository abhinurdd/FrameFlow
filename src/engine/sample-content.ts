import type { ClipSpec, Grades, ProjectSettings, Word } from './types';

/**
 * Sample Hinglish podcast content used by the local demo pipeline until the
 * real ASR + highlight services exist. Each line: [speaker, roman, devanagari].
 */
type Line = ['A' | 'B', string, string];

type Sample = {
  title: string;
  reason: string;
  tags: string[];
  score: number;
  grades: Grades;
  lines: Line[];
  emphasis: string[];
};

export const SAMPLE_CLIPS: Sample[] = [
  {
    title: 'Paisa bachana nahi, kamana seekho',
    reason: 'Contrarian money take with a clear payoff in 41s. Opens on a question, which makes a strong hook.',
    tags: ['money', 'career'],
    score: 94,
    grades: { hook: 'A', flow: 'A-', value: 'B+' },
    emphasis: ['bachana', 'kamana', 'investment'],
    lines: [
      ['A', 'Toh basically aapka kehna hai ki saving se koi ameer nahi banta?', 'तो बेसिकली आपका कहना है कि सेविंग से कोई अमीर नहीं बनता?'],
      ['B', 'Bilkul. Matlab dekho, 20s mein sabse badi galti hai ki log sirf paisa bachate hain.', 'बिल्कुल। मतलब देखो, 20s में सबसे बड़ी गलती है कि लोग सिर्फ़ पैसा बचाते हैं।'],
      ['B', 'Paisa bachana nahi, kamana seekho. Skills mein investment karo, wahi compound hota hai.', 'पैसा बचाना नहीं, कमाना सीखो। स्किल्स में इन्वेस्टमेंट करो, वही कंपाउंड होता है।'],
    ],
  },
  {
    title: '20s mein ye galti mat karna',
    reason: 'Relatable question hook and a direct answer. Works as a standalone story.',
    tags: ['career', 'mindset'],
    score: 89,
    grades: { hook: 'A', flow: 'B+', value: 'B+' },
    emphasis: ['galti', 'comfort'],
    lines: [
      ['A', 'Agar aap apne 20 saal ke version ko ek advice do, toh kya hogi?', 'अगर आप अपने 20 साल के वर्ज़न को एक एडवाइस दो, तो क्या होगी?'],
      ['B', 'Sabse badi galti thi comfort choose karna. Main naukri mein atka raha kyunki safe lagta tha.', 'सबसे बड़ी गलती थी कम्फ़र्ट चूज़ करना। मैं नौकरी में अटका रहा क्योंकि सेफ़ लगता था।'],
      ['B', 'Risk lo jab responsibilities kam hain. Baad mein mauka nahi milta.', 'रिस्क लो जब रिस्पॉन्सिबिलिटीज़ कम हैं। बाद में मौका नहीं मिलता।'],
    ],
  },
  {
    title: 'SIP vs FD: the honest answer',
    reason: 'Clear comparison that answers a top search question. Complete thought, no cut-off.',
    tags: ['money', 'investing'],
    score: 81,
    grades: { hook: 'B+', flow: 'A-', value: 'A' },
    emphasis: ['SIP', 'inflation'],
    lines: [
      ['A', 'Log poochte hain SIP better hai ya FD?', 'लोग पूछते हैं SIP बेहतर है या FD?'],
      ['B', 'FD safe hai, par inflation usse kha jaata hai. Lambe time ke liye SIP jeet-ta hai.', 'FD सेफ़ है, पर इन्फ़्लेशन उसे खा जाता है। लंबे टाइम के लिए SIP जीतता है।'],
    ],
  },
  {
    title: 'Pehli salary ka plan',
    reason: 'Practical step-by-step list. Viewers save and share this kind of clip.',
    tags: ['money', 'beginners'],
    score: 78,
    grades: { hook: 'B', flow: 'A-', value: 'A-' },
    emphasis: ['emergency', 'fund'],
    lines: [
      ['B', 'Pehli salary aaye toh teen kaam karo.', 'पहली सैलरी आए तो तीन काम करो।'],
      ['B', 'Ek, emergency fund. Do, health insurance. Teen, ek chhota SIP start karo.', 'एक, इमरजेंसी फ़ंड। दो, हेल्थ इंश्योरेंस। तीन, एक छोटा SIP स्टार्ट करो।'],
    ],
  },
  {
    title: 'Network hi net worth hai',
    reason: 'Quotable one-liner with a story behind it. Good for a hook title.',
    tags: ['career', 'networking'],
    score: 76,
    grades: { hook: 'B+', flow: 'B', value: 'B+' },
    emphasis: ['network', 'worth'],
    lines: [
      ['A', 'Aapki pehli badi opportunity kaise aayi?', 'आपकी पहली बड़ी अपॉर्चुनिटी कैसे आई?'],
      ['B', 'Ek dost ke dost ne recommend kiya. Isliye kehta hoon, network hi net worth hai.', 'एक दोस्त के दोस्त ने रिकमेंड किया। इसलिए कहता हूँ, नेटवर्क ही नेट वर्थ है।'],
    ],
  },
  {
    title: 'Failure ke baad kya kiya',
    reason: 'Emotional turn with vulnerability. Viewers tend to watch these to the end.',
    tags: ['mindset', 'story'],
    score: 72,
    grades: { hook: 'B', flow: 'B+', value: 'B' },
    emphasis: ['zero', 'restart'],
    lines: [
      ['B', 'Startup band hua toh bank mein zero tha.', 'स्टार्टअप बंद हुआ तो बैंक में ज़ीरो था।'],
      ['B', 'Maine restart kiya, chhote clients se. Wahi foundation bana.', 'मैंने रीस्टार्ट किया, छोटे क्लाइंट्स से। वही फ़ाउंडेशन बना।'],
    ],
  },
];

export const FILLERS = new Set(['basically', 'matlab', 'toh', 'na', 'yaar', 'actually']);

/** Builds word-level timings from sample lines (~2.6 words/sec). */
export function buildWords(sample: Sample, startSec: number): Word[] {
  const words: Word[] = [];
  let t = startSec;
  for (const [speaker, roman, deva] of sample.lines) {
    const r = roman.split(' ');
    const d = deva.split(' ');
    r.forEach((token, i) => {
      const len = 0.25 + token.length * 0.035;
      const bare = token.toLowerCase().replace(/[^a-z0-9]/g, '');
      words.push({
        t0: t,
        t1: t + len,
        speaker,
        text: { roman: token, devanagari: d[i] ?? token },
        emphasis: sample.emphasis.some((e) => bare === e.toLowerCase()),
        filler: FILLERS.has(bare),
      });
      t += len + 0.08;
    });
    t += 0.4;
  }
  return words;
}

export function buildSpec(sample: Sample, startSec: number, settings: ProjectSettings): ClipSpec {
  const words = buildWords(sample, startSec);
  return {
    version: 1,
    aspect: settings.aspect,
    source: { in: startSec, out: words[words.length - 1].t1 + 0.3 },
    captions: {
      script: settings.script,
      template: settings.template,
      wordsPerLine: 3,
      autoEmphasis: true,
      position: { y: 0.68 },
    },
    words,
    layout: { mode: 'auto', followSpeaker: true, keepOriginal: false },
    hook: { text: sample.title, enabled: settings.hookTitle },
  };
}
