import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./services/firebase.service.js";
import store from "./store/index.js";
import { renderNavbar } from "./components/navbar.js";
import { renderCart } from "./components/cart.js";
import { initializeAuth } from "./core/auth-init.js";
import { ACTION_TYPES } from "./store/actions.js";

initializeAuth();

// Re-render nav + cart when state changes
store.subscribe(() => {
  const state = store.getState();
  renderNavbar(state);
  renderCart(state);
});

const params = new URLSearchParams(window.location.search);
const id = params.get("id");

const root = document.getElementById("product-root");

async function renderProductDetail(productId) {
  if (!productId) {
    root.innerHTML = `
      <div class="not-found">
        <h2>Product not found</h2>
        <p>Invalid product, please return to shop.</p>
        <a href="index.html" class="btn-primary">Back to Shop</a>
      </div>
    `;
    return;
  }

  root.innerHTML = `<div class="loading">Loading product...</div>`;

  try {
    const docRef = doc(db, "products", productId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      root.innerHTML = `
        <div class="not-found">
          <h2>Product not found</h2>
          <p>This product does not exist or has been removed.</p>
          <a href="index.html" class="btn-primary">Back to shop</a>
        </div>
      `;
      return;
    }

    const p = snap.data();
    if (!p.available) {
      root.innerHTML = `
        <div class="not-found">
          <h2>Product unavailable</h2>
          <p>Sorry, this product is currently unavailable.</p>
          <a href="index.html" class="btn-primary">Back to shop</a>
        </div>
      `;
      return;
    }

    const discount = p.discount || 0;
    const discountedPrice = p.price * (1 - discount / 100);

    root.innerHTML = `
      <div class="product-detail">
        <img src="${p.image || "https://placehold.co/800x520?text=Coffee"}" alt="${p.name}" class="product-image-large" />

        <div class="product-info">
          <h1 class="product-title">${p.name}</h1>
          <div class="product-meta">
            <span class="tag">${p.category || "Uncategorized"}</span>
            <span class="tag">Stock: ${p.stock || 0}</span>
            <span class="tag">${p.available ? "Available" : "Unavailable"}</span>
            ${discount > 0 ? `<span class="tag">-${discount}%</span>` : ""}
          </div>

          <div class="product-price">
            ${discount > 0 ? `<span style="text-decoration: line-through; margin-right: 10px; color: #aaa; font-size: 1.1rem;">${formatCurrency(p.price)}</span><span>${formatCurrency(discountedPrice)}</span>` : formatCurrency(p.price)}
          </div>

          <p>${p.description || "No description provided."}</p>

          <div style="margin-top: 16px; display: flex; gap: 12px; align-items: center;">
            <button id="add-to-cart" class="btn-primary" ${p.stock <= 0 ? "disabled" : ""}>Add to Cart</button>
            <button id="go-back" class="btn-primary" style="background: #222; color: #fff;">Back to Shop</button>
          </div>

          <div class="section">
            <h3>Product Specs</h3>
            <ul>
              <li>Origin: ${p.origin || "Local farm"}</li>
              <li>Roast level: ${p.roast || "Medium"}</li>
              <li>Roast date: ${p.roastedDate || "N/A"}</li>
              <li>Process: ${p.process || "N/A"}</li>
            </ul>
          </div>

          <div class="section">
            <h3>Brewing Guide</h3>
            <p>${p.brewingGuide || "1:15 ratio, water at 92°C, brew for 3-4 minutes."}</p>
          </div>

          <div class="section">
            <h3>Frequently Bought Together</h3>
            <ul>
              <li>Paper filters</li>
              <li>Hand grinder</li>
              <li>Gift box set</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    document.getElementById("go-back").addEventListener("click", () => {
      window.location.href = "index.html";
    });

    document.getElementById("add-to-cart").addEventListener("click", () => {
      if (p.stock <= 0) {
        alert("Out of stock");
        return;
      }
      store.dispatch({
        type: ACTION_TYPES.ADD_TO_CART,
        payload: {
          id: productId,
          name: p.name,
          price: discountedPrice || p.price,
          image: p.image,
          quantity: 1,
        },
      });
      const event = new Event("cart-updated");
      window.dispatchEvent(event);
      const float = document.createElement("div");
      float.className = "cart-float";
      float.textContent = `Added ${p.name} to cart`;
      document.body.appendChild(float);
      setTimeout(() => float.remove(), 1200);
    });
  } catch (err) {
    root.innerHTML = `<div class="not-found">Error loading product: ${err.message}</div>`;
    console.error(err);
  }
}

function formatCurrency(value) {
  if (typeof value !== "number") value = Number(value) || 0;
  return value.toLocaleString("vi-VN") + "đ";
}

renderNavbar(store.getState());
renderCart(store.getState());

if (!id) {
  renderProductDetail(null);
} else {
  renderProductDetail(id);
}
