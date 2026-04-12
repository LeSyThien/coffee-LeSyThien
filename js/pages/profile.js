import store from "../store/index.js";
import { calculateMemberRank } from "../services/firebase.service.js";

/**
 * CountUp Animation Function
 */
function countUp(element, target, duration = 2000) {
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Easing function for smooth animation
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.floor(start + (target - start) * easeOut);

    element.textContent = current.toLocaleString('vi-VN');

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

/**
 * Render Ultra Luxury Profile
 */
export function renderMemberRankBadge() {
  const memberInfo = store.getState().user?.data;
  if (!memberInfo) return;

  const totalSpent = Number(memberInfo.totalSpent) || 0;
  const balance = Number(memberInfo.balance) || 0;
  const memberRank = calculateMemberRank(totalSpent);

  // Update Member Card
  const userNameEl = document.getElementById("user-name");
  const userEmailEl = document.getElementById("user-email");
  const vipLevelBadge = document.getElementById("vip-level-badge");
  const userAvatar = document.getElementById("user-avatar");

  if (userNameEl) userNameEl.textContent = memberInfo.name || "Guest";
  if (userEmailEl) userEmailEl.textContent = memberInfo.email || "";
  if (vipLevelBadge) vipLevelBadge.textContent = memberRank.title;
  if (userAvatar) userAvatar.textContent = memberInfo.name?.charAt(0)?.toUpperCase() || "👤";

  // Animate Balance with CountUp
  const balanceValueEl = document.getElementById("balance-value");
  if (balanceValueEl) {
    setTimeout(() => countUp(balanceValueEl, balance), 800);
  }

  // Animate VIP Level
  const vipLevelValueEl = document.getElementById("vip-level-value");
  if (vipLevelValueEl) {
    setTimeout(() => countUp(vipLevelValueEl, memberRank.rank), 1000);
  }

  // Update VIP Progress Bar
  const progressPercentEl = document.getElementById("progress-percent");
  const progressLiquidEl = document.getElementById("progress-liquid");
  const spentAmountEl = document.getElementById("spent-amount");
  const nextThresholdEl = document.getElementById("next-threshold");

  if (progressPercentEl) progressPercentEl.textContent = `${memberRank.progress}%`;
  if (progressLiquidEl) {
    setTimeout(() => {
      progressLiquidEl.style.width = `${memberRank.progress}%`;
    }, 1200);
  }
  if (spentAmountEl) spentAmountEl.textContent = totalSpent.toLocaleString('vi-VN');
  if (nextThresholdEl) nextThresholdEl.textContent = memberRank.nextThreshold.toLocaleString('vi-VN');

  // Update VIP Progress Circle
  const vipProgressFill = document.getElementById("vip-progress-fill");
  if (vipProgressFill) {
    const progressAngle = (memberRank.progress / 100) * 180; // 180deg for half circle
    setTimeout(() => {
      vipProgressFill.style.background = `conic-gradient(
        #d4af37 0deg,
        #f4d03f ${progressAngle}deg,
        #333 ${progressAngle}deg,
        #333 360deg
      )`;
    }, 1400);
  }

  // Render Recent Orders
  renderRecentOrders();
}

/**
 * Render Recent Orders (non-archived only)
 */
async function renderRecentOrders() {
  const ordersListEl = document.getElementById("orders-list");
  if (!ordersListEl) return;

  try {
    // Get orders from store (assuming orders are loaded in auth-init.js)
    const orders = store.getState().orders?.list || [];

    // Filter non-archived orders and take latest 3
    const recentOrders = orders
      .filter(order => !order.isArchived)
      .sort((a, b) => new Date(b.createdAt?.toDate?.() || b.createdAt) - new Date(a.createdAt?.toDate?.() || a.createdAt))
      .slice(0, 3);

    if (recentOrders.length === 0) {
      ordersListEl.innerHTML = `
        <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">
          <div style="font-size: 48px; margin-bottom: 16px;">📦</div>
          <p>No orders yet</p>
        </div>
      `;
      return;
    }

    const ordersHTML = recentOrders.map((order, index) => {
      const status = order.status || 'pending';
      const statusClass = status.toLowerCase();
      const createdDate = order.createdAt?.toDate?.()
        ? order.createdAt.toDate().toLocaleDateString('vi-VN')
        : 'N/A';

      return `
        <div class="order-item" style="animation-delay: ${1.4 + index * 0.2}s; animation: orderItemSlide 0.6s ease-out both;">
          <div class="order-info">
            <div class="order-icon">📦</div>
            <div class="order-details">
              <h4>Order #${order.id?.substring(0, 8) || 'Unknown'}</h4>
              <p>${createdDate} • ${(Number(order.total) || 0).toLocaleString('vi-VN')}đ</p>
            </div>
          </div>
          <div class="order-status ${statusClass}">${status}</div>
        </div>
      `;
    }).join('');

    ordersListEl.innerHTML = ordersHTML;

    // Add slide animation
    if (!document.getElementById('order-animations')) {
      const style = document.createElement('style');
      style.id = 'order-animations';
      style.textContent = `
        @keyframes orderItemSlide {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `;
      document.head.appendChild(style);
    }

  } catch (error) {
    console.error('Error rendering recent orders:', error);
    ordersListEl.innerHTML = `
      <div style="text-align: center; padding: 20px; color: rgba(255,255,255,0.5);">
        <p>Failed to load orders</p>
      </div>
    `;
  }
}

/**
 * Create Floating Particles
 */
function createFloatingParticles() {
  const container = document.getElementById('floating-particles');
  if (!container) return;

  // Clear existing particles
  container.innerHTML = '';

  // Create 20 particles
  for (let i = 0; i < 20; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.cssText = `
      position: absolute;
      width: ${Math.random() * 3 + 1}px;
      height: ${Math.random() * 3 + 1}px;
      background: rgba(212, 175, 55, ${Math.random() * 0.6 + 0.2});
      border-radius: 50%;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      animation: floatParticle ${Math.random() * 10 + 15}s infinite linear;
      animation-delay: ${Math.random() * 10}s;
    `;
    container.appendChild(particle);
  }

  // Add particle animation if not exists
  if (!document.getElementById('particle-styles')) {
    const style = document.createElement('style');
    style.id = 'particle-styles';
    style.textContent = `
      @keyframes floatParticle {
        0% {
          transform: translateY(0) rotate(0deg);
          opacity: 0;
        }
        10% { opacity: 1; }
        90% { opacity: 1; }
        100% {
          transform: translateY(-100vh) rotate(360deg);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize particles when profile loads
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('profile.html')) {
    createFloatingParticles();
  }
});

/**
 * Initialize profile page
 */
export function initProfile() {
  // Subscribe to store updates to re-render badge when user data changes
  store.subscribe(() => {
    renderMemberRankBadge();
  });

  // Initial render
  renderMemberRankBadge();
}
