-- ==============================================================================
-- SMARTKHATA AI: AUTOMATIC PROFILE & SHOP TRIGGER (MIGRATION 02)
-- Execute this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/syleuhpeoypvfhmrqurj/sql
-- ==============================================================================

-- 1. Create a secure trigger function to automatically provision
--    a profile and shop record whenever a user signs up.
--    SECURITY DEFINER ensures it runs with postgres superuser rights,
--    completely bypassing Row Level Security (RLS) constraints.
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

-- 2. Bind the trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Ensure profiles and shops RLS allow authenticated users to upsert/update
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

