import Chart from 'chart.js/auto';
import { dashboardService } from '../services/dashboard-service.js';
import { openTransactionModal } from '../components/transaction-form.js';
import { openCustomerModal } from '../components/customer-modal.js';
import { voiceAssistant } from '../components/microphone.js';
import { formatINR } from '../utils/currency.js';
import { formatRelativeDate, formatDate } from '../utils/date.js';

let chartInstance = null;

export async function renderDashboardPage(container, { shop, profile }) {
  const shopId = shop?.id;
  const shopName = shop?.shop_name || 'My Kirana Store';
  const ownerName = profile?.full_name || 'Shopkeeper';
  const todayStr = formatDate(new Date());

  container.innerHTML = `
    <!-- Top Header -->
    <div class="dashboard-header">
      <div class="shop-welcome">
        <h1>Namaste, ${ownerName} 🙏</h1>
        <p><strong>${shopName}</strong> &bull; <span>${todayStr}</span></p>
      </div>

      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <button id="refresh-dashboard-btn" class="btn btn-secondary btn-sm" title="Refresh metrics">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- AI Voice Assistant Hero -->
    <div class="voice-hero-card">
      <div class="voice-hero-text">
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
          <span class="badge" style="background: rgba(255,255,255,0.2); color: #fff; border: none;">AI VOICE LEDGER</span>
          <span style="font-size: 0.8rem; color: #a7f3d0;">Kannada &bull; English &bull; Hindi</span>
        </div>
        <h2>Tap & Speak Transaction</h2>
        <p>
          Speak naturally: <em>"Ramesh ge 500 rupayi udhara kodi"</em> or <em>"Ramesh 200 rupayi kottidane"</em>
        </p>
      </div>

      <div class="voice-hero-action">
        <button id="dashboard-mic-btn" class="mic-btn-large" title="Click to speak">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="22"></line>
          </svg>
        </button>
      </div>
    </div>

    <!-- 4 Primary KPI Cards -->
    <div class="stats-grid">
      <!-- Total Customers -->
      <div class="stat-card stat-card-customers">
        <div class="stat-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-label">Total Customers</span>
          <span id="stat-total-customers" class="stat-value">...</span>
        </div>
      </div>

      <!-- Total Outstanding Balance -->
      <div class="stat-card stat-card-total">
        <div class="stat-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2"></rect>
            <line x1="2" y1="10" x2="22" y2="10"></line>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-label">Total Outstanding</span>
          <span id="stat-total-outstanding" class="stat-value">...</span>
        </div>
      </div>

      <!-- Today's Credit Given -->
      <div class="stat-card stat-card-credit">
        <div class="stat-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-label">Credit Given Today</span>
          <span id="stat-today-credit" class="stat-value">...</span>
        </div>
      </div>

      <!-- Today's Payments Received -->
      <div class="stat-card stat-card-payment">
        <div class="stat-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
        </div>
        <div class="stat-info">
          <span class="stat-label">Payments Received Today</span>
          <span id="stat-today-payments" class="stat-value">...</span>
        </div>
      </div>
    </div>

    <!-- Quick Action Bar & Fast Customer Search -->
    <div class="card" style="margin-bottom: 1.5rem; padding: 1rem 1.25rem;">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
        <!-- Fast Customer Search -->
        <div style="position: relative; flex: 1; min-width: 260px;">
          <input 
            type="text" 
            id="quick-customer-search-input" 
            class="form-control" 
            placeholder="🔍 Quick search customer by name or phone..."
            autocomplete="off"
          />
          <div id="quick-search-results" style="position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); z-index: 20; display: none; margin-top: 4px; max-height: 220px; overflow-y: auto;">
          </div>
        </div>

        <!-- Quick Manual Action Buttons -->
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button id="quick-credit-btn" class="btn btn-danger btn-sm">
            <span>+ Credit (Udhar)</span>
          </button>
          <button id="quick-payment-btn" class="btn btn-primary btn-sm">
            <span>+ Payment (Jama)</span>
          </button>
          <button type="button" id="quick-add-cust-btn" class="btn btn-secondary btn-sm">
            <span>+ New Customer</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 2-Column Section: Recent Transactions & Weekly Trend Chart -->
    <div class="dashboard-columns">
      <!-- Left Column: Recent Transactions Feed -->
      <div class="card">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
          <h3>Recent Transactions</h3>
          <a href="#/transactions" class="btn btn-outline btn-sm">View All</a>
        </div>

        <div id="recent-transactions-container">
          <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
            <span class="spinner spinner-dark"></span>
            <p style="margin-top: 0.5rem;">Loading recent ledger activity...</p>
          </div>
        </div>
      </div>

      <!-- Right Column: 7-Day Cashflow Chart -->
      <div class="card">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
          <h3>7-Day Cashflow Trend</h3>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Udhar vs Jama</span>
        </div>

        <div style="position: relative; height: 260px; width: 100%;">
          <canvas id="weekly-trend-chart"></canvas>
        </div>
      </div>
    </div>
  `;

  // Attach event handlers
  setupDashboardEvents(container, shopId, profile);

  // Load live data from Supabase
  await loadDashboardData(container, shopId);
}

/**
 * Load and display live dashboard data
 */
async function loadDashboardData(container, shopId) {
  if (!shopId) return;

  try {
    // 1. Load Summary KPI stats
    const summary = await dashboardService.getSummary(shopId);
    
    const totalCustEl = container.querySelector('#stat-total-customers');
    const totalOutEl = container.querySelector('#stat-total-outstanding');
    const todayCreditEl = container.querySelector('#stat-today-credit');
    const todayPayEl = container.querySelector('#stat-today-payments');

    if (totalCustEl) totalCustEl.textContent = summary.total_customers;
    if (totalOutEl) totalOutEl.textContent = formatINR(summary.total_outstanding);
    if (todayCreditEl) todayCreditEl.textContent = formatINR(summary.today_credit);
    if (todayPayEl) todayPayEl.textContent = formatINR(summary.today_payments);

    // 2. Load Recent Transactions
    const recentTxContainer = container.querySelector('#recent-transactions-container');
    const recentTxs = await dashboardService.getRecentTransactions(shopId, 6);

    if (!recentTxs || recentTxs.length === 0) {
      recentTxContainer.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📒</div>
          <h4>No transactions recorded yet</h4>
          <p style="font-size: 0.875rem; margin-top: 0.25rem;">
            Click <strong>+ Credit</strong> or speak to add your shop's first entry.
          </p>
        </div>
      `;
    } else {
      recentTxContainer.innerHTML = `
        <div class="customer-cards-list">
          ${recentTxs.map(tx => {
            const isCredit = tx.transaction_type === 'credit';
            const customerName = tx.customers?.customer_name || 'Customer';
            const customerId = tx.customer_id;
            const amountFormatted = formatINR(tx.amount);
            const relativeTime = formatRelativeDate(tx.created_at);
            const isVoice = tx.entry_method === 'voice';

            return `
              <div class="customer-row-card" onclick="window.location.hash='#/customers/${customerId}'">
                <div class="customer-meta">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <h4>${customerName}</h4>
                    <span class="badge ${isVoice ? 'badge-neutral' : ''}" style="font-size: 0.65rem;">
                      ${isVoice ? '🎙️ Voice' : '✍️ Manual'}
                    </span>
                  </div>
                  <p>${tx.description ? `${tx.description} &bull; ` : ''}${relativeTime}</p>
                </div>

                <div class="customer-balance-box">
                  <span class="badge ${isCredit ? 'badge-credit' : 'badge-payment'}">
                    ${isCredit ? `+ ${amountFormatted}` : `- ${amountFormatted}`}
                  </span>
                  <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">
                    ${isCredit ? 'Credit (Udhar)' : 'Payment (Jama)'}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // 3. Render 7-Day Trend Chart
    const trend = await dashboardService.getWeeklyTrend(shopId);
    renderTrendChart(container, trend);

  } catch (err) {
    console.error('Error loading dashboard live data:', err);
  }
}

/**
 * Render Chart.js Weekly Cashflow Chart
 */
function renderTrendChart(container, { labels, creditData, paymentData }) {
  const canvas = container.querySelector('#weekly-trend-chart');
  if (!canvas) return;

  if (chartInstance) {
    chartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels && labels.length > 0 ? labels : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        {
          label: 'Credit (Udhar)',
          data: creditData && creditData.length > 0 ? creditData : [0, 0, 0, 0, 0, 0, 0],
          backgroundColor: 'rgba(220, 38, 38, 0.75)',
          borderRadius: 4,
          maxBarThickness: 18
        },
        {
          label: 'Payment (Jama)',
          data: paymentData && paymentData.length > 0 ? paymentData : [0, 0, 0, 0, 0, 0, 0],
          backgroundColor: 'rgba(22, 163, 74, 0.75)',
          borderRadius: 4,
          maxBarThickness: 18
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            font: { size: 11, family: 'Inter, sans-serif' }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ${context.dataset.label}: ₹${Number(context.raw).toLocaleString('en-IN')}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(val) {
              return '₹' + val;
            },
            font: { size: 10 }
          }
        }
      }
    }
  });
}

/**
 * Setup interactive events (manual entry modals, quick search, refresh)
 */
function setupDashboardEvents(container, shopId, profile) {
  // Refresh button
  const refreshBtn = container.querySelector('#refresh-dashboard-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '<span class="spinner spinner-dark"></span> <span>Refreshing...</span>';
      await loadDashboardData(container, shopId);
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        <span>Refresh</span>
      `;
    });
  }

  // Quick Credit button
  const creditBtn = container.querySelector('#quick-credit-btn');
  if (creditBtn) {
    creditBtn.addEventListener('click', () => {
      openTransactionModal({
        shopId,
        defaultType: 'credit',
        onSuccess: () => loadDashboardData(container, shopId)
      });
    });
  }

  // Quick Payment button
  const paymentBtn = container.querySelector('#quick-payment-btn');
  if (paymentBtn) {
    paymentBtn.addEventListener('click', () => {
      openTransactionModal({
        shopId,
        defaultType: 'payment',
        onSuccess: () => loadDashboardData(container, shopId)
      });
    });
  }

  // Quick Add Customer button
  const addCustBtn = container.querySelector('#quick-add-cust-btn');
  if (addCustBtn) {
    addCustBtn.addEventListener('click', () => {
      openCustomerModal({
        shopId,
        onSuccess: () => loadDashboardData(container, shopId)
      });
    });
  }

  // Quick Customer Search
  const searchInput = container.querySelector('#quick-customer-search-input');
  const searchResults = container.querySelector('#quick-search-results');
  let debounceTimeout = null;

  if (searchInput && searchResults) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout);
      const query = e.target.value.trim();

      if (!query) {
        searchResults.style.display = 'none';
        searchResults.innerHTML = '';
        return;
      }

      debounceTimeout = setTimeout(async () => {
        const matches = await dashboardService.searchCustomers(shopId, query);
        if (matches.length === 0) {
          searchResults.innerHTML = `
            <div style="padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.85rem;">
              No matching customers found.
            </div>
          `;
        } else {
          searchResults.innerHTML = matches.map(c => `
            <div 
              class="quick-search-item" 
              style="padding: 0.65rem 1rem; border-bottom: 1px solid var(--border-color); cursor: pointer; display: flex; justify-content: space-between;"
              onclick="window.location.hash='#/customers/${c.id}'"
            >
              <strong>${c.customer_name}</strong>
              <span style="color: var(--text-muted); font-size: 0.85rem;">${c.phone || ''}</span>
            </div>
          `).join('');
        }
        searchResults.style.display = 'block';
      }, 250);
    });

    // Close search dropdown on click outside
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
      }
    });
  }

  // Large Microphone button - Launch SmartKhata AI Voice Assistant
  const micBtn = container.querySelector('#dashboard-mic-btn');
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      voiceAssistant.start({
        shopId,
        preferredLanguage: profile?.preferred_language || 'kn-IN',
        onSuccess: () => loadDashboardData(container, shopId)
      });
    });
  }
}
