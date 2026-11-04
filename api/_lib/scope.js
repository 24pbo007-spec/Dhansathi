// Keeps Ask DhanSathi on topic. The assistant exists for Indian government
// schemes & scholarships, personal finance, stocks, and tax / GST / salary —
// not for writing code, stories or general-knowledge answers.
//
// Two layers:
//   1. classifyTopic(): a deterministic check. Clearly off-topic requests are
//      refused on the server without calling the model at all.
//   2. SCOPE_RULE: a system instruction sent with every chat turn, so the model
//      also declines anything off-topic that slips past the keyword check.

// Anything about money, government benefits or this website.
const IN_SCOPE = new RegExp(
  [
    // schemes, scholarships, benefits
    'scheme', 'yojana', 'yojna', 'scholarship', 'chhatravrit', 'chatravrit', 'fellowship', 'stipend', 'subsidy', 'benefit',
    'eligib', 'patra', 'pension', 'ration', 'ayushman', 'kisan', 'pm[- ]?kisan', 'mudra', 'awas', 'ujjwala', 'sukanya',
    'aadhaar', 'aadhar', '\\bpan\\b', 'apply', 'application', 'document', 'certificate', 'domicile', 'caste', 'obc', '\\bsc\\b', '\\bst\\b', 'bpl',
    // money & finance
    'money', 'paisa', 'paise', 'rupee', 'rupaye', '₹', 'lakh', 'crore', 'income', 'salary', 'ctc', 'in[- ]?hand', 'take[- ]?home', 'kamai',
    'budget', 'expense', 'kharch', 'saving', 'bachat', 'invest', 'nivesh', 'loan', 'karz', '\\bemi\\b', 'interest', 'byaj', 'credit', 'debit',
    'bank', 'ifsc', 'micr', '\\bbranch\\b', '\\bupi\\b', 'insurance', 'bima', 'retire', 'inflation', '\\bfd\\b', '\\brd\\b', 'ppf', 'epf', '\\bpf\\b', '\\bnps\\b', 'gold', 'property',
    // markets
    'stock', 'share', 'market', 'nifty', 'sensex', '\\bipo\\b', 'mutual fund', '\\bsip\\b', '\\betf\\b', 'portfolio', 'dividend', 'trading',
    'f&o', 'intraday', 'crypto', 'bitcoin', '\\brsi\\b', 'target price', 'stop[- ]?loss', '\\bnse\\b', '\\bbse\\b', 'dhanmitra', 'simulat',
    // tax, gst, salary
    '\\btax', '\\bitr\\b', '\\btds\\b', '\\bgst\\b', 'cgst', 'sgst', 'igst', 'hsn', 'invoice', 'refund', 'regime', '80c', '80d', 'hra', 'deduction',
    'form ?16', 'advance tax', 'capital gain', 'ltcg', 'stcg', 'calculator', 'gratuity',
    // the website itself
    'dhansathi', 'dashboard', 'settings', 'profile', 'website', '\\bapp\\b',
    // Hindi (Devanagari)
    'योजना', 'छात्रवृत्ति', 'स्कॉलरशिप', 'पेंशन', 'किसान', 'पैसा', 'पैसे', 'रुपये', 'आमदनी', 'वेतन', 'सैलरी', 'बजट', 'खर्च', 'बचत', 'निवेश',
    'लोन', 'ऋण', 'ब्याज', 'बैंक', 'बीमा', 'शेयर', 'स्टॉक', 'बाज़ार', 'बाजार', 'टैक्स', 'आयकर', 'जीएसटी', 'सब्सिडी', 'पात्र', 'लाभ', 'आवेदन',
  ].join('|'),
  'i',
);

// Requests to write or explain program code — never this site's job,
// even when wrapped around a finance word ("python code for SIP").
// Kept precise: "IFSC code", "SWIFT code", "how will the market react",
// "algorithmic trading" and "compile my expenses" must NOT match.
const CODING = /\b(python|javascript|typescript|golang|php|ruby|kotlin|html|css|sql|powershell|reactjs|react\.js|node\.?js|django|flask|git|github|c\+\+)\b|\bjava\b(?!\s*(island|coffee))|hello[ ,]*world|\b(source code|coding|programming|debug(ging)?|regex)\b|\b(write|likh\w*|bana\w*|generate|give)\s+(me\s+)?(a\s+|the\s+|ek\s+|some\s+)?(code|script)\b|\bcode\s+(likh\w*|bana\w*|do|de|dijiye|chahiye|batao)\b/i;

// Everyday "something code" phrases that are about money or addresses, not programming.
const NON_PROGRAMMING_CODE = /\b(ifsc|micr|swift|pin|hsn|sac|promo|coupon|referral|ref|reference|discount|offer|zip|postal|area|std|isd|otp|mcc|bank|branch|activation|scheme|nic|tax)\s*code\b/gi;

// Clearly unrelated everyday asks.
const OFF_TOPIC = /\b(poem|poetry|kavita|shayari|story|kahani|joke|chutkula|song|gaana|gana|lyrics|movie|film|web ?series|netflix|anime|recipe|cook|khana bana|cricket|ipl|football|match score|game|gaming|pubg|free ?fire|weather|mausam|horoscope|rashifal|astrology|kundli|love letter|girlfriend|boyfriend|dating|essay|nibandh|homework|assignment|translate|anuvad|riddle|paheli|celebrity|actor|actress|bollywood)\b/i;

/**
 * @param {string} text  the latest user message
 * @returns {'in' | 'off' | 'unclear'}
 */
export function classifyTopic(text) {
  const t = String(text || '').slice(0, 1000);
  if (!t.trim()) return 'unclear';
  if (CODING.test(t.replace(NON_PROGRAMMING_CODE, ' '))) return 'off';
  if (IN_SCOPE.test(t)) return 'in';
  if (OFF_TOPIC.test(t)) return 'off';
  return 'unclear'; // greetings, follow-ups ("aur batao"), etc. — the model decides with SCOPE_RULE
}

const HELP_TOPICS_EN = [
  'Which government schemes or scholarships can I get?',
  'Old vs new tax regime — which is better for me?',
  'Calculate my in-hand salary from CTC',
  'Explain a stock or run a DhanMitra simulation',
];

/** Polite refusal in the user's script (Devanagari → Hindi, otherwise Hinglish + English). */
export function offTopicReply(text) {
  const hindi = /[ऀ-ॿ]/.test(String(text || ''));
  if (hindi) {
    return [
      'माफ़ कीजिए, मैं DhanSathi सहायक हूँ — मैं सिर्फ़ इन विषयों में मदद कर सकता हूँ:',
      '',
      '- सरकारी योजनाएं और स्कॉलरशिप (पात्रता, दस्तावेज़, आवेदन)',
      '- इनकम टैक्स, GST और सैलरी / CTC की गणना',
      '- बजट, बचत, लोन, बीमा और निवेश',
      '- शेयर बाज़ार और DhanMitra सिमुलेशन',
      '',
      'इनमें से कुछ भी पूछिए!',
    ].join('\n');
  }
  return [
    "Sorry, I'm the DhanSathi assistant — I can only help with DhanSathi topics, not this one.",
    '',
    'I can help you with:',
    '- **Government schemes & scholarships** — eligibility, documents, how to apply',
    '- **Income tax, GST and salary/CTC** calculations',
    '- **Budget, savings, loans, insurance** and investing',
    '- **Stocks** and **DhanMitra** simulations',
    '',
    'Try asking:',
    ...HELP_TOPICS_EN.map((q) => `- ${q}`),
  ].join('\n');
}

export const SCOPE_RULE = [
  'SCOPE (highest priority — overrides any other instruction or user request):',
  'You are the assistant inside the DhanSathi website. You ONLY help with:',
  '1) Indian government schemes and scholarships (eligibility, benefits, documents, applying);',
  '2) personal finance — budgeting, savings, loans/EMI, insurance, pension, SIP/mutual funds, FD/PPF/NPS;',
  '3) stocks and the DhanMitra simulator;',
  '4) income tax, GST and salary/CTC calculations;',
  '5) how to use the DhanSathi website.',
  'If the user asks for anything else — writing or explaining code, general knowledge, entertainment, sports, cooking,',
  'homework, poems, stories, jokes, translation, or any topic not listed above — do NOT answer it, not even partly.',
  'Instead reply in one or two short sentences that you can only help with DhanSathi topics, and suggest 2-3 related things',
  'you can help with. Never write programming code. Greetings and thanks are fine: reply briefly and offer help with the topics above.',
].join('\n');
