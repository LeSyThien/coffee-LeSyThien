import {
  doc,
  getDoc,
  updateDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
  getDocs,
  where,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  onAuthStateChanged,
  getIdTokenResult,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import store from "../store/index.js";
import { renderNavbar } from "../components/navbar.js";
import { renderCart } from "../components/cart.js";
import { initializeAuth } from "../core/auth-init.js";
import {
  auth,
  db,
  updateOrderStatus,
  cancelOrderWithStockRestore,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductAvailability,
  toggleShowOnHome,
  toggleVipStore,
  logoutUser,
} from "../services/firebase.service.js";
import {
  setUserRole,
  getAllUsers,
  promoteToAdmin,
  demoteToUser,
} from "../services/role.service.js";

// ❌ DEPRECATED - Cloud Functions (commented out until Blaze plan enabled)
// import { functions, httpsCallable } from "../js/services/firebase.service.js";

let hasInitialized = false;
let ordersUnsub = null;
let productsUnsub = null;
let transactionsUnsub = null;
let depositsUnsub = null;
let currentOrders = [];
let currentProducts = [];
let currentTransactions = [];
let currentDeposits = [];
let usersCache = new Map(); // Cache for user emails
let editingProductId = null;
let revenueChart = null;

// 🔄 DUAL-MODE TRANSACTION HANDLING
// ⚠️ Set to false for development (no Blaze plan) - using Firestore directly
// Change to true when Cloud Functions are available and Blaze plan is enabled
const USE_CLOUD_FUNCTIONS = false;

// ❌ DEPRECATED - Cloud Functions wrappers (commented out for Blaze deployment)
// const approveTransactionCF = httpsCallable(functions, "approveTransaction");
// const rejectTransactionCF = httpsCallable(functions, "rejectTransaction");

/**
 * ⚠️ HELPER: Verify current user has admin claim
 * Used for local mode admin check with email fallback
 */
async function verifyAdminClaim() {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  const tokenResult = await getIdTokenResult(user);
  let isAdmin = tokenResult.claims.admin === true;

  // Fallback: If no admin claim, check if email matches admin email
  if (!isAdmin && user.email === "sythien09@gmail.com") {
    isAdmin = true;
  }

  if (!isAdmin) {
    throw new Error("User does not have admin privileges");
  }
  return true;
}

// ===== AUTH GUARD =====
// REMOVED: Synchronous guardAdmin causes redirect loops
// Now using proper async auth checking in init()

// ===== EXPIRE OLD TRANSACTIONS =====
async function expireOldTransactions() {
  try {
    // ✅ FIXED: Use Firestore Timestamp instead of JavaScript Date
    const twentyFourHoursAgo = Timestamp.fromDate(
      new Date(Date.now() - 24 * 60 * 60 * 1000),
    );

    const q = query(
      collection(db, "transactions"),
      where("status", "==", "pending"),
      where("createdAt", "<", twentyFourHoursAgo),
    );

    const snapshot = await getDocs(q);
    const batch = [];

    snapshot.forEach((doc) => {
      batch.push(
        updateDoc(doc.ref, {
          status: "expired",
          updatedAt: serverTimestamp(),
        }),
      );
    });

    await Promise.all(batch);

    if (batch.length > 0) {
      console.log(`Expired ${batch.length} old transactions`);
    }
  } catch (error) {
    console.error("Error expiring old transactions:", error);
  }
}
async function getUserEmail(userId) {
  if (usersCache.has(userId)) {
    return usersCache.get(userId);
  }

  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (userDoc.exists()) {
      const email = userDoc.data().email || "Unknown";
      usersCache.set(userId, email);
      return email;
    }
  } catch (error) {
    console.error("Error fetching user:", error);
  }

  return "Unknown";
}
function formatCurrency(value) {
  if (typeof value !== "number") value = Number(value) || 0;
  return value.toLocaleString("vi-VN") + "đ";
}

function formatDate(date) {
  return new Date(date).toLocaleString("vi-VN");
}

// ===== REVENUE CHART =====
function initializeRevenueChart() {
  const ctx = document.getElementById("revenue-chart");
  if (!ctx) return;

  revenueChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Revenue",
          data: [],
          borderColor: "#d4af37",
          backgroundColor: "rgba(212, 175, 55, 0.1)",
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: "#d4af37",
          pointBorderColor: "#fff",
          pointBorderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointHoverBackgroundColor: "#c67c4e",
          pointHoverBorderColor: "#fff",
          pointHoverBorderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: "rgba(26, 26, 28, 0.95)",
          titleColor: "#d4af37",
          bodyColor: "#fff",
          borderColor: "#d4af37",
          borderWidth: 1,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: function (context) {
              return formatDate(context[0].parsed.x);
            },
            label: function (context) {
              return `Revenue: ${formatCurrency(context.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
          ticks: {
            color: "#b0b0b0",
            font: {
              size: 12,
            },
          },
        },
        y: {
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
          ticks: {
            color: "#b0b0b0",
            font: {
              size: 12,
            },
            callback: function (value) {
              return formatCurrency(value);
            },
          },
        },
      },
      animation: {
        duration: 1000,
        easing: "easeOutCubic",
      },
      elements: {
        point: {
          hoverRadius: 8,
        },
      },
    },
  });

  updateRevenueChart("30d");
}

function updateRevenueChart(period) {
  if (!revenueChart) return;

  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);

  // Generate sample data (in real app, this would come from analytics)
  const labels = [];
  const data = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    labels.push(date);

    // Calculate revenue for this date from orders
    const dayRevenue = currentOrders
      .filter((order) => {
        const orderDate = new Date(
          order.createdAt?.toDate?.() || order.createdAt,
        );
        return (
          orderDate.toDateString() === date.toDateString() &&
          order.status === "completed"
        );
      })
      .reduce((sum, order) => sum + (Number(order.total) || 0), 0);

    data.push(dayRevenue);
  }

  revenueChart.data.labels = labels.map((date) => formatDate(date));
  revenueChart.data.datasets[0].data = data;
  revenueChart.update("active");
}

// ===== ENHANCED STAT CARDS =====
function renderStatCards(orders) {
  const statsContainer = document.getElementById("stat-cards");
  if (!statsContainer) return;

  const totalOrders = orders.length;
  const completedOrders = orders.filter((o) => o.status === "completed").length;
  const totalRevenue = orders
    .filter((o) => o.status === "completed")
    .reduce((acc, o) => acc + (Number(o.total) || 0), 0);

  // Calculate trends (comparing to previous period using real data)
  const toDate = (orderDate) =>
    orderDate?.toDate?.() ? orderDate.toDate() : new Date(orderDate);

  const now = new Date();
  const currentPeriodStart = new Date(now);
  currentPeriodStart.setDate(now.getDate() - 30);
  const previousPeriodStart = new Date(currentPeriodStart);
  previousPeriodStart.setDate(currentPeriodStart.getDate() - 30);

  const periodRevenue = (from, to) =>
    orders
      .filter((o) => o.status === "completed")
      .filter((o) => {
        const d = toDate(o.createdAt);
        return d >= from && d < to;
      })
      .reduce((acc, o) => acc + (Number(o.total) || 0), 0);

  const currentPeriodRevenue = periodRevenue(currentPeriodStart, now);
  const previousPeriodRevenue = periodRevenue(
    previousPeriodStart,
    currentPeriodStart,
  );
  const revenueChange = previousPeriodRevenue
    ? ((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) *
      100
    : currentPeriodRevenue > 0
      ? 100
      : 0;

  statsContainer.innerHTML = `
    <div class="stat-card revenue-primary" style="animation-delay: 0.1s">
      <div class="stat-label">Total Revenue</div>
      <div class="stat-value">${formatCurrency(totalRevenue)}</div>
      <div class="stat-trend ${revenueChange >= 0 ? "positive" : "negative"}">
        <span>${revenueChange >= 0 ? "↗" : "↘"}</span>
        ${Math.abs(revenueChange).toFixed(1)}%
      </div>
    </div>
    <div class="stat-card" style="animation-delay: 0.2s">
      <div class="stat-label">Completed Orders</div>
      <div class="stat-value">${completedOrders}</div>
      <div class="stat-trend positive">
        <span>↗</span>
        12.5%
      </div>
    </div>
    <div class="stat-card" style="animation-delay: 0.3s">
      <div class="stat-label">Total Orders</div>
      <div class="stat-value">${totalOrders}</div>
      <div class="stat-trend positive">
        <span>↗</span>
        8.2%
      </div>
    </div>
  `;

  // Trigger animations
  setTimeout(() => {
    document.querySelectorAll(".stat-card").forEach((card) => {
      card.style.opacity = "1";
    });
  }, 100);
}

// ===== ENHANCED PRODUCTS TABLE =====
function renderProductsTable(products) {
  const container = document.getElementById("products-list");
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <h3>No products yet</h3>
        <p>Click "+ Add Product" to create your first coffee product</p>
      </div>
    `;
    return;
  }

  container.innerHTML = products
    .map(
      (p, i) => `
    <div class="table-row" style="animation-delay: ${i * 50}ms">
      <div class="product-image">☕</div>
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.description || "No description"}</div>
      </div>
      <div class="product-price">${formatCurrency(Number(p.price) || 0)}</div>
      <div>
        <span class="status-badge ${p.available ? "status-available" : "status-unavailable"}">
          ${p.available ? "Available" : "Unavailable"}
        </span>
      </div>
      <div class="row-actions">
        <button class="action-btn edit-btn" data-id="${p.id}" title="Edit" data-tooltip="Edit product">✏️</button>
        <button class="action-btn toggle-show-home-btn" data-id="${p.id}" title="Toggle Show on Home" style="color: ${p.showOnHome ? "#c89b3c" : "#666"}; transition: color 0.3s ease;">🏠</button>
        <button class="action-btn toggle-exclusive-vip-btn" data-id="${p.id}" title="Toggle Exclusive VIP" style="color: ${p.isExclusiveVIP ? "#d4af37" : "#888"}; transition: color 0.3s ease;">👑</button>
        <button class="action-btn toggle-availability-btn" data-id="${p.id}" title="Toggle availability" data-tooltip="Toggle availability">
          ${p.available ? "🔒" : "🔓"}
        </button>
        <button class="action-btn delete-btn" data-id="${p.id}" title="Hold 3s to Delete" data-tooltip="Hold 3s to Delete">🗑️</button>
      </div>
    </div>
  `,
    )
    .join("");

  // Attach event listeners with improved UX
  container.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const productId = btn.dataset.id;
      const product = products.find((p) => p.id === productId);
      if (product) openEditDrawer(product);
    });
  });

  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
    const productId = btn.dataset.id;
    const product = products.find((p) => p.id === productId);
    if (product) {
      attachHoldToDelete(btn, productId, product.name);
    }
  });

  container.querySelectorAll(".toggle-show-home-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const productId = btn.dataset.id;
      const product = products.find((p) => p.id === productId);
      if (!product) return;

      btn.disabled = true;
      btn.style.opacity = "0.5";
      try {
        await toggleShowOnHome(productId, !product.showOnHome);
        btn.style.color = !product.showOnHome ? "#c89b3c" : "#666";
        showToast(
          `Product "${product.name}" is now ${!product.showOnHome ? "shown" : "hidden"} on home page`,
          "success",
        );
      } catch (error) {
        showToast("Failed to toggle show on home: " + error.message, "error");
      } finally {
        btn.disabled = false;
        btn.style.opacity = "1";
      }
    });
  });

  container.querySelectorAll(".toggle-exclusive-vip-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const productId = btn.dataset.id;
      const product = products.find((p) => p.id === productId);
      if (!product) return;

      btn.disabled = true;
      btn.style.opacity = "0.5";
      try {
        await toggleVipStore(productId, !product.isExclusiveVIP);
        btn.style.color = !product.isExclusiveVIP ? "#d4af37" : "#888";
        showToast(
          `Product "${product.name}" is now ${!product.isExclusiveVIP ? "exclusive" : "not exclusive"} to VIP Store`,
          "success",
        );
      } catch (error) {
        showToast("Failed to toggle exclusive VIP: " + error.message, "error");
      } finally {
        btn.disabled = false;
        btn.style.opacity = "1";
      }
    });
  });

  container.querySelectorAll(".toggle-availability-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const productId = btn.dataset.id;
      const product = products.find((p) => p.id === productId);
      if (!product) return;

      btn.disabled = true;
      try {
        await toggleProductAvailability(productId, !product.available);
        showToast(
          `Product "${product.name}" is now ${product.available ? "unavailable" : "available"}`,
          "success",
        );
      } catch (error) {
        showToast("Failed to toggle availability: " + error.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Trigger row animations
  setTimeout(() => {
    container.querySelectorAll(".table-row").forEach((row) => {
      row.style.opacity = "1";
    });
  }, 100);
}

// ===== ORDERS TABLE =====
function renderOrdersTable(orders) {
  const container = document.getElementById("orders-list");
  if (!container) return;

  // Determine if we're showing archived or active orders
  const showArchived = localStorage.getItem("orders-tab") === "history";

  // Filter: hide completed orders older than 24 hours (archive logic)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const visibleOrders = showArchived
    ? orders.filter((order) => {
        if (order.status !== "completed") return false;
        const orderDate =
          order.createdAt?.toDate?.() || new Date(order.createdAt);
        return orderDate <= twentyFourHoursAgo;
      })
    : orders.filter((order) => {
        if (order.status === "completed") {
          const orderDate =
            order.createdAt?.toDate?.() || new Date(order.createdAt);
          return orderDate > twentyFourHoursAgo;
        }
        return true;
      });

  if (visibleOrders.length === 0) {
    const message = showArchived ? "No archived orders" : "No active orders";
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <h3>${message}</h3>
        <p>${showArchived ? "Completed orders older than 24 hours appear here" : "Orders will appear here when customers make purchases"}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="products-table">
      <div class="table-header">
        <div style="width: 40px"></div>
        <div>Order</div>
        <div>Email</div>
        <div>Total</div>
        <div>Status</div>
        <div>Actions</div>
      </div>
      ${visibleOrders
        .slice(0, 10)
        .map((order, i) => {
          const statusColor =
            order.status === "pending"
              ? "#d4af37"
              : order.status === "shipping"
                ? "#2196f3"
                : order.status === "completed"
                  ? "#4caf50"
                  : "#999";

          const statusLabel =
            order.status === "pending"
              ? "⏳ Pending"
              : order.status === "shipping"
                ? "🚚 Shipping"
                : order.status === "completed"
                  ? "✓ Completed"
                  : order.status;

          return `
        <div class="table-row" style="animation-delay: ${i * 50}ms">
          <div class="product-image">📦</div>
          <div class="product-info">
            <div class="product-name">${order.id?.substring(0, 12) || "Unknown"}</div>
            <div class="product-desc">${order.userEmail || "No email"}</div>
          </div>
          <div class="product-price">${formatCurrency(Number(order.total) || 0)}</div>
          <div>
            <span class="status-badge" style="
              background: ${statusColor}22;
              color: ${statusColor};
              border: 1px solid ${statusColor}44;
            ">
              ${statusLabel}
            </span>
          </div>
          <div class="row-actions">
            ${
              !showArchived && order.status === "pending"
                ? `
              <button class="action-btn ship-order-btn" data-id="${order.id}" title="Ship Order" style="color: #2196f3">🚚</button>
              <button class="action-btn cancel-order-btn" data-id="${order.id}" title="Cancel" style="color: #ff4d4f">✗</button>
            `
                : showArchived
                  ? `<span style="font-size: 12px; color: #4caf50;">✓ Archived</span>`
                  : !showArchived && order.status === "shipping"
                    ? `<span style="font-size: 12px; color: #2196f3;">Awaiting confirmation...</span>`
                    : `<span style="font-size: 12px; color: var(--text-muted)">—</span>`
            }
          </div>
        </div>
      `;
        })
        .join("")}
    </div>
  `;

  // Attach order action listeners
  if (!showArchived) {
    container.querySelectorAll(".ship-order-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const orderId = btn.dataset.id;
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          await updateOrderStatus(orderId, "shipping");
          showToast("Order marked as shipping!", "success");
        } catch (error) {
          showToast("Failed to update order: " + error.message, "error");
        } finally {
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll(".cancel-order-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const orderId = btn.dataset.id;
        if (btn.disabled) return;
        btn.disabled = true;
        try {
          await cancelOrderWithStockRestore(orderId);
          showToast("✅ Đơn hàng đã hủy và hàng đã được hoàn kho", "success");
        } catch (error) {
          showToast("Failed to cancel order: " + error.message, "error");
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // Trigger animations
  setTimeout(() => {
    container.querySelectorAll(".table-row").forEach((row) => {
      row.style.opacity = "1";
    });
  }, 100);
}

// ===== DEPOSITS TABLE (NEW) =====
function renderDepositsTable(deposits) {
  const container = document.getElementById("deposits-list");
  if (!container) return;

  if (deposits.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏦</div>
        <h3>No pending deposits</h3>
        <p>Deposit requests will appear here for approval</p>
      </div>
    `;
    return;
  }

  // Get user emails for all deposits
  const renderPromises = deposits.map(async (dep) => {
    const userEmail = await getUserEmail(dep.userId);
    return { ...dep, userEmail };
  });

  Promise.all(renderPromises).then((depositsWithEmails) => {
    container.innerHTML = `
      <div class="products-table">
        <div class="table-header">
          <div style="width: 40px"></div>
          <div>User</div>
          <div>Amount</div>
          <div>Payment Method</div>
          <div>Status</div>
          <div>Timestamp</div>
          <div>Actions</div>
        </div>
        ${depositsWithEmails
          .map(
            (dep, i) => `
          <div class="table-row" style="animation-delay: ${i * 50}ms">
            <div class="product-image">🏦</div>
            <div class="product-info">
              <div class="product-name">${dep.userEmail}</div>
              <div class="product-desc">${dep.id?.substring(0, 12) || "Unknown"}</div>
            </div>
            <div class="product-price">${formatCurrency(Number(dep.amount) || 0)}</div>
            <div style="font-size: 14px;">
              ${dep.paymentMethod || "unknown"}
            </div>
            <div>
              <span class="status-badge ${
                dep.status === "pending"
                  ? "status-pending"
                  : dep.status === "approved"
                    ? "status-success"
                    : dep.status === "rejected"
                      ? "status-rejected"
                      : "status-unavailable"
              }">
                ${dep.status || "pending"}
              </span>
            </div>
            <div class="product-price">${formatDate(dep.createdAt?.toDate?.() || new Date())}</div>
            <div class="row-actions">
              ${
                dep.status === "pending"
                  ? `
                <button class="action-btn approve-deposit-btn" data-id="${dep.id}" data-user-id="${dep.userId}" data-amount="${dep.amount}" title="Approve" style="color: #4caf50">✓</button>
                <button class="action-btn reject-deposit-btn" data-id="${dep.id}" data-user-id="${dep.userId}" data-amount="${dep.amount}" title="Reject with Reason" style="color: #ff4d4f">✗</button>
              `
                  : `<span style="font-size: 12px; color: var(--text-muted)">Final</span>`
              }
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;

    // Attach event listeners
    attachDepositListeners(container);

    // Trigger animations
    setTimeout(() => {
      container.querySelectorAll(".table-row").forEach((row) => {
        row.style.opacity = "1";
      });
    }, 100);
  });
}

function attachDepositListeners(container) {
  container.querySelectorAll(".approve-deposit-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const depositId = btn.dataset.id;
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await approveDepositHandler({ depositId });
        showToast("Deposit approved successfully!", "success");
      } catch (error) {
        showToast("Failed to approve deposit: " + error.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll(".reject-deposit-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const depositId = btn.dataset.id;
      const amount = btn.dataset.amount;
      openRejectDepositModal(depositId, amount);
    });
  });
}

// ===== REJECT DEPOSIT MODAL =====
function openRejectDepositModal(depositId, amount) {
  // Create modal if it doesn't exist
  let modal = document.getElementById("reject-deposit-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "reject-deposit-modal";
    modal.innerHTML = `
      <div id="reject-deposit-overlay" class="modal-overlay"></div>
      <div class="modal-content" style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #121214;
        border: 1px solid #1c1c1e;
        border-radius: 12px;
        padding: 28px;
        max-width: 500px;
        width: 90%;
        z-index: 2000;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      ">
        <h3 style="margin-bottom: 16px; color: #d4af37;">Từ Chối Nạp Tiền</h3>
        <p style="color: #aaa; margin-bottom: 16px;">
          Số tiền: <strong style="color: #fff;">${formatCurrency(amount)}</strong>
        </p>
        <label style="display: block; margin-bottom: 12px; color: #aaa; font-size: 14px;">
          Lý do từ chối:
        </label>
        <textarea id="reject-reason" placeholder="Ví dụ: Ảnh chuyển khoản mờ quá, chưa rõ số tiền..." style="
          width: 100%;
          height: 100px;
          padding: 10px;
          background: #0a0a0b;
          color: #fff;
          border: 1px solid #1c1c1e;
          border-radius: 8px;
          font-family: inherit;
          resize: vertical;
        "></textarea>
        <div style="display: flex; gap: 12px; margin-top: 20px;">
          <button id="cancel-reject-btn" style="
            flex: 1;
            padding: 10px;
            background: #1c1c1e;
            color: #aaa;
            border: 1px solid #1c1c1e;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
          ">Hủy</button>
          <button id="confirm-reject-btn" style="
            flex: 1;
            padding: 10px;
            background: #ff4d4f;
            color: #fff;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
          ">Từ Chối</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Set data attributes
  modal.dataset.depositId = depositId;

  // Show modal
  const overlay = document.getElementById("reject-deposit-overlay");
  modal.style.display = "block";
  overlay.style.display = "block";

  // Focus textarea
  document.getElementById("reject-reason").value = "";
  setTimeout(() => {
    document.getElementById("reject-reason").focus();
  }, 100);

  // Attach handlers
  const cancelBtn = document.getElementById("cancel-reject-btn");
  const confirmBtn = document.getElementById("confirm-reject-btn");

  const closeModal = () => {
    modal.style.display = "none";
    overlay.style.display = "none";
  };

  cancelBtn.onclick = closeModal;
  overlay.onclick = closeModal;

  confirmBtn.onclick = async () => {
    const reason = document.getElementById("reject-reason").value.trim();
    if (!reason) {
      showToast("Vui lòng nhập lý do từ chối", "error");
      return;
    }

    confirmBtn.disabled = true;
    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = "⏳ Processing...";

    try {
      await rejectDepositHandler({ depositId, reason });
      showToast("Deposit rejected successfully!", "success");
      closeModal();
    } catch (error) {
      showToast("Failed to reject deposit: " + error.message, "error");
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalText;
    }
  };
}

async function approveDepositHandler({ depositId }) {
  try {
    await verifyAdminClaim();

    await runTransaction(db, async (transaction) => {
      const depRef = doc(db, "deposit_requests", depositId);
      const depSnap = await transaction.get(depRef);

      if (!depSnap.exists()) {
        throw new Error("Deposit request not found");
      }

      const depData = depSnap.data();

      if (depData.status !== "pending") {
        throw new Error(`Deposit is ${depData.status}, not pending`);
      }

      const amount = depData.amount;
      const userId = depData.userId;

      // Get user
      const userRef = doc(db, "users", userId);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists()) {
        throw new Error("User not found");
      }

      const currentBalance = Number(userSnap.data().balance || 0);
      const newBalance = currentBalance + amount;

      // Update deposit status
      transaction.update(depRef, {
        status: "approved",
        updatedAt: serverTimestamp(),
      });

      // Update user balance
      transaction.update(userRef, {
        balance: newBalance,
        updatedAt: serverTimestamp(),
      });

      // Create notification for user
      const notifRef = doc(collection(db, "notifications"));
      transaction.set(notifRef, {
        userId,
        type: "deposit",
        title: "Nạp tiền thành công",
        message: `Nạp tiền ${formatCurrency(amount)} đã được phê duyệt`,
        createdAt: serverTimestamp(),
        read: false,
      });
    });

    return { success: true, message: "Deposit approved" };
  } catch (error) {
    console.error("Error approving deposit:", error);
    throw error;
  }
}

async function rejectDepositHandler({ depositId, reason }) {
  try {
    await verifyAdminClaim();

    await runTransaction(db, async (transaction) => {
      const depRef = doc(db, "deposit_requests", depositId);
      const depSnap = await transaction.get(depRef);

      if (!depSnap.exists()) {
        throw new Error("Deposit request not found");
      }

      const depData = depSnap.data();

      if (depData.status !== "pending") {
        throw new Error(`Deposit is ${depData.status}, not pending`);
      }

      const userId = depData.userId;
      const amount = depData.amount;

      // Update deposit status
      transaction.update(depRef, {
        status: "rejected",
        reason,
        updatedAt: serverTimestamp(),
      });

      // Create notification for user with reason
      const notifRef = doc(collection(db, "notifications"));
      transaction.set(notifRef, {
        userId,
        type: "deposit",
        title: "Nạp tiền bị từ chối",
        message: `Nạp tiền ${formatCurrency(amount)} bị từ chối. Lý do: ${reason}`,
        reason,
        createdAt: serverTimestamp(),
        read: false,
      });
    });

    return { success: true, message: "Deposit rejected" };
  } catch (error) {
    console.error("Error rejecting deposit:", error);
    throw error;
  }
}

// ===== TRANSACTIONS TABLE =====
function renderTransactionsTable(transactions) {
  const container = document.getElementById("transactions-list");
  if (!container) return;

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💳</div>
        <h3>No pending transactions</h3>
        <p>Pending transactions will appear here for approval</p>
      </div>
    `;
    return;
  }

  // Get user emails for all transactions
  const renderPromises = transactions.map(async (tx) => {
    const userEmail = await getUserEmail(tx.userId);
    return { ...tx, userEmail };
  });

  Promise.all(renderPromises).then((transactionsWithEmails) => {
    container.innerHTML = `
      <div class="products-table">
        <div class="table-header">
          <div style="width: 40px"></div>
          <div>User</div>
          <div>Type</div>
          <div>Amount</div>
          <div>Status</div>
          <div>Timestamp</div>
          <div>Actions</div>
        </div>
        ${transactionsWithEmails
          .map(
            (tx, i) => `
          <div class="table-row" style="animation-delay: ${i * 50}ms">
            <div class="product-image">💳</div>
            <div class="product-info">
              <div class="product-name">${tx.userEmail}</div>
              <div class="product-desc">${tx.id?.substring(0, 12) || "Unknown"}</div>
            </div>
            <div>
              <span class="status-badge ${tx.type === "deposit" ? "status-available" : "status-unavailable"}">
                ${tx.type || "unknown"}
              </span>
            </div>
            <div class="product-price">${formatCurrency(Number(tx.amount) || 0)}</div>
            <div>
              <span class="status-badge ${
                tx.status === "pending"
                  ? "status-pending"
                  : tx.status === "success"
                    ? "status-success"
                    : tx.status === "rejected"
                      ? "status-rejected"
                      : tx.status === "expired"
                        ? "status-expired"
                        : "status-unavailable"
              }">
                ${tx.status || "pending"}
              </span>
            </div>
            <div class="product-price">${formatDate(tx.createdAt?.toDate?.() || new Date())}</div>
            <div class="row-actions">
              ${
                tx.status === "pending"
                  ? `
                <button class="action-btn approve-tx-btn" data-id="${tx.id}" data-type="${tx.type}" data-amount="${tx.amount}" title="Approve" style="color: #4caf50">✓</button>
                <button class="action-btn reject-tx-btn" data-id="${tx.id}" title="Reject" style="color: #ff4d4f">✗</button>
              `
                  : `<span style="font-size: 12px; color: var(--text-muted)">Final</span>`
              }
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;

    // Attach event listeners
    attachTransactionListeners(container);

    // Trigger animations
    setTimeout(() => {
      container.querySelectorAll(".table-row").forEach((row) => {
        row.style.opacity = "1";
      });
    }, 100);
  });
}

// ===== ATTACH TRANSACTION LISTENERS =====
function attachTransactionListeners(container) {
  container.querySelectorAll(".approve-tx-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const txId = btn.dataset.id;
      const type = btn.dataset.type;
      // ⚠️ SECURITY: Don't pass amount from client
      // It will be read from database by handler
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await approveTransactionHandler({ txId, type });
        showToast("Transaction approved successfully!", "success");
      } catch (error) {
        showToast("Failed to approve transaction: " + error.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll(".reject-tx-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const txId = btn.dataset.id;
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await rejectTransactionHandler({ txId });
        showToast("Transaction rejected", "warning");
      } catch (error) {
        showToast("Failed to reject transaction: " + error.message, "error");
      } finally {
        btn.disabled = false;
      }
    });
  });
}
/**
 * 🔄 HANDLER: Approve Transaction (Dual-Mode)
 *
 * Routes to either:
 * - Cloud Function (production with Blaze plan)
 * - Local fallback (development without Blaze plan)
 *
 * @param {Object} data - { txId, type }
 * @returns {Object} Success response
 */
async function approveTransactionHandler({ txId, type }) {
  if (USE_CLOUD_FUNCTIONS) {
    // 🔥 PRODUCTION MODE: Cloud Functions with server-side admin check
    // ⚠️ Amount is read from database, NOT trusted from client
    console.log("📡 Using Cloud Function for transaction approval");
    const result = await approveTransactionCF({ txId, type });
    console.log("✅ Transaction approved via Cloud Function:", result);
    return result;
  } else {
    // 🔧 DEVELOPMENT MODE: Local fallback (no Cloud Functions needed)
    console.log("⚙️ Using local handler for transaction approval");
    const result = await approveTransactionLocal({ txId, type });
    console.log("✅ Transaction approved locally:", result);
    return result;
  }
}

/**
 * 🔄 HANDLER: Reject Transaction (Dual-Mode)
 *
 * Routes to either:
 * - Cloud Function (production)
 * - Local fallback (development)
 *
 * @param {Object} data - { txId }
 * @returns {Object} Success response
 */
async function rejectTransactionHandler({ txId }) {
  if (USE_CLOUD_FUNCTIONS) {
    // 🔥 PRODUCTION MODE: Cloud Functions
    console.log("📡 Using Cloud Function for transaction rejection");
    const result = await rejectTransactionCF({ txId });
    console.log("✅ Transaction rejected via Cloud Function:", result);
    return result;
  } else {
    // 🔧 DEVELOPMENT MODE: Local fallback
    console.log("⚙️ Using local handler for transaction rejection");
    const result = await rejectTransactionLocal({ txId });
    console.log("✅ Transaction rejected locally:", result);
    return result;
  }
}

/**
 * 🔧 LOCAL FALLBACK: Approve Transaction
 *
 * ⚠️ REQUIREMENTS:
 * - User must be admin (verified via custom claims)
 * - Amount is READ from database, NOT trusted from client
 * - Uses runTransaction for atomicity
 * - Updates: transaction status, user balance (if deposit)
 *
 * @param {Object} data - { txId, type }
 * @returns {Object} Success response
 */
async function approveTransactionLocal({ txId, type }) {
  try {
    // 🔒 SECURITY CHECK: Verify admin
    await verifyAdminClaim();
    console.log(`🔐 Admin verified: ${auth.currentUser.uid}`);

    if (!txId || typeof txId !== "string") {
      throw new Error("Invalid transaction ID");
    }

    if (!type || !["deposit", "payment"].includes(type)) {
      throw new Error("Invalid transaction type");
    }

    let result = null;

    // 🔄 ATOMIC TRANSACTION
    await runTransaction(db, async (transaction) => {
      // ===== 1️⃣ READ ALL DATA FIRST =====
      const txRef = doc(db, "transactions", txId);
      const txSnap = await transaction.get(txRef);

      if (!txSnap.exists()) {
        throw new Error("Transaction not found");
      }

      const txData = txSnap.data();
      const amount = txData.amount; // ⚠️ READ FROM DB, NOT CLIENT

      // Double-click prevention
      if (txData.status !== "pending") {
        throw new Error(`Transaction is ${txData.status}, not pending`);
      }

      // Get user document
      const userRef = doc(db, "users", txData.userId);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists()) {
        throw new Error("User not found");
      }

      const userData = userSnap.data();
      const currentBalance = Number(userData.balance || 0);

      // Read order if exists (BEFORE any writes!)
      let orderSnap = null;
      if (txData.orderId) {
        const orderRef = doc(db, "orders", txData.orderId);
        orderSnap = await transaction.get(orderRef);
      }

      // ===== 2️⃣ VALIDATE & CALCULATE (NO READS/WRITES) =====
      if (type === "payment" && currentBalance < amount) {
        throw new Error("Insufficient balance for payment");
      }

      const newBalance =
        type === "deposit" ? currentBalance + amount : currentBalance - amount;

      // ===== 3️⃣ WRITE ALL DATA AFTER READS =====

      // Update transaction status
      transaction.update(txRef, {
        status: "success",
        updatedAt: serverTimestamp(),
      });

      // Update user balance
      transaction.update(userRef, {
        balance: newBalance,
        updatedAt: serverTimestamp(),
      });

      // Update order if exists
      if (orderSnap && orderSnap.exists()) {
        const orderRef = doc(db, "orders", txData.orderId);
        transaction.update(orderRef, {
          status: "confirmed",
          updatedAt: serverTimestamp(),
        });
      }

      // Create notification
      const notifRef = doc(collection(db, "notifications"));
      transaction.set(notifRef, {
        userId: txData.userId,
        type: "transaction",
        message:
          type === "deposit"
            ? `Deposit of ${amount.toLocaleString("vi-VN")} VND has been approved`
            : `Payment of ${amount.toLocaleString("vi-VN")} VND has been approved`,
        createdAt: serverTimestamp(),
        read: false,
      });

      result = {
        success: true,
        message: `${type === "deposit" ? "Deposit" : "Payment"} approved`,
        newBalance: newBalance,
      };
    });

    console.log(`✅ Transaction ${txId} approved locally`);
    return result;
  } catch (error) {
    console.error("❌ Error approving transaction locally:", error);
    throw error;
  }
}

/**
 * 🔧 LOCAL FALLBACK: Reject Transaction
 *
 * ⚠️ REQUIREMENTS:
 * - User must be admin (verified via custom claims)
 * - Updates transaction status to "rejected"
 * - Cancels associated order and restores stock atomically
 * - Creates user notification
 *
 * @param {Object} data - { txId }
 * @returns {Object} Success response
 */
async function rejectTransactionLocal({ txId }) {
  try {
    // 🔒 SECURITY CHECK: Verify admin
    await verifyAdminClaim();
    console.log(`🔐 Admin verified: ${auth.currentUser.uid}`);

    if (!txId || typeof txId !== "string") {
      throw new Error("Invalid transaction ID");
    }

    // 🔄 ATOMIC TRANSACTION - Reject payment + Cancel order + Restore stock
    await runTransaction(db, async (transaction) => {
      const txRef = doc(db, "transactions", txId);
      const txSnap = await transaction.get(txRef);

      if (!txSnap.exists()) {
        throw new Error("Transaction not found");
      }

      const txData = txSnap.data();

      // Check if still pending
      if (txData.status !== "pending") {
        throw new Error(`Transaction is ${txData.status}, not pending`);
      }

      // Get associated order
      const orderId = txData.orderId;
      if (orderId) {
        const orderRef = doc(db, "orders", orderId);
        const orderSnap = await transaction.get(orderRef);

        if (orderSnap.exists()) {
          const orderData = orderSnap.data();

          // Restore stock for each item in the order
          for (const item of orderData.items || []) {
            const productRef = doc(db, "products", item.id || item.productId);
            const productSnap = await transaction.get(productRef);

            if (productSnap.exists()) {
              const productData = productSnap.data();
              const currentStock = Number(productData.stock || 0);
              const newStock = currentStock + (item.quantity || 0);

              // Update product stock (restore the quantity)
              transaction.update(productRef, {
                stock: newStock,
                available: true,
                updatedAt: serverTimestamp(),
              });
            }
          }

          // Cancel the associated order
          transaction.update(orderRef, {
            status: "cancelled",
            cancelledAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Update transaction status to rejected
      transaction.update(txRef, {
        status: "rejected",
        updatedAt: serverTimestamp(),
      });

      // Create notification
      const notifRef = doc(collection(db, "notifications"));
      transaction.set(notifRef, {
        userId: txData.userId,
        type: "transaction",
        message: "Your transaction has been rejected",
        createdAt: serverTimestamp(),
        read: false,
      });
    });

    console.log(`✅ Transaction ${txId} rejected & stock restored`);
    return {
      success: true,
      message: "Transaction rejected",
      txId: txId,
    };
  } catch (error) {
    console.error("❌ Error rejecting transaction locally:", error);
    throw error;
  }
}

// ===== ORDERS SUMMARY (Dashboard) =====
function renderOrdersSummary(orders) {
  const container = document.getElementById("orders-summary");
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <h3>No orders yet</h3>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="products-table">
      <div class="table-header">
        <div style="width: 40px"></div>
        <div>Order</div>
        <div>Email</div>
        <div>Total</div>
        <div>Status</div>
        <div>Actions</div>
      </div>
      ${orders
        .slice(0, 5)
        .map((order, i) => {
          const statusColor =
            order.status === "pending"
              ? "#d4af37"
              : order.status === "shipping"
                ? "#2196f3"
                : order.status === "completed"
                  ? "#4caf50"
                  : "#999";

          const statusLabel =
            order.status === "pending"
              ? "⏳ Pending"
              : order.status === "shipping"
                ? "🚚 Shipping"
                : order.status === "completed"
                  ? "✓ Completed"
                  : order.status;

          return `
        <div class="table-row" style="animation-delay: ${i * 50}ms">
          <div class="product-image">📦</div>
          <div class="product-info">
            <div class="product-name">${order.id?.substring(0, 12) || "Unknown"}</div>
          </div>
          <div class="product-desc">${order.userEmail || "Loading..."}</div>
          <div class="product-price">${formatCurrency(Number(order.total) || 0)}</div>
          <div>
            <span class="status-badge" style="
              background: ${statusColor}22;
              color: ${statusColor};
              border: 1px solid ${statusColor}44;
            ">
              ${statusLabel}
            </span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="action-btn" onclick="showOrderDetails('${order.id}')" title="View">👁️</button>
            ${
              order.status === "pending"
                ? `
              <button class="btn-ship-order" data-order-id="${order.id}" title="Ship Order" style="color: #2196f3; padding: 6px 10px; background: #0a0a0b; border: 1px solid #1c1c1e; border-radius: 6px; cursor: pointer; font-size: 12px;">
                Ship
              </button>
            `
                : ""
            }
          </div>
        </div>
      `;
        })
        .join("")}
    </div>
  `;

  // Attach ship order handlers
  container.querySelectorAll(".btn-ship-order").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const orderId = btn.dataset.orderId;
      btn.disabled = true;
      try {
        await updateOrderStatus(orderId, "shipping");
        showToast("Order marked as shipping!", "success");
        renderOrdersSummary(currentOrders);
      } catch (error) {
        showToast("Error shipping order: " + error.message, "error");
        btn.disabled = false;
      }
    });
  });

  // Trigger animations
  setTimeout(() => {
    container.querySelectorAll(".table-row").forEach((row) => {
      row.style.opacity = "1";
    });
  }, 100);
}

function attachHoldToDelete(button, productId, productName) {
  let holdTimer = null;
  let isHolding = false;
  let progressInterval = null;
  let holdProgress = 0;
  const holdDuration = 3000;

  button.addEventListener("mousedown", () => {
    isHolding = true;
    holdProgress = 0;
    button.classList.add("is-holding");

    // Start progress tracking for visual feedback
    progressInterval = setInterval(() => {
      holdProgress += 50;
      const progress = (holdProgress / holdDuration) * 100;
      // Update CSS variable for potential progress bar
      button.style.setProperty("--hold-progress", progress + "%");
    }, 50);

    // Timer for actual delete after 3 seconds
    holdTimer = setTimeout(async () => {
      button.classList.remove("is-holding");
      button.classList.add("deleted");
      button.textContent = "✓ Deleted";
      button.disabled = true;
      clearInterval(progressInterval);

      // Execute delete
      try {
        await deleteProduct(productId);
        showToast(`Product "${productName}" deleted successfully`, "success");
      } catch (error) {
        showToast(`Failed to delete product: ${error.message}`, "error");
        button.classList.remove("deleted");
        button.textContent = "🗑️";
        button.disabled = false;
      }

      isHolding = false;
    }, holdDuration);
  });

  button.addEventListener("mouseup", () => {
    if (isHolding && holdTimer) {
      clearTimeout(holdTimer);
      clearInterval(progressInterval);
      button.classList.remove("is-holding");
      button.style.setProperty("--hold-progress", "0%");
      isHolding = false;
    }
  });

  button.addEventListener("mouseleave", () => {
    if (isHolding && holdTimer) {
      clearTimeout(holdTimer);
      clearInterval(progressInterval);
      button.classList.remove("is-holding");
      button.style.setProperty("--hold-progress", "0%");
      isHolding = false;
    }
  });
}

// For order rejection - simpler version without product name
function attachHoldToDeleteOrder(button, onComplete) {
  let holdTimer = null;
  let isHolding = false;
  let progressInterval = null;
  let holdProgress = 0;
  const holdDuration = 3000;

  button.addEventListener("mousedown", () => {
    isHolding = true;
    holdProgress = 0;
    button.classList.add("holding");

    // Start progress tracking for visual feedback
    progressInterval = setInterval(() => {
      holdProgress += 50;
      const progress = (holdProgress / holdDuration) * 100;
      button.style.setProperty("--hold-progress", progress + "%");
    }, 50);

    // Timer for actual delete after 3 seconds
    holdTimer = setTimeout(() => {
      button.classList.remove("holding");
      button.classList.add("deleted");
      button.textContent = "✓ Rejected";
      button.disabled = true;
      clearInterval(progressInterval);
      onComplete();
      isHolding = false;
    }, holdDuration);
  });

  button.addEventListener("mouseup", () => {
    if (isHolding && holdTimer) {
      clearTimeout(holdTimer);
      clearInterval(progressInterval);
      button.classList.remove("holding");
      button.style.setProperty("--hold-progress", "0%");
      isHolding = false;
    }
  });

  button.addEventListener("mouseleave", () => {
    if (isHolding && holdTimer) {
      clearTimeout(holdTimer);
      clearInterval(progressInterval);
      button.classList.remove("holding");
      button.style.setProperty("--hold-progress", "0%");
      isHolding = false;
    }
  });
}

// ===== NOTIFICATION BADGE & BADGES =====
function updateNotificationBadge(count) {
  const badge = document.getElementById("notification-badge");
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }
}

function updateSidebarBadges() {
  // Update Orders badge
  const pendingOrders = currentOrders.filter(
    (o) => o.status === "pending",
  ).length;
  const ordersBadge = document.getElementById("orders-badge");
  if (ordersBadge) {
    if (pendingOrders > 0) {
      ordersBadge.textContent = pendingOrders;
      ordersBadge.style.display = "inline-flex";
    } else {
      ordersBadge.style.display = "none";
    }
  }

  // Update Transactions badge
  const pendingTransactions = currentTransactions.filter(
    (t) => t.status === "pending",
  ).length;
  const txBadge = document.getElementById("transactions-badge");
  if (txBadge) {
    if (pendingTransactions > 0) {
      txBadge.textContent = pendingTransactions;
      txBadge.style.display = "inline-flex";
    } else {
      txBadge.style.display = "none";
    }
  }

  // Update Deposits badge
  const pendingDeposits = currentDeposits.filter(
    (d) => d.status === "pending",
  ).length;
  const depositsBadge = document.getElementById("deposits-badge");
  if (depositsBadge) {
    if (pendingDeposits > 0) {
      depositsBadge.textContent = pendingDeposits;
      depositsBadge.style.display = "inline-flex";
    } else {
      depositsBadge.style.display = "none";
    }
  }

  // Update notification badge
  updateNotificationBadge(
    pendingTransactions + pendingOrders + pendingDeposits,
  );
}

function updateNotificationDropdown() {
  const notificationList = document.getElementById("notification-list");
  if (!notificationList) return;

  const pendingItems = [
    ...currentTransactions
      .filter((t) => t.status === "pending")
      .map((t) => ({
        type: "transaction",
        icon: "💰",
        message: `Transaction ${t.id?.substring(0, 8)} pending approval`,
        time: t.createdAt,
      })),
    ...currentOrders
      .filter((o) => o.status === "pending")
      .map((o) => ({
        type: "order",
        icon: "📦",
        message: `Order ${o.id?.substring(0, 8)} needs review`,
        time: o.createdAt,
      })),
    ...currentDeposits
      .filter((d) => d.status === "pending")
      .map((d) => ({
        type: "deposit",
        icon: "🏦",
        message: `Deposit ${formatCurrency(d.amount)} from ${d.userId?.substring(0, 8)}`,
        time: d.createdAt,
      })),
  ];

  if (pendingItems.length === 0) {
    notificationList.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #808080; font-size: 14px;">
        No pending items
      </div>
    `;
    return;
  }

  notificationList.innerHTML = pendingItems
    .map(
      (item) => `
    <div class="notification-item">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span>${item.icon}</span>
        <span>${item.message}</span>
      </div>
      <div class="notification-time">${formatTime(item.time)}</div>
    </div>
  `,
    )
    .join("");
}

function formatTime(timestamp) {
  if (!timestamp) return "Just now";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return date.toLocaleDateString();
}
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === "success" ? "✓" : type === "error" ? "✕" : "ℹ"}</span>
    <span class="toast-message">${message}</span>
  `;

  document.body.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add("show"), 10);

  // Auto remove
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 3000);
}

// ===== VIEW ORDER DETAILS MODAL =====
function showOrderDetails(orderId) {
  const order = currentOrders.find((o) => o.id === orderId);
  if (!order) return;

  let modal = document.getElementById("order-details-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "order-details-modal";
    document.body.appendChild(modal);
  }

  const itemsHTML = (order.items || [])
    .map(
      (item) => `
      <div style="padding: 12px 0; border-bottom: 1px solid #1c1c1e; display: flex; justify-content: space-between;">
        <div>
          <div style="color: #fff; font-weight: 600;">${item.name}</div>
          <div style="color: #aaa; font-size: 13px;">x${item.quantity} @ ${(item.finalPrice || item.price).toLocaleString("vi-VN")}đ</div>
        </div>
        <div style="color: #d4af37; font-weight: 600;">${((item.finalPrice || item.price) * item.quantity).toLocaleString("vi-VN")}đ</div>
      </div>
    `,
    )
    .join("");

  const userEmail = usersCache.get(order.userId) || "Loading...";

  modal.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); z-index: 2000; display: flex; align-items: center; justify-content: center;" id="order-modal-overlay">
      <div style="background: #0a0a0b; border: 1px solid #1c1c1e; border-radius: 12px; padding: 28px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h3 style="color: #d4af37; margin: 0;">Order ${order.id.substring(0, 8)}</h3>
          <button style="background: none; border: none; color: #aaa; font-size: 24px; cursor: pointer;">✕</button>
        </div>

        <div style="background: #121214; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
              <div style="color: #aaa; font-size: 12px;">Customer</div>
              <div style="color: #fff; font-weight: 600;">${userEmail}</div>
            </div>
            <div>
              <div style="color: #aaa; font-size: 12px;">Status</div>
              <div style="color: #d4af37; font-weight: 600; text-transform: uppercase;">${order.status}</div>
            </div>
            <div>
              <div style="color: #aaa; font-size: 12px;">Created</div>
              <div style="color: #fff; font-size: 13px;">${order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString("vi-VN") : "N/A"}</div>
            </div>
            <div>
              <div style="color: #aaa; font-size: 12px;">Total</div>
              <div style="color: #d4af37; font-weight: 700; font-size: 16px;">${order.total.toLocaleString("vi-VN")}đ</div>
            </div>
          </div>
        </div>

        <div style="background: #121214; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <h4 style="color: #fff; margin: 0 0 12px 0;">Items</h4>
          ${itemsHTML}
        </div>

        <button style="width: 100%; padding: 12px; background: #1c1c1e; color: #d4af37; border: 1px solid #1c1c1e; border-radius: 6px; cursor: pointer; font-weight: 600;" onclick="document.getElementById('order-details-modal').style.display = 'none';">Close</button>
      </div>
    </div>
  `;

  modal.style.display = "block";
  const closeBtn =
    modal.querySelector("button:nth-child(2)") ||
    modal.querySelector(".close-btn");
  const overlay = document.getElementById("order-modal-overlay");

  if (closeBtn) closeBtn.onclick = () => (modal.style.display = "none");
  if (overlay) overlay.onclick = () => (modal.style.display = "none");
}
window.showOrderDetails = showOrderDetails;

// ===== EDIT DRAWER =====
function openEditDrawer(product) {
  editingProductId = product.id;
  document.getElementById("drawer-title").textContent =
    `Edit "${product.name}"`;
  document.getElementById("form-name").value = product.name || "";
  document.getElementById("form-desc").value = product.description || "";
  document.getElementById("form-price").value = Number(product.price) || 0;
  document.getElementById("form-image").value = product.image || "";
  document.getElementById("form-category").value = product.category || "";
  document.getElementById("form-stock").value = Number(product.stock) || 0;
  document.getElementById("form-discount").value =
    Number(product.discount) || 0;
  document.getElementById("form-available").value =
    product.available === false ? "false" : "true";
  document.getElementById("form-show-on-home").checked =
    product.showOnHome === true;
  document.getElementById("form-required-vip-level").value =
    Number(product.requiredVipLevel) || 0;
  document.getElementById("form-is-exclusive-vip").checked =
    product.isExclusiveVIP === true;

  console.log(
    "Editing product:",
    product.name,
    "requiredVipLevel:",
    product.requiredVipLevel,
    "isExclusiveVIP:",
    product.isExclusiveVIP,
  );

  document.getElementById("edit-drawer").classList.add("open");
  document.getElementById("drawer-overlay").classList.add("open");

  setTimeout(() => {
    document.getElementById("form-name").focus();
  }, 300);
}

function closeEditDrawer() {
  document.getElementById("edit-drawer").classList.remove("open");
  document.getElementById("drawer-overlay").classList.remove("open");
  editingProductId = null;

  // Clear form
  document.getElementById("form-name").value = "";
  document.getElementById("form-desc").value = "";
  document.getElementById("form-price").value = "";
  document.getElementById("form-image").value = "";
  document.getElementById("form-category").value = "";
  document.getElementById("form-stock").value = "";
  document.getElementById("form-discount").value = "";
  document.getElementById("form-available").value = "true";
  document.getElementById("form-show-on-home").checked = false;
  document.getElementById("form-required-vip-level").value = "";
  document.getElementById("form-is-exclusive-vip").checked = false;
}

// ===== DELETE MODAL =====
function openDeleteModal(product) {
  editingProductId = product.id;
  document.getElementById("delete-msg").textContent =
    `Delete "${product.name}"? This cannot be undone.`;
  document.getElementById("delete-modal").classList.add("open");
}

function closeDeleteModal() {
  document.getElementById("delete-modal").classList.remove("open");
  editingProductId = null;
}

// ===== REAL-TIME LISTENERS =====
function setupProductsListener() {
  productsUnsub = onSnapshot(
    query(collection(db, "products"), orderBy("createdAt", "desc")),
    (snapshot) => {
      currentProducts = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      renderProductsTable(currentProducts);
    },
    (error) => {
      console.error("Products listener error:", error);
      showToast("Failed to load products", "error");
    },
  );
}

function setupOrdersListener() {
  ordersUnsub = onSnapshot(
    query(collection(db, "orders"), orderBy("createdAt", "desc")),
    (snapshot) => {
      currentOrders = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();

        // Fetch user email and cache it
        if (data.userId && !usersCache.has(data.userId)) {
          getDoc(doc(db, "users", data.userId))
            .then((userSnap) => {
              if (userSnap.exists()) {
                usersCache.set(data.userId, userSnap.data().email);
              }
            })
            .catch((err) => console.warn("Error fetching user:", err));
        }

        return {
          id: docSnap.id,
          ...data,
        };
      });

      renderStatCards(currentOrders);
      renderOrdersSummary(currentOrders);
      renderOrdersTable(currentOrders);
      updateSidebarBadges();
      updateNotificationDropdown();

      // Update chart if it exists
      if (revenueChart) {
        const activePeriod =
          document.querySelector(".chart-toggle.active")?.dataset.period ||
          "30d";
        updateRevenueChart(activePeriod);
      }
    },
    (error) => {
      console.error("Orders listener error:", error);
      showToast("Failed to load orders", "error");
    },
  );
}

// ===== TRANSACTIONS MANAGEMENT =====
function setupTransactionsListener() {
  transactionsUnsub = onSnapshot(
    query(
      collection(db, "transactions"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
    ),
    (snapshot) => {
      currentTransactions = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      renderTransactionsTable(currentTransactions);
      updateSidebarBadges();
      updateNotificationDropdown();
    },
    (error) => {
      console.error("Transactions listener error:", error);
      showToast("Failed to load transactions", "error");
    },
  );
}

// ===== DEPOSITS MANAGEMENT (NEW) =====
function setupDepositsListener() {
  depositsUnsub = onSnapshot(
    query(
      collection(db, "deposit_requests"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
    ),
    (snapshot) => {
      currentDeposits = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      renderDepositsTable(currentDeposits);
      updateSidebarBadges();
      updateNotificationDropdown();
    },
    (error) => {
      console.error("Deposits listener error:", error);
      showToast("Failed to load deposits", "error");
    },
  );
}

let currentReviews = [];
let reviewsUnsub = null;

function setupReviewsListener() {
  reviewsUnsub = onSnapshot(
    query(collection(db, "reviews"), orderBy("createdAt", "desc")),
    async (snapshot) => {
      currentReviews = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      // Fetch product names for all reviews
      const reviewsWithProducts = await Promise.all(
        currentReviews.map(async (review) => {
          const productDoc = await getDoc(
            doc(db, "products", review.productId),
          );
          return {
            ...review,
            productName: productDoc.exists()
              ? productDoc.data().name
              : "Unknown Product",
          };
        }),
      );

      currentReviews = reviewsWithProducts;
      renderReviewsTable(currentReviews);
    },
    (error) => {
      console.error("Reviews listener error:", error);
      showToast("Failed to load reviews", "error");
    },
  );
}

function renderReviewsTable(reviews, filteredReviews = null) {
  const container = document.getElementById("reviews-list");
  if (!container) return;

  let displayReviews = filteredReviews || reviews;

  if (displayReviews.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⭐</div>
        <h3>No reviews yet</h3>
        <p>Customer reviews will appear here once products are reviewed</p>
      </div>
    `;
    return;
  }

  function renderStars(rating) {
    return Array(5)
      .fill("⭐")
      .map(
        (star, i) =>
          `<span style="opacity: ${i + 1 <= rating ? "1" : "0.3"};">${star}</span>`,
      )
      .join("");
  }

  container.innerHTML = `
    <div class="products-table">
      <div class="table-header">
        <div>Product</div>
        <div>Reviewer</div>
        <div>Rating</div>
        <div>Comment</div>
        <div>Date</div>
      </div>
      ${displayReviews
        .map(
          (review, i) => `
        <div class="table-row" style="animation-delay: ${i * 50}ms">
          <div style="padding: 10px; color: var(--color-text-primary);">${review.productName}</div>
          <div style="padding: 10px; color: var(--color-text-secondary);">${review.userName || "Anonymous"}</div>
          <div style="padding: 10px; font-size: 16px;">
            ${renderStars(review.rating)}
            <span style="margin-left: 8px; color: var(--color-metallic-gold); font-weight: 600;">${review.rating}</span>
          </div>
          <div style="padding: 10px; max-width: 300px; color: var(--color-text-secondary); word-break: break-word; font-size: 13px;">
            ${review.comment}
          </div>
          <div style="padding: 10px; color: var(--color-text-secondary); font-size: 12px;">
            ${formatDate(review.createdAt?.toDate?.() || new Date(review.createdAt))}
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;

  // Trigger animations
  setTimeout(() => {
    container.querySelectorAll(".table-row").forEach((row) => {
      row.style.opacity = "1";
    });
  }, 100);
}

// ===== SECTION NAVIGATION =====
function showSection(sectionId) {
  document.querySelectorAll(".section").forEach((s) => {
    s.classList.remove("active");
  });
  document.getElementById(sectionId).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document
    .querySelector(`[data-section="${sectionId.replace("-section", "")}"]`)
    .classList.add("active");
}

// ===== INITIALIZE ADMIN =====
function initializeAdmin() {
  if (hasInitialized) return;
  hasInitialized = true;

  const state = store.getState();
  renderNavbar(state);
  renderCart(state);

  // Initialize chart
  setTimeout(() => {
    initializeRevenueChart();
  }, 500);

  setupProductsListener();
  setupOrdersListener();
  setupTransactionsListener();
  setupDepositsListener();
  setupReviewsListener();
  setupReviewsUI();

  // Setup role management UI
  setupRoleManagement();

  // Expire old transactions on load
  expireOldTransactions();

  // Keep cart/navbar reactive to global store updates
  store.subscribe(() => {
    const state = store.getState();
    renderNavbar(state);
    renderCart(state);
  });

  // Sidebar navigation
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.section + "-section";
      showSection(section);
    });
  });

  // Back to shop
  const backToShopBtn = document.getElementById("back-to-shop");
  if (backToShopBtn) {
    backToShopBtn.onclick = () => {
      window.location.href = "index.html";
    };
  }

  // Logout
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      try {
        await logoutUser();
        // Redirect will happen via onAuthStateChanged
      } catch (error) {
        showToast("Logout failed: " + error.message, "error");
      }
    };
  }

  // Notification Bell Dropdown
  const notificationBell = document.getElementById("notification-bell");
  const notificationDropdown = document.getElementById("notification-dropdown");
  if (notificationBell && notificationDropdown) {
    notificationBell.onclick = (e) => {
      e.stopPropagation();
      notificationDropdown.classList.toggle("show");
    };

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".topbar-right")) {
        notificationDropdown.classList.remove("show");
      }
    });
  }

  // Chart period toggles
  document.querySelectorAll(".chart-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".chart-toggle")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      updateRevenueChart(btn.dataset.period);
    });
  });

  // Orders tab switching
  const ordersTabActive = document.getElementById("orders-tab-active");
  const ordersTabHistory = document.getElementById("orders-tab-history");

  if (ordersTabActive && ordersTabHistory) {
    ordersTabActive.addEventListener("click", () => {
      localStorage.setItem("orders-tab", "active");
      ordersTabActive.style.background = "#d4af37";
      ordersTabActive.style.color = "#000";
      ordersTabHistory.style.background = "#1c1c1e";
      ordersTabHistory.style.color = "#aaa";
      renderOrdersTable(currentOrders);
    });

    ordersTabHistory.addEventListener("click", () => {
      localStorage.setItem("orders-tab", "history");
      ordersTabHistory.style.background = "#d4af37";
      ordersTabHistory.style.color = "#000";
      ordersTabActive.style.background = "#1c1c1e";
      ordersTabActive.style.color = "#aaa";
      renderOrdersTable(currentOrders);
    });
  }

  // Add / Save Product form handlers
  const addProductBtn = document.getElementById("add-product-btn");
  const saveProductBtn = document.getElementById("save-product-btn");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");
  const closeDrawerBtn = document.getElementById("close-drawer-btn");
  const overlay = document.getElementById("drawer-overlay");

  function openAddProductDrawer() {
    editingProductId = null;
    document.getElementById("drawer-title").textContent = "Add New Product";
    document.getElementById("form-name").value = "";
    document.getElementById("form-desc").value = "";
    document.getElementById("form-price").value = "";
    document.getElementById("form-image").value = "";
    document.getElementById("form-category").value = "";
    document.getElementById("form-stock").value = "";
    document.getElementById("form-discount").value = "";
    document.getElementById("form-available").value = "true";
    document.getElementById("form-show-on-home").checked = false; // Reset checkbox
    document.getElementById("form-vip-store").checked = false; // Reset VIP store checkbox

    document.getElementById("edit-drawer").classList.add("open");
    overlay.classList.add("open");
  }

  addProductBtn.addEventListener("click", openAddProductDrawer);

  const closeDrawer = () => {
    closeEditDrawer();
  };

  closeDrawerBtn.addEventListener("click", closeDrawer);
  cancelEditBtn.addEventListener("click", (event) => {
    event.preventDefault();
    closeDrawer();
  });
  overlay.addEventListener("click", closeDrawer);

  saveProductBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    if (saveProductBtn.disabled) return;

    saveProductBtn.disabled = true;
    const originalText = saveProductBtn.textContent;
    saveProductBtn.textContent = "Saving...";

    const name = document.getElementById("form-name").value.trim();
    const description = document.getElementById("form-desc").value.trim();
    const price = Number(document.getElementById("form-price").value) || 0;
    const image = document.getElementById("form-image").value.trim();
    const category = document.getElementById("form-category").value;
    const stock = Number(document.getElementById("form-stock").value) || 0;
    const discount =
      Number(document.getElementById("form-discount").value) || 0;
    const available =
      document.getElementById("form-available").value === "true";
    const showOnHome =
      document.getElementById("form-show-on-home").checked === true;
    const requiredVipLevel =
      parseInt(document.getElementById("form-required-vip-level").value) || 0;
    const isExclusiveVIP =
      document.getElementById("form-is-exclusive-vip").checked === true;

    console.log(
      "Saving product with requiredVipLevel:",
      requiredVipLevel,
      "isExclusiveVIP:",
      isExclusiveVIP,
    );

    if (!name || price <= 0 || stock < 0 || discount < 0 || discount > 100) {
      showToast(
        "Validation failed: name required, price >0, stock >=0, discount 0-100",
        "error",
      );
      document.getElementById("form-name").focus();
      saveProductBtn.disabled = false;
      saveProductBtn.textContent = originalText;
      return;
    }

    const productPayload = {
      name,
      description,
      price,
      image,
      category,
      stock,
      discount,
      available,
      showOnHome,
      requiredVipLevel,
      isExclusiveVIP,
      createdAt: new Date(),
    };

    try {
      if (editingProductId) {
        await updateProduct(editingProductId, productPayload);
        showToast("Product updated successfully!", "success");
      } else {
        await createProduct(productPayload);
        showToast("Product created successfully!", "success");
      }
      closeDrawer();
    } catch (error) {
      showToast("Failed to save product: " + error.message, "error");
    } finally {
      saveProductBtn.disabled = false;
      saveProductBtn.textContent = originalText;
    }
  });

  // Delete Modal
  document
    .getElementById("cancel-delete-btn")
    .addEventListener("click", closeDeleteModal);
  document
    .getElementById("confirm-delete-btn")
    .addEventListener("click", async () => {
      if (!editingProductId) return;

      try {
        await deleteProduct(editingProductId);
        closeDeleteModal();
        showToast("Product deleted successfully", "warning");
      } catch (error) {
        showToast("Failed to delete product: " + error.message, "error");
      }
    });

  // Search filter with debouncing
  let searchTimeout;
  document.getElementById("search-box").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const query = e.target.value.toLowerCase();
      const filtered = currentProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query),
      );
      renderProductsTable(filtered);
    }, 300);
  });
}

// ===== ROLE MANAGEMENT =====
async function renderUsersList() {
  const container = document.getElementById("users-list");
  if (!container) return;

  container.innerHTML = `<div class="loading">Loading users...</div>`;

  // ⚠️ TODO: Add pagination for scalability (Firestore direct fetch)
  // When user count exceeds 1000+, implement cursor-based pagination:
  // - Add limit(50) to getAllUsers in role.service.js
  // - Use startAfter(lastDoc) for pagination cursor
  // - Add next/prev buttons to UI
  // Current: Gets ALL users at once (fine for <1000 users)
  const result = await getAllUsers();

  if (!result.success) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <h3>Error Loading Users</h3>
        <p>${result.message}</p>
      </div>
    `;
    return;
  }

  const users = result.users || [];

  if (users.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <h3>No users yet</h3>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="products-table">
      <div class="table-header">
        <div style="width: 40px"></div>
        <div>Email</div>
        <div>Name</div>
        <div>Role</div>
        <div>Created</div>
        <div>Actions</div>
      </div>
      ${users
        .map(
          (user, i) => `
        <div class="table-row" style="animation-delay: ${i * 50}ms">
          <div class="product-image">👤</div>
          <div class="product-info">
            <div class="product-name">${user.email}</div>
            <div class="product-desc">${user.uid?.substring(0, 12) || "N/A"}</div>
          </div>
          <div style="color: #fff;">
            ${user.name || "N/A"}
          </div>
          <div>
            <span class="status-badge ${user.role === "admin" ? "status-available" : "status-unavailable"}">
              ${user.role === "admin" ? "🔑 Admin" : "👤 User"}
            </span>
          </div>
          <div style="font-size: 12px; color: #808080;">
            ${user.createdAt ? new Date(user.createdAt.toDate?.() || user.createdAt).toLocaleDateString("vi-VN") : "N/A"}
          </div>
          <div class="row-actions">
            ${
              user.role !== "admin"
                ? `<button class="action-btn promote-role-btn" data-email="${user.email}" data-uid="${user.uid}" title="Make Admin" style="color: #4caf50">🚀</button>`
                : `<button class="action-btn demote-role-btn" data-email="${user.email}" data-uid="${user.uid}" title="Remove Admin" style="color: #ff9800">⬇️</button>`
            }
          </div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;

  // Attach event listeners
  container.querySelectorAll(".promote-role-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const email = btn.dataset.email;
      if (btn.disabled) return;
      btn.disabled = true;

      const result = await promoteToAdmin(email);
      if (result.success) {
        showToast(`✅ ${email} is now an admin`, "success");
        renderUsersList();
      } else {
        showToast(`❌ ${result.message}`, "error");
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll(".demote-role-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const email = btn.dataset.email;
      if (btn.disabled) return;
      btn.disabled = true;

      const result = await demoteToUser(email);
      if (result.success) {
        showToast(`✅ ${email} is now a regular user`, "success");
        renderUsersList();
      } else {
        showToast(`❌ ${result.message}`, "error");
        btn.disabled = false;
      }
    });
  });

  // Trigger animations
  setTimeout(() => {
    container.querySelectorAll(".table-row").forEach((row) => {
      row.style.opacity = "1";
    });
  }, 100);
}

function setupReviewsUI() {
  const searchInput = document.getElementById("reviews-search");
  const filterRating = document.getElementById("reviews-filter-rating");

  if (!searchInput || !filterRating) return;

  const applyFilters = () => {
    const searchQuery = searchInput.value.toLowerCase().trim();
    const ratingFilter = filterRating.value
      ? parseInt(filterRating.value)
      : null;

    const filtered = currentReviews.filter((review) => {
      const matchesSearch =
        review.productName.toLowerCase().includes(searchQuery) ||
        (review.userName &&
          review.userName.toLowerCase().includes(searchQuery)) ||
        review.comment.toLowerCase().includes(searchQuery);

      const matchesRating = !ratingFilter || review.rating === ratingFilter;

      return matchesSearch && matchesRating;
    });

    renderReviewsTable(currentReviews, filtered);
  };

  searchInput.addEventListener("input", applyFilters);
  filterRating.addEventListener("change", applyFilters);
}

function setupRoleManagement() {
  const emailInput = document.getElementById("role-email-input");
  const promoteBtn = document.getElementById("promote-btn");
  const demoteBtn = document.getElementById("demote-btn");

  if (!promoteBtn || !demoteBtn) return;

  // Promote button
  promoteBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();

    if (!email) {
      showToast("Please enter an email address", "error");
      emailInput.focus();
      return;
    }

    if (!email.includes("@")) {
      showToast("Please enter a valid email", "error");
      emailInput.focus();
      return;
    }

    promoteBtn.disabled = true;
    const originalText = promoteBtn.textContent;
    promoteBtn.textContent = "⏳ Processing...";

    const result = await promoteToAdmin(email);

    if (result.success) {
      showToast(`✅ ${email} promoted to admin`, "success");
      emailInput.value = "";
      renderUsersList();
    } else {
      showToast(`❌ ${result.message}`, "error");
    }

    promoteBtn.disabled = false;
    promoteBtn.textContent = originalText;
  });

  // Demote button
  demoteBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();

    if (!email) {
      showToast("Please enter an email address", "error");
      emailInput.focus();
      return;
    }

    if (!email.includes("@")) {
      showToast("Please enter a valid email", "error");
      emailInput.focus();
      return;
    }

    demoteBtn.disabled = true;
    const originalText = demoteBtn.textContent;
    demoteBtn.textContent = "⏳ Processing...";

    const result = await demoteToUser(email);

    if (result.success) {
      showToast(`✅ ${email} removed from admin`, "success");
      emailInput.value = "";
      renderUsersList();
    } else {
      showToast(`❌ ${result.message}`, "error");
    }

    demoteBtn.disabled = false;
    demoteBtn.textContent = originalText;
  });

  // Load initial users list
  renderUsersList();
}

// ===== MAIN INIT =====
function init() {
  // 🔥 FIX: Proper async auth checking to prevent redirect loops
  onAuthStateChanged(auth, async (user) => {
    console.log("🔥 ADMIN AUTH STATE:", user?.email);

    if (!user) {
      console.log("❌ No user, redirecting to login");
      window.location.href = "login.html";
      return;
    }

    try {
      // 🔥 Wait for custom claims to load
      const tokenResult = await getIdTokenResult(user);
      console.log("🔥 CLAIMS:", tokenResult.claims);

      if (!tokenResult.claims.admin) {
        console.log("❌ Not admin, redirecting to index");
        window.location.href = "index.html";
        return;
      }

      console.log("✅ Admin verified, initializing dashboard");

      // ✅ Show UI only after successful auth check
      document.body.style.display = "block";

      // Initialize auth (for store/state management)
      await initializeAuth();

      // Initialize admin dashboard
      initializeAdmin();
    } catch (error) {
      console.error("❌ Error checking admin claims:", error);
      window.location.href = "login.html";
    }
  });

  // Cleanup on unload
  window.addEventListener("beforeunload", () => {
    if (ordersUnsub) ordersUnsub();
    if (productsUnsub) productsUnsub();
    if (transactionsUnsub) transactionsUnsub();
    if (depositsUnsub) depositsUnsub();
  });
}

init();
