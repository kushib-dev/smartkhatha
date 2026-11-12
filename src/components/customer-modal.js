import { customerService } from '../services/customer-service.js';
import { showToast } from '../utils/toast.js';

export function openCustomerModal({ shopId, customer = null, onSuccess }) {
  const isEdit = Boolean(customer?.id);
  const modalRoot = document.getElementById('modal-root') || document.body;

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-backdrop';
  modalOverlay.id = 'customer-modal-backdrop';

  modalOverlay.innerHTML = `
    <div class="modal-content" style="max-width: 480px;">
      <div class="modal-header">
        <h3>${isEdit ? 'Edit Customer Details' : 'Add New Customer'}</h3>
        <button type="button" id="close-cust-modal-btn" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.5rem; min-height: 28px;">✕</button>
      </div>

      <form id="customer-form">
        <div class="modal-body">
          <div id="cust-modal-alert" class="auth-alert auth-alert-error" style="display: none;"></div>
          <div id="duplicate-warning" class="auth-alert auth-alert-info" style="display: none; background-color: #fffbeb; border-color: #fde68a; color: #92400e;"></div>

          <div class="form-group">
            <label class="form-label" for="cust-name-input">Customer Full Name <span class="required">*</span></label>
            <input 
              type="text" 
              id="cust-name-input" 
              class="form-control" 
              placeholder="e.g. Ramesh Gowda" 
              value="${customer?.customer_name || ''}" 
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="cust-phone-input">Mobile Number (Optional)</label>
            <input 
              type="tel" 
              id="cust-phone-input" 
              class="form-control" 
              placeholder="e.g. 9876543210" 
              maxlength="10" 
              value="${customer?.phone || ''}"
            />
            <span class="form-help">Helps search customers and distinguish between similar names.</span>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="cust-address-input">Address / Landmark (Optional)</label>
            <input 
              type="text" 
              id="cust-address-input" 
              class="form-control" 
              placeholder="e.g. Near Ganapathi Temple, 2nd Cross" 
              value="${customer?.address || ''}"
            />
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" id="cancel-cust-btn" class="btn btn-secondary">Cancel</button>
          <button type="submit" id="save-cust-btn" class="btn btn-primary">
            <span>${isEdit ? 'Update Details' : 'Save Customer'}</span>
          </button>
        </div>
      </form>
    </div>
  `;

  modalRoot.appendChild(modalOverlay);

  const form = modalOverlay.querySelector('#customer-form');
  const alertBox = modalOverlay.querySelector('#cust-modal-alert');
  const dupWarning = modalOverlay.querySelector('#duplicate-warning');
  const nameInput = modalOverlay.querySelector('#cust-name-input');
  const phoneInput = modalOverlay.querySelector('#cust-phone-input');
  const saveBtn = modalOverlay.querySelector('#save-cust-btn');

  const closeModal = () => {
    if (modalOverlay.parentNode) {
      modalOverlay.parentNode.removeChild(modalOverlay);
    }
  };

  modalOverlay.querySelector('#close-cust-modal-btn').addEventListener('click', closeModal);
  modalOverlay.querySelector('#cancel-cust-btn').addEventListener('click', closeModal);

  // Debounced duplicate detection
  let debounceTimeout = null;
  const checkDuplicateName = () => {
    clearTimeout(debounceTimeout);
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();

    if (name.length < 3) {
      dupWarning.style.display = 'none';
      return;
    }

    debounceTimeout = setTimeout(async () => {
      const dup = await customerService.checkDuplicate(shopId, name, phone, customer?.id);
      if (dup) {
        if (dup.type === 'exact_name') {
          dupWarning.innerHTML = `⚠️ <strong>Duplicate alert:</strong> A customer named <strong>${dup.customer.customer_name}</strong> already exists in your shop.`;
          dupWarning.style.display = 'block';
        } else if (dup.type === 'exact_phone') {
          dupWarning.innerHTML = `⚠️ <strong>Mobile conflict:</strong> Phone <strong>${phone}</strong> is already registered to <strong>${dup.customer.customer_name}</strong>.`;
          dupWarning.style.display = 'block';
        } else if (dup.type === 'similar_name') {
          dupWarning.innerHTML = `ℹ️ <em>Note:</em> Similar customer <strong>"${dup.customer.customer_name}"</strong> found. Ensure they are distinct.`;
          dupWarning.style.display = 'block';
        }
      } else {
        dupWarning.style.display = 'none';
      }
    }, 350);
  };

  nameInput.addEventListener('input', checkDuplicateName);
  phoneInput.addEventListener('input', checkDuplicateName);

  // Submit Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.style.display = 'none';

    const customerName = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const address = modalOverlay.querySelector('#cust-address-input').value.trim();

    if (!customerName) {
      alertBox.textContent = 'Please enter a customer name.';
      alertBox.style.display = 'block';
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner"></span> <span>Saving...</span>';

      let result = null;
      if (isEdit) {
        result = await customerService.updateCustomer(customer.id, { customerName, phone, address });
        showToast(`Customer "${customerName}" updated!`, 'success');
      } else {
        result = await customerService.addCustomer(shopId, { customerName, phone, address });
        showToast(`Customer "${customerName}" added to ledger!`, 'success');
      }

      closeModal();
      if (onSuccess) onSuccess(result);
    } catch (err) {
      console.error('Save customer error:', err);
      alertBox.textContent = err.message || 'Failed to save customer.';
      alertBox.style.display = 'block';
      saveBtn.disabled = false;
      saveBtn.innerHTML = `<span>${isEdit ? 'Update Details' : 'Save Customer'}</span>`;
    }
  });
}

