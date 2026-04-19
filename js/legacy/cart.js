/**
 * ============================================================================
 * LUMINA COFFEE - CART MANAGEMENT MODULE
 * Description: Handles shopping cart state, LocalStorage persistence,
 * dynamic UI rendering, tax calculations, and balance validation.
 * Architecture: ES Modules, Singleton State, Reactive UI Updates.
 * ============================================================================
 */

import { formatCurrency, Toast } from "./utils.js";
import { currentUserProfile } from "./auth.js";

// --- CART STATE ---
// Initialize cart from LocalStorage to persist data across page reloads
let cartItems = JSON.parse(localStorage.getItem("lumina_cart")) || [];
const TAX_RATE = 0.1; // 10% VAT for MVP

/**
 * Initializes cart event listeners and renders the initial UI state.
 * Called once during application startup.
 */
export function initCart() {
  const cartToggleBtn = document.getElementById("cartToggleBtn");
  const closeCartBtn = document.getElementById("closeCartBtn");
  const checkoutBtn = document.getElementById("checkoutBtn");

  if (cartToggleBtn) {
    cartToggleBtn.addEventListener("click", toggleCartSidebar);
  }

  if (closeCartBtn) {
    closeCartBtn.addEventListener("click", toggleCartSidebar);
  }

  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", proceedToCheckout);
  }

  // Render initial state
  updateCartUI();
}

/**
 * Saves the current cart state to LocalStorage.
 */
function saveCartState() {
  try {
    localStorage.setItem("lumina_cart", JSON.stringify(cartItems));
  } catch (error) {
    console.error("Failed to save cart state to LocalStorage:", error);
    Toast.warning("Browser storage full. Cart may not save.");
  }
}

/**
 * Toggles the visibility of the Cart Sidebar.
 */
export function toggleCartSidebar() {
  const sidebar = document.getElementById("cart-sidebar");
  if (sidebar) {
    sidebar.classList.toggle("open");
    // If opening, re-evaluate balance in case it changed
    if (sidebar.classList.contains("open")) {
      validateCheckoutEligibility();
    }
  }
}

/**
 * Adds a product to the cart or increments its quantity if it already exists.
 * @param {Object} item - The product object to add.
 * @param {string} item.id - Product ID.
 * @param {string} item.name - Product Name.
 * @param {number} item.price - Final calculated price.
 * @param {string} item.image - Image URL.
 * @param {number} item.qty - Quantity to add.
 */
export function addToCart(item) {
  if (!item || !item.id || !item.price) {
    console.error("Invalid item passed to addToCart", item);
    return;
  }

  const existingItemIndex = cartItems.findIndex(
    (cartItem) => cartItem.id === item.id,
  );

  if (existingItemIndex > -1) {
    // Item exists, update quantity
    const newQty = cartItems[existingItemIndex].qty + item.qty;
    if (newQty > 10) {
      Toast.warning(`You can only order up to 10 of ${item.name}.`);
      cartItems[existingItemIndex].qty = 10;
    } else {
      cartItems[existingItemIndex].qty = newQty;
      Toast.success(`Added more ${item.name} to cart.`);
    }
  } else {
    // New item
    cartItems.push({
      id: item.id,
      name: item.name,
      price: item.price,
      image: item.image,
      qty: item.qty > 10 ? 10 : item.qty, // Cap at 10
    });
    Toast.success(`${item.name} added to your cart.`);
  }

  saveCartState();
  updateCartUI();

  // Automatically open sidebar to show the user what they added
  const sidebar = document.getElementById("cart-sidebar");
  if (sidebar && !sidebar.classList.contains("open")) {
    toggleCartSidebar();
  }
}

/**
 * Removes an item completely from the cart.
 * @param {string} itemId - The ID of the product to remove.
 */
export function removeFromCart(itemId) {
  const initialLength = cartItems.length;
  cartItems = cartItems.filter((item) => item.id !== itemId);

  if (cartItems.length < initialLength) {
    saveCartState();
    updateCartUI();
    Toast.info("Item removed from cart.");
  }
}

/**
 * Updates the quantity of a specific item in the cart.
 * @param {string} itemId - The ID of the product.
 * @param {number} change - Amount to change (+1 or -1).
 */
export function updateItemQuantity(itemId, change) {
  const itemIndex = cartItems.findIndex((item) => item.id === itemId);

  if (itemIndex > -1) {
    const currentQty = cartItems[itemIndex].qty;
    const newQty = currentQty + change;

    if (newQty <= 0) {
      // Remove item if quantity hits 0
      removeFromCart(itemId);
    } else if (newQty > 10) {
      Toast.warning("Maximum 10 items per product allowed.");
    } else {
      cartItems[itemIndex].qty = newQty;
      saveCartState();
      updateCartUI();
    }
  }
}

/**
 * Calculates cart totals: Subtotal, Tax, and Grand Total.
 * @returns {Object} { subtotal, tax, total, itemCount }
 */
export function calculateTotals() {
  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.qty,
    0,
  );
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + tax;
  const itemCount = cartItems.reduce((count, item) => count + item.qty, 0);

  return { subtotal, tax, total, itemCount };
}

/**
 * Validates if the user has sufficient balance to checkout.
 * Disables the checkout button and shows a warning if funds are insufficient.
 */
export function validateCheckoutEligibility() {
  const checkoutBtn = document.getElementById("checkoutBtn");
  const warningMsg = document.getElementById("cart-warning");

  if (!checkoutBtn || !warningMsg) return;

  const { total } = calculateTotals();

  // Condition 1: Cart is empty
  if (cartItems.length === 0) {
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = "Cart is Empty";
    warningMsg.classList.add("hidden");
    return;
  }

  // Condition 2: User is not logged in
  if (!currentUserProfile) {
    checkoutBtn.disabled = false; // Let them click to be redirected to login
    checkoutBtn.textContent = "Log in to Checkout";
    warningMsg.classList.add("hidden");
    return;
  }

  // Condition 3: Check Balance
  const userBalance = currentUserProfile.balance || 0;
  if (userBalance >= total) {
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = "Proceed to Checkout";
    warningMsg.classList.add("hidden");
  } else {
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = "Insufficient Balance";
    warningMsg.classList.remove("hidden");
  }
}

/**
 * Renders the entire Cart UI dynamically based on state.
 */
export function updateCartUI() {
  const container = document.getElementById("cart-items-container");
  const badge = document.getElementById("cart-badge");
  const subtotalEl = document.getElementById("cart-subtotal");
  const taxEl = document.getElementById("cart-tax");
  const totalEl = document.getElementById("cart-total");

  if (!container) return; // Not on a page with a cart

  const { subtotal, tax, total, itemCount } = calculateTotals();

  // Update Badge
  if (badge) {
    badge.textContent = itemCount;
    badge.style.display = itemCount > 0 ? "flex" : "none";
  }

  // Update Summary Values
  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (taxEl) taxEl.textContent = formatCurrency(tax);
  if (totalEl) totalEl.textContent = formatCurrency(total);

  // Render Items
  container.innerHTML = "";

  if (cartItems.length === 0) {
    container.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
                <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin: 0 auto 16px; opacity: 0.5;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
                </svg>
                <p>Your cart is empty.</p>
                <button class="btn btn-outline" style="margin-top: 16px;" onclick="document.getElementById('cart-sidebar').classList.remove('open')">Continue Shopping</button>
            </div>
        `;
  } else {
    cartItems.forEach((item) => {
      const itemEl = document.createElement("div");
      itemEl.className = "cart-item";

      // Using a safe placeholder if image is missing
      const imgSrc = item.image || "assets/images/placeholder-coffee.jpg";

      itemEl.innerHTML = `
                <img src="${imgSrc}" alt="${item.name}" class="cart-item-img">
                <div class="cart-item-details">
                    <span class="cart-item-title">${item.name}</span>
                    <span class="cart-item-price">${formatCurrency(item.price)}</span>
                    <div class="cart-item-actions">
                        <button class="qty-btn minus-btn" data-id="${item.id}">-</button>
                        <span style="font-weight: 600; font-size: 0.9rem; width: 20px; text-align: center;">${item.qty}</span>
                        <button class="qty-btn plus-btn" data-id="${item.id}">+</button>
                        <button class="remove-btn" data-id="${item.id}">Remove</button>
                    </div>
                </div>
            `;
      container.appendChild(itemEl);
    });

    // Attach event listeners to newly created dynamic buttons
    container.querySelectorAll(".minus-btn").forEach((btn) => {
      btn.addEventListener("click", (e) =>
        updateItemQuantity(e.target.dataset.id, -1),
      );
    });
    container.querySelectorAll(".plus-btn").forEach((btn) => {
      btn.addEventListener("click", (e) =>
        updateItemQuantity(e.target.dataset.id, 1),
      );
    });
    container.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => removeFromCart(e.target.dataset.id));
    });
  }

  validateCheckoutEligibility();
}

/**
 * Handles the "Proceed to Checkout" button click.
 */
function proceedToCheckout() {
  if (!currentUserProfile) {
    // Redirect to login, store intent in sessionStorage
    sessionStorage.setItem("redirectAfterLogin", "/checkout");
    window.location.href = "/login";
    return;
  }

  const { total } = calculateTotals();
  if (currentUserProfile.balance >= total && cartItems.length > 0) {
    window.location.href = "/checkout";
  } else {
    Toast.error("Cannot proceed to checkout. Please check your balance.");
  }
}

/**
 * Returns the current cart items (read-only copy) for use in other modules (like checkout).
 * @returns {Array} Array of cart item objects.
 */
export function getCartItems() {
  return [...cartItems];
}

/**
 * Clears the cart entirely (used after successful checkout).
 */
export function clearCart() {
  cartItems = [];
  saveCartState();
  updateCartUI();
}
