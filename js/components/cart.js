import store from "../store/index.js";
import { ACTION_TYPES } from "../store/actions.js";
import { auth } from "../services/firebase.service.js";
import { checkoutTransaction } from "../services/transaction.service.js";
import { db } from "../services/firebase.service.js";
import {
  toastSuccess,
  toastError,
  toastInfo,
  initializeToastContainer,
} from "../services/toast.service.js";
import {
  onSnapshot,
  query,
  collection,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function renderCart(state) {
  try {
    // Check if cart container exists in DOM
    const cartContainer = document.getElementById("cart-root");
    if (!cartContainer) {
      return; // Silent return, no logging
    }

    // Initialize cart HTML structure if missing
    if (!cartContainer.innerHTML) {
      cartContainer.innerHTML = `
        <div class="cart-sidebar">
          <div class="cart-header">
            <h3>🛒 Your Cart</h3>
            <button id="close-cart-btn" style="background: none; border: none; color: #ccc; font-size: 20px; cursor: pointer;">✕</button>
          </div>
          <div class="cart-list"></div>
          <div class="cart-total-section">
            <div>Total: <span class="cart-total">0đ</span></div>
          </div>
        </div>
      `;

      // Add close button handler
      const closeBtn = cartContainer.querySelector("#close-cart-btn");
      if (closeBtn) {
        closeBtn.onclick = () => {
          store.dispatch({ type: ACTION_TYPES.TOGGLE_CART });
        };
      }
    }

    // Safe check for state structure
    if (!state || !state.ui || !state.cart) {
      return;
    }

    const { cartOpen } = state.ui;
    const { items, total } = state.cart;
    const user = state.user?.data;

    // Check if cart-list container exists (safe check)
    const cartListContainer = cartContainer.querySelector(".cart-list");
    const cartTotalContainer = cartContainer.querySelector(".cart-total");
    if (!cartListContainer || !cartTotalContainer) {
      return;
    }

    // Toggle trạng thái hiển thị bằng Class
    if (cartOpen) {
      cartContainer.classList.add("open");
    } else {
      cartContainer.classList.remove("open");
    }

    // Render danh sách sản phẩm
    const cartContent =
      items.length > 0
        ? items
            .map(
              (item) => `
          <div class="cart-item">
            <span>${item.name} x${item.quantity}</span>
            <span>${((item.finalPrice || item.price) * item.quantity).toLocaleString()}đ</span>
          </div>
        `,
            )
            .join("")
        : '<p class="empty-msg">Your cart is empty</p>';

    // Cập nhật vùng dữ liệu
    const listContainer = cartContainer.querySelector(".cart-list");
    const totalContainer = cartContainer.querySelector(".cart-total");

    if (listContainer) listContainer.innerHTML = cartContent;
    if (totalContainer) totalContainer.innerText = `${total.toLocaleString()}đ`;

    // Add or update checkout section
    let checkoutSection = cartContainer.querySelector(".cart-checkout");
    if (items.length > 0) {
      if (!checkoutSection) {
        // Create checkout section
        checkoutSection = document.createElement("div");
        checkoutSection.className = "cart-checkout";
        cartContainer.appendChild(checkoutSection);
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

          // ✅ SECURITY FIX: Prevent duplicate checkout requests
          if (checkoutBtn.disabled) {
            return;
          }

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
          checkoutBtn.disabled = true;
          const originalText = checkoutBtn.textContent;
          checkoutBtn.textContent = "⏳ Processing...";
          await handleCheckout(items, total);
          checkoutBtn.disabled = false;
          checkoutBtn.textContent = originalText;
        };
      }
    } else if (checkoutSection) {
      // Remove checkout section if cart is empty
      checkoutSection.remove();
    }
  } catch (error) {
    console.error("Error rendering cart:", error);
    console.warn("Cart rendering failed, DOM may not be ready");
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

    // Prepare order data with finalPrice details
    const orderData = {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price, // original price
        finalPrice: item.finalPrice || item.price, // discounted price
        discount: Number(item.discount) || 0, // discount percentage
        quantity: item.quantity,
        itemTotal: (item.finalPrice || item.price) * item.quantity, // final total for this item
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

    // ✅ SECURITY FIX: Validate orderId exists before using it
    if (!result || !result.orderId) {
      throw new Error(
        "No Order ID returned from checkout. Transaction may have failed.",
      );
    }

    // Success - clear cart immediately
    store.dispatch({ type: ACTION_TYPES.CLEAR_CART });

    // Inform user of pending approval
    const orderIdShort = result.orderId.substring(0, 8);
    toastInfo(
      `⏳ Đã tạo đơn hàng ${orderIdShort}, chờ admin duyệt thanh toán...`,
      4000,
    );

    // ✅ NEW: Listen for order transaction status changes
    if (result.txId) {
      setupOrderTransactionListener(user.uid, result.txId, orderIdShort);
    }

    // Close cart after order creation
    store.dispatch({ type: ACTION_TYPES.TOGGLE_CART });
  } catch (error) {
    console.error("Checkout failed:", error);
    let errorMsg = "❌ Thanh toán thất bại";
    if (error.message) {
      errorMsg = "❌ " + error.message;
    }
    toastError(errorMsg, 5000);
  } finally {
    // Clear global loading state
    store.dispatch({ type: ACTION_TYPES.SET_GLOBAL_LOADING, payload: false });
  }
}

// ✅ NEW: Listen for order transaction status changes
function setupOrderTransactionListener(userId, txId, orderIdShort) {
  const txCollection = collection(db, "transactions");
  const q = query(txCollection, where("userId", "==", userId));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      snapshot.docs.forEach((doc) => {
        if (doc.id === txId) {
          const data = doc.data();
          if (data.status === "success") {
            toastSuccess(
              `✅ Thanh toán được duyệt! Đơn hàng ${orderIdShort} đã được xác nhận.`,
              4000,
            );
            unsubscribe(); // Stop listening after success
          } else if (data.status === "rejected") {
            toastError(
              `❌ Thanh toán bị từ chối. Vui lòng liên hệ admin để biết thêm chi tiết.`,
              5000,
            );
            unsubscribe(); // Stop listening after rejection
          }
        }
      });
    },
    (error) => {
      console.error("Error listening to transaction status:", error);
    },
  );
}

export function initCart() {
  // Initialize toast container
  initializeToastContainer();

  renderCart(store.getState());
  store.subscribe(() => {
    renderCart(store.getState());
  });
}
