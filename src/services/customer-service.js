import { supabase, isConfigured } from './supabase.js';

export const customerService = {
  /**
   * Fetch all customers for a shop with their current outstanding balance
   */
  async getCustomers(shopId, { includeArchived = false, searchQuery = '', sortBy = 'name' } = {}) {
    if (!isConfigured || !shopId) return [];

    try {
      // 1. Query customers
      let query = supabase
        .from('customers')
        .select('id, shop_id, customer_name, phone, address, is_archived, created_at')
        .eq('shop_id', shopId);

      if (!includeArchived) {
        query = query.eq('is_archived', false);
      }

      if (searchQuery && searchQuery.trim()) {
        const clean = searchQuery.trim();
        query = query.or(`customer_name.ilike.%${clean}%,phone.ilike.%${clean}%`);
      }

      if (sortBy === 'name') {
        query = query.order('customer_name', { ascending: true });
      } else if (sortBy === 'recent') {
        query = query.order('created_at', { ascending: false });
      }

      const { data: customers, error: custErr } = await query;
      if (custErr) throw custErr;
      if (!customers || customers.length === 0) return [];

      // 2. Fetch non-reversed transactions to compute customer balances
      const { data: txs, error: txErr } = await supabase
        .from('transactions')
        .select('customer_id, transaction_type, amount')
        .eq('shop_id', shopId)
        .is('reversed_transaction_id', null);

      if (txErr) throw txErr;

      // Group balances by customer_id
      const balanceMap = {};
      for (const tx of txs || []) {
        if (!balanceMap[tx.customer_id]) {
          balanceMap[tx.customer_id] = { balance: 0, totalCredit: 0, totalPayment: 0 };
        }
        const amt = Number(tx.amount) || 0;
        if (tx.transaction_type === 'credit') {
          balanceMap[tx.customer_id].balance += amt;
          balanceMap[tx.customer_id].totalCredit += amt;
        } else if (tx.transaction_type === 'payment') {
          balanceMap[tx.customer_id].balance -= amt;
          balanceMap[tx.customer_id].totalPayment += amt;
        }
      }

      // Attach balance metadata
      const customersWithBalances = customers.map(c => {
        const stats = balanceMap[c.id] || { balance: 0, totalCredit: 0, totalPayment: 0 };
        return {
          ...c,
          balance: stats.balance,
          total_credit: stats.totalCredit,
          total_payment: stats.totalPayment
        };
      });

      // Sort by balance if requested
      if (sortBy === 'balance_desc') {
        customersWithBalances.sort((a, b) => b.balance - a.balance);
      }

      return customersWithBalances;
    } catch (err) {
      console.error('Error fetching customers:', err);
      throw err;
    }
  },

  /**
   * Check for potential duplicates by name or phone within the same shop
   */
  async checkDuplicate(shopId, customerName, phone = null, excludeCustomerId = null) {
    if (!isConfigured || !shopId || !customerName) return null;

    try {
      const cleanName = customerName.trim().toLowerCase();
      const { data: existing, error } = await supabase
        .from('customers')
        .select('id, customer_name, phone, is_archived')
        .eq('shop_id', shopId);

      if (error || !existing) return null;

      // Find similar name or identical phone
      for (const c of existing) {
        if (excludeCustomerId && c.id === excludeCustomerId) continue;

        if (c.customer_name.trim().toLowerCase() === cleanName) {
          return { type: 'exact_name', customer: c };
        }

        if (phone && c.phone && c.phone.trim() === phone.trim()) {
          return { type: 'exact_phone', customer: c };
        }

        if (c.customer_name.toLowerCase().includes(cleanName) || cleanName.includes(c.customer_name.toLowerCase())) {
          return { type: 'similar_name', customer: c };
        }
      }

      return null;
    } catch (err) {
      console.error('Duplicate check error:', err);
      return null;
    }
  },

  /**
   * Add a new customer
   */
  async addCustomer(shopId, { customerName, phone, address }) {
    if (!isConfigured) throw new Error('Supabase is not configured.');

    const cleanName = customerName?.trim();
    if (!cleanName) throw new Error('Customer name is required.');

    const { data, error } = await supabase
      .from('customers')
      .insert({
        shop_id: shopId,
        customer_name: cleanName,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        is_archived: false
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update existing customer details
   */
  async updateCustomer(customerId, { customerName, phone, address }) {
    if (!isConfigured) throw new Error('Supabase is not configured.');

    const cleanName = customerName?.trim();
    if (!cleanName) throw new Error('Customer name is required.');

    const { data, error } = await supabase
      .from('customers')
      .update({
        customer_name: cleanName,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', customerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Archive a customer (Soft Delete - preserves all financial audit records)
   */
  async archiveCustomer(customerId) {
    if (!isConfigured) throw new Error('Supabase is not configured.');

    const { data, error } = await supabase
      .from('customers')
      .update({
        is_archived: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', customerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Restore/Unarchive a customer
   */
  async unarchiveCustomer(customerId) {
    if (!isConfigured) throw new Error('Supabase is not configured.');

    const { data, error } = await supabase
      .from('customers')
      .update({
        is_archived: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', customerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};

