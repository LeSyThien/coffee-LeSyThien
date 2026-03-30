import store from "../store/index.js";
import { ACTION_TYPES } from "../store/actions.js";
import { auth } from "../services/firebase.service.js";
import { checkoutTransaction } from "../services/transaction.service.js";
import { db } from "../services/firebase.service.js";

export function renderCart(state) {
  let cartElement = document.getElementById("cart");
  const cartContainer = document.getElementById("cart-container");

  if (!cartElement) {
    cartElement = document.createElement("div");
    cartElement.id = "cart";
    cartElement.innerHTML = `
      <h3 style="margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 10px;">Your Cart</h3>
      <div class="cart-list"></div>
      <div style="margin-top: 15px; display: flex; justify-content: space-between; font-weight: bold;">
        <span>Total:</span>
        <span class="cart-total">0đ</span>
      </div>
    `;
    if (cartContainer) {
      cartContainer.appendChild(cartElement);
    } else {
      document.body.appendChild(cartElement);
    }
  }

  const { cartOpen } = state.ui;
  const { items, total } = state.cart;
  const user = state.user.data;

  // Toggle trạng thái hiển thị bằng Class
  if (cartOpen) {
    cartElement.classList.add("open");
  } else {
    cartElement.classList.remove("open");
  }

  // Render danh sách sản phẩm
  const cartContent =
    items.length > 0
      ? items
          .map(
            (item) => `
        <div class="cart-item">
          <span>${item.name} x${item.quantity}</span>
          <span>${(item.price * item.quantity).toLocaleString()}đ</span>
        </div>
      `,
          )
          .join("")
      : '<p class="empty-msg">Your cart is empty</p>';

  // Cập nhật vùng dữ liệu
  const listContainer = cartElement.querySelector(".cart-list");
  const totalContainer = cartElement.querySelector(".cart-total");

  if (listContainer) listContainer.innerHTML = cartContent;
  if (totalContainer) totalContainer.innerText = `${total.toLocaleString()}đ`;

  // Add or update checkout section
  let checkoutSection = cartElement.querySelector(".cart-checkout");
  if (items.length > 0) {
    if (!checkoutSection) {
      // Create checkout section
      checkoutSection = document.createElement("div");
      checkoutSection.className = "cart-checkout";
      cartElement.appendChild(checkoutSection);
    }

    const enoughBalance = user && user.balance >= total;
    const balanceStatus = user
      ? `Số dư: ${user.balance.toLocaleString()}đ`
      : "Chưa đăng nhập";

    checkoutSection.innerHTML = `
      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #333;">
        <div style="font-size: 12px; color: #aaa; margin-bottom: 10px;">
          ${balanceStatus}
        </div>
        <button id="checkout-btn" style="
          width: 100%;
          padding: 10px;
          background: ${enoughBalance ? "#4caf50" : "#999"};
          color: white;
          border: none;
          border-radius: 6px;
          cursor: ${enoughBalance ? "pointer" : "not-allowed"};
          font-weight: bold;
          opacity: ${enoughBalance ? "1" : "0.6"};
        ">
          ${!user ? "🔐 Đăng nhập để thanh toán" : enoughBalance ? "✓ Thanh toán" : "💰 Nạp thêm tiền"}
        </button>
        ${
          !enoughBalance && user
            ? `
          <div style="margin-top: 8px; font-size: 12px; color: #ff4d4f;">
            Cần thêm: ${(total - user.balance).toLocaleString()}đ
          </div>
        `
            : ""
        }
      </div>
    `;

    // Bind checkout button
    const checkoutBtn = checkoutSection.querySelector("#checkout-btn");
    if (checkoutBtn) {
      checkoutBtn.onclick = async (e) => {
        e.stopPropagation();

        if (!user) {
          // Redirect to login
          window.location.href = "login.html";
          return;
        }

        if (user.balance < total) {
          // Redirect to deposit
          window.location.href = "deposit.html";
          return;
        }

        // Proceed with checkout
        await handleCheckout(items, total);
      };
    }
  } else if (checkoutSection) {
    // Remove checkout section if cart is empty
    checkoutSection.remove();
  }
}

async function handleCheckout(items, total) {
  const user = auth.currentUser;
  if (!user) {
    alert("❌ Bạn chưa đăng nhập");
    return;
  }

  try {
    // Set global loading state
    store.dispatch({ type: ACTION_TYPES.SET_GLOBAL_LOADING, payload: true });

    // Generate unique clientRequestId (idempotency key)
    // Format: timestamp + random ID
    const clientRequestId = `${user.uid}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Prepare order data
    const orderData = {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      total: total,
    };

    // Call transaction with idempotency key
    const result = await checkoutTransaction(
      db,
      user.uid,
      orderData,
      clientRequestId,
    );

    // Success - clear cart immediately
    store.dispatch({ type: ACTION_TYPES.CLEAR_CART });

    // Inform user of pending approval
    showToast(
      `⏳ Đã tạo đơn hàng ${result.orderId.substring(0, 8)}, chờ admin duyệt thanh toán...`,
      "info",
    );

    // Close cart after order creation
    store.dispatch({ type: ACTION_TYPES.TOGGLE_CART });
  } catch (error) {
    console.error("Checkout failed:", error);
    let errorMsg = "❌ Thanh toán thất bại";
    if (error.message) {
      errorMsg = "❌ " + error.message;
    }
    showToast(errorMsg, "error");
  } finally {
    // Clear global loading state
    store.dispatch({ type: ACTION_TYPES.SET_GLOBAL_LOADING, payload: false });
  }
}

// Simple toast notification (can be improved later)
function showToast(message, type = "info") {
  const existingToast = document.getElementById("app-toast");
  if (existingToast) existingToast.remove();

  const toast = document.createElement("div");
  toast.id = "app-toast";
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${type === "success" ? "#4caf50" : type === "error" ? "#ff4d4f" : "#333"};
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 2000;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(toast);

  // Add animation
  if (!document.getElementById("toast-animation-style")) {
    const style = document.createElement("style");
    style.id = "toast-animation-style";
    style.innerHTML = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.style.animation = "slideIn 0.3s ease-out reverse forwards";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
