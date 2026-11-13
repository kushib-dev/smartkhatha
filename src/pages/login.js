import { authService } from '../services/auth-service.js';
import { showToast } from '../utils/toast.js';

export function renderLoginPage(container) {
  const isConfigured = authService.isConfigured();

  container.innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-logo-badge">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
              <path d="M6 6h10"></path>
              <path d="M6 10h10"></path>
            </svg>
          </div>
          <h1 class="auth-title">SmartKhata AI</h1>
          <p class="auth-subtitle">Voice-Powered Digital Ledger for Kirana Stores</p>
        </div>

        <div class="auth-body">
          ${!isConfigured ? `
            <div class="auth-alert auth-alert-info">
              <div>
                <strong>Supabase Setup Needed</strong><br>
                Please add your <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code> to connect real authentication.
              </div>
            </div>
          ` : ''}

          <div id="login-error-alert" class="auth-alert auth-alert-error" style="display: none;"></div>

          <form id="login-form">
            <div class="form-group">
              <label class="form-label" for="login-email">Email Address <span class="required">*</span></label>
              <input 
                type="email" 
                id="login-email" 
                class="form-control" 
                placeholder="shopkeeper@example.com" 
                required 
                autocomplete="email"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="login-password">Password <span class="required">*</span></label>
              <input 
                type="password" 
                id="login-password" 
                class="form-control" 
                placeholder="••••••••" 
                required 
                autocomplete="current-password"
              />
            </div>

            <button type="submit" id="login-submit-btn" class="btn btn-primary btn-block btn-lg" style="margin-top: 1.25rem;">
              <span>Login to Shop</span>
            </button>
          </form>
        </div>

        <div class="auth-footer">
          Don't have a shop account? <a href="#/register">Register Your Shop</a>
        </div>
      </div>
    </div>
  `;

  const form = container.querySelector('#login-form');
  const errorAlert = container.querySelector('#login-error-alert');
  const submitBtn = container.querySelector('#login-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorAlert.style.display = 'none';

    const email = container.querySelector('#login-email').value.trim();
    const password = container.querySelector('#login-password').value;

    if (!email || !password) {
      errorAlert.textContent = 'Please enter both email and password.';
      errorAlert.style.display = 'block';
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> <span>Logging in...</span>';

      await authService.signIn({ email, password });
      showToast('Logged in successfully!', 'success');
      window.location.hash = '#/dashboard';
    } catch (err) {
      console.error('Login error:', err);
      let errorMsg = err.message || 'Login failed. Please check your credentials.';
      if (errorMsg.toLowerCase().includes('invalid login credentials') || errorMsg.toLowerCase().includes('invalid_grant')) {
        errorMsg = 'Incorrect email or password. Please verify your password and try again.';
      } else if (errorMsg.toLowerCase().includes('email not confirmed')) {
        errorMsg = 'Email address is not yet confirmed. Please verify your account or contact support.';
      }
      errorAlert.textContent = errorMsg;
      errorAlert.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Login to Shop</span>';
    }
  });
}

