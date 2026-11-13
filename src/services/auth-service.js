import { supabase, isConfigured } from './supabase.js';

let cachedProfile = null;
let cachedShop = null;

export const authService = {
  /**
   * Check if Supabase is properly configured in .env
   */
  isConfigured() {
    return isConfigured;
  },

  /**
   * Register a new shopkeeper account and provision shop record
   */
  async signUp({ email, password, fullName, phone, shopName, address, preferredLanguage = 'kn-IN' }) {
    if (!isConfigured) {
      throw new Error('Supabase is not configured. Please add your credentials to the .env file.');
    }

    // 1. Create auth user with metadata
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone || null,
          preferred_language: preferredLanguage,
          shop_name: shopName,
          address: address || null
        }
      }
    });

    if (authError) throw authError;
    if (!authData?.user) throw new Error('Registration failed. No user was returned.');

    const userId = authData.user.id;
    const session = authData.session;

    // If email confirmation is enabled in Supabase, session is null.
    // Client cannot write to RLS-protected tables without an active session.
    if (!session) {
      return {
        user: authData.user,
        session: null,
        needsConfirmation: true
      };
    }

    // 2. If authenticated session exists, ensure Profile record
    try {
      const { data: pData, error: pErr } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: fullName,
          phone: phone || null,
          preferred_language: preferredLanguage,
          updated_at: new Date().toISOString()
        })
        .select()
        .maybeSingle();
      if (pData) cachedProfile = pData;
    } catch (e) {
      console.warn('Profile creation non-fatal warning:', e);
    }

    // 3. Ensure Shop record
    try {
      const { data: sData, error: sErr } = await supabase
        .from('shops')
        .insert({
          owner_id: userId,
          shop_name: shopName,
          address: address || null
        })
        .select()
        .maybeSingle();
      if (sData) cachedShop = sData;
    } catch (e) {
      console.warn('Shop creation non-fatal warning:', e);
    }

    if (!cachedProfile) {
      cachedProfile = {
        id: userId,
        full_name: fullName,
        phone: phone || null,
        preferred_language: preferredLanguage
      };
    }
    if (!cachedShop) {
      cachedShop = {
        owner_id: userId,
        shop_name: shopName,
        address: address || null
      };
    }

    return {
      user: authData.user,
      session,
      profile: cachedProfile,
      shop: cachedShop,
      needsConfirmation: false
    };
  },

  /**
   * Login with email and password
   */
  async signIn({ email, password }) {
    if (!isConfigured) {
      throw new Error('Supabase is not configured. Please add your credentials to the .env file.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    if (!data.user) throw new Error('Login failed: Invalid credentials.');

    // Fetch associated profile and shop
    await this.fetchProfileAndShop(data.user.id);

    return {
      user: data.user,
      session: data.session,
      profile: cachedProfile,
      shop: cachedShop
    };
  },

  /**
   * Sign out current user
   */
  async signOut() {
    cachedProfile = null;
    cachedShop = null;
    if (isConfigured) {
      await supabase.auth.signOut();
    }
  },

  /**
   * Get currently active session, profile, and shop
   */
  async getSession() {
    if (!isConfigured) return null;

    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      cachedProfile = null;
      cachedShop = null;
      return null;
    }

    if (!cachedShop || !cachedProfile) {
      await this.fetchProfileAndShop(session.user.id);
    }

    return {
      session,
      user: session.user,
      profile: cachedProfile,
      shop: cachedShop
    };
  },

  /**
   * Fetch profile and shop records for user ID
   */
  async fetchProfileAndShop(userId) {
    if (!isConfigured || !userId) return null;

    // Fetch user metadata for fallback
    let userMeta = {};
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata) {
        userMeta = user.user_metadata;
      }
    } catch (e) {
      // ignore
    }

    // Fetch profile
    let { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    // Auto-provision profile if missing (e.g. registered before trigger was created)
    if (!profile) {
      try {
        const { data: newProfile } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            full_name: userMeta.full_name || 'Shopkeeper',
            phone: userMeta.phone || null,
            preferred_language: userMeta.preferred_language || 'kn-IN',
            updated_at: new Date().toISOString()
          })
          .select()
          .maybeSingle();
        if (newProfile) profile = newProfile;
      } catch (e) {
        console.warn('Could not auto-create profile:', e);
      }
    }

    // Fetch shop
    let { data: shop } = await supabase
      .from('shops')
      .select('*')
      .eq('owner_id', userId)
      .maybeSingle();

    // Auto-provision default shop if missing
    if (!shop && profile) {
      try {
        const { data: newShop } = await supabase
          .from('shops')
          .insert({
            owner_id: userId,
            shop_name: userMeta.shop_name || 'My Kirana Store',
            address: userMeta.address || null
          })
          .select()
          .maybeSingle();
        if (newShop) shop = newShop;
      } catch (e) {
        console.warn('Could not auto-create shop:', e);
      }
    }

    cachedProfile = profile;
    cachedShop = shop;

    return { profile, shop };
  },

  /**
   * Cached synchronous getters
   */
  getCachedProfile() {
    return cachedProfile;
  },

  getCachedShop() {
    return cachedShop;
  },

  /**
   * Subscribe to auth changes
   */
  onAuthStateChange(callback) {
    if (!isConfigured) return { data: { subscription: { unsubscribe: () => {} } } };

    return supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await this.fetchProfileAndShop(session.user.id);
      } else {
        cachedProfile = null;
        cachedShop = null;
      }
      callback(event, session, { profile: cachedProfile, shop: cachedShop });
    });
  }
};

