import store from "../store/index.js";
import { ACTION_TYPES } from "../store/actions.js";

let prevBalance = 0;

function formatMoney(amount) {
  return Math.floor(amount).toLocaleString("vi-VN");
}

// Format currency function for instant render
function formatCurrency(amount) {
  return Math.floor(amount).toLocaleString("vi-VN") + "đ";
}

// Instant navbar render from localStorage cache
// Runs immediately when JS loads, before Firebase auth
export function renderNavbarInstant() {
  try {
    const cachedUser = localStorage.getItem("cached_user");
    if (!cachedUser) return; // No cache, skip

    const userData = JSON.parse(cachedUser);
    if (!userData) return;

    // Defensive programming: Check elements exist before setting
    const balanceEl = document.getElementById("balance-display");
    if (balanceEl && userData.balance !== undefined) {
      balanceEl.textContent = `💰 ${formatCurrency(userData.balance)}`;
    }

    const usernameEl = document.getElementById("nav-username");
    if (usernameEl && userData.displayName) {
      usernameEl.textContent = userData.displayName;
    }

    // Update avatar if available
    const avatarEl = document.querySelector(".navbar-avatar");
    if (avatarEl && userData.photoURL) {
      avatarEl.src = userData.photoURL;
    }

    // Update VIP level if available
    const vipEl = document.querySelector(".vip-badge");
    if (vipEl && userData.vipLevel !== undefined) {
      vipEl.textContent =
        userData.vipLevel > 0 ? `👑 V${userData.vipLevel}` : "👑 Member";
    }
  } catch (error) {
    console.warn("⚠️ Error rendering navbar from cache:", error);
    // Silently fail to avoid breaking the page
  }
}

// Call instant render immediately when this file loads
renderNavbarInstant();

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
  const navRoot = document.getElementById("navbar-root");
  if (!navRoot) return;

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

    const balanceEl = document.getElementById("balance-display");
    if (balanceEl) {
      animateBalance(balanceEl, prevBalance, currentBalance);
      balanceEl.classList.add("balance-pop");
      setTimeout(() => balanceEl.classList.remove("balance-pop"), 500);
    }
  }

  prevBalance = currentBalance;

  // AVATAR LOGIC: Prioritize photoURL (from URL paste), then avatar (base64), then fallback
  const userPhoto = user?.photoURL || user?.avatar || null;
  const isAdmin = user && user.role === "admin";

  const existingInput = document.getElementById("nav-search");
  const prevSearchValue = existingInput?.value || state.ui?.searchQuery || "";
  const isSearchFocused =
    document.activeElement && document.activeElement.id === "nav-search";
  const cursorPos = existingInput?.selectionStart || 0;

  // Avatar HTML with smooth transition
  const avatarHTML = user
    ? userPhoto
      ? `<img src="${userPhoto}" alt="Avatar" class="navbar-avatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(200, 155, 60, 0.5); transition: all 0.3s ease;">`
      : `<div class="navbar-avatar-fallback" style="width: 40px; height: 40px; border-radius: 50%; background: #2a2a2a; color: #c89b3c; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 1.5px solid rgba(200, 155, 60, 0.3);">${(user.name || "U").charAt(0).toUpperCase()}</div>`
    : `<div class="navbar-avatar-guest" style="width: 40px; height: 40px; border-radius: 50%; background: #2a2a2a; color: #888; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 1.5px solid rgba(100, 100, 100, 0.3);">G</div>`;

  // Get products for autocomplete
  const products = state.products?.list || [];

  // Render HTML
  navRoot.innerHTML = `
    <nav class="navbar">
      <div class="nav-left">
        <a href="/pages/index.html" class="navbar-brand">☕ Coffee</a>
      </div>

      <div class="nav-center" style="display: flex; gap: 2rem; font-size: 14px;">
        <a href="/pages/index.html" class="nav-link" style="color: #ccc; text-decoration: none; transition: all 0.3s;">Home</a>
        <a href="/pages/products.html" class="nav-link" style="color: #ccc; text-decoration: none; transition: all 0.3s;">Menu</a>
        ${user ? `<a href="/pages/orders.html" class="nav-link" style="color: #ccc; text-decoration: none; transition: all 0.3s;">Orders</a>` : ""}
        <a href="/pages/about.html" class="nav-link" style="color: #ccc; text-decoration: none; transition: all 0.3s;">Our Story</a>
        <a href="/pages/contact.html" class="nav-link" style="color: #ccc; text-decoration: none; transition: all 0.3s;">Contact</a>
      </div>

      <div class="nav-center-right" style="display: flex; align-items: center; position: relative;">
        <input type="text" id="nav-search" placeholder="Search coffee..." 
               value="${prevSearchValue}"
               class="search-input"
               style="width: 240px; height: 38px; background: rgba(42, 42, 42, 0.8); border-radius: 20px; padding: 0 16px; color: #fff; border: 1.5px solid rgba(200, 155, 60, 0.3); outline: none; font-size: 14px; backdrop-filter: blur(10px); transition: all 0.3s ease;">
        <div id="nav-search-suggestions" class="search-suggestions" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: rgba(26, 26, 28, 0.95); backdrop-filter: blur(20px); border: 1px solid rgba(200, 155, 60, 0.2); border-radius: 12px; margin-top: 8px; max-height: 300px; overflow-y: auto; z-index: 1001; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);">
        </div>
      </div>

      <div class="nav-right" style="display: flex; align-items: center; gap: 2rem;">
        ${user ? `<div id="balance-display" class="balance-badge" style="font-size: 14px; color: #fff; background: rgba(42, 42, 42, 0.8); padding: 8px 14px; border-radius: 10px; cursor: pointer; border: 1px solid rgba(200, 155, 60, 0.3); transition: all 0.3s ease; backdrop-filter: blur(10px);">💰 ${balance}đ</div>` : ""}
        
        <button id="cart-btn" class="cart-btn" style="position: relative; background: none; border: none; color: #fff; font-size: 1.2rem; cursor: pointer; transition: all 0.3s ease; padding: 4px;">
          🛒
          ${cartCount > 0 ? `<span style="position: absolute; top: -8px; right: -8px; background: #ff9800; color: white; padding: 2px 6px; border-radius: 50%; font-size: 10px; font-weight: bold;">${cartCount}</span>` : ""}
        </button>
        
        <div style="display: flex; align-items: center; gap: 8px;">
          <div id="avatar-btn" class="avatar-container" style="cursor: pointer; position: relative; display: flex; align-items: center; gap: 6px;">
            ${
              user
                ? `<a href="/pages/vip.html" class="vip-badge ${
                    user.vipLevel && user.vipLevel >= 10
                      ? "vip-badge--vip10"
                      : user.vipLevel && user.vipLevel > 0
                        ? "vip-badge--vip"
                        : "vip-badge--member"
                  }" title="View VIP Benefits">👑 ${user.vipLevel && user.vipLevel > 0 ? `V${user.vipLevel}` : "Member"}</a>`
                : `<a href="/pages/login.html" class="vip-badge vip-badge--guest" title="Login to join VIP">👑 Login</a>`
            }
            ${avatarHTML}
            <div id="profile-dropdown" style="display: none; position: absolute; top: 50px; right: 0; width: 220px; background: rgba(26, 26, 28, 0.95); backdrop-filter: blur(20px); border: 1px solid rgba(200, 155, 60, 0.2); border-radius: 15px; padding: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 1000;">
              ${
                user
                  ? `
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                  ${avatarHTML}
                  <div style="flex: 1;">
                    <small style="color: #888;">Logged in as</small>
                    <div id="nav-username" style="color: #fff; font-weight: 600;">${user.name}</div>
                  </div>
                </div>
                <a href="/pages/profile.html" style="color: #ccc; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block;">👤 Profile</a>

                  <a href="/pages/orders.html" style="color: #ccc; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block;">📦 My Orders</a>

                  <a href="/pages/deposit.html" style="color: #ccc; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block;">💰 Deposit</a>

                  ${user.vipLevel && user.vipLevel > 0 ? `<a href="/pages/vip.html" style="color: #d4af37; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block; font-weight: 600;">👑 VIP Club</a>` : ""}

                  ${user.vipLevel && user.vipLevel > 0 ? `<a href="/pages/vip-products.html" style="color: #d4af37; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block; font-weight: 600;">✨ VIP Store</a>` : ""}

                  ${isAdmin ? `<a href="/pages/admin.html" style="color: #c89b3c; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block;">⚙️ Admin Dashboard</a>` : ""}

                </div>

              `
                  : `

                <div style="display: flex; flex-direction: column; gap: 8px;">

                  <a href="/pages/profile.html" style="color: #ccc; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block;">👤 Profile</a>

                  <a href="/pages/login.html" style="color: #c89b3c; text-decoration: none; padding: 8px 0; transition: color 0.3s; display: block; font-weight: 600;">🔐 Login</a>

                </div>

              `
              }

            </div>

          </div>

        </div>
    </nav>

  `;

  // Add hover effects for links
  const navLinks = navRoot.querySelectorAll(".nav-link");
  navLinks.forEach((link) => {
    link.addEventListener("mouseenter", () => {
      link.style.color = "#c89b3c";
      link.style.transform = "scale(1.05)";
    });
    link.addEventListener("mouseleave", () => {
      link.style.color = "#ccc";
      link.style.transform = "scale(1)";
    });
  });

  // Logo animation (bounce + glow)
  const logoLink = navRoot.querySelector(".navbar-brand");
  if (logoLink) {
    logoLink.addEventListener("mouseenter", () => {
      logoLink.style.animation = "logoBounce 0.6s ease-in-out";
      logoLink.style.textShadow =
        "0 0 10px #c89b3c, 0 0 20px rgba(200, 155, 60, 0.5)";
    });
    logoLink.addEventListener("mouseleave", () => {
      logoLink.style.animation = "none";
      logoLink.style.textShadow = "none";
    });
  }

  // Search input with autocomplete
  const searchInput = navRoot.querySelector("#nav-search");
  const searchSuggestions = navRoot.querySelector("#nav-search-suggestions");

  if (searchInput) {
    searchInput.value = prevSearchValue;
    if (isSearchFocused) {
      searchInput.focus();
      searchInput.setSelectionRange(cursorPos, cursorPos);
    }

    // Focus and blur effects
    searchInput.addEventListener("focus", () => {
      searchInput.style.borderColor = "rgba(200, 155, 60, 0.8)";
      searchInput.style.boxShadow = "0 0 16px rgba(200, 155, 60, 0.2)";
      searchInput.style.background = "rgba(42, 42, 42, 0.95)";
    });

    searchInput.addEventListener("blur", () => {
      searchInput.style.borderColor = "rgba(200, 155, 60, 0.3)";
      searchInput.style.boxShadow = "none";
      searchInput.style.background = "rgba(42, 42, 42, 0.8)";
      // Hide suggestions on blur after a delay
      setTimeout(() => {
        searchSuggestions.style.display = "none";
      }, 200);
    });

    // Search input handler with autocomplete
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      store.dispatch({
        type: ACTION_TYPES.SET_SEARCH_QUERY,
        payload: e.target.value,
      });

      // Show/hide autocomplete suggestions
      if (query.length > 0) {
        const filtered = products.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            (p.description && p.description.toLowerCase().includes(query)),
        );

        if (filtered.length > 0) {
          const suggestionsHTML = filtered
            .slice(0, 5) // Limit to 5 suggestions
            .map((product) => {
              const discount = Number(product.discount) || 0;
              const finalPrice = product.price * (1 - discount / 100);
              return `
              <div class="search-suggestion-item" data-id="${product.id}" style="
                padding: 12px 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                transition: all 0.2s ease;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
              ">
                <div style="width: 50px; height: 50px; border-radius: 8px; overflow: hidden; flex-shrink: 0; background: #2a2a2a; display: flex; align-items: center; justify-content: center;">
                  ${product.image ? `<img src="${product.image}" style="width: 100%; height: 100%; object-fit: cover;" alt="${product.name}">` : `<span style="font-size: 1.5rem;">☕</span>`}
                </div>
                <div style="flex: 1;">
                  <div style="color: #fff; font-weight: 600; font-size: 13px; margin-bottom: 4px;">${product.name}</div>
                  <div style="display: flex; gap: 8px; align-items: center; font-size: 11px;">
                    ${discount > 0 ? `<span style="color: #888; text-decoration: line-through;">${product.price.toLocaleString("vi-VN")}đ</span>` : ""}
                    <span style="color: #c89b3c; font-weight: 700;">${finalPrice.toLocaleString("vi-VN")}đ</span>
                    ${discount > 0 ? `<span style="color: #ff4757; font-weight: bold;">-${discount}%</span>` : ""}
                  </div>
                </div>
              </div>
            `;
            })
            .join("");

          searchSuggestions.innerHTML = suggestionsHTML;
          searchSuggestions.style.display = "block";

          // Add hover effects and click handlers to suggestion items
          searchSuggestions
            .querySelectorAll(".search-suggestion-item")
            .forEach((item) => {
              item.addEventListener("mouseenter", () => {
                item.style.background = "rgba(200, 155, 60, 0.15)";
              });
              item.addEventListener("mouseleave", () => {
                item.style.background = "transparent";
              });
              item.addEventListener("click", () => {
                const productId = item.dataset.id;
                const product = products.find((p) => p.id === productId);
                if (product) {
                  // Check if we're on the products page
                  const isOnProductPage =
                    window.location.pathname.includes("product.html");
                  if (isOnProductPage) {
                    // Just update search on this page
                    searchInput.value = product.name;
                    store.dispatch({
                      type: ACTION_TYPES.SET_SEARCH_QUERY,
                      payload: product.name,
                    });
                  } else {
                    // Redirect to products page with search parameter
                    window.location.href = `products.html?search=${encodeURIComponent(product.name)}`;
                  }
                  searchSuggestions.style.display = "none";
                }
              });
            });
        } else {
          searchSuggestions.innerHTML = `
            <div style="padding: 14px; text-align: center; color: #888; font-size: 13px;">
              No products found
            </div>
          `;
          searchSuggestions.style.display = "block";
        }
      } else {
        searchSuggestions.style.display = "none";
      }
    });

    // Add Enter key handler for search
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const query = searchInput.value.trim();
        if (query.length > 0) {
          const isOnProductPage =
            window.location.pathname.includes("product.html") ||
            window.location.pathname.includes("products.html");
          if (isOnProductPage) {
            store.dispatch({
              type: ACTION_TYPES.SET_SEARCH_QUERY,
              payload: query,
            });
          } else {
            // Redirect to products page with search parameter
            window.location.href = `pages/products.html?search=${encodeURIComponent(query)}`;
          }
          searchSuggestions.style.display = "none";
        }
      }
    });
  }

  // Cart button hover effect
  const cartBtn = navRoot.querySelector("#cart-btn");
  if (cartBtn) {
    // Store previous cart count for detecting cart item additions
    const prevCartCount = store
      .getState()
      .cart.items.reduce((acc, item) => acc + item.quantity, 0);

    // Trigger pulse animation when cart items change
    store.subscribe(() => {
      const newCartCount = store
        .getState()
        .cart.items.reduce((acc, item) => acc + item.quantity, 0);
      if (newCartCount > prevCartCount) {
        // Add pulse class for animation
        cartBtn.classList.add("pulse");
        setTimeout(() => {
          cartBtn.classList.remove("pulse");
        }, 600);
      }
    });

    cartBtn.addEventListener("mouseenter", () => {
      cartBtn.style.transform = "scale(1.2) rotate(10deg)";
    });
    cartBtn.addEventListener("mouseleave", () => {
      cartBtn.style.transform = "scale(1) rotate(0deg)";
    });
    cartBtn.onclick = () => {
      store.dispatch({ type: ACTION_TYPES.TOGGLE_CART });
    };
  }

  // Balance click to deposit and hover effect
  if (user) {
    const balanceEl = navRoot.querySelector("#balance-display");
    if (balanceEl) {
      balanceEl.addEventListener("mouseenter", () => {
        balanceEl.style.borderColor = "rgba(200, 155, 60, 0.8)";
        balanceEl.style.boxShadow = "0 0 12px rgba(200, 155, 60, 0.2)";
        balanceEl.style.transform = "scale(1.05)";
      });
      balanceEl.addEventListener("mouseleave", () => {
        balanceEl.style.borderColor = "rgba(200, 155, 60, 0.3)";
        balanceEl.style.boxShadow = "none";
        balanceEl.style.transform = "scale(1)";
      });
      balanceEl.onclick = () => {
        window.location.href = "deposit.html";
      };
    }
  }

  // Logout is NOW ONLY on profile.html - removed from navbar dropdown
  // (to prevent misclicks on landing page navbar)

  // Avatar with hover effects
  const avatarContainer = navRoot.querySelector("#avatar-btn");
  const dropdown = navRoot.querySelector("#profile-dropdown");
  const avatarImg = avatarContainer.querySelector(
    ".navbar-avatar-fallback, .navbar-avatar-guest, .navbar-avatar",
  );

  if (avatarImg) {
    avatarImg.addEventListener("mouseenter", () => {
      avatarImg.style.transform = "rotate(15deg) scale(1.1)";
      avatarImg.style.borderColor = "#c89b3c";
      avatarImg.style.boxShadow = "0 0 12px rgba(200, 155, 60, 0.5)";
    });
    avatarImg.addEventListener("mouseleave", () => {
      avatarImg.style.transform = "rotate(0deg) scale(1)";
      avatarImg.style.borderColor = "#555";
      avatarImg.style.boxShadow = "none";
    });
  }

  let isDropdownOpen = false;
  avatarContainer?.addEventListener("click", () => {
    isDropdownOpen = !isDropdownOpen;
    dropdown.style.display = isDropdownOpen ? "block" : "none";

    // Add hover transitions to dropdown menu items
    if (isDropdownOpen) {
      const dropdownItems = dropdown.querySelectorAll("a");
      dropdownItems.forEach((item) => {
        item.addEventListener("mouseenter", () => {
          item.style.background = "rgba(200, 155, 60, 0.1)";
          item.style.transform = "translateX(5px)";
          item.style.transition = "all 0.2s ease";
        });
        item.addEventListener("mouseleave", () => {
          item.style.background = "transparent";
          item.style.transform = "translateX(0)";
          item.style.transition = "all 0.2s ease";
        });
      });
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!avatarContainer?.contains(e.target)) {
      isDropdownOpen = false;
      if (dropdown) dropdown.style.display = "none";
    }
  });

  // ===== VIP 10 EASTER EGG =====
  if (user && user.vipLevel === 10) {
    const userNameEl = navRoot.querySelector(".vip-badge");
    const avatarContainerEl = navRoot.querySelector("#avatar-btn");

    if (userNameEl) {
      userNameEl.classList.add("vip10-rainbow-text");
      userNameEl.textContent = `👑 VIP LEGEND 👑`;
      userNameEl.classList.add("vip-badge--vip10");
    }

    if (avatarContainerEl) {
      let sparkleLayer = avatarContainerEl.querySelector(
        ".vip10-sparkles-layer",
      );
      if (!sparkleLayer) {
        sparkleLayer = document.createElement("span");
        sparkleLayer.className = "vip10-sparkles-layer";
        avatarContainerEl.appendChild(sparkleLayer);

        const sparkleCount = 10;
        for (let i = 0; i < sparkleCount; i++) {
          const sparkle = document.createElement("span");
          sparkle.className = "sparkle";
          sparkle.style.left = Math.random() * 100 + "%";
          sparkle.style.top = Math.random() * 100 + "%";
          sparkle.style.animationDelay = Math.random() * 2 + "s";
          sparkleLayer.appendChild(sparkle);
        }
      }
    }
  }
} // Kết thúc hàm renderNavbar

export function initNavbar() {
  renderNavbar(store.getState());

  store.subscribe(() => {
    renderNavbar(store.getState());
  });
}
