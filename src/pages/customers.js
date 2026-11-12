import { customerService } from '../services/customer-service.js';
import { authService } from '../services/auth-service.js';
import { openCustomerModal } from '../components/customer-modal.js';
import { formatINR } from '../utils/currency.js';
import { formatDate } from '../utils/date.js';
import { showToast } from '../utils/toast.js';

let activeFilter = 'all'; // 'all' | 'outstanding' | 'archived'
let activeSort = 'name';   // 'name' | 'balance_desc' | 'recent'
let currentSearch = '';

export async function renderCustomersPage(container) {
  const shop = authService.getCachedShop();
  const shopId = shop?.id;

  container.innerHTML = `
    <!-- Header -->
    <div class="section-header">
      <div>
        <h1>Customer Khata Accounts</h1>
        <p>Manage customer profiles, credit limits, and outstanding balances.</p>
      </div>

      <div>
        <button id="add-customer-top-btn" class="btn btn-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>+ Add Customer</span>
        </button>
      </div>
    </div>

    <!-- Search, Filter & Sort Controls -->
    <div class="card" style="margin-bottom: 1.5rem; padding: 1.25rem;">
      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; justify-content: space-between;">
        <!-- Search -->
        <div class="search-input-wrapper" style="flex: 1; min-width: 240px;">
          <span class="search-icon">🔍</span>
          <input 
            type="text" 
            id="customer-search-input" 
            class="form-control" 
            placeholder="Search by customer name or phone..." 
            value="${currentSearch}"
          />
        </div>

        <!-- Filter Chips -->
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn btn-sm ${activeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" data-filter="all">
            All Active
          </button>
          <button class="btn btn-sm ${activeFilter === 'outstanding' ? 'btn-danger' : 'btn-secondary'}" data-filter="outstanding">
            With Balance
          </button>
          <button class="btn btn-sm ${activeFilter === 'archived' ? 'btn-secondary' : 'btn-secondary'}" data-filter="archived" style="${activeFilter === 'archived' ? 'background: #475569; color: #fff;' : ''}">
            Archived
          </button>
        </div>

        <!-- Sort Select -->
        <div style="min-width: 170px;">
          <select id="customer-sort-select" class="form-control" style="min-height: 38px; font-size: 0.875rem;">
            <option value="name" ${activeSort === 'name' ? 'selected' : ''}>Sort: Name (A-Z)</option>
            <option value="balance_desc" ${activeSort === 'balance_desc' ? 'selected' : ''}>Sort: Highest Balance</option>
            <option value="recent" ${activeSort === 'recent' ? 'selected' : ''}>Sort: Recently Added</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Customers List Container -->
    <div id="customers-list-container">
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <span class="spinner spinner-dark"></span>
        <p style="margin-top: 0.5rem;">Loading customer ledger accounts...</p>
      </div>
    </div>
  `;

  // Attach Top Add Button
  container.querySelector('#add-customer-top-btn').addEventListener('click', () => {
    openCustomerModal({
      shopId,
      onSuccess: () => loadCustomers(container, shopId)
    });
  });

  // Attach Filter Chips
  const filterBtns = container.querySelectorAll('[data-filter]');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.getAttribute('data-filter');
      filterBtns.forEach(b => {
        b.className = 'btn btn-sm btn-secondary';
        b.style.background = '';
        b.style.color = '';
      });

      if (activeFilter === 'all') btn.className = 'btn btn-sm btn-primary';
      else if (activeFilter === 'outstanding') btn.className = 'btn btn-sm btn-danger';
      else if (activeFilter === 'archived') {
        btn.style.background = '#475569';
        btn.style.color = '#fff';
      }

      loadCustomers(container, shopId);
    });
  });

  // Attach Sort Dropdown
  const sortSelect = container.querySelector('#customer-sort-select');
  sortSelect.addEventListener('change', (e) => {
    activeSort = e.target.value;
    loadCustomers(container, shopId);
  });

  // Attach Search Input (Debounced)
  const searchInput = container.querySelector('#customer-search-input');
  let debounceTimeout = null;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    currentSearch = e.target.value;
    debounceTimeout = setTimeout(() => {
      loadCustomers(container, shopId);
    }, 250);
  });

  // Initial Data Load
  await loadCustomers(container, shopId);
}

/**
 * Load customers based on search, filter, and sort states
 */
async function loadCustomers(container, shopId) {
  const listContainer = container.querySelector('#customers-list-container');
  if (!listContainer || !shopId) return;

  try {
    const includeArchived = activeFilter === 'archived';
    let customers = await customerService.getCustomers(shopId, {
      includeArchived: true, // Fetch all and filter client-side for immediate reactivity
      searchQuery: currentSearch,
      sortBy: activeSort
    });

    // Apply Client Filter
    if (activeFilter === 'all') {
      customers = customers.filter(c => !c.is_archived);
    } else if (activeFilter === 'outstanding') {
      customers = customers.filter(c => !c.is_archived && c.balance > 0);
    } else if (activeFilter === 'archived') {
      customers = customers.filter(c => c.is_archived);
    }

    if (customers.length === 0) {
      listContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">👥</div>
          <h3>No customers found</h3>
          <p style="margin-top: 0.25rem; font-size: 0.9rem;">
            ${currentSearch ? `No customers matched "${currentSearch}"` : 'No customers exist under this filter.'}
          </p>
          <button id="empty-add-cust-btn" class="btn btn-outline" style="margin-top: 1rem;">
            <span>+ Add First Customer</span>
          </button>
        </div>
      `;

      const emptyAddBtn = listContainer.querySelector('#empty-add-cust-btn');
      if (emptyAddBtn) {
        emptyAddBtn.onclick = () => {
          openCustomerModal({
            shopId,
            onSuccess: () => loadCustomers(container, shopId)
          });
        };
      }
      return;
    }

    // Render Customer Cards List
    listContainer.innerHTML = `
      <div class="customer-cards-list">
        ${customers.map(c => {
          const balance = Number(c.balance) || 0;
          const isOwed = balance > 0;
          const isSettled = balance === 0;
          const balanceFormatted = formatINR(Math.abs(balance));
          const initial = (c.customer_name || 'C').charAt(0).toUpperCase();

          return `
            <div class="card" style="padding: 1.25rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
              <!-- Customer Avatar & Info -->
              <div style="display: flex; align-items: center; gap: 1rem; min-width: 220px;">
                <div style="width: 48px; height: 48px; border-radius: var(--radius-full); background: ${isOwed ? 'var(--credit-bg)' : 'var(--primary-light)'}; color: ${isOwed ? 'var(--credit-color)' : 'var(--primary)'}; font-size: 1.25rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1.5px solid ${isOwed ? 'var(--credit-border)' : 'var(--primary-border)'};">
                  ${initial}
                </div>

                <div>
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <a href="#/customers/${c.id}" style="color: var(--text-primary); text-decoration: none; font-weight: 700; font-size: 1.1rem;">
                      ${c.customer_name}
                    </a>
                    ${c.is_archived ? '<span class="badge badge-neutral" style="font-size: 0.65rem;">Archived</span>' : ''}
                  </div>

                  <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.15rem; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                    ${c.phone ? `<span>📞 ${c.phone}</span>` : ''}
                    ${c.address ? `<span>📍 ${c.address}</span>` : ''}
                    <span>🗓️ Since ${formatDate(c.created_at)}</span>
                  </div>
                </div>
              </div>

              <!-- Balance & Action Buttons -->
              <div style="display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap;">
                <!-- Balance Box -->
                <div style="text-align: right; min-width: 140px;">
                  <div style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">
                    Outstanding Balance
                  </div>
                  <div style="font-size: 1.35rem; font-weight: 800; color: ${isOwed ? 'var(--credit-color)' : (isSettled ? 'var(--text-muted)' : 'var(--payment-color)')};">
                    ${isOwed ? `+ ${balanceFormatted}` : (isSettled ? '₹0.00' : `- ${balanceFormatted}`)}
                  </div>
                  <div style="font-size: 0.75rem; color: ${isOwed ? 'var(--credit-color)' : 'var(--text-muted)'}; font-weight: 600;">
                    ${isOwed ? 'Credit Owed (Udhar)' : (isSettled ? 'Settled' : 'Advance Paid')}
                  </div>
                </div>

                <!-- Action Buttons -->
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                  <a href="#/customers/${c.id}" class="btn btn-outline btn-sm" title="View customer credit ledger">
                    <span>View Ledger</span>
                  </a>

                  <button class="btn btn-secondary btn-sm edit-cust-btn" data-id="${c.id}" title="Edit customer">
                    ✏️
                  </button>

                  ${c.is_archived ? `
                    <button class="btn btn-secondary btn-sm restore-cust-btn" data-id="${c.id}" data-name="${c.customer_name}" title="Restore customer">
                      ↩️
                    </button>
                  ` : `
                    <button class="btn btn-secondary btn-sm archive-cust-btn" data-id="${c.id}" data-name="${c.customer_name}" title="Archive customer">
                      📁
                    </button>
                  `}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Attach Edit Handlers
    listContainer.querySelectorAll('.edit-cust-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const custId = btn.getAttribute('data-id');
        const target = customers.find(c => c.id === custId);
        if (target) {
          openCustomerModal({
            shopId,
            customer: target,
            onSuccess: () => loadCustomers(container, shopId)
          });
        }
      });
    });

    // Attach Archive Handlers (Soft Delete)
    listContainer.querySelectorAll('.archive-cust-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const custId = btn.getAttribute('data-id');
        const custName = btn.getAttribute('data-name');
        
        const confirmed = confirm(
          `Archive customer "${custName}"?\n\nThis customer will be hidden from the active list, but all credit and payment transaction history will remain safely preserved for your accounts.`
        );

        if (confirmed) {
          try {
            await customerService.archiveCustomer(custId);
            showToast(`Customer "${custName}" archived`, 'info');
            loadCustomers(container, shopId);
          } catch (err) {
            console.error('Archive error:', err);
            showToast('Failed to archive customer: ' + err.message, 'error');
          }
        }
      });
    });

    // Attach Restore Handlers
    listContainer.querySelectorAll('.restore-cust-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const custId = btn.getAttribute('data-id');
        const custName = btn.getAttribute('data-name');

        try {
          await customerService.unarchiveCustomer(custId);
          showToast(`Customer "${custName}" restored to active list!`, 'success');
          loadCustomers(container, shopId);
        } catch (err) {
          console.error('Restore error:', err);
          showToast('Failed to restore customer', 'error');
        }
      });
    });

  } catch (err) {
    console.error('Load customers error:', err);
    listContainer.innerHTML = `
      <div class="card" style="text-align: center; padding: 2rem; color: var(--credit-color);">
        <p>Failed to load customer list. Please check your Supabase connection.</p>
      </div>
    `;
  }
}
