import { transactionService } from '../services/transaction-service.js';
import { authService } from '../services/auth-service.js';
import { openTransactionModal } from '../components/transaction-form.js';
import { voiceAssistant } from '../components/microphone.js';
import { formatINR } from '../utils/currency.js';
import { formatDateTime } from '../utils/date.js';
import { showToast } from '../utils/toast.js';

export async function renderCustomerLedgerPage(container, customerId) {
  const shop = authService.getCachedShop();
  const shopId = shop?.id;
  const profile = authService.getCachedProfile();

  container.innerHTML = `
    <!-- Top Nav Back -->
    <div style="margin-bottom: 1rem;">
      <a href="#/customers" class="btn btn-secondary btn-sm">
        ← Back to Customers
      </a>
    </div>

    <!-- Ledger Content Container -->
    <div id="customer-ledger-container">
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <span class="spinner spinner-dark"></span>
        <p style="margin-top: 0.5rem;">Loading customer ledger...</p>
      </div>
    </div>
  `;

  await loadLedger(container, customerId, shopId, profile);
}

/**
 * Fetch and render the full customer ledger
 */
async function loadLedger(container, customerId, shopId, profile) {
  const ledgerContainer = container.querySelector('#customer-ledger-container');
  if (!ledgerContainer || !shopId) return;

  try {
    const data = await transactionService.getCustomerLedger(customerId, shopId);

    if (!data || !data.customer) {
      ledgerContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem 1rem; color: var(--credit-color);">
          <h3>Customer Not Found</h3>
          <p style="margin-top: 0.5rem; color: var(--text-muted);">The requested customer account was not found in your shop ledger.</p>
          <a href="#/customers" class="btn btn-secondary" style="margin-top: 1rem;">Return to Customers</a>
        </div>
      `;
      return;
    }

    const { customer, totalCredit, totalPayment, currentBalance, transactions } = data;
    const isOwed = currentBalance > 0;
    const isSettled = currentBalance === 0;
    const balanceFormatted = formatINR(Math.abs(currentBalance));
    const initial = (customer.customer_name || 'C').charAt(0).toUpperCase();

    ledgerContainer.innerHTML = `
      <!-- Customer Profile & Action Banner -->
      <div class="card" style="margin-bottom: 1.5rem; padding: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.25rem;">
          <!-- Customer Meta -->
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="width: 56px; height: 56px; border-radius: var(--radius-full); background: ${isOwed ? 'var(--credit-bg)' : 'var(--primary-light)'}; color: ${isOwed ? 'var(--credit-color)' : 'var(--primary)'}; font-size: 1.5rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 2px solid ${isOwed ? 'var(--credit-border)' : 'var(--primary-border)'};">
              ${initial}
            </div>

            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <h1 style="font-size: 1.4rem; margin: 0;">${customer.customer_name}</h1>
                ${customer.is_archived ? '<span class="badge badge-neutral">Archived</span>' : ''}
              </div>

              <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.25rem; display: flex; gap: 1rem; flex-wrap: wrap;">
                ${customer.phone ? `<span>📞 <a href="tel:${customer.phone}" style="color: inherit; text-decoration: none; font-weight: 600;">${customer.phone}</a></span>` : ''}
                ${customer.address ? `<span>📍 ${customer.address}</span>` : ''}
              </div>
            </div>
          </div>

          <!-- Quick Actions on Ledger -->
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button id="ledger-add-credit-btn" class="btn btn-danger">
              <span>+ Give Credit (Udhar)</span>
            </button>
            <button id="ledger-add-payment-btn" class="btn btn-primary">
              <span>+ Record Payment (Jama)</span>
            </button>
            <button id="ledger-voice-btn" class="btn btn-secondary" title="Speak transaction for this customer">
              <span>🎙️ Voice Entry</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Financial Metrics Summary (Single Source of Truth) -->
      <div class="stats-grid" style="margin-bottom: 1.5rem;">
        <!-- Current Outstanding Balance -->
        <div class="stat-card ${isOwed ? 'stat-card-credit' : 'stat-card-payment'}">
          <div class="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">Current Balance</span>
            <span class="stat-value" style="color: ${isOwed ? 'var(--credit-color)' : (isSettled ? 'var(--text-muted)' : 'var(--payment-color)')};">
              ${isOwed ? `+ ${balanceFormatted}` : (isSettled ? '₹0.00' : `- ${balanceFormatted}`)}
            </span>
            <span style="font-size: 0.75rem; font-weight: 600; color: ${isOwed ? 'var(--credit-color)' : 'var(--payment-color)'};">
              ${isOwed ? 'Owed by customer (Udhar)' : (isSettled ? 'Account Settled' : 'Advance Paid')}
            </span>
          </div>
        </div>

        <!-- Total Credit Given -->
        <div class="stat-card stat-card-credit">
          <div class="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"></line>
              <polyline points="5 12 12 5 19 12"></polyline>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">Total Credit Given</span>
            <span class="stat-value" style="color: var(--credit-color);">${formatINR(totalCredit)}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Lifetime credit</span>
          </div>
        </div>

        <!-- Total Payments Received -->
        <div class="stat-card stat-card-payment">
          <div class="stat-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <polyline points="19 12 12 19 5 12"></polyline>
            </svg>
          </div>
          <div class="stat-info">
            <span class="stat-label">Total Payments Received</span>
            <span class="stat-value" style="color: var(--payment-color);">${formatINR(totalPayment)}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Lifetime payments</span>
          </div>
        </div>
      </div>

      <!-- Transaction Ledger History Table -->
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <div>
            <h3>Financial Ledger History</h3>
            <p style="font-size: 0.85rem; color: var(--text-muted);">
              Chronological record with real-time calculated running balance.
            </p>
          </div>
          <span class="badge badge-neutral">${transactions.length} Transactions</span>
        </div>

        ${transactions.length === 0 ? `
          <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📖</div>
            <h4>No transactions recorded for ${customer.customer_name}</h4>
            <p style="font-size: 0.875rem; margin-top: 0.25rem;">
              Click <strong>+ Give Credit</strong> or <strong>+ Record Payment</strong> to add the first entry.
            </p>
          </div>
        ` : `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Transaction Type</th>
                  <th>Items / Notes</th>
                  <th>Mode</th>
                  <th style="text-align: right;">Amount</th>
                  <th style="text-align: right;">Running Balance</th>
                  <th style="text-align: center;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${transactions.map(tx => {
                  const isCredit = tx.transaction_type === 'credit';
                  const isReversed = tx.is_reversed;
                  const amtFormatted = formatINR(tx.amount);
                  const runningFormatted = formatINR(tx.running_balance);
                  const isVoice = tx.entry_method === 'voice';

                  return `
                    <tr style="${isReversed ? 'opacity: 0.5; text-decoration: line-through;' : ''}">
                      <td style="white-space: nowrap; font-size: 0.85rem;">
                        ${formatDateTime(tx.created_at)}
                      </td>

                      <td>
                        <span class="badge ${isCredit ? 'badge-credit' : 'badge-payment'}">
                          ${isCredit ? '🔴 Credit (Udhar)' : '🟢 Payment (Jama)'}
                        </span>
                        ${isReversed ? '<span class="badge badge-neutral" style="margin-left: 0.25rem;">Reversed</span>' : ''}
                      </td>

                      <td style="font-size: 0.9rem; color: var(--text-secondary);">
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

                      <td style="text-align: right; font-weight: 700; color: var(--text-primary);">
                        ${runningFormatted}
                      </td>

                      <td style="text-align: center;">
                        ${!isReversed ? `
                          <button class="btn btn-secondary btn-sm reverse-tx-btn" data-id="${tx.id}" title="Reverse transaction" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; min-height: 28px;">
                            ↩️ Reversal
                          </button>
                        ` : `
                          <span style="font-size: 0.75rem; color: var(--text-muted);">Voided</span>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    // Attach Event Handlers:
    // Add Credit
    container.querySelector('#ledger-add-credit-btn').addEventListener('click', () => {
      openTransactionModal({
        shopId,
        defaultType: 'credit',
        defaultCustomerId: customerId,
        onSuccess: () => loadLedger(container, customerId, shopId, profile)
      });
    });

    // Add Payment
    container.querySelector('#ledger-add-payment-btn').addEventListener('click', () => {
      openTransactionModal({
        shopId,
        defaultType: 'payment',
        defaultCustomerId: customerId,
        onSuccess: () => loadLedger(container, customerId, shopId, profile)
      });
    });

    // Voice Entry for this customer
    container.querySelector('#ledger-voice-btn').addEventListener('click', () => {
      voiceAssistant.start({
        shopId,
        preferredLanguage: profile?.preferred_language || 'kn-IN',
        onSuccess: () => loadLedger(container, customerId, shopId, profile)
      });
    });

    // Reversal Handlers
    container.querySelectorAll('.reverse-tx-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const txId = btn.getAttribute('data-id');
        const confirmed = confirm(
          'Are you sure you want to reverse this transaction?\n\nAn auditable reversal entry will be created to maintain strict financial integrity.'
        );

        if (confirmed) {
          try {
            btn.disabled = true;
            btn.textContent = 'Reversing...';
            await transactionService.reverseTransaction(txId, shopId, 'Shopkeeper adjustment');
            showToast('Transaction reversed successfully!', 'info');
            loadLedger(container, customerId, shopId, profile);
          } catch (err) {
            console.error('Reversal error:', err);
            showToast('Failed to reverse transaction: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = '↩️ Reversal';
          }
        }
      });
    });

  } catch (err) {
    console.error('Error loading ledger:', err);
    ledgerContainer.innerHTML = `
      <div class="card" style="text-align: center; padding: 2rem; color: var(--credit-color);">
        <p>Failed to load customer ledger. Please check your Supabase connection.</p>
      </div>
    `;
  }
}
