/**
 * TOAST NOTIFICATION SYSTEM
 * Displays toast messages with auto-dismiss and smooth animations
 * Types: success (green), error (red neon), info (gold)
 */

/**
 * Initialize toast container (call once on page load)
 */
export function initializeToastContainer() {
  if (document.getElementById("toast-container")) return;

  const container = document.createElement("div");
  container.id = "toast-container";
  container.setAttribute("role", "region");
  container.setAttribute("aria-live", "polite");
  document.body.appendChild(container);
}

/**
 * Show a toast notification
 * @param {string} message - Toast message text
 * @param {string} type - Toast type: 'success' | 'error' | 'info'
 * @param {number} duration - Auto-dismiss duration in ms (default 3000)
 */
export function showToast(message, type = "info", duration = 3000) {
  const container =
    document.getElementById("toast-container") ||
    (() => {
      const c = document.createElement("div");
      c.id = "toast-container";
      document.body.appendChild(c);
      return c;
    })();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  // Sanitize message and set content
  toast.textContent = message;

  // Add icon based on type
  const iconMap = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  };

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = iconMap[type] || "ℹ";
  toast.insertBefore(icon, toast.firstChild);

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("toast-show");
  });

  // Auto-dismiss
  const timeoutId = setTimeout(() => {
    toast.classList.remove("toast-show");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);

  // Manual close on click
  toast.addEventListener("click", () => {
    clearTimeout(timeoutId);
    toast.classList.remove("toast-show");
    setTimeout(() => {
      toast.remove();
    }, 300);
  });

  return toast;
}

/**
 * Show success toast
 */
export function toastSuccess(message, duration = 3000) {
  return showToast(message, "success", duration);
}

/**
 * Show error toast
 */
export function toastError(message, duration = 5000) {
  return showToast(message, "error", duration);
}

/**
 * Show info toast
 */
export function toastInfo(message, duration = 3000) {
  return showToast(message, "info", duration);
}
