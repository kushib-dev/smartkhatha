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

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone || null,
          preferred_language: preferredLanguage
        }
      }
    });

    if (authError) throw authError;
    if (!authData?.user) throw new Error('Registration failed. No user was returned.');

    const userId = authData.user.id;

    // 2. Create Profile record
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        full_name: fullName,
        phone: phone || null,
        preferred_language: preferredLanguage,
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
      throw new Error(`Profile creation failed: ${profileError.message}`);
    }

    // 3. Create Shop record
    const { data: shopData, error: shopError } = await supabase
      .from('shops')
      .insert({
        owner_id: userId,
        shop_name: shopName,
        address: address || null
      })
      .select()
      .single();

    if (shopError) {
      console.error('Error creating shop:', shopError);
      throw new Error(`Shop creation failed: ${shopError.message}`);
    }

    cachedProfile = {
      id: userId,
      full_name: fullName,
      phone: phone || null,
      preferred_language: preferredLanguage
    };
    cachedShop = shopData;

    return {
      user: authData.user,
      session: authData.session,
      profile: cachedProfile,
      shop: cachedShop
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

    // Fetch profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    // Fetch shop
    const { data: shop } = await supabase
      .from('shops')
      .select('*')
      .eq('owner_id', userId)
      .maybeSingle();

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

