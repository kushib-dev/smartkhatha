import { supabase, isConfigured } from './supabase.js';

export const dashboardService = {
  /**
   * Fetch live KPI metrics for the authenticated shop.
   * Uses PostgreSQL RPC function `get_shop_dashboard_summary` with fallback to direct queries.
   */
  async getSummary(shopId) {
    if (!isConfigured) {
      return {
        total_customers: 0,
        total_outstanding: 0,
        today_credit: 0,
        today_payments: 0
      };
    }

    try {
      // 1. Attempt DB RPC function
      const { data, error } = await supabase.rpc('get_shop_dashboard_summary');
      if (!error && data) {
        return {
          total_customers: Number(data.total_customers) || 0,
          total_outstanding: Number(data.total_outstanding) || 0,
          today_credit: Number(data.today_credit) || 0,
          today_payments: Number(data.today_payments) || 0
        };
      }
    } catch (rpcErr) {
      console.warn('RPC get_shop_dashboard_summary failed, falling back to direct queries:', rpcErr);
    }

    // Direct query fallback
    try {
      // Count customers
      const { count: customerCount } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('shop_id', shopId)
        .eq('is_archived', false);

      // Query non-reversed transactions for this shop
      const { data: txs, error: txError } = await supabase
        .from('transactions')
        .select('transaction_type, amount, created_at, reversed_transaction_id')
        .eq('shop_id', shopId)
        .is('reversed_transaction_id', null);

      if (txError) throw txError;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      let totalOutstanding = 0;
      let todayCredit = 0;
      let todayPayments = 0;

      for (const tx of txs || []) {
        const amt = Number(tx.amount) || 0;
        const txDate = new Date(tx.created_at);
        const isToday = txDate >= todayStart;

        if (tx.transaction_type === 'credit') {
          totalOutstanding += amt;
          if (isToday) todayCredit += amt;
        } else if (tx.transaction_type === 'payment') {
          totalOutstanding -= amt;
          if (isToday) todayPayments += amt;
        }
      }

      return {
        total_customers: customerCount || 0,
        total_outstanding: totalOutstanding,
        today_credit: todayCredit,
        today_payments: todayPayments
      };
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
      return {
        total_customers: 0,
        total_outstanding: 0,
        today_credit: 0,
        today_payments: 0
      };
    }
  },

  /**
   * Fetch recent transactions with customer name and metadata
   */
  async getRecentTransactions(shopId, limit = 6) {
    if (!isConfigured || !shopId) return [];

    try {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id,
          customer_id,
          transaction_type,
          amount,
          description,
          entry_method,
          created_at,
          reversed_transaction_id,
          customers (
            id,
            customer_name,
            phone
          )
        `)
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching recent transactions:', err);
      return [];
    }
  },

  /**
   * Fetch daily credit vs payment aggregated for the last 7 days (for Chart.js)
   */
  async getWeeklyTrend(shopId) {
    if (!isConfigured || !shopId) {
      return { labels: [], creditData: [], paymentData: [] };
    }

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      const { data: txs, error } = await supabase
        .from('transactions')
        .select('transaction_type, amount, created_at')
        .eq('shop_id', shopId)
        .gte('created_at', sevenDaysAgo.toISOString())
        .is('reversed_transaction_id', null)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Group by day of week
      const days = [];
      const dayMap = {};

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayKey = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
        days.push(dayKey);
        dayMap[dayKey] = { credit: 0, payment: 0 };
      }

      for (const tx of txs || []) {
        const txDate = new Date(tx.created_at);
        const dayKey = txDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
        if (dayMap[dayKey]) {
          const amt = Number(tx.amount) || 0;
          if (tx.transaction_type === 'credit') {
            dayMap[dayKey].credit += amt;
          } else if (tx.transaction_type === 'payment') {
            dayMap[dayKey].payment += amt;
          }
        }
      }

      return {
        labels: days,
        creditData: days.map(d => dayMap[d].credit),
        paymentData: days.map(d => dayMap[d].payment)
      };
    } catch (err) {
      console.error('Error calculating weekly trend:', err);
      return { labels: [], creditData: [], paymentData: [] };
    }
  },

  /**
   * Quick customer search by name or phone
   */
  async searchCustomers(shopId, query) {
    if (!isConfigured || !shopId || !query) return [];

    try {
      const clean = query.trim().toLowerCase();
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_name, phone')
        .eq('shop_id', shopId)
        .eq('is_archived', false)
        .ilike('customer_name', `%${clean}%`)
        .limit(5);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error searching customers:', err);
      return [];
    }
  }
};

