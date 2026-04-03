import { initRender } from "./core/render.js";
import { initializeAuth } from "./core/auth-init.js";
import { initNavbar } from "./components/navbar.js";
import { initCart } from "./components/cart.js";
import { initBannerCarousel } from "./components/carousel.js";
import store from "./store/index.js";
import { ACTION_TYPES } from "./store/actions.js";

// 1. Initialize rendering system
initRender();

// 2. Initialize Firebase Auth - restores session, sets up realtime listeners
initializeAuth();

// 3. Initialize navbar component
initNavbar();

// 4. Initialize cart component
initCart();

// 5. Initialize banner carousel on homepage
document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector(".hero-section")) {
    setTimeout(() => {
      initBannerCarousel();
    }, 500);
  }
});

// ===== HELPER FUNCTIONS FOR ANIMATIONS =====

// Format money with thousand separators
function formatMoney(amount) {
  return Math.floor(amount).toLocaleString("vi-VN");
}

// Show floating money text animation
function showMoneyAnimation(amount) {
  const el = document.createElement("div");
  el.className = "money-float";
  el.innerText = `+${formatMoney(amount)}đ`;
  document.body.appendChild(el);

  setTimeout(() => el.remove(), 1500);
}

// Animate balance count-up effect
function animateBalance(el, start, end) {
  if (start === end) return;

  let current = start;
  const step = (end - start) / 20;
  let steps = 0;

  const interval = setInterval(() => {
    steps++;
    current += step;

    if ((step > 0 && current >= end) || (step < 0 && current <= end)) {
      current = end;
      clearInterval(interval);
    }

    el.innerText = formatMoney(current) + "đ";
  }, 20);
}

// ===== BALANCE CHANGE TRACKING =====

let prevBalance = 0;

// Track balance changes and trigger animations
store.subscribe(() => {
  const state = store.getState();
  const newBalance = state.user?.data?.balance || 0;

  if (newBalance > prevBalance && prevBalance !== 0) {
    const diff = newBalance - prevBalance;

    // 1. Show floating +amount text
    showMoneyAnimation(diff);

    // 2. Animate balance count-up
    const balanceElements = document.querySelectorAll(
      "#balance-btn span, #balance-display",
    );
    balanceElements.forEach((el) => {
      if (el) {
        animateBalance(el, prevBalance, newBalance);

        // 3. Add pop/rotate effect to balance
        el.classList.add("balance-pop");
        setTimeout(() => el.classList.remove("balance-pop"), 500);
      }
    });
  }

  prevBalance = newBalance;
});

// ===== CART TOGGLE LOGIC =====

// Close cart when clicking outside
document.addEventListener("click", (e) => {
  const state = store.getState();
  const isCartOpen = state.ui.cartOpen;
  if (
    isCartOpen &&
    !e.target.closest("#cart") &&
    !e.target.closest("#cart-btn")
  ) {
    store.dispatch({ type: ACTION_TYPES.TOGGLE_CART });
  }
});

// Close cart when pressing ESC key
document.addEventListener("keydown", (e) => {
  const state = store.getState();
  if (e.key === "Escape" && state.ui.cartOpen) {
    store.dispatch({ type: ACTION_TYPES.TOGGLE_CART });
  }
});
