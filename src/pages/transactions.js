import { transactionService } from '../services/transaction-service.js';
import { authService } from '../services/auth-service.js';
import { openTransactionModal } from '../components/transaction-form.js';
import { voiceAssistant } from '../components/microphone.js';
import { formatINR } from '../utils/currency.js';
import { formatDateTime } from '../utils/date.js';
import { showToast } from '../utils/toast.js';

let activeDateFilter = 'all';     // 'all' | 'today' | 'yesterday' | 'week' | 'month'
let activeTypeFilter = 'all';     // 'all' | 'credit' | 'payment'
let activeMethodFilter = 'all';   // 'all' | 'voice' | 'manual'
let currentSearch = '';

export async function renderTransactionsPage(container) {
  const shop = authService.getCachedShop();
  const shopId = shop?.id;
  const profile = authService.getCachedProfile();

  container.innerHTML = `
    <!-- Page Header & Action Controls -->
    <div class="section-header">
      <div>
        <h1>Transaction Management</h1>
        <p>Complete historical log of all credit (Udhar) and payment (Jama) entries.</p>
      </div>

      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button id="tx-page-credit-btn" class="btn btn-danger btn-sm">
          <span>+ Credit (Udhar)</span>
        </button>
        <button id="tx-page-payment-btn" class="btn btn-primary btn-sm">
          <span>+ Payment (Jama)</span>
        </button>
        <button id="tx-page-voice-btn" class="btn btn-secondary btn-sm" title="Speak transaction">
          <span>🎙️ Voice</span>
        </button>
      </div>
    </div>

    <!-- Filters & Search Toolbar -->
    <div class="card" style="margin-bottom: 1.5rem; padding: 1.25rem;">
      <!-- Search Input -->
      <div style="margin-bottom: 1rem;">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input 
            type="text" 
            id="tx-search-input" 
            class="form-control" 
            placeholder="Search by customer name, phone, or notes..." 
            value="${currentSearch}"
          />
        </div>
      </div>

      <!-- Filter Chips & Selectors -->
      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; justify-content: space-between;">
        <!-- Date Filters -->
        <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;" id="date-filter-group">
          <button class="btn btn-sm ${activeDateFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" data-date="all">
            All Time
          </button>
          <button class="btn btn-sm ${activeDateFilter === 'today' ? 'btn-primary' : 'btn-secondary'}" data-date="today">
            Today
          </button>
          <button class="btn btn-sm ${activeDateFilter === 'yesterday' ? 'btn-primary' : 'btn-secondary'}" data-date="yesterday">
            Yesterday
          </button>
          <button class="btn btn-sm ${activeDateFilter === 'week' ? 'btn-primary' : 'btn-secondary'}" data-date="week">
            This Week
          </button>
          <button class="btn btn-sm ${activeDateFilter === 'month' ? 'btn-primary' : 'btn-secondary'}" data-date="month">
            This Month
          </button>
        </div>

        <!-- Type & Method Dropdowns -->
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
          <!-- Type Filter -->
          <select id="tx-type-filter" class="form-control" style="width: auto; min-width: 140px; min-height: 38px; font-size: 0.85rem;">
            <option value="all" ${activeTypeFilter === 'all' ? 'selected' : ''}>All Types</option>
            <option value="credit" ${activeTypeFilter === 'credit' ? 'selected' : ''}>🔴 Credit (Udhar)</option>
            <option value="payment" ${activeTypeFilter === 'payment' ? 'selected' : ''}>🟢 Payment (Jama)</option>
          </select>

          <!-- Method Filter -->
          <select id="tx-method-filter" class="form-control" style="width: auto; min-width: 130px; min-height: 38px; font-size: 0.85rem;">
            <option value="all" ${activeMethodFilter === 'all' ? 'selected' : ''}>All Modes</option>
            <option value="voice" ${activeMethodFilter === 'voice' ? 'selected' : ''}>🎙️ Voice Only</option>
            <option value="manual" ${activeMethodFilter === 'manual' ? 'selected' : ''}>✍️ Manual Only</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Filtered Totals Summary -->
    <div id="tx-summary-bar" class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 1.5rem;">
      <div class="stat-card" style="padding: 1rem;">
        <div class="stat-info">
          <span class="stat-label">Total Transactions</span>
          <span id="summary-count" class="stat-value" style="font-size: 1.3rem;">...</span>
        </div>
      </div>

      <div class="stat-card stat-card-credit" style="padding: 1rem;">
        <div class="stat-info">
          <span class="stat-label">Credit Total (Udhar)</span>
          <span id="summary-credit" class="stat-value" style="font-size: 1.3rem; color: var(--credit-color);">...</span>
        </div>
      </div>

      <div class="stat-card stat-card-payment" style="padding: 1rem;">
        <div class="stat-info">
          <span class="stat-label">Payments Total (Jama)</span>
          <span id="summary-payment" class="stat-value" style="font-size: 1.3rem; color: var(--payment-color);">...</span>
        </div>
      </div>
    </div>

    <!-- Transactions List Container -->
    <div id="transactions-table-container">
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <span class="spinner spinner-dark"></span>
        <p style="margin-top: 0.5rem;">Loading transactions...</p>
      </div>
    </div>
  `;

  // Attach Header Actions
  container.querySelector('#tx-page-credit-btn').addEventListener('click', () => {
    openTransactionModal({
      shopId,
      defaultType: 'credit',
      onSuccess: () => loadTransactions(container, shopId)
    });
  });

  container.querySelector('#tx-page-payment-btn').addEventListener('click', () => {
    openTransactionModal({
      shopId,
      defaultType: 'payment',
      onSuccess: () => loadTransactions(container, shopId)
    });
  });

  container.querySelector('#tx-page-voice-btn').addEventListener('click', () => {
    voiceAssistant.start({
      shopId,
      preferredLanguage: profile?.preferred_language || 'kn-IN',
      onSuccess: () => loadTransactions(container, shopId)
    });
  });

  // Attach Date Filter Chips
  container.querySelectorAll('#date-filter-group [data-date]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeDateFilter = btn.getAttribute('data-date');
      container.querySelectorAll('#date-filter-group [data-date]').forEach(b => {
        b.className = 'btn btn-sm btn-secondary';
      });
      btn.className = 'btn btn-sm btn-primary';
      loadTransactions(container, shopId);
    });
  });

  // Attach Type Select
  container.querySelector('#tx-type-filter').addEventListener('change', (e) => {
    activeTypeFilter = e.target.value;
    loadTransactions(container, shopId);
  });

  // Attach Method Select
  container.querySelector('#tx-method-filter').addEventListener('change', (e) => {
    activeMethodFilter = e.target.value;
    loadTransactions(container, shopId);
  });

  // Attach Search Input (Debounced)
  const searchInput = container.querySelector('#tx-search-input');
  let debounceTimeout = null;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    currentSearch = e.target.value;
    debounceTimeout = setTimeout(() => {
      loadTransactions(container, shopId);
    }, 250);
  });

  // Initial Load
  await loadTransactions(container, shopId);
}

/**
 * Fetch and display filtered transactions
 */
async function loadTransactions(container, shopId) {
  const tableContainer = container.querySelector('#transactions-table-container');
  if (!tableContainer || !shopId) return;

  try {
    const data = await transactionService.getAllTransactions(shopId, {
      dateFilter: activeDateFilter,
      typeFilter: activeTypeFilter,
      methodFilter: activeMethodFilter,
      searchQuery: currentSearch
    });

    const { transactions, totalCredit, totalPayment, count } = data;

    // Update Summary Metrics
    const countEl = container.querySelector('#summary-count');
    const creditEl = container.querySelector('#summary-credit');
    const paymentEl = container.querySelector('#summary-payment');

    if (countEl) countEl.textContent = count;
    if (creditEl) creditEl.textContent = formatINR(totalCredit);
    if (paymentEl) paymentEl.textContent = formatINR(totalPayment);

    // Empty state
    if (transactions.length === 0) {
      tableContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📋</div>
          <h3>No transactions found</h3>
          <p style="margin-top: 0.25rem; font-size: 0.9rem;">
            ${currentSearch || activeDateFilter !== 'all' || activeTypeFilter !== 'all' ? 'No transactions match the selected filters.' : 'Your shop does not have any transactions yet.'}
          </p>
          <button id="reset-tx-filters-btn" class="btn btn-outline" style="margin-top: 1rem;">
            Reset Filters
          </button>
        </div>
      `;

      const resetBtn = tableContainer.querySelector('#reset-tx-filters-btn');
      if (resetBtn) {
        resetBtn.onclick = () => {
          activeDateFilter = 'all';
          activeTypeFilter = 'all';
          activeMethodFilter = 'all';
          currentSearch = '';
          renderTransactionsPage(container);
        };
      }
      return;
    }

    // Render Table
    tableContainer.innerHTML = `
      <div class="card" style="padding: 0; overflow: hidden;">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Customer</th>
                <th>Transaction Type</th>
                <th>Notes / Items</th>
                <th>Entry Mode</th>
                <th style="text-align: right;">Amount</th>
                <th style="text-align: center;">Reversal</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.map(tx => {
                const isCredit = tx.transaction_type === 'credit';
                const isReversed = Boolean(tx.reversed_transaction_id);
                const amtFormatted = formatINR(tx.amount);
                const customerName = tx.customers?.customer_name || 'Customer';
                const customerId = tx.customer_id;
                const isVoice = tx.entry_method === 'voice';

                return `
                  <tr style="${isReversed ? 'opacity: 0.5; text-decoration: line-through;' : ''}">
                    <td style="white-space: nowrap; font-size: 0.85rem;">
                      ${formatDateTime(tx.created_at)}
                    </td>

                    <td>
                      <a href="#/customers/${customerId}" style="color: var(--text-primary); text-decoration: none; font-weight: 600;">
                        ${customerName}
                      </a>
                    </td>

                    <td>
                      <span class="badge ${isCredit ? 'badge-credit' : 'badge-payment'}">
                        ${isCredit ? '🔴 Credit (Udhar)' : '🟢 Payment (Jama)'}
                      </span>
                      ${isReversed ? '<span class="badge badge-neutral" style="margin-left: 0.25rem;">Voided</span>' : ''}
                    </td>

                    <td style="font-size: 0.9rem; color: var(--text-secondary); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${tx.description || '-'}
                    </td>

                    <td>
                      <span class="badge ${isVoice ? 'badge-neutral' : ''}" style="font-size: 0.75rem;">
                        ${isVoice ? '🎙️ Voice' : '✍️ Manual'}
                      </span>
                    </td>

                    <td style="text-align: right; font-weight: 700; color: ${isCredit ? 'var(--credit-color)' : 'var(--payment-color)'};">
                      ${isCredit ? `+ ${amtFormatted}` : `- ${amtFormatted}`}
                    </td>

                    <td style="text-align: center;">
                      ${!isReversed ? `
                        <button class="btn btn-secondary btn-sm reverse-all-tx-btn" data-id="${tx.id}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; min-height: 28px;">
                          ↩️ Reverse
                        </button>
                      ` : `
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Reversed</span>
                      `}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Attach Reversal Click Handlers
    tableContainer.querySelectorAll('.reverse-all-tx-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const txId = btn.getAttribute('data-id');
        const confirmed = confirm(
          'Are you sure you want to reverse this transaction?\n\nAn auditable reversal entry will be created in Supabase to adjust the customer balance without deleting records.'
        );

        if (confirmed) {
          try {
            btn.disabled = true;
            btn.textContent = 'Reversing...';
            await transactionService.reverseTransaction(txId, shopId, 'Audit adjustment');
            showToast('Transaction reversed successfully!', 'info');
            loadTransactions(container, shopId);
          } catch (err) {
            console.error('Reversal error:', err);
            showToast('Failed to reverse transaction: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = '↩️ Reverse';
          }
        }
      });
    });

  } catch (err) {
    console.error('Error loading transactions:', err);
    tableContainer.innerHTML = `
      <div class="card" style="text-align: center; padding: 2rem; color: var(--credit-color);">
        <p>Failed to load transactions. Please check your Supabase connection.</p>
      </div>
    `;
  }
}
