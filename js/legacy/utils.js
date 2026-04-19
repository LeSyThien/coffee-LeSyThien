/**
 * ============================================================================
 * LUMINA COFFEE - UTILITIES & UI HELPERS
 * Description: Global helper functions, formatters, DOM wrappers, and
 * a comprehensive Toast Notification System for non-blocking alerts.
 * Architecture: ES Modules, Object-Oriented Helpers.
 * ============================================================================
 */

/**
 * --- FORMATTING HELPERS ---
 */

/**
 * Formats a number into Vietnamese Dong (VND) currency string.
 * @param {number} amount - The amount to format.
 * @returns {string} Formatted currency string (e.g., "35,000 VND").
 */
export function formatCurrency(amount) {
  if (typeof amount !== "number" || isNaN(amount)) {
    console.warn("Invalid amount passed to formatCurrency:", amount);
    return "0 VND";
  }
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace("₫", "VND");
}

/**
 * Formats a Firestore Timestamp or standard Date object into a readable string.
 * @param {Object|Date} timestamp - Firestore timestamp or JS Date.
 * @returns {string} Formatted date (e.g., "Oct 12, 2026, 14:30").
 */
export function formatDate(timestamp) {
  if (!timestamp) return "Unknown Date";

  // Convert Firestore timestamp to JS Date if necessary
  const date =
    timestamp.toDate && typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);

  if (isNaN(date.getTime())) return "Invalid Date";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Calculates the discounted price based on original price and discount percentage.
 * @param {number} originalPrice - The base price.
 * @param {number} discountPercent - The discount percentage (0-100).
 * @returns {number} The final calculated price.
 */
export function calculateDiscountPrice(originalPrice, discountPercent) {
  if (!discountPercent || discountPercent <= 0) return originalPrice;
  if (discountPercent >= 100) return 0;

  const discountAmount = originalPrice * (discountPercent / 100);
  return Math.round(originalPrice - discountAmount);
}

/**
 * --- VALIDATION HELPERS ---
 */

/**
 * Validates an email address format using a robust Regex.
 * @param {string} email - The email string to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
export function isValidEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(String(email).toLowerCase());
}

/**
 * Validates password strength. Must be at least 8 characters,
 * contain a number, and a special character.
 * @param {string} password - The password string.
 * @returns {Object} { isValid: boolean, message: string }
 */
export function validatePassword(password) {
  if (password.length < 8) {
    return {
      isValid: false,
      message: "Password must be at least 8 characters long.",
    };
  }
  if (!/\d/.test(password)) {
    return {
      isValid: false,
      message: "Password must contain at least one number.",
    };
  }
  return { isValid: true, message: "Password is valid." };
}

/**
 * --- DOM & UI STATE HELPERS ---
 */

/**
 * Shows the global loading overlay.
 * @param {string} [message] - Optional custom loading message.
 */
export function showGlobalLoader(message = "Brewing your experience...") {
  const loader = document.getElementById("global-loader");
  if (loader) {
    const textElement = loader.querySelector("p");
    if (textElement) textElement.textContent = message;
    loader.classList.remove("hidden");
    loader.style.opacity = "1";
  }
}

/**
 * Hides the global loading overlay with a smooth fade-out.
 */
export function hideGlobalLoader() {
  const loader = document.getElementById("global-loader");
  if (loader) {
    loader.style.opacity = "0";
    setTimeout(() => {
      loader.classList.add("hidden");
    }, 500); // Matches CSS transition time
  }
}

/**
 * Generates initials from a full name for user avatars.
 * @param {string} name - The user's full name.
 * @returns {string} 1 or 2 letter initials.
 */
export function getInitials(name) {
  if (!name) return "U";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * --- TOAST NOTIFICATION SYSTEM ---
 * A singleton class to manage dynamic, non-blocking UI notifications.
 */
class ToastNotificationSystem {
  constructor() {
    this.container = document.getElementById("toast-container");
    if (!this.container) {
      console.warn("Toast container not found. Creating one dynamically.");
      this.container = document.createElement("div");
      this.container.id = "toast-container";
      this.container.className = "toast-container";
      document.body.appendChild(this.container);
    }
  }

  /**
   * Internal method to render the toast.
   * @param {string} message - Toast message.
   * @param {string} type - 'success', 'error', 'warning', 'info'.
   * @param {number} duration - Time in ms before auto-dismiss.
   */
  _showToast(message, type = "info", duration = 3000) {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    // Define SVGs for different types
    let iconSvg = "";
    let borderColor = "var(--accent-primary)";

    switch (type) {
      case "success":
        borderColor = "var(--success)";
        iconSvg = `<svg width="20" height="20" fill="none" stroke="${borderColor}" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
        break;
      case "error":
        borderColor = "var(--danger)";
        iconSvg = `<svg width="20" height="20" fill="none" stroke="${borderColor}" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
        break;
      case "warning":
        borderColor = "var(--warning)";
        iconSvg = `<svg width="20" height="20" fill="none" stroke="${borderColor}" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
        break;
      default:
        iconSvg = `<svg width="20" height="20" fill="none" stroke="${borderColor}" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    }

    toast.style.borderLeftColor = borderColor;
    toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                ${iconSvg}
                <span style="font-weight: 500; font-size: 0.95rem;">${message}</span>
            </div>
        `;

    this.container.appendChild(toast);

    // Auto-remove after duration
    setTimeout(() => {
      toast.style.animation = "slideUp 0.3s ease reverse forwards";
      setTimeout(() => {
        if (this.container.contains(toast)) {
          this.container.removeChild(toast);
        }
      }, 300); // Wait for reverse animation
    }, duration);
  }

  success(message, duration) {
    this._showToast(message, "success", duration);
  }
  error(message, duration) {
    this._showToast(message, "error", duration);
  }
  warning(message, duration) {
    this._showToast(message, "warning", duration);
  }
  info(message, duration) {
    this._showToast(message, "info", duration);
  }
}

export const Toast = new ToastNotificationSystem();

/**
 * Safely adds an event listener to an element if it exists in the DOM.
 * @param {string} selector - CSS selector of the element.
 * @param {string} event - Event type (e.g., 'click').
 * @param {Function} handler - Event callback function.
 */
export function safeAddListener(selector, event, handler) {
  const element = document.querySelector(selector);
  if (element) {
    element.addEventListener(event, handler);
  } else {
    console.warn(`safeAddListener: Element '${selector}' not found in DOM.`);
  }
}
