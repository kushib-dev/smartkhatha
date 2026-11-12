import { authService } from '../services/auth-service.js';
import { showToast } from '../utils/toast.js';

export function renderNavbar(shop, profile) {
  const shopName = shop?.shop_name || 'My Kirana Shop';
  const ownerName = profile?.full_name || 'Shopkeeper';
  const lang = profile?.preferred_language || 'kn-IN';

  const langNames = {
    'kn-IN': 'ಕನ್ನಡ',
    'en-IN': 'English',
    'hi-IN': 'हिन्दी',
    'ta-IN': 'தமிழ்',
    'te-IN': 'తెలుగు'
  };

  return `
    <header class="navbar">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <a href="#/dashboard" class="nav-brand">
          <div class="nav-logo-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path>
              <path d="M6 6h10"></path>
              <path d="M6 10h10"></path>
            </svg>
          </div>
          <span>SmartKhata</span>
        </a>

        <div class="nav-shop-pill" title="${shopName}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
          <span>${shopName}</span>
        </div>
      </div>

      <div class="nav-user-actions">
        <span class="badge badge-neutral" title="Voice Language">
          🌐 ${langNames[lang] || 'kn-IN'}
        </span>

        <button id="logout-btn" class="btn btn-secondary btn-sm" title="Logout">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span class="desktop-only">Logout</span>
        </button>
      </div>
    </header>
  `;
}

export function attachNavbarEvents() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await authService.signOut();
        showToast('Logged out successfully', 'info');
        window.location.hash = '#/login';
      } catch (err) {
        console.error('Logout error:', err);
      }
    });
  }
}

