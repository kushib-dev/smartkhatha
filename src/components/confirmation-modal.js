import { supabase } from '../services/supabase.js';
import { formatINR } from '../utils/currency.js';
import { formatDate } from '../utils/date.js';
import { showToast } from '../utils/toast.js';
import { ttsService } from '../services/tts-service.js';

export async function openConfirmationModal({
  shopId,
  customerName,
  transactionType,
  amount,
  notes = '',
  preferredLanguage = 'kn-IN',
  onSuccess,
  onCancel
}) {
  const modalRoot = document.getElementById('modal-root') || document.body;

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-backdrop';
  modalOverlay.id = 'voice-confirm-modal';

  const todayStr = formatDate(new Date());
  const isCredit = transactionType === 'credit';
  const typeDisplay = isCredit ? 'Credit (Udhar)' : 'Payment (Jama)';
  const badgeClass = isCredit ? 'badge-credit' : 'badge-payment';

  modalOverlay.innerHTML = `
    <div class="modal-content" style="max-width: 480px; border-top: 4px solid ${isCredit ? 'var(--credit-color)' : 'var(--payment-color)'};">
      <div class="modal-header">
        <div>
          <span class="badge ${badgeClass}" style="margin-bottom: 0.25rem;">
            ${isCredit ? '🔴 UDHARA (DEBT)' : '🟢 JAMA (PAYMENT)'}
          </span>
          <h3 style="margin-top: 0.25rem;">Confirm Transaction</h3>
        </div>
        <button type="button" id="voice-cancel-x" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.5rem; min-height: 28px;">✕</button>
      </div>

      <div class="modal-body">
        <div id="voice-confirm-alert" class="auth-alert auth-alert-error" style="display: none;"></div>

        <!-- Details Card -->
        <div style="background-color: #f8fafc; border: 1.5px dashed var(--border-color); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.75rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">CUSTOMER</span>
            <div id="customer-match-container" style="text-align: right;">
              <span class="spinner spinner-dark" style="width: 1rem; height: 1rem;"></span>
              <span style="font-size: 0.85rem; color: var(--text-muted);">Finding customer...</span>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.75rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">TRANSACTION</span>
            <strong style="color: ${isCredit ? 'var(--credit-color)' : 'var(--payment-color)'}; font-size: 1.05rem;">
              ${typeDisplay}
            </strong>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.75rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">AMOUNT</span>
            <div id="amount-container" style="display: flex; align-items: center; gap: 0.5rem;">
              <span id="amount-display" style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary);">
                ${formatINR(amount)}
              </span>
              <button type="button" id="edit-amount-btn" class="btn btn-secondary btn-sm" style="padding: 0.15rem 0.5rem; font-size: 0.75rem; min-height: 24px;">✏️ Edit</button>
            </div>
          </div>

          <div id="edit-amount-input-row" style="display: none; margin-bottom: 0.75rem;">
            <input type="number" id="manual-amount-edit" class="form-control" value="${amount}" step="0.01" min="0.01">
          </div>

          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">DATE</span>
            <span style="color: var(--text-secondary); font-size: 0.9rem;">${todayStr}</span>
          </div>

          ${notes ? `
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color); font-size: 0.85rem; color: var(--text-secondary);">
              <strong>Notes:</strong> ${notes}
            </div>
          ` : ''}
        </div>

        <p style="font-size: 0.825rem; color: var(--text-muted); text-align: center;">
          🔒 Financial records require shopkeeper confirmation before committing to Supabase.
        </p>
      </div>

      <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
        <button type="button" id="voice-cancel-btn" class="btn btn-secondary">
          Cancel
        </button>

        <button type="button" id="voice-confirm-btn" class="btn ${isCredit ? 'btn-danger' : 'btn-primary'}" disabled>
          <span>Confirm & Record</span>
        </button>
      </div>
    </div>
  `;

  modalRoot.appendChild(modalOverlay);

  const confirmBtn = modalOverlay.querySelector('#voice-confirm-btn');
  const cancelBtn = modalOverlay.querySelector('#voice-cancel-btn');
  const cancelX = modalOverlay.querySelector('#voice-cancel-x');
  const alertBox = modalOverlay.querySelector('#voice-confirm-alert');
  const customerContainer = modalOverlay.querySelector('#customer-match-container');
  const editAmountBtn = modalOverlay.querySelector('#edit-amount-btn');
  const editAmountRow = modalOverlay.querySelector('#edit-amount-input-row');
  const editAmountInput = modalOverlay.querySelector('#manual-amount-edit');
  const amountDisplay = modalOverlay.querySelector('#amount-display');

  let selectedCustomerId = null;
  let finalAmount = amount;

  // Toggle amount edit
  editAmountBtn.addEventListener('click', () => {
    if (editAmountRow.style.display === 'none') {
      editAmountRow.style.display = 'block';
      editAmountInput.focus();
    } else {
      const parsed = parseFloat(editAmountInput.value);
      if (!isNaN(parsed) && parsed > 0) {
        finalAmount = parsed;
        amountDisplay.textContent = formatINR(finalAmount);
        editAmountRow.style.display = 'none';
      }
    }
  });

  editAmountInput.addEventListener('input', () => {
    const parsed = parseFloat(editAmountInput.value);
    if (!isNaN(parsed) && parsed > 0) {
      finalAmount = parsed;
      amountDisplay.textContent = formatINR(finalAmount);
    }
  });

  // Close helper
  const closeModal = () => {
    if (modalOverlay.parentNode) {
      modalOverlay.parentNode.removeChild(modalOverlay);
    }
  };

  cancelBtn.addEventListener('click', () => {
    closeModal();
    if (onCancel) onCancel();
  });

  cancelX.addEventListener('click', () => {
    closeModal();
    if (onCancel) onCancel();
  });

  // Customer Matching Algorithm
  try {
    const rawSearch = customerName ? customerName.trim() : '';
    const searchParam = rawSearch.toLowerCase();
    
    // Transliteration mapping for Kannada <-> English common names
    const nameMap = {
      'ರಮೇಶ': 'ramesh', 'ರಮೇಶ್': 'ramesh', 'ramesh': 'ರಮೇಶ',
      'ಸುರೇಶ': 'suresh', 'ಸುರೇಶ್': 'suresh', 'suresh': 'ಸುರೇಶ',
      'ಕುಮಾರ': 'kumar', 'ಕುಮಾರ್': 'kumar', 'kumar': 'ಕುಮಾರ',
      'ಮಹೇಶ': 'mahesh', 'ಮಹೇಶ್': 'mahesh', 'mahesh': 'ಮಹೇಶ',
      'ಮಂಜು': 'manju', 'ಮಂಜುನಾಥ': 'manjunath', 'manju': 'ಮಂಜು', 'manjunath': 'ಮಂಜುನಾಥ',
      'ಗಣೇಶ': 'ganesh', 'ಗಣೇಶ್': 'ganesh', 'ganesh': 'ಗಣೇಶ',
      'ಪ್ರಿಯಾ': 'priya', 'ಪ್ರಿಯ': 'priya', 'priya': 'ಪ್ರಿಯಾ',
      'ರಾಜು': 'raju', 'raju': 'ರಾಜು',
      'ಮಲ್ಲು': 'mallu', 'mallu': 'ಮಲ್ಲು',
      'ಆನಂದ': 'anand', 'ಆನಂದ್': 'anand', 'anand': 'ಆನಂದ',
      'ಸಂತೋಷ': 'santosh', 'ಸಂತೋಷ್': 'santosh', 'santosh': 'ಸಂತೋಷ',
      'ರವೀ': 'ravi', 'ರವಿ': 'ravi', 'ravi': 'ರವಿ'
    };

    const altSearch = nameMap[searchParam] || '';

    const { data: matchedCustomers, error } = await supabase
      .from('customers')
      .select('id, customer_name, phone')
      .eq('shop_id', shopId)
      .eq('is_archived', false);

    if (error) throw error;

    const filtered = (matchedCustomers || []).filter(c => {
      const cName = c.customer_name.toLowerCase();
      return (
        cName.includes(searchParam) ||
        searchParam.includes(cName) ||
        (altSearch && (cName.includes(altSearch) || altSearch.includes(cName)))
      );
    });

    if (filtered.length === 1) {
      // Exact single match
      selectedCustomerId = filtered[0].id;
      customerContainer.innerHTML = `
        <strong style="font-size: 1.05rem; color: var(--text-primary);">${filtered[0].customer_name}</strong>
        ${filtered[0].phone ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${filtered[0].phone}</div>` : ''}
      `;
      confirmBtn.disabled = false;
    } else if (filtered.length > 1) {
      // Multiple matches: show dropdown to select
      customerContainer.innerHTML = `
        <select id="multi-customer-select" class="form-control" style="font-size: 0.85rem; padding: 0.35rem 0.5rem; min-height: 32px;">
          <option value="">-- Choose matching customer --</option>
          ${filtered.map(c => `<option value="${c.id}">${c.customer_name} ${c.phone ? `(${c.phone})` : ''}</option>`).join('')}
        </select>
      `;
      const selectEl = customerContainer.querySelector('#multi-customer-select');
      selectEl.addEventListener('change', () => {
        selectedCustomerId = selectEl.value;
        confirmBtn.disabled = !selectedCustomerId;
      });
    } else {
      // No match found: allow creating customer or picking from list
      customerContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem;">
          <span style="color: var(--credit-color); font-size: 0.85rem;">"${customerName}" not found</span>
          <button type="button" id="create-new-cust-btn" class="btn btn-outline btn-sm" style="font-size: 0.75rem; padding: 0.2rem 0.6rem; min-height: 28px;">
            + Add "${customerName}" as New Customer
          </button>
        </div>
      `;

      const createBtn = customerContainer.querySelector('#create-new-cust-btn');
      createBtn.addEventListener('click', async () => {
        try {
          createBtn.disabled = true;
          createBtn.innerHTML = '<span class="spinner spinner-dark"></span> Adding...';

          const { data: newCust, error: newCustErr } = await supabase
            .from('customers')
            .insert({
              shop_id: shopId,
              customer_name: customerName
            })
            .select()
            .single();

          if (newCustErr) throw newCustErr;

          selectedCustomerId = newCust.id;
          customerContainer.innerHTML = `
            <strong style="color: var(--primary);">${newCust.customer_name}</strong>
            <span class="badge badge-neutral" style="font-size: 0.65rem;">New Customer</span>
          `;
          confirmBtn.disabled = false;
        } catch (cErr) {
          console.error('Error creating customer on the fly:', cErr);
          alertBox.textContent = `Could not create customer: ${cErr.message}`;
          alertBox.style.display = 'block';
          createBtn.disabled = false;
          createBtn.textContent = `+ Add "${customerName}" as New Customer`;
        }
      });
    }
  } catch (custErr) {
    console.error('Customer lookup error:', custErr);
    customerContainer.innerHTML = `<span style="color: var(--credit-color); font-size: 0.85rem;">Lookup error</span>`;
  }

  // Handle Confirm Click
  confirmBtn.addEventListener('click', async () => {
    if (!selectedCustomerId) {
      alertBox.textContent = 'Please select a customer first.';
      alertBox.style.display = 'block';
      return;
    }

    if (!finalAmount || finalAmount <= 0) {
      alertBox.textContent = 'Please enter a valid amount greater than zero.';
      alertBox.style.display = 'block';
      return;
    }

    try {
      // Prevent duplicate clicks
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner"></span> <span>Recording...</span>';

      const idempotencyKey = `voice-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const { data, error } = await supabase.rpc('record_transaction_atomic', {
        p_customer_id: selectedCustomerId,
        p_transaction_type: transactionType,
        p_amount: finalAmount,
        p_description: notes || 'Voice entry',
        p_entry_method: 'voice',
        p_idempotency_key: idempotencyKey
      });

      if (error) throw error;

      showToast(`Recorded: ${formatINR(finalAmount)} (${typeDisplay})`, 'success');
      closeModal();

      // Speak audio confirmation via Gnani Timbre / TTS
      const spokenText = preferredLanguage.startsWith('kn')
        ? `${customerName} ಅವರಿಗೆ ${finalAmount} ರೂಪಾಯಿ ${isCredit ? 'ಉದ್ಧಾರ' : 'ಜಮೆ'} ದಾಖಲಿಸಲಾಗಿದೆ.`
        : `${formatINR(finalAmount)} ${isCredit ? 'credit' : 'payment'} recorded for ${customerName}.`;

      ttsService.speak(spokenText, preferredLanguage);

      if (onSuccess) onSuccess(data);
    } catch (err) {
      console.error('Transaction confirmation error:', err);
      alertBox.textContent = err.message || 'Failed to record transaction. Please try again.';
      alertBox.style.display = 'block';
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = '<span>Confirm & Record</span>';
    }
  });
}

