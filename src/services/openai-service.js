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
        clarification_needed: true,
        reply_message: 'ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಸ್ಪಷ್ಟವಾಗಿ ಹೇಳಿ (Please speak again clearly)'
      };
    }

    const text = transcript.toLowerCase();

    // 1. Extract Numbers (Amount)
    let amount = null;
    const amountMatch = text.match(/(?:₹|rs\.?|rupees|rupayi|rupaayi|roopayi)?\s*(\d+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|rupees|rupayi|rupaayi|roopayi)?/);
    if (amountMatch && amountMatch[1]) {
      amount = parseFloat(amountMatch[1]);
    }

    // 2. Determine Intent
    let intent = INTENTS.UNKNOWN;
    let transaction_type = null;

    const isCredit = text.includes('udhar') || text.includes('credit') || text.includes('kodi') || text.includes('baki');
    const isPayment = text.includes('jama') || text.includes('kott') || text.includes('paid') || text.includes('diya') || text.includes('receive');
    const isBalance = text.includes('balance') || text.includes('eshtu') || text.includes('kitna');

    if (isBalance) {
      intent = INTENTS.CHECK_BALANCE;
    } else if (isCredit && amount) {
      intent = INTENTS.ADD_CREDIT;
      transaction_type = 'credit';
    } else if (isPayment && amount) {
      intent = INTENTS.RECORD_PAYMENT;
      transaction_type = 'payment';
    }

    // 3. Extract Customer Name (words before 'ge', 'ka', 'ne', or action words)
    let customer_name = null;
    const nameMatch = text.match(/^([a-zA-Z\u0C80-\u0CFF\u0900-\u097F]+)(?:\s+(?:ge|ka|ne|ko|ki|ku))?/i);
    if (nameMatch && nameMatch[1]) {
      const candidate = nameMatch[1].trim();
      const forbidden = ['give', 'add', 'record', 'check', 'total', 'please', 'jama', 'udhar'];
      if (!forbidden.includes(candidate.toLowerCase())) {
        customer_name = candidate.charAt(0).toUpperCase() + candidate.slice(1);
      }
    }

    const clarification_needed = intent === INTENTS.UNKNOWN || (!customer_name && intent !== INTENTS.CHECK_BALANCE) || (intent !== INTENTS.CHECK_BALANCE && !amount);

    return {
      intent,
      customer_name,
      transaction_type,
      amount,
      notes: null,
      clarification_needed,
      reply_message: clarification_needed 
        ? 'ಕ್ಷಮಿಸಿ, ಗ್ರಾಹಕರ ಹೆಸರು ಅಥವಾ ಮೊತ್ತ ಸ್ಪಷ್ಟವಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಹೇಳಿ.'
        : `ಖಚಿತಪಡಿಸಿ: ${customer_name} ₹${amount}`
    };
  }
};

