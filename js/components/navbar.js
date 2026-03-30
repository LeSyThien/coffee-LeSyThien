import store from "../store/index.js";
import { ACTION_TYPES } from "../store/actions.js";

let prevBalance = 0;

function formatMoney(amount) {
  return Math.floor(amount).toLocaleString("vi-VN");
}

function showMoneyAnimation(amount) {
  const el = document.createElement("div");
  el.className = "money-float";
  el.innerText = `+${formatMoney(amount)}đ`;
  document.body.appendChild(el);

  setTimeout(() => el.remove(), 1500);
}

function animateBalance(el, start, end) {
  if (!el || start === end) return;
  let current = start;
  const step = (end - start) / 20;

  const interval = setInterval(() => {
    current += step;
    if ((step > 0 && current >= end) || (step < 0 && current <= end)) {
      current = end;
      clearInterval(interval);
    }
    el.innerText = `💰 ${formatMoney(current)}đ`;
  }, 20);
}

export function renderNavbar(state) {
  const navElement = document.getElementById("navbar");
  if (!navElement) return;

  const user = state.user?.data;
  const currentBalance = user ? Number(user.balance || 0) : 0;
  const balance = formatMoney(currentBalance);
  const cartCount = state.cart.items.reduce(
    (acc, item) => acc + item.quantity,
    0,
  );

  // Balance animation (set in navbar because it renders state changes)
  if (currentBalance > prevBalance && prevBalance > 0) {
    const diff = currentBalance - prevBalance;
    showMoneyAnimation(diff);

    const balanceEl = document.getElementById("balance");
    if (balanceEl) {
      animateBalance(balanceEl, prevBalance, currentBalance);
      balanceEl.classList.add("balance-pop");
      setTimeout(() => balanceEl.classList.remove("balance-pop"), 500);
    }
  }

  prevBalance = currentBalance;
  const avatar = user && user.avatar ? user.avatar : null;
  const isAdmin = user && user.role === "admin";

  const existingInput = document.getElementById("search-input");
  const prevSearchValue = existingInput?.value || state.ui?.searchQuery || "";
  const isSearchFocused =
    document.activeElement && document.activeElement.id === "search-input";
  const cursorPos = existingInput?.selectionStart || 0;

  const avatarHTML = user
    ? user.avatar
      ? `<img src="${user.avatar}" alt="Avatar" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid #333;">`
      : `<div style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: #333; color: white; border-radius: 50%; border: 1px solid #333; font-size: 1rem; font-weight: 600;">${(user.name || "U").charAt(0).toUpperCase()}</div>`
    : `<div style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: #333; color: white; border-radius: 50%; border: 1px solid #333; font-size: 1rem;">G</div>`;

  // Render HTML
  navElement.innerHTML = `
    <div>
      <div class="nav-left">
        <a href="index.html" style="font-size: 20px; font-weight: 600; color: #c89b3c; text-decoration: none;">Coffee</a>
      </div>

      <div class="nav-center" style="display: flex; gap: 24px; font-size: 14px;">
        <a href="index.html" style="color: #ccc; text-decoration: none; transition: all 0.3s;">Home</a>
        <a href="index.html#products" style="color: #ccc; text-decoration: none; transition: all 0.3s;">Menu</a>
        ${user ? `<a href="orders.html" style="color: #ccc; text-decoration: none; transition: all 0.3s;">Orders</a>` : ""}
      </div>

      <div class="nav-center-right" style="display: flex; align-items: center;">
        <input type="text" id="search-input" placeholder="Search coffee..." 
               value="${prevSearchValue}"
               style="width: 240px; height: 36px; background: #2a2a2a; border-radius: 20px; padding: 0 14px; color: #fff; border: none; outline: none; font-size: 14px;">
      </div>

      <div class="nav-right" style="display: flex; align-items: center; gap: 20px;">
        ${user ? `<div id="balance" style="font-size: 14px; color: #fff; background: #2a2a2a; padding: 8px 12px; border-radius: 8px; cursor: pointer;">💰 ${balance}đ</div>` : ""}
        
        <button id="cart-btn" style="position: relative; background: none; border: none; color: #fff; font-size: 1rem; cursor: pointer;">
          🛒
          ${cartCount > 0 ? `<span style="position: absolute; top: -8px; right: -8px; background: #ff9800; color: white; padding: 2px 6px; border-radius: 50%; font-size: 10px; font-weight: bold;">${cartCount}</span>` : ""}
        </button>
        
        <div id="avatar-container" style="cursor: pointer; position: relative;">
          ${avatarHTML}
          <div id="profile-dropdown" style="display: none; position: absolute; top: 50px; right: 0; width: 200px; background: #2a2a2a; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 1000; padding: 16px; animation: fadeIn 0.3s;">
            ${
              user
                ? `
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #333;">
                ${avatarHTML}
                <div style="color: #fff; font-weight: 600;">${user.name}</div>
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <a href="profile.html" style="color: #ccc; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block;">👤 Profile</a>
                <a href="orders.html" style="color: #ccc; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block;">📦 My Orders</a>
                <a href="deposit.html" style="color: #ccc; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block;">💰 Deposit</a>
                ${isAdmin ? `<a href="admin.html" style="color: #c89b3c; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block;">⚙️ Admin Dashboard</a>` : ""}
              </div>
            `
                : `
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <a href="profile.html" style="color: #ccc; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block;">👤 Profile</a>
                <a href="login.html" style="color: #c89b3c; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block; font-weight: 600;">🔐 Login</a>
              </div>
            `
            }
          </div>
        </div>
      </div>
    </div>
  `;

  // Add hover effects for links
  const links = navElement.querySelectorAll(".nav-center a");
  links.forEach((link) => {
    link.addEventListener("mouseenter", () => {
      link.style.color = "#c89b3c";
      link.style.transform = "translateY(-2px)";
    });
    link.addEventListener("mouseleave", () => {
      link.style.color = "#ccc";
      link.style.transform = "translateY(0)";
    });
  });

  // Focus effect for search
  const searchInput = navElement.querySelector("#search-input");
  if (searchInput) {
    searchInput.value = prevSearchValue;
    if (isSearchFocused) {
      searchInput.focus();
      searchInput.setSelectionRange(cursorPos, cursorPos);
    }

    searchInput.addEventListener("focus", () => {
      searchInput.style.outline = "1px solid #c89b3c";
    });
    searchInput.addEventListener("blur", () => {
      searchInput.style.outline = "none";
    });

    searchInput.oninput = (e) => {
      store.dispatch({
        type: ACTION_TYPES.SET_SEARCH_QUERY,
        payload: e.target.value,
      });
    };
  }

  // Cart button
  navElement.querySelector("#cart-btn").onclick = () => {
    store.dispatch({ type: ACTION_TYPES.TOGGLE_CART });
  };

  // Balance click to deposit
  if (user) {
    const balanceEl = navElement.querySelector("#balance");
    if (balanceEl) {
      balanceEl.onclick = () => {
        window.location.href = "deposit.html";
      };
    }
  }

  // Avatar dropdown - always show for both guest and logged-in users
  const avatarContainer = navElement.querySelector("#avatar-container");
  const dropdown = navElement.querySelector("#profile-dropdown");
  let isDropdownOpen = false;

  avatarContainer?.addEventListener("click", () => {
    isDropdownOpen = !isDropdownOpen;
    dropdown.style.display = isDropdownOpen ? "block" : "none";
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!avatarContainer?.contains(e.target)) {
      isDropdownOpen = false;
      if (dropdown) dropdown.style.display = "none";
    }
  });
}
