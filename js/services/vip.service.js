/**
 * VIP Subscription System
 * Handles VIP package purchases, balance checks, and Firestore updates
 */

import store from "../store/index.js";
import { auth, db, calculateMemberRank } from "../services/firebase.service.js";
import {
  doc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { toastError, toastSuccess } from "../services/toast.service.js";
import { ACTION_TYPES } from "../store/actions.js";

const VIP_PACKAGES = {
  monthly: {
    name: "Gói Vàng",
    price: 99000,
    vipLevel: 1,
    durationDays: 30,
    isPermanent: false,
    icon: "🏆",
  },
  sixmonth: {
    name: "Gói Kim Cương",
    price: 500000,
    vipLevel: 3,
    durationDays: 180,
    isPermanent: false,
    icon: "💎",
  },
  legendary: {
    name: "Gói Vĩnh Viễn",
    price: 5000000,
    vipLevel: 5,
    durationDays: null,
    isPermanent: true, // ✅ Flag để dễ check permanent
    icon: "👑",
  },
};

/**
 * Animate number counter on UI (mượt mà từ giá trị cũ đến giá trị mới)
 * @param {string} elementId - ID của element chứa số
 * @param {number} startValue - Giá trị bắt đầu
 * @param {number} endValue - Giá trị kết thúc
 * @param {number} duration - Thời gian animation (ms), mặc định 1500ms
 */
export function animateNumber(
  elementId,
  startValue,
  endValue,
  duration = 1500,
) {
  const element = document.getElementById(elementId);

  // ✅ ERROR HANDLING: Log if element not found
  if (!element) {
    console.warn(
      `⚠️ animateNumber FAILED: Element #${elementId} not found in DOM`,
    );
    return;
  }

  console.log(
    `🎯 animateNumber started: #${elementId} ${startValue} → ${endValue}`,
  );

  let current = startValue;
  const step = (endValue - startValue) / (duration / 50); // Cập nhật mỗi 50ms
  const startTime = Date.now();

  const animate = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    current = startValue + (endValue - startValue) * progress;

    // Format với dấu phân cách hàng nghìn
    try {
      element.innerText = `💰 ${Math.floor(current).toLocaleString("vi-VN")}đ`;
    } catch (err) {
      console.error(`❌ Error updating element #${elementId}:`, err);
    }

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      console.log(`✅ animateNumber completed: #${elementId}`);
    }
  };

  animate();
}

/**
 * Open VIP Subscription Modal
 */
export function openVipModal() {
  const modal = document.getElementById("vip-modal");
  if (modal) {
    modal.classList.add("open");
  }
}

/**
 * Close VIP Subscription Modal
 */
export function closeVipModal() {
  const modal = document.getElementById("vip-modal");
  if (modal) {
    modal.classList.remove("open");
  }
}

/**
 * Purchase VIP Package
 */
export async function purchaseVipPackage(packageType) {
  const state = store.getState();
  const user = state.user?.data;

  // Check if user is logged in
  if (!user || !auth.currentUser) {
    toastError("Vui lòng đăng nhập để mua gói VIP", 3000);
    return;
  }

  const pkg = VIP_PACKAGES[packageType];
  if (!pkg) {
    toastError("Gói VIP không tồn tại", 3000);
    return;
  }

  // Check balance
  const currentBalance = Number(user.balance) || 0;
  if (currentBalance < pkg.price) {
    toastError(
      `❌ Số dư không đủ! Cần thêm ₫${(pkg.price - currentBalance).toLocaleString("vi-VN")}`,
      4000,
    );
    return;
  }

  // ✅ PROTECTION: Ngăn ghi đè trạng thái "Vĩnh Viễn" bằng gói tháng/6 tháng
  const currentlyPermanent = user.isPermanent === true;
  if (currentlyPermanent && !pkg.isPermanent) {
    toastError(
      "🏆 Ông đã là VIP Vĩnh Viễn (Elite Patron)!\\n\\nKhông cần phí tiền mua gói thời hạn thêm đâu.",
      5000,
    );
    return;
  }

  // ✅ Calculate VIP expiration date
  // Legendary (vĩnh viễn) → vipExpiration = '9999-12-31T23:59:59Z' (ISO format)
  let vipExpiration = null;
  let isPermanent = false;

  if (pkg.isPermanent) {
    // Năm 9999: Đủ xa để coi như vĩnh viễn (dùng ISO format để Firestore chuẩn)
    vipExpiration = "9999-12-31T23:59:59Z";
    isPermanent = true;
  } else if (pkg.durationDays) {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + pkg.durationDays);
    vipExpiration = expirationDate.toISOString();
    isPermanent = false;
  }

  try {
    // Disable the button temporarily
    const activeButtons = document.querySelectorAll(".btn-buy-package");
    activeButtons.forEach((btn) => (btn.disabled = true));

    // ⚠️ CRITICAL: Update Firestore FIRST and WAIT for success
    const userRef = doc(db, "users", auth.currentUser.uid);
    console.log("🔄 Attempting to update Firestore...", {
      balance: currentBalance - pkg.price,
      totalSpent: (Number(user.totalSpent) || 0) + pkg.price,
    });

    // ✅ STRICT 9-FIELD SCHEMA - Đảm bảo không thiếu trường, không gửi thừa
    const newBalance = currentBalance - pkg.price;
    const newTotalSpent = (Number(user.totalSpent) || 0) + pkg.price;
    const nowISO = new Date().toISOString();

    // AWAIT completion before proceeding
    await updateDoc(userRef, {
      balance: newBalance, // Field 1: Number
      totalSpent: newTotalSpent, // Field 2: Number
      vipLevel: pkg.vipLevel, // Field 3: Number
      isVipActive: true, // Field 4: Boolean
      vipExpiration: vipExpiration, // Field 5: String ISO
      vipPackageType: packageType, // Field 6: String
      lastVipPurchaseDate: nowISO, // Field 7: String ISO
      updatedAt: nowISO, // Field 8: String ISO
      isPermanent: isPermanent, // Field 9: Boolean
    });

    console.log("✅ Firestore update SUCCESS! Now updating store.dispatch...");

    // ✅ SYNC DISPATCH FIRST - ensure store state updates before animation
    store.dispatch({
      type: ACTION_TYPES.SET_USER,
      payload: {
        ...user,
        balance: newBalance,
        vipLevel: pkg.vipLevel,
        isVipActive: true,
        vipExpiration: vipExpiration,
        totalSpent: newTotalSpent,
        vipPackageType: packageType,
        isPermanent: isPermanent,
      },
    });
    console.log("✅ store.dispatch completed. Starting UI animation...");

    // ✅ ANIMATE BALANCE - with error handling
    const balanceEl = document.getElementById("balance-display");
    if (balanceEl) {
      try {
        animateNumber("balance-display", currentBalance, newBalance, 1500);
        console.log("✅ Balance animation started successfully");
      } catch (err) {
        console.warn("⚠️ Balance animation error:", err);
      }
    } else {
      console.warn("⚠️ Element #balance-display NOT FOUND in DOM");
    }

    // ✅ ANIMATE TOTAL SPENT - with error handling
    const totalSpentEl = document.getElementById("total-spent-display");
    if (totalSpentEl) {
      try {
        animateNumber(
          "total-spent-display",
          Number(user.totalSpent) || 0,
          newTotalSpent,
          1500,
        );
        console.log("✅ Total spent animation started successfully");
      } catch (err) {
        console.warn("⚠️ Total spent animation error:", err);
      }
    } else {
      console.warn("⚠️ Element #total-spent-display NOT FOUND in DOM");
    }

    // Show success toast
    toastSuccess(
      `🎉 Chúc mừng! Bạn đã nâng cấp lên ${pkg.name}. VIP Level: ${pkg.vipLevel}`,
      4000,
    );

    // Close modal
    closeVipModal();

    // Trigger confetti animation (pass packageType for legendary effects)
    showConfetti(packageType);

    // Re-render member card
    setTimeout(async () => {
      const { renderMemberRankBadge } = await import("../pages/profile.js");
      renderMemberRankBadge();
    }, 500);
  } catch (error) {
    console.error("❌ Error purchasing VIP package:", error);

    // ⚠️ SHOW ERROR BUT DO NOT UPDATE UI
    if (error.code === "permission-denied") {
      toastError(
        "❌ Bạn không có quyền thực hiện giao dịch này. Kiểm tra balance và VIP level.",
        5000,
      );
    } else {
      toastError("Có lỗi xảy ra khi mua gói VIP. Vui lòng thử lại.", 4000);
    }
  } finally {
    // Re-enable buttons
    const activeButtons = document.querySelectorAll(".btn-buy-package");
    activeButtons.forEach((btn) => (btn.disabled = false));
  }
}

/**
 * Enhanced Confetti Animation with Tier-based Effects
 */
function showConfetti(packageType = null) {
  const state = store.getState();
  const user = state.user?.data;
  const tier = user?.vipLevel || 0;
  const isLegendary = packageType === "legendary";

  // Load canvas-confetti if available, otherwise use fallback
  const script = document.createElement("script");
  script.src =
    "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.0/dist/confetti.browser.min.js";
  script.onload = () => {
    if (window.confetti) {
      const duration = (t) => {
        return 1 + 1 * t;
      };

      // 🔥 LEGENDARY: 5 bursts with Purple & Gold
      if (isLegendary) {
        const burstIntervals = [0, 400, 800, 1200, 1600];
        const colors = ["#bf00ff", "#d4af37", "#9b59b6"];

        burstIntervals.forEach((delay, idx) => {
          setTimeout(() => {
            window.confetti({
              particleCount: 120,
              spread: 100,
              origin: { y: 0.5 },
              duration: duration(0.4),
              colors: colors,
              ticks: 200,
            });
          }, delay);
        });
        return;
      }

      // Regular tier-based confetti
      const confettiCount =
        tier >= 10 ? 150 : tier >= 7 ? 100 : tier >= 4 ? 75 : 50;

      window.confetti({
        particleCount: confettiCount,
        spread: 70,
        origin: { y: 0.6 },
        duration: duration(0.3),
        colors:
          tier >= 7
            ? ["#d081be", "#9b59b6", "#c68fd9"]
            : ["#d4af37", "#f4d03f"],
      });

      // Extra bursts for VIP 10 (3 bursts)
      if (tier >= 10) {
        setTimeout(() => {
          window.confetti({
            particleCount: 100,
            spread: 100,
            origin: { y: 0.5 },
            duration: duration(0.3),
            colors: ["#bf00ff", "#d4af37", "#9b59b6"],
          });
        }, 300);

        setTimeout(() => {
          window.confetti({
            particleCount: 80,
            spread: 80,
            origin: { x: 0.2, y: 0.5 },
            duration: duration(0.3),
            colors: ["#bf00ff", "#d4af37"],
          });
        }, 600);
      }
      return;
    }

    // Fallback: Simple confetti if library not available
    showConfettiFallback(tier, isLegendary);
  };
  script.onerror = () => {
    // Fallback if CDN fails
    showConfettiFallback(tier, isLegendary);
  };

  document.head.appendChild(script);
}

/**
 * Fallback Confetti Animation (no external library)
 */
function showConfettiFallback(tier, isLegendary = false) {
  const confettiCount = isLegendary
    ? 200
    : tier >= 10
      ? 100
      : tier >= 7
        ? 70
        : tier >= 4
          ? 50
          : 40;
  const confettiContainer = document.body;
  const colors = isLegendary
    ? ["#bf00ff", "#d4af37", "#9b59b6"]
    : tier >= 7
      ? ["#d081be", "#9b59b6", "#c68fd9"]
      : ["#d4af37", "#f4d03f"];

  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement("div");
    confetti.style.position = "fixed";
    confetti.style.left = Math.random() * window.innerWidth + "px";
    confetti.style.top = "-10px";
    confetti.style.width = (tier >= 10 ? 15 : tier >= 7 ? 12 : 10) + "px";
    confetti.style.height = (tier >= 10 ? 15 : tier >= 7 ? 12 : 10) + "px";
    confetti.style.backgroundColor =
      colors[Math.floor(Math.random() * colors.length)];
    confetti.style.borderRadius = "50%";
    confetti.style.pointerEvents = "none";
    confetti.style.zIndex = "9999";
    confetti.style.opacity = "0.9";
    confetti.style.boxShadow = `0 0 ${tier >= 10 ? 20 : tier >= 7 ? 15 : 10}px ${colors[0]}`;

    confettiContainer.appendChild(confetti);

    // Animate falling
    let top = -10;
    const speed = Math.random() * 4 + 3 + (tier >= 10 ? 2 : 0); // Slower for VIP 10
    const sway = Math.random() * 3 - 1.5;
    let left = parseFloat(confetti.style.left);
    const rotation = Math.random() * 360;
    let rotateSpeed = Math.random() * 15 - 7.5;

    const interval = setInterval(() => {
      top += speed;
      left += sway;
      confetti.style.top = top + "px";
      confetti.style.left = left + "px";
      confetti.style.opacity = Math.max(
        0,
        0.9 - (top / window.innerHeight) * 0.8,
      );
      confetti.style.transform = `rotate(${rotateSpeed * (top / 100)}deg)`;

      if (top > window.innerHeight) {
        clearInterval(interval);
        confetti.remove();
      }
    }, 20);
  }
}

/**
 * Initialize VIP Modal Event Listeners
 */
export function initVipModal() {
  const vipModal = document.getElementById("vip-modal");
  const closeBtn = document.getElementById("close-vip-modal");
  const overlay = document.getElementById("vip-overlay");
  const memberCard = document.getElementById("member-card");

  // Open modal on member card click
  if (memberCard) {
    memberCard.addEventListener("click", () => {
      const user = store.getState().user?.data;
      if (user) {
        openVipModal();
      }
    });
  }

  // Close modal handlers
  if (closeBtn) {
    closeBtn.addEventListener("click", closeVipModal);
  }

  if (overlay) {
    overlay.addEventListener("click", closeVipModal);
  }

  // Prevent modal close on content click
  if (vipModal) {
    vipModal.querySelector(".modal-content")?.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }
}

// Export for global access
window.purchaseVipPackage = purchaseVipPackage;
window.openVipModal = openVipModal;
window.closeVipModal = closeVipModal;
