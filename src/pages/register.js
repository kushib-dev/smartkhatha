import { authService } from '../services/auth-service.js';
import { showToast } from '../utils/toast.js';
import { isValidEmail } from '../utils/validation.js';

export function renderRegisterPage(container) {
  const isConfigured = authService.isConfigured();

  container.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card" style="max-width: 520px;">
        <div class="auth-header">
          <div class="auth-logo-badge">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </div>
          <h1 class="auth-title">Register Your Shop</h1>
          <p class="auth-subtitle">Create your digital khata ledger in less than 2 minutes</p>
        </div>

        <div class="auth-body">
          ${!isConfigured ? `
            <div class="auth-alert auth-alert-info">
              <div>
                <strong>Supabase Setup Needed</strong><br>
                Please ensure Supabase credentials in <code>.env</code> are populated and migration SQL has been executed in the Supabase SQL Editor.
              </div>
            </div>
          ` : ''}

          <div id="register-error-alert" class="auth-alert auth-alert-error" style="display: none;"></div>

          <form id="register-form">
            <!-- Shop Details -->
            <div class="form-group">
              <label class="form-label" for="reg-shop-name">Shop Name <span class="required">*</span></label>
              <input 
                type="text" 
                id="reg-shop-name" 
                class="form-control" 
                placeholder="e.g. Sri Venkateshwara Stores" 
                required 
              />
            </div>

            <div class="form-grid-2">
              <div class="form-group">
                <label class="form-label" for="reg-owner-name">Shopkeeper Name <span class="required">*</span></label>
                <input 
                  type="text" 
                  id="reg-owner-name" 
                  class="form-control" 
                  placeholder="e.g. Suresh Kumar" 
                  required 
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="reg-phone">Mobile Number</label>
                <input 
                  type="tel" 
                  id="reg-phone" 
                  class="form-control" 
                  placeholder="e.g. 9876543210" 
                  maxlength="10"
                />
              </div>
            </div>

            <!-- Credentials -->
            <div class="form-grid-2">
              <div class="form-group">
                <label class="form-label" for="reg-email">Email Address <span class="required">*</span></label>
                <input 
                  type="email" 
                  id="reg-email" 
                  class="form-control" 
                  placeholder="owner@example.com" 
                  required 
                  autocomplete="email"
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="reg-password">Password <span class="required">*</span></label>
                <input 
                  type="password" 
                  id="reg-password" 
                  class="form-control" 
                  placeholder="At least 6 characters" 
                  minlength="6"
                  required 
                  autocomplete="new-password"
                />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-address">Shop Address / Landmark</label>
              <input 
                type="text" 
                id="reg-address" 
                class="form-control" 
                placeholder="e.g. Main Road, Gandhi Circle, Tumakuru" 
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="reg-language">Preferred Voice Language <span class="required">*</span></label>
              <select id="reg-language" class="form-control" required>
                <option value="kn-IN" selected>ಕನ್ನಡ (Kannada)</option>
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">हिन्दी (Hindi)</option>
                <option value="ta-IN">தமிழ் (Tamil)</option>
                <option value="te-IN">తెలుగు (Telugu)</option>
              </select>
              <span class="form-help">SmartKhata AI voice assistant will respond in this language.</span>
            </div>

            <button type="submit" id="register-submit-btn" class="btn btn-primary btn-block btn-lg" style="margin-top: 1rem;">
              <span>Create Shop Ledger</span>
            </button>
          </form>
        </div>

        <div class="auth-footer">
          Already registered? <a href="#/login">Login to your Shop</a>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector('#register-form');
  const errorAlert = container.querySelector('#register-error-alert');
  const submitBtn = container.querySelector('#register-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorAlert.style.display = 'none';

    const shopName = container.querySelector('#reg-shop-name').value.trim();
    const fullName = container.querySelector('#reg-owner-name').value.trim();
    const phone = container.querySelector('#reg-phone').value.trim();
    const email = container.querySelector('#reg-email').value.trim();
    const password = container.querySelector('#reg-password').value;
    const address = container.querySelector('#reg-address').value.trim();
    const preferredLanguage = container.querySelector('#reg-language').value;

    if (!shopName || !fullName || !email || !password) {
      errorAlert.textContent = 'Please fill in all required fields marked with *';
      errorAlert.style.display = 'block';
      return;
    }

    if (!isValidEmail(email)) {
      errorAlert.textContent = 'Please enter a valid email address.';
      errorAlert.style.display = 'block';
      return;
    }

    if (password.length < 6) {
      errorAlert.textContent = 'Password must be at least 6 characters.';
      errorAlert.style.display = 'block';
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> <span>Registering Shop...</span>';

      await authService.signUp({
        email,
        password,
        fullName,
        phone,
        shopName,
        address,
        preferredLanguage
      });

      showToast('Shop registered successfully!', 'success');
      window.location.hash = '#/dashboard';
    } catch (err) {
      console.error('Registration error:', err);
      errorAlert.textContent = err.message || 'Registration failed. Please try again.';
      errorAlert.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Create Shop Ledger</span>';
    }
  });
}

