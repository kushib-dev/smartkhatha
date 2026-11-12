import { supabase, isConfigured } from './supabase.js';

export const transactionService = {
  /**
   * Fetch complete financial ledger for a specific customer.
   * Calculates running balances and lifetime totals strictly from transactions.
   */
  async getCustomerLedger(customerId, shopId) {
    if (!isConfigured || !customerId || !shopId) return null;

    try {
      // 1. Fetch customer details
      const { data: customer, error: custErr } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .eq('shop_id', shopId)
        .single();

      if (custErr) throw custErr;
      if (!customer) return null;

      // 2. Fetch all transactions for this customer ordered chronologically
      const { data: txs, error: txErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('customer_id', customerId)
        .eq('shop_id', shopId)
        .order('created_at', { ascending: true });

      if (txErr) throw txErr;

      let totalCredit = 0;
      let totalPayment = 0;
      let runningBalance = 0;

      // Calculate running balance chronologically
      const ledgerEntries = (txs || []).map(tx => {
        const amt = Number(tx.amount) || 0;
        const isReversed = Boolean(tx.reversed_transaction_id);

        if (!isReversed) {
          if (tx.transaction_type === 'credit') {
            totalCredit += amt;
            runningBalance += amt;
          } else if (tx.transaction_type === 'payment') {
            totalPayment += amt;
            runningBalance -= amt;
          }
        }

        return {
          ...tx,
          amount: amt,
          is_reversed: isReversed,
          running_balance: runningBalance
        };
      });

      // Reverse array so the most recent transaction appears first in the UI
      const recentFirstEntries = [...ledgerEntries].reverse();

      return {
        customer,
        totalCredit,
        totalPayment,
        currentBalance: runningBalance,
        transactions: recentFirstEntries,
        transactionCount: ledgerEntries.length
      };
    } catch (err) {
      console.error('Error fetching customer ledger:', err);
      throw err;
    }
  },

  /**
   * Reverse / void a transaction with an audit trail
   */
  async reverseTransaction(transactionId, shopId, reason = 'Shopkeeper reversal') {
    if (!isConfigured) throw new Error('Supabase is not configured.');

    // 1. Fetch target transaction
    const { data: targetTx, error: fetchErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('shop_id', shopId)
      .single();

    if (fetchErr) throw fetchErr;
    if (!targetTx) throw new Error('Transaction not found.');
    if (targetTx.reversed_transaction_id) {
      throw new Error('This transaction has already been reversed.');
    }

    // 2. Create offsetting reversal transaction
    const oppositeType = targetTx.transaction_type === 'credit' ? 'payment' : 'credit';
    const reversalIdempotencyKey = `reversal-${targetTx.id}-${Date.now()}`;

    const { data: reversalResult, error: revErr } = await supabase.rpc('record_transaction_atomic', {
      p_customer_id: targetTx.customer_id,
      p_transaction_type: oppositeType,
      p_amount: targetTx.amount,
      p_description: `Reversal of #${targetTx.id.slice(0, 8)} (${reason})`,
      p_entry_method: 'manual',
      p_idempotency_key: reversalIdempotencyKey
    });

    if (revErr) throw revErr;

    // 3. Mark original transaction as reversed
    await supabase
      .from('transactions')
      .update({ reversed_transaction_id: reversalResult.transaction_id })
      .eq('id', targetTx.id);

    return reversalResult;
  },

  /**
   * Fetch all shop transactions with customer relationships and multi-criteria filters
   */
  async getAllTransactions(shopId, {
    dateFilter = 'all',
    typeFilter = 'all',
    methodFilter = 'all',
    searchQuery = ''
  } = {}) {
    if (!isConfigured || !shopId) return { transactions: [], totalCredit: 0, totalPayment: 0, count: 0 };

    try {
      let query = supabase
        .from('transactions')
        .select(`
          id,
          shop_id,
          customer_id,
          transaction_type,
          amount,
          description,
          entry_method,
          idempotency_key,
          created_at,
          reversed_transaction_id,
          customers (
            id,
            customer_name,
            phone
          )
        `)
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false });

      // 1. Transaction Type Filter
      if (typeFilter === 'credit' || typeFilter === 'payment') {
        query = query.eq('transaction_type', typeFilter);
      }

      // 2. Entry Method Filter
      if (methodFilter === 'voice' || methodFilter === 'manual') {
        query = query.eq('entry_method', methodFilter);
      }

      // 3. Date Range Filter
      const now = new Date();
      if (dateFilter === 'today') {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query.gte('created_at', todayStart.toISOString());
      } else if (dateFilter === 'yesterday') {
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query.gte('created_at', yesterdayStart.toISOString()).lt('created_at', todayStart.toISOString());
      } else if (dateFilter === 'week') {
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query = query.gte('created_at', weekStart.toISOString());
      } else if (dateFilter === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        query = query.gte('created_at', monthStart.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      let transactions = data || [];

      // 4. Text Search (Customer Name or Description)
      if (searchQuery && searchQuery.trim()) {
        const clean = searchQuery.trim().toLowerCase();
        transactions = transactions.filter(tx => {
          const custName = tx.customers?.customer_name?.toLowerCase() || '';
          const custPhone = tx.customers?.phone?.toLowerCase() || '';
          const desc = tx.description?.toLowerCase() || '';
          return custName.includes(clean) || custPhone.includes(clean) || desc.includes(clean);
        });
      }

      // 5. Compute summary metrics for filtered set
      let totalCredit = 0;
      let totalPayment = 0;

      for (const tx of transactions) {
        if (!tx.reversed_transaction_id) {
          const amt = Number(tx.amount) || 0;
          if (tx.transaction_type === 'credit') {
            totalCredit += amt;
          } else if (tx.transaction_type === 'payment') {
            totalPayment += amt;
          }
        }
      }

      return {
        transactions,
        totalCredit,
        totalPayment,
        netCashflow: totalCredit - totalPayment,
        count: transactions.length
      };
    } catch (err) {
      console.error('Error fetching all transactions:', err);
      throw err;
    }
  }
};

