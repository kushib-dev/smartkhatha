import { supabase } from '../services/supabase.js';
import { authService } from '../services/auth-service.js';
import { openCustomerModal } from './customer-modal.js';
import { showToast } from '../utils/toast.js';

export function openTransactionModal({ shopId, defaultType = 'credit', defaultCustomerId = null, onSuccess }) {
  const effectiveShopId = shopId || authService.getCachedShop()?.id;
  const modalRoot = document.getElementById('modal-root') || document.body;

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-backdrop';
  modalOverlay.id = 'transaction-modal-backdrop';

  modalOverlay.innerHTML = `
    <div class="modal-content" style="max-width: 480px;">
      <div class="modal-header">
        <h3 id="tx-modal-title">Record Transaction</h3>
        <button type="button" id="close-modal-btn" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.5rem; min-height: 28px;">✕</button>
      </div>

      <form id="manual-tx-form">
        <div class="modal-body">
          <div id="tx-modal-alert" class="auth-alert auth-alert-error" style="display: none;"></div>

          <!-- Transaction Type Toggle -->
          <div class="form-group">
            <label class="form-label">Transaction Type <span class="required">*</span></label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
              <label class="btn ${defaultType === 'credit' ? 'btn-danger' : 'btn-secondary'}" id="btn-type-credit" style="cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                <input type="radio" name="tx_type" value="credit" ${defaultType === 'credit' ? 'checked' : ''} style="display: none;">
                <span>🔴 Credit (Udhar)</span>
              </label>
              <label class="btn ${defaultType === 'payment' ? 'btn-primary' : 'btn-secondary'}" id="btn-type-payment" style="cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                <input type="radio" name="tx_type" value="payment" ${defaultType === 'payment' ? 'checked' : ''} style="display: none;">
                <span>🟢 Payment (Jama)</span>
              </label>
            </div>
            <span class="form-help" id="type-help-text">Credit increases customer's outstanding balance.</span>
          </div>

          <!-- Customer Selection -->
          <div class="form-group">
            <label class="form-label" for="tx-customer-select">Select Customer <span class="required">*</span></label>
            <select id="tx-customer-select" class="form-control" required>
              <option value="">Loading customer list...</option>
            </select>
          </div>

          <!-- Amount -->
          <div class="form-group">
            <label class="form-label" for="tx-amount">Amount (₹) <span class="required">*</span></label>
            <input 
              type="number" 
              id="tx-amount" 
              class="form-control" 
              placeholder="e.g. 500" 
              step="0.01" 
              min="0.01" 
              required
              style="font-size: 1.25rem; font-weight: 700;"
            />
          </div>

          <!-- Description -->
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="tx-description">Item Details / Notes (Optional)</label>
            <input 
              type="text" 
              id="tx-description" 
              class="form-control" 
              placeholder="e.g. 5kg Atta, 2L Oil" 
            />
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" id="cancel-tx-btn" class="btn btn-secondary">Cancel</button>
          <button type="submit" id="save-tx-btn" class="btn btn-primary">
            <span>Save Transaction</span>
          </button>
        </div>
      </form>
    </div>
  `;

  modalRoot.appendChild(modalOverlay);

  const form = modalOverlay.querySelector('#manual-tx-form');
  const alertBox = modalOverlay.querySelector('#tx-modal-alert');
  const customerSelect = modalOverlay.querySelector('#tx-customer-select');
  const btnCredit = modalOverlay.querySelector('#btn-type-credit');
  const btnPayment = modalOverlay.querySelector('#btn-type-payment');
  const typeHelpText = modalOverlay.querySelector('#type-help-text');
  const saveBtn = modalOverlay.querySelector('#save-tx-btn');

  // Toggle Type buttons visually
  btnCredit.addEventListener('click', () => {
    btnCredit.className = 'btn btn-danger';
    btnPayment.className = 'btn btn-secondary';
    btnCredit.querySelector('input').checked = true;
    typeHelpText.textContent = "Credit increases customer's outstanding balance (Udhar).";
  });

  btnPayment.addEventListener('click', () => {
    btnPayment.className = 'btn btn-primary';
    btnCredit.className = 'btn btn-secondary';
    btnPayment.querySelector('input').checked = true;
    typeHelpText.textContent = "Payment decreases customer's outstanding balance (Jama).";
  });

  // Fetch active customers for this shop
  (async () => {
    try {
      const { data: customers, error } = await supabase
        .from('customers')
        .select('id, customer_name, phone')
        .eq('shop_id', effectiveShopId)
        .eq('is_archived', false)
        .order('customer_name', { ascending: true });

      if (error) throw error;

      if (!customers || customers.length === 0) {
        customerSelect.innerHTML = '<option value="">No customers found. Please add a customer first.</option>';
        saveBtn.disabled = true;

        const custGroup = customerSelect.closest('.form-group');
        let helper = custGroup?.querySelector('#no-cust-helper');
        if (!helper && custGroup) {
          helper = document.createElement('div');
          helper.id = 'no-cust-helper';
          helper.style.marginTop = '0.5rem';
          helper.innerHTML = `
            <button type="button" id="tx-quick-create-cust-btn" class="btn btn-secondary btn-sm" style="width: 100%; justify-content: center;">
              <span>+ Add Customer Now</span>
            </button>
          `;
          custGroup.appendChild(helper);
          helper.querySelector('#tx-quick-create-cust-btn').onclick = () => {
            closeModal();
            openCustomerModal({
              shopId: effectiveShopId,
              onSuccess: (newCust) => {
                openTransactionModal({
                  shopId: effectiveShopId,
                  defaultType,
                  defaultCustomerId: newCust?.id,
                  onSuccess
                });
              }
            });
          };
        }
        return;
      }

      customerSelect.innerHTML = '<option value="">-- Choose Customer --</option>' +
        customers.map(c => `
          <option value="${c.id}" ${defaultCustomerId === c.id ? 'selected' : ''}>
            ${c.customer_name} ${c.phone ? `(${c.phone})` : ''}
          </option>
        `).join('');
    } catch (err) {
      console.error('Error loading customers for modal:', err);
      customerSelect.innerHTML = '<option value="">Failed to load customers</option>';
    }
  })();

  const closeModal = () => {
    if (modalOverlay.parentNode) {
      modalOverlay.parentNode.removeChild(modalOverlay);
    }
  };

  modalOverlay.querySelector('#close-modal-btn').addEventListener('click', closeModal);
  modalOverlay.querySelector('#cancel-tx-btn').addEventListener('click', closeModal);

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.style.display = 'none';

    const selectedType = modalOverlay.querySelector('input[name="tx_type"]:checked')?.value || 'credit';
    const customerId = customerSelect.value;
    const amount = parseFloat(modalOverlay.querySelector('#tx-amount').value);
    const description = modalOverlay.querySelector('#tx-description').value.trim();

    if (!customerId) {
      alertBox.textContent = 'Please select a customer.';
      alertBox.style.display = 'block';
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      alertBox.textContent = 'Amount must be greater than zero.';
      alertBox.style.display = 'block';
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner"></span> <span>Saving...</span>';

      // Generate idempotency key
      const idempotencyKey = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Execute atomic RPC
      const { data, error } = await supabase.rpc('record_transaction_atomic', {
        p_customer_id: customerId,
        p_transaction_type: selectedType,
        p_amount: amount,
        p_description: description || null,
        p_entry_method: 'manual',
        p_idempotency_key: idempotencyKey
      });

      if (error) throw error;

      showToast(`Transaction saved! ₹${amount} (${selectedType.toUpperCase()})`, 'success');
      closeModal();
      if (typeof onSuccess === 'function') {
        onSuccess(data);
      }
    } catch (err) {
      console.error('Save transaction error:', err);
      alertBox.textContent = err.message || 'Failed to record transaction. Please check your connection.';
      alertBox.style.display = 'block';
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>Save Transaction</span>';
    }
  });
}

