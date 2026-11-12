import { authService } from './services/auth-service.js';
import { renderLoginPage } from './pages/login.js';
import { renderRegisterPage } from './pages/register.js';
import { renderNavbar, attachNavbarEvents } from './components/navbar.js';
import { renderSidebar } from './components/sidebar.js';
import { voiceAssistant } from './components/microphone.js';

// Route dispatcher
async function handleRoute() {
  const app = document.getElementById('app');
  if (!app) return;

  const hash = window.location.hash || '#/dashboard';
  const isAuthRoute = hash === '#/login' || hash === '#/register';

  // Check auth session
  let sessionData = null;
  try {
    sessionData = await authService.getSession();
  } catch (err) {
    console.error('Session retrieval error:', err);
  }

  const isAuthenticated = Boolean(sessionData?.user && sessionData?.shop);

  // Protected route redirects
  if (!isAuthenticated && !isAuthRoute) {
    window.location.hash = '#/login';
    return;
  }

  // Already logged in redirect
  if (isAuthenticated && isAuthRoute) {
    window.location.hash = '#/dashboard';
    return;
  }

  // Render Auth Pages
  if (hash === '#/login') {
    renderLoginPage(app);
    return;
  }

  if (hash === '#/register') {
    renderRegisterPage(app);
    return;
  }

  // Render Authenticated Shell Layout
  const shop = sessionData?.shop;
  const profile = sessionData?.profile;

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar(hash)}
      <div class="main-content">
        ${renderNavbar(shop, profile)}
        <div id="page-content" class="page-container">
          <!-- Page content injected dynamically -->
        </div>
      </div>
    </div>
  `;

  attachNavbarEvents();

  // Mobile Bottom Navigation Microphone Trigger
  const mobileVoiceBtn = document.getElementById('mobile-voice-trigger-btn');
  if (mobileVoiceBtn) {
    mobileVoiceBtn.onclick = () => {
      voiceAssistant.start({
        shopId: shop?.id,
        preferredLanguage: profile?.preferred_language || 'kn-IN',
        onSuccess: () => {
          if (window.location.hash === '#/dashboard' || window.location.hash === '' || window.location.hash === '#/') {
            handleRoute();
          }
        }
      });
    };
  }

  const pageContent = document.getElementById('page-content');

  // Route switching for authenticated modules
  if (hash === '#/dashboard' || hash === '#/') {
    // Dynamic import dashboard or render placeholder until Module 2
    try {
      const { renderDashboardPage } = await import('./pages/dashboard.js');
      renderDashboardPage(pageContent, { shop, profile });
    } catch {
      renderModulePlaceholder(pageContent, 'Dashboard', 'Module 1 (Authentication & Shop Registration) is active.');
    }
  } else if (hash.startsWith('#/customers/')) {
    const customerId = hash.replace('#/customers/', '');
    try {
      const { renderCustomerLedgerPage } = await import('./pages/customer-ledger.js');
      renderCustomerLedgerPage(pageContent, customerId);
    } catch {
      renderModulePlaceholder(pageContent, 'Customer Ledger', `Viewing Customer ID: ${customerId}`);
    }
  } else if (hash === '#/customers') {
    try {
      const { renderCustomersPage } = await import('./pages/customers.js');
      renderCustomersPage(pageContent);
    } catch {
      renderModulePlaceholder(pageContent, 'Customers', 'Customer Management Module');
    }
  } else if (hash === '#/transactions') {
    try {
      const { renderTransactionsPage } = await import('./pages/transactions.js');
      renderTransactionsPage(pageContent);
    } catch {
      renderModulePlaceholder(pageContent, 'Transactions', 'Transaction Management Module');
    }
  } else {
    window.location.hash = '#/dashboard';
  }
}

function renderModulePlaceholder(container, title, subtitle) {
  container.innerHTML = `
    <div class="card" style="text-align: center; padding: 3rem 1.5rem;">
      <h2 style="margin-bottom: 0.5rem;">${title}</h2>
      <p style="margin-bottom: 1.5rem;">${subtitle}</p>
      <div class="badge badge-neutral">Ready for next module implementation</div>
    </div>
  `;
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  handleRoute();
});

window.addEventListener('hashchange', () => {
  handleRoute();
});

// React to auth state changes from Supabase
authService.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
    handleRoute();
  }
});

