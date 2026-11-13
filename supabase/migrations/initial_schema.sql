-- ==============================================================================
-- SMARTKHATA AI: DATABASE SCHEMA & MIGRATION SCRIPT
-- PostgreSQL on Supabase with Row Level Security (RLS) & RPC Functions
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. PROFILES TABLE (Linked directly to Supabase Auth auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    preferred_language TEXT NOT NULL DEFAULT 'kn-IN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 2. SHOPS TABLE (Each shop is owned by a profile)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    shop_name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 3. CUSTOMERS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 4. TRANSACTIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('credit', 'payment')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    description TEXT,
    entry_method TEXT NOT NULL DEFAULT 'manual' CHECK (entry_method IN ('manual', 'voice')),
    idempotency_key TEXT UNIQUE,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    reversed_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------------------------
-- 5. VOICE LOGS TABLE (For auditing voice intent processing without storing raw audio)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.voice_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    transcript TEXT,
    intent TEXT,
    processing_status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- INDEXES FOR PERFORMANCE & FAST LOOKUPS
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON public.shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON public.customers(shop_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(shop_id, lower(customer_name));
CREATE INDEX IF NOT EXISTS idx_transactions_shop_id ON public.transactions(shop_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON public.transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON public.transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_voice_logs_shop_id ON public.voice_logs(shop_id);

-- ------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: Get the shop_id for the authenticated user
CREATE OR REPLACE FUNCTION public.get_auth_user_shop_id()
RETURNS UUID AS $$
    SELECT id FROM public.shops WHERE owner_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Profiles Policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Shops Policies
DROP POLICY IF EXISTS "Owners can view own shop" ON public.shops;
CREATE POLICY "Owners can view own shop"
    ON public.shops FOR SELECT
    TO authenticated
    USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can insert own shop" ON public.shops;
CREATE POLICY "Owners can insert own shop"
    ON public.shops FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update own shop" ON public.shops;
CREATE POLICY "Owners can update own shop"
    ON public.shops FOR UPDATE
    TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- Customers Policies (Scoped by shop ownership)
DROP POLICY IF EXISTS "Shop owners can view customers" ON public.customers;
CREATE POLICY "Shop owners can view customers"
    ON public.customers FOR SELECT
    TO authenticated
    USING (shop_id = public.get_auth_user_shop_id());

DROP POLICY IF EXISTS "Shop owners can insert customers" ON public.customers;
CREATE POLICY "Shop owners can insert customers"
    ON public.customers FOR INSERT
    TO authenticated
    WITH CHECK (shop_id = public.get_auth_user_shop_id());

DROP POLICY IF EXISTS "Shop owners can update customers" ON public.customers;
CREATE POLICY "Shop owners can update customers"
    ON public.customers FOR UPDATE
    TO authenticated
    USING (shop_id = public.get_auth_user_shop_id())
    WITH CHECK (shop_id = public.get_auth_user_shop_id());

-- Transactions Policies (Scoped by shop ownership)
DROP POLICY IF EXISTS "Shop owners can view transactions" ON public.transactions;
CREATE POLICY "Shop owners can view transactions"
    ON public.transactions FOR SELECT
    TO authenticated
    USING (shop_id = public.get_auth_user_shop_id());

DROP POLICY IF EXISTS "Shop owners can insert transactions" ON public.transactions;
CREATE POLICY "Shop owners can insert transactions"
    ON public.transactions FOR INSERT
    TO authenticated
    WITH CHECK (
        shop_id = public.get_auth_user_shop_id() AND
        created_by = auth.uid()
    );

-- Voice Logs Policies
DROP POLICY IF EXISTS "Shop owners can view voice logs" ON public.voice_logs;
CREATE POLICY "Shop owners can view voice logs"
    ON public.voice_logs FOR SELECT
    TO authenticated
    USING (shop_id = public.get_auth_user_shop_id());

DROP POLICY IF EXISTS "Shop owners can insert voice logs" ON public.voice_logs;
CREATE POLICY "Shop owners can insert voice logs"
    ON public.voice_logs FOR INSERT
    TO authenticated
    WITH CHECK (shop_id = public.get_auth_user_shop_id());

-- ------------------------------------------------------------------------------
-- DATABASE FUNCTIONS & RPC FOR FINANCIAL ACCURACY
-- ------------------------------------------------------------------------------

-- Function 1: Compute real customer outstanding balance
-- Balance = SUM(credit) - SUM(payment) (excluding reversed transactions)
CREATE OR REPLACE FUNCTION public.get_customer_balance(p_customer_id UUID)
RETURNS NUMERIC(12, 2) AS $$
DECLARE
    v_balance NUMERIC(12, 2);
BEGIN
    SELECT COALESCE(
        SUM(
            CASE 
                WHEN transaction_type = 'credit' THEN amount 
                WHEN transaction_type = 'payment' THEN -amount 
                ELSE 0 
            END
        ), 0.00
    )
    INTO v_balance
    FROM public.transactions
    WHERE customer_id = p_customer_id
      AND reversed_transaction_id IS NULL;

    RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function 2: Atomically record a transaction with idempotency check
CREATE OR REPLACE FUNCTION public.record_transaction_atomic(
    p_customer_id UUID,
    p_transaction_type TEXT,
    p_amount NUMERIC(12, 2),
    p_description TEXT DEFAULT NULL,
    p_entry_method TEXT DEFAULT 'manual',
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_shop_id UUID;
    v_tx_id UUID;
    v_new_balance NUMERIC(12, 2);
    v_existing_tx RECORD;
BEGIN
    -- Get caller shop ID
    v_shop_id := public.get_auth_user_shop_id();
    IF v_shop_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User does not own a registered shop';
    END IF;

    -- Validate customer belongs to this shop
    IF NOT EXISTS (
        SELECT 1 FROM public.customers 
        WHERE id = p_customer_id AND shop_id = v_shop_id AND is_archived = false
    ) THEN
        RAISE EXCEPTION 'Customer not found or not active in your shop';
    END IF;

    -- Validate amount
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Transaction amount must be strictly greater than zero';
    END IF;

    -- Validate transaction type
    IF p_transaction_type NOT IN ('credit', 'payment') THEN
        RAISE EXCEPTION 'Invalid transaction type: must be credit or payment';
    END IF;

    -- Check idempotency key if provided
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, amount, transaction_type INTO v_existing_tx 
        FROM public.transactions 
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            -- Idempotent return: don't double insert
            v_new_balance := public.get_customer_balance(p_customer_id);
            RETURN jsonb_build_object(
                'status', 'duplicate_ignored',
                'transaction_id', v_existing_tx.id,
                'customer_id', p_customer_id,
                'new_balance', v_new_balance
            );
        END IF;
    END IF;

    -- Insert atomic transaction
    INSERT INTO public.transactions (
        shop_id,
        customer_id,
        transaction_type,
        amount,
        description,
        entry_method,
        idempotency_key,
        created_by
    ) VALUES (
        v_shop_id,
        p_customer_id,
        p_transaction_type,
        p_amount,
        p_description,
        p_entry_method,
        p_idempotency_key,
        auth.uid()
    )
    RETURNING id INTO v_tx_id;

    -- Retrieve strictly accurate updated balance
    v_new_balance := public.get_customer_balance(p_customer_id);

    RETURN jsonb_build_object(
        'status', 'success',
        'transaction_id', v_tx_id,
        'customer_id', p_customer_id,
        'new_balance', v_new_balance
    );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- Function 3: Dashboard summary metrics aggregated directly from DB
CREATE OR REPLACE FUNCTION public.get_shop_dashboard_summary()
RETURNS JSONB AS $$
DECLARE
    v_shop_id UUID;
    v_total_customers INT;
    v_total_outstanding NUMERIC(12, 2);
    v_today_credit NUMERIC(12, 2);
    v_today_payments NUMERIC(12, 2);
    v_today_start TIMESTAMPTZ;
BEGIN
    v_shop_id := public.get_auth_user_shop_id();
    IF v_shop_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User does not own a registered shop';
    END IF;

    -- Total active customers
    SELECT COUNT(*) INTO v_total_customers
    FROM public.customers
    WHERE shop_id = v_shop_id AND is_archived = false;

    -- Total outstanding ledger balance across all customers
    SELECT COALESCE(
        SUM(
            CASE 
                WHEN transaction_type = 'credit' THEN amount 
                WHEN transaction_type = 'payment' THEN -amount 
                ELSE 0 
            END
        ), 0.00
    )
    INTO v_total_outstanding
    FROM public.transactions
    WHERE shop_id = v_shop_id AND reversed_transaction_id IS NULL;

    -- Start of current day (UTC or server local)
    v_today_start := date_trunc('day', timezone('utc'::text, now()));

    -- Today's credit
    SELECT COALESCE(SUM(amount), 0.00) INTO v_today_credit
    FROM public.transactions
    WHERE shop_id = v_shop_id 
      AND transaction_type = 'credit'
      AND created_at >= v_today_start
      AND reversed_transaction_id IS NULL;

    -- Today's payments received
    SELECT COALESCE(SUM(amount), 0.00) INTO v_today_payments
    FROM public.transactions
    WHERE shop_id = v_shop_id 
      AND transaction_type = 'payment'
      AND created_at >= v_today_start
      AND reversed_transaction_id IS NULL;

    RETURN jsonb_build_object(
        'total_customers', v_total_customers,
        'total_outstanding', v_total_outstanding,
        'today_credit', v_today_credit,
        'today_payments', v_today_payments
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- AUTOMATIC PROFILE & SHOP PROVISIONING TRIGGER ON SIGNUP
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert into profiles
  INSERT INTO public.profiles (id, full_name, phone, preferred_language)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Shopkeeper'),
    new.raw_user_meta_data->>'phone',
    COALESCE(new.raw_user_meta_data->>'preferred_language', 'kn-IN')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    preferred_language = EXCLUDED.preferred_language,
    updated_at = timezone('utc'::text, now());

  -- Insert into shops
  INSERT INTO public.shops (owner_id, shop_name, address)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'shop_name', 'My Kirana Store'),
    new.raw_user_meta_data->>'address'
  )
  ON CONFLICT DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


