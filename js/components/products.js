import store from "../store/index.js";
import { ACTION_TYPES } from "../store/actions.js";
import {
  toastSuccess,
  toastError,
  initializeToastContainer,
} from "../services/toast.service.js";

function formatCurrency(value) {
  if (typeof value !== "number") value = Number(value) || 0;
  return value.toLocaleString("vi-VN") + "đ";
}

function calculateFinalPrice(product) {
  const originalPrice = Number(product.price) || 0;
  const discount = Number(product.discount) || 0;
  return originalPrice * (1 - discount / 100);
}

export function renderProducts(state) {
  const container = document.getElementById("products");
  if (!container) return;

  // Initialize toast system
  initializeToastContainer();

  if (state.products?.loading) {
    container.innerHTML = new Array(8)
      .fill(0)
      .map(
        () => `
        <div class="product-card skeleton-card">
          <div class="skeleton-image"></div>
          <div class="skeleton-text title"></div>
          <div class="skeleton-text"></div>
          <div class="skeleton-text description"></div>
          <div class="skeleton-button"></div>
        </div>
      `,
      )
      .join("");
    return;
  }

  let products = state.products?.list || [];
  const searchQuery = state.ui?.searchQuery || "";
  const userVipLevel = state.user?.data?.vipLevel || 0;

  // Check if we're on the homepage - only show products where showOnHome == true
  const isHomePage =
    window.location.pathname.includes("index.html") ||
    window.location.pathname.endsWith("/");
  if (isHomePage) {
    products = products.filter(
      (p) => p.showOnHome === true && p.available === true,
    );
    products = products.slice(0, 16); // Limit to 16 products
    products.sort(
      (a, b) => (Number(b.discount) || 0) - (Number(a.discount) || 0),
    ); // Sort by discount descending
  }

  // Filter products based on search
  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.description &&
        product.description.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  if (filteredProducts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #888;">
        ${searchQuery ? `No products found for "${searchQuery}"` : "No products available"}
      </div>
    `;
    return;
  }

  const productsHTML = filteredProducts
    .map((product) => {
      const isOutOfStock = Number(product.stock) <= 0;
      const discount = Number(product.discount) || 0;
      const finalPrice = calculateFinalPrice(product);
      const stockColor = Number(product.stock) <= 5 ? "#ff4757" : "#888";

      // Check VIP exclusivity
      const requiredVipLevel = product.requiredVipLevel || 0;
      const isUserVIPEligible = userVipLevel >= requiredVipLevel;
      const canAddToCart = !isOutOfStock && isUserVIPEligible;

      return `
    <div class="product-card" data-id="${product.id}" ${isOutOfStock ? 'data-out-of-stock="true"' : ""}>
      <div class="product-image-container" ${isOutOfStock || (requiredVipLevel > 0 && !isUserVIPEligible) ? 'style="filter: grayscale(100%); opacity: 0.6;"' : ""}>
        ${product.image ? `<img src="${product.image}" alt="${product.name}" class="product-image">` : `<div class="product-image" style="background: var(--color-surface-l2); display: flex; align-items: center; justify-content: center; font-size: 3rem;">☕</div>`}
      </div>
      ${discount > 0 ? `<div class="discount-badge">${discount}% OFF</div>` : ""}
      ${requiredVipLevel > 0 ? `<div class="discount-badge" style="background: linear-gradient(45deg, #d4af37, #f9e29c); color: #000;">VIP ${requiredVipLevel}+</div>` : ""}
      <div class="product-content">
        <h3 class="product-name">${product.name}</h3>
        ${
          product.avgRating
            ? `
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 12px;">
            <span style="color: var(--color-metallic-gold);">⭐ ${product.avgRating.toFixed(1)}</span>
            <span style="color: var(--color-text-secondary);">(${product.reviewCount || 0})</span>
          </div>
        `
            : `
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 12px; color: var(--color-text-secondary);">
            No reviews yet
          </div>
        `
        }
        <p class="product-description">${product.description || "No description"}</p>
        <div class="product-pricing">
          ${discount > 0 ? `<span class="product-price-original">${formatCurrency(product.price)}</span>` : ""}
          <span class="product-price" ${discount > 0 ? 'style="text-decoration: none; font-weight: 800;"' : ""}>${formatCurrency(finalPrice)}</span>
        </div>
        <div class="product-stock" style="color: ${stockColor};">Stock: ${product.stock}</div>
        <div class="product-footer">
          ${
            requiredVipLevel > 0 && !isUserVIPEligible
              ? `
            <button class="add-to-cart-btn" disabled style="opacity: 0.5; cursor: not-allowed;">
              🔒 Upgrade to Buy
            </button>
            <div style="color: #d4af37; font-size: 11px; margin-top: 6px; text-align: center; font-weight: 600;">
              VIP ${requiredVipLevel}+ Required
            </div>
          `
              : `
            <button class="add-to-cart-btn" data-id="${product.id}" ${!canAddToCart ? "disabled" : ""}>
              ${isOutOfStock ? "Out of Stock" : "Add to Cart"}
            </button>
          `
          }
        </div>
      </div>
    </div>
  `;
    })
    .join("");

  container.innerHTML = productsHTML;

  // Add event listeners for add to cart buttons
  container.querySelectorAll(".add-to-cart-btn").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();

      if (btn.disabled) return;

      const productId = btn.dataset.id;
      const product = filteredProducts.find((p) => p.id === productId);
      if (product && Number(product.stock) > 0) {
        // Check VIP eligibility one more time
        const requiredVipLevel = product.requiredVipLevel || 0;
        console.log(
          "Adding to cart:",
          product.name,
          "requiredVipLevel:",
          requiredVipLevel,
          "userVipLevel:",
          userVipLevel,
        );
        if (requiredVipLevel > 0 && userVipLevel < requiredVipLevel) {
          toastError(
            `❌ VIP ${requiredVipLevel}+ membership required for this product`,
          );
          return;
        }

        // Add scale animation + ripple to button for optimistic UI
        btn.classList.add("optimistic", "ripple");
        setTimeout(() => {
          btn.classList.remove("optimistic", "ripple");
        }, 500);

        // Optimistic UI feedback - pulse cart button
        const cartBtn = document.querySelector("#cart-btn");
        if (cartBtn) {
          cartBtn.classList.add("pulse");
          setTimeout(() => {
            cartBtn.classList.remove("pulse");
          }, 600);
        }

        toastSuccess(`✅ Đã thêm ${product.name} vào giỏ hàng`, 3000);

        // Use final price with discount applied
        const finalPrice = calculateFinalPrice(product);
        store.dispatch({
          type: ACTION_TYPES.ADD_TO_CART,
          payload: { ...product, quantity: 1, finalPrice },
        });
      }
    };
  });

  // Global click handler for product details navigation (delegation)
  container.addEventListener("click", (event) => {
    const card = event.target.closest(".product-card");
    if (!card) return;

    const productId = card.dataset.id;
    if (!productId) return;

    // avoid navigation when click Add to Cart button
    if (event.target.closest(".add-to-cart-btn")) {
      return;
    }

    window.location.href = `product.html?id=${productId}`;
  });
}
