# SmartKhata AI – Voice-Powered Digital Ledger for Indian Kirana Stores

SmartKhata AI is a voice-controlled digital ledger (Digital Udhar & Jama Khata) designed specifically for small Indian retail shopkeepers and kirana store owners. It replaces cumbersome handwritten paper notebooks with an AI-driven, voice-first ledger that understands natural spoken commands in Kannada, English, and Hindi.

---

## 1. System Architecture

```
Shopkeeper Speaks (Kannada / English / Hindi)
       │
       ▼
Frontend (MediaRecorder / Web Audio)
       │
       ▼
Supabase Edge Function: `process-voice`
       │
       ├─► Gnani Prisma v3.0 (ASR / STT) ────► Transcribes Spoken Voice to Text
       │
       └─► OpenAI API (Structured JSON NLU) ──► Extracts Intent, Customer, Amount
       │
       ▼
Frontend Confirmation Modal (Shopkeeper Reviews Customer, Amount & Type)
       │
       ▼ (Confirmed)
Supabase Database: `record_transaction_atomic` (PostgreSQL RPC with RLS)
       │
       ▼
Supabase Edge Function: `text-to-speech`
       │
       └─► Gnani Timbre v3.0 (TTS) ──────────► Speaks Confirmation in Shopkeeper's Language
```

---

## 2. Technology Stack

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3, Vite
- **UI Libraries:** Lucide Icons, Chart.js
- **Database & Auth:** Supabase (PostgreSQL, Supabase Auth, Row Level Security, Edge Functions)
- **AI Understanding:** OpenAI API (`gpt-4o-mini` with structured JSON output)
- **Speech-to-Text (STT):** Gnani.ai Prisma v3.0
- **Text-to-Speech (TTS):** Gnani.ai Timbre v3.0

---

## 3. Six Essential Modules Roadmap

1. **Module 1: Login and Shop Registration** *(Implemented)*
   - User authentication via Supabase Auth
   - Automatic creation of shopkeeper `profiles` and `shops`
   - Multi-language selection (Kannada, English, Hindi, Tamil, Telugu)
   - Client-side route protection and session restoration

2. **Module 2: Main Dashboard** *(Next)*
   - Live KPI cards: Total Customers, Total Outstanding Balance, Today's Credit (Udhar), Today's Payment (Jama)
   - Large touch-friendly microphone button
   - Recent transaction feed and visual ledger chart

3. **Module 3: AI Voice Assistant**
   - Single-tap voice recording
   - Gnani Prisma v3.0 speech recognition
   - OpenAI intent & entity extraction
   - Audio feedback via Gnani Timbre v3.0
   - Confirmation modal to prevent accidental entries

4. **Module 4: Customer Management**
   - Add, edit, search, and archive customer accounts
   - Duplicate prevention and phone number linkage

5. **Module 5: Individual Customer Ledger**
   - Complete credit and payment history
   - Real-time running balance calculation from database records
   - Manual transaction entry modal

6. **Module 6: Transaction Management**
   - Filterable transaction journal (Today, Yesterday, Credit, Payment)
   - Entry method tracking (Voice vs Manual)
   - Audit trail and reversal mechanism

---

## 4. Setup & Running Locally

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your Supabase project credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Step 3: Run Database Migrations in Supabase
1. Open your [Supabase Dashboard](https://app.supabase.com).
2. Go to the **SQL Editor**.
3. Open `supabase/migrations/initial_schema.sql` from this repository.
4. Paste and execute the SQL script. This sets up:
   - `profiles`, `shops`, `customers`, `transactions`, `voice_logs`
   - Row Level Security (RLS) policies for complete shop isolation
   - `record_transaction_atomic` stored procedure
   - `get_customer_balance` and `get_shop_dashboard_summary` functions

### Step 4: Run Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 5. Security & Financial Data Integrity

- **Row Level Security (RLS):** Every customer and transaction row is strictly bound to `auth.uid()` via the shop owner foreign key. Shop A can never read or mutate Shop B's records.
- **Idempotency Keys:** Every voice and manual transaction can submit a unique idempotency key to prevent accidental double-billing on network retries or repeated voice taps.
- **No AI Financial Calculations:** AI is strictly used to parse intent and text. The database is the single source of truth for all balances.
- **Zero Client-Side Secrets:** Private keys for OpenAI and Gnani.ai reside exclusively in Supabase Edge Function environment secrets.

