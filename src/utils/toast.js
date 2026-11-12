/**
 * Clean Toast Notification Utility
 */

export function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const iconSpan = document.createElement('span');
  if (type === 'success') {
    iconSpan.innerHTML = '✓';
    iconSpan.style.color = 'var(--payment-color)';
    iconSpan.style.fontWeight = 'bold';
  } else if (type === 'error') {
    iconSpan.innerHTML = '✕';
    iconSpan.style.color = 'var(--credit-color)';
    iconSpan.style.fontWeight = 'bold';
  } else {
    iconSpan.innerHTML = 'ℹ';
    iconSpan.style.color = 'var(--primary)';
    iconSpan.style.fontWeight = 'bold';
  }

  const textSpan = document.createElement('span');
  textSpan.textContent = message;

  toast.appendChild(iconSpan);
  toast.appendChild(textSpan);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
}

