/**
 * OpenAI NLU Service
 * Defines the structured JSON prompt and schemas for interpreting Kirana voice commands.
 * Handles English, Kannada (Kannada script and Romanized Kannada), and Hindi.
 */

export const INTENTS = {
  ADD_CREDIT: 'ADD_CREDIT',       // Shopkeeper gives goods on credit (Udhar)
  RECORD_PAYMENT: 'RECORD_PAYMENT', // Customer pays cash/UPI (Jama)
  CHECK_BALANCE: 'CHECK_BALANCE',   // Inquire customer balance
  UNKNOWN: 'UNKNOWN'               // Unclear or missing critical info
};

export const openaiService = {
  /**
   * System prompt with multi-language rules and strict financial precautions
   */
  getSystemPrompt() {
    return `
You are the Natural Language Understanding engine for SmartKhata AI, a voice digital ledger for Indian Kirana store keepers.
The shopkeeper speaks in Kannada (e.g. "Ramesh ge 500 rupayi udhara kodi", "Suresh 200 rupayi kottidane"), English (e.g. "Give 500 credit to Ramesh", "Ramesh paid 200"), or Hindi (e.g. "Ramesh ka 500 udhar likho", "Ramesh ne 200 jama kiya").

Your job is to extract:
1. intent: "ADD_CREDIT" | "RECORD_PAYMENT" | "CHECK_BALANCE" | "UNKNOWN"
2. customer_name: string or null
3. transaction_type: "credit" | "payment" | null
4. amount: number or null (strictly positive)
5. notes: string or null (e.g. items mentioned like "oil", "rice", "dal")
6. clarification_needed: boolean (true if customer_name or amount is missing for transactions)
7. reply_message: string (short, polite confirmation or clarification prompt in the language spoken by the shopkeeper)

CRITICAL RULES:
- Never invent or assume transaction amounts. If not explicitly spoken, amount MUST be null and clarification_needed MUST be true.
- Never guess a customer name if missing.
- "Udhara", "Udaari", "Credit", "Baki", "Likho" mean ADD_CREDIT (transaction_type = "credit").
- "Kottidane", "Kotta", "Jama", "Paid", "Diya", "Received" mean RECORD_PAYMENT (transaction_type = "payment").
- "Balance", "Baki kitna", "Eshtu", "Balance check" mean CHECK_BALANCE.
- Return ONLY a valid JSON object matching these exact keys.
`;
  },

  /**
   * Client-side fallback rule-based parser in case network or backend edge function is temporarily offline
   */
  parseLocally(transcript, language = 'kn-IN') {
    if (!transcript || typeof transcript !== 'string') {
      return {
        intent: INTENTS.UNKNOWN,
        customer_name: null,
        transaction_type: null,
        amount: null,
        notes: null,
        clarification_needed: true,
        reply_message: 'ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಸ್ಪಷ್ಟವಾಗಿ ಹೇಳಿ (Please speak again clearly)'
      };
    }

    const raw = transcript.trim();
    const text = raw.toLowerCase();

    // 1. Extract Numbers (Amount)
    let amount = null;
    const amountMatch = text.match(/(?:₹|rs\.?|rupees|rupayi|rupaayi|roopayi|ರೂಪಾಯಿ|ರೂ)?\s*(\d+(?:\.\d{1,2})?)/);
    if (amountMatch && amountMatch[1]) {
      amount = parseFloat(amountMatch[1]);
    }

    // 2. Determine Intent (Comprehensive Kannada, Hindi, English keywords)
    const creditKeywords = [
      'udhar', 'credit', 'kodi', 'baki', 'tagonda', 'thagonda', 'togond', 'kotte', 'barkoli', 'likho',
      'ತಗೊಂಡ', 'ತೆಗೆದುಕೊಂಡ', 'ತಗೊಂಡಿದ್ದಾನೆ', 'ತಗೊಂಡಿದಾನೆ', 'ತಗೊಂಡ್ರು', 'ತಗೋಂಡ', 'ತಗೊಂಡ್ಹೋದ', 'ತಗೊಂಡಿ',
      'ಉದ್ದರಿ', 'ಉದ್ರಿ', 'ಉಧಾರ', 'ಉದ್ಧಾರ', 'ಉದಾರ', 'ಖಾತೆಗೆ', 'ಖಾತೆ', 'ಬರ್ಕೊಳ್ಳಿ', 'ಬರ್ಕೋ', 'ಹಾಕು', 'ಹಾಕಿ',
      'ಕೊಟ್ಟೆ', 'ಕೊಟ್ಟಿದ್ದೀನಿ', 'ಖರೀದಿ', 'ಖರೀದಿಸಿದ'
    ];

    const paymentKeywords = [
      'jama', 'paid', 'diya', 'receive', 'kott', 'kottidane', 'pavathi', 'chutka',
      'ಕೊಟ್ಟ', 'ಕೊಟ್ಟಿದ್ದಾನೆ', 'ಕೊಟ್ಟಿದಾನೆ', 'ಕೊಟ್ರು', 'ಕೊಟ್ಟಿದ್ದು', 'ಕೊಟ್ಟಿರೋದು',
      'ಪಾವತಿ', 'ಜಮಾ', 'ಸಲ್ಲಿಸಿದ', 'ಸಂದಾಯ', 'ಮುಗಿಸಿದ', 'ಚುಕ್ತಾ'
    ];

    const balanceKeywords = [
      'balance', 'eshtu', 'kitna', 'lekka', 'ಬಾಕಿ ಎಷ್ಟು', 'ಎಷ್ಟು ಕೊಡಬೇಕು', 'ಎಷ್ಟು ಇದೆ', 'ಲೆಕ್ಕ'
    ];

    let intent = INTENTS.UNKNOWN;
    let transaction_type = null;

    const isBalance = balanceKeywords.some(k => text.includes(k)) || (text.includes('ಬಾಕಿ') && !amount);
    const isPayment = paymentKeywords.some(k => text.includes(k));
    const isCredit = creditKeywords.some(k => text.includes(k));

    if (isBalance) {
      intent = INTENTS.CHECK_BALANCE;
    } else if (isPayment && amount) {
      intent = INTENTS.RECORD_PAYMENT;
      transaction_type = 'payment';
    } else if (isCredit && amount) {
      intent = INTENTS.ADD_CREDIT;
      transaction_type = 'credit';
    } else if (amount) {
      // Default to credit when amount exists and item/action was spoken
      intent = INTENTS.ADD_CREDIT;
      transaction_type = 'credit';
    }

    // 3. Extract Customer Name
    let customer_name = null;
    const words = raw.split(/\s+/);

    // Check Pattern A: "to <Name>", "by <Name>", etc.
    const prepMatch = text.match(/(?:to|from|by|for)\s+([a-zA-Z\u0C80-\u0CFF\u0900-\u097F]+)/i);
    if (prepMatch && prepMatch[1]) {
      const candidate = prepMatch[1].trim();
      const forbidden = ['credit', 'payment', 'balance', 'rupees', 'rs', 'udhar', 'jama', 'rupayi'];
      if (!forbidden.includes(candidate.toLowerCase())) {
        customer_name = candidate.charAt(0).toUpperCase() + candidate.slice(1);
      }
    }

    // Pattern B: First word or word before suffix/particles
    if (!customer_name && words.length > 0) {
      let firstWord = words[0].replace(/[^a-zA-Z\u0C80-\u0CFF\u0900-\u097F]/g, '');
      const stopWords = ['give', 'add', 'record', 'check', 'total', 'please', 'jama', 'udhar', 'credit', 'payment', 'balance'];
      if (!stopWords.includes(firstWord.toLowerCase()) && isNaN(firstWord)) {
        // Strip Kannada/Hindi grammatical case endings: ನ, ನಿಗೆ, ಗೆ, ನನ್ನು, ಅವರ, ge, ka, ne
        firstWord = firstWord.replace(/(?:ನನ್ನು|ನಿಗೆ|ಇಂಗೆ|ಅವರ|ಗೆ|ನ|ka|ge|ne|ki)$/, '');
        if (firstWord.length >= 2) {
          customer_name = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
        }
      }
    }

    // Pattern C: Fallback scan through words
    if (!customer_name) {
      const stopWords = ['give', 'add', 'record', 'check', 'total', 'please', 'jama', 'udhar', 'credit', 'payment', 'balance', 'rupees', 'rs', 'rupayi', 'kodi', 'kottidane', 'to', 'for', 'from', 'in', 'and'];
      for (const w of words) {
        let clean = w.replace(/[^a-zA-Z\u0C80-\u0CFF\u0900-\u097F]/g, '');
        clean = clean.replace(/(?:ನನ್ನು|ನಿಗೆ|ಇಂಗೆ|ಅವರ|ಗೆ|ನ|ka|ge|ne|ki)$/, '');
        if (clean.length >= 2 && !stopWords.includes(clean.toLowerCase()) && isNaN(clean)) {
          customer_name = clean.charAt(0).toUpperCase() + clean.slice(1);
          break;
        }
      }
    }

    // 4. Extract Notes (e.g. "ಐದು ಕೆಜಿ ಗೋಡಂಬಿ" or "5kg rice")
    let notes = null;
    let remaining = raw;
    if (words[0]) remaining = remaining.replace(words[0], '');
    if (amountMatch) remaining = remaining.replace(amountMatch[0], '').replace(/\s*ಕ್ಕೆ/, '');
    for (const kw of [...creditKeywords, ...paymentKeywords, ...balanceKeywords]) {
      remaining = remaining.replace(new RegExp(kw, 'gi'), '');
    }
    const cleanNotes = remaining.replace(/[,;]/g, '').trim();
    if (cleanNotes && cleanNotes.length >= 2) {
      notes = cleanNotes;
    }

    const clarification_needed = intent === INTENTS.UNKNOWN || (!customer_name && intent !== INTENTS.CHECK_BALANCE) || (intent !== INTENTS.CHECK_BALANCE && !amount);

    let reply = 'ಕ್ಷಮಿಸಿ, ಗ್ರಾಹಕರ ಹೆಸರು ಅಥವಾ ಮೊತ್ತ ಸ್ಪಷ್ಟವಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಹೇಳಿ.';
    if (!clarification_needed) {
      if (intent === INTENTS.CHECK_BALANCE) {
        reply = language.startsWith('en') 
          ? `Checking ledger balance for ${customer_name}`
          : `${customer_name} ಅವರ ಬಾಕಿ ಮೊತ್ತವನ್ನು ನೋಡಲಾಗುತ್ತಿದೆ`;
      } else {
        reply = language.startsWith('en')
          ? `Confirm: ${customer_name} ₹${amount} (${transaction_type})`
          : `ಖಚಿತಪಡಿಸಿ: ${customer_name} ₹${amount}`;
      }
    }

    return {
      intent,
      customer_name,
      transaction_type,
      amount,
      notes,
      clarification_needed,
      reply_message: reply
    };
  }
};

