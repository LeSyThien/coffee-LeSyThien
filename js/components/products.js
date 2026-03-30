import store from "../store/index.js";
import { ACTION_TYPES } from "../store/actions.js";

function formatCurrency(value) {
  if (typeof value !== "number") value = Number(value) || 0;
  return value.toLocaleString("vi-VN") + "đ";
}

export function renderProducts(state) {
  const container = document.getElementById("products");
  if (!container) return;

  const products = state.products?.list || [];
  const searchQuery = state.ui?.searchQuery || "";

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
    .map(
      (product) => `
    <div class="product-card" data-id="${product.id}">
      ${product.image ? `<img src="${product.image}" alt="${product.name}" class="product-image">` : `<div class="product-image" style="background: var(--color-surface-l2); display: flex; align-items: center; justify-content: center; font-size: 3rem;">☕</div>`}
      <div class="product-content">
        <h3 class="product-name">${product.name}</h3>
        <p class="product-description">${product.description || "No description"}</p>
        <div class="product-footer">
          <span class="product-price">${formatCurrency(product.price)}</span>
          <button class="add-to-cart-btn" data-id="${product.id}">
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  container.innerHTML = productsHTML;

  // Add event listeners for add to cart buttons
  container.querySelectorAll(".add-to-cart-btn").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation(); // Prevent card click

      const productId = btn.dataset.id;
      const product = filteredProducts.find((p) => p.id === productId);
      if (product) {
        // Add scale animation to button
        btn.style.transform = "scale(0.95)";
        setTimeout(() => {
          btn.style.transform = "";
        }, 150);

        // Show cart float animation
        showCartFloat(product.name);

        store.dispatch({
          type: ACTION_TYPES.ADD_TO_CART,
          payload: { ...product, quantity: 1 },
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

// Cart float animation function
function showCartFloat(productName) {
  const floatEl = document.createElement("div");
  floatEl.className = "cart-float";
  floatEl.textContent = `Added ${productName} to cart!`;
  document.body.appendChild(floatEl);

  setTimeout(() => {
    floatEl.remove();
  }, 3000);
}
