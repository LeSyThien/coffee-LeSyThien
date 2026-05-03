/**
 * Home Page Product Rendering & Cart Functionality
 * - Loads premium products from Firestore with glassmorphism UI
 * - Handles "Add to Cart" with VIP level validation
 * - Implements scroll reveal animations & skeleton loading
 * - Easter egg for VIP 10 in navbar
 */

import store from "../store/index.js";
import { ACTION_TYPES } from "../store/actions.js";
import {
  toastError,
  toastSuccess,
  toastInfo,
} from "../services/toast.service.js";

// ===== LOAD CONTROL FLAG =====
let isProductsLoaded = false;
let isLoadingProducts = false;
let isElitaPatronsInitialized = false; // ✅ FIX: Prevent Elite Patrons init 2 lần

// ===== SKELETON LOADING =====
/**
 * Hiển thị Skeleton Loading trong khi chờ dữ liệu từ Firebase
 */
function showSkeletonLoading() {
  const grid = document.getElementById("home-products-grid");
  if (!grid) return;

  grid.innerHTML = Array(6)
    .fill(0)
    .map(
      () => `
    <div class="product-card-skeleton">
      <div class="skeleton-image"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text" style="width: 70%;"></div>
      <div class="skeleton-button"></div>
    </div>
  `,
    )
    .join("");

  // Thêm animation class
  document.querySelectorAll(".product-card-skeleton").forEach((el) => {
    el.classList.add("skeleton-loading");
  });
}

/**
 * ⏳ Đợi cho đến khi Auth sẵn sàng (user data loaded)
 * Đây là critical để tránh render products khi VIP level chưa được set
 */
function waitForAuthReady() {
  return new Promise((resolve) => {
    const state = store.getState();
    const authReady = state.auth?.isAuthReady || false;

    if (authReady) {
      console.log("✅ Auth đã sẵn sàng - renderProducts ngay");
      resolve();
    } else {
      console.log("⏳ Chờ Auth sẵn sàng...");
      let resolved = false;
      const unsubscribe = store.subscribe(() => {
        if (resolved) return;
        const updatedState = store.getState();
        if (updatedState.auth?.isAuthReady) {
          console.log("✅ Auth ready - renderProducts ngay");
          resolved = true;
          unsubscribe();
          resolve();
        }
      });
      // Timeout sau 3 giây để tránh stuck forever
      setTimeout(() => {
        if (!resolved) {
          console.warn("⚠️ Auth timeout - render anyway với default VIP 0");
          resolved = true;
          unsubscribe();
          resolve();
        }
      }, 3000);
    }
  });
}

/**
 * Load và render sản phẩm từ Firestore
 * - CHỈ gọi MỘT LẦN DUY NHẤT (kiểm tra flag isProductsLoaded)
 * - Lấy từ collection 'products' với showOnHome === true
 * - Format giá tiền theo Vietnam locale
 * - Hiển thị VIP badge nếu requiredVIP > 0
 * - Thêm overlay lock cho sản phẩm VIP-only\n * - ✅ ĐỢI auth sẵn sàng trước khi render (FIX: VIP 10 bị khóa đồ VIP 5)
 */
export async function loadPremiumProducts() {
  // ✅ PRIORITY 1: Khống chế Request - Chỉ load 1 lần duy nhất
  if (isProductsLoaded || isLoadingProducts) {
    console.log("📌 Sản phẩm đã được load hoặc đang loading...");
    return;
  }

  isLoadingProducts = true;

  // 🔴 CRITICAL: Đợi Auth sẵn sàng để VIP level được set đúng (FIX VIP 10 bug)
  await waitForAuthReady();

  try {
    // Hiển thị skeleton loading
    showSkeletonLoading();
    console.log("⏳ Đang tải sản phẩm...");

    // Import Firestore utilities
    const { db } = await import("../services/firebase.service.js");
    const { collection, getDocs, query, where } =
      await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

    // Lấy sản phẩm từ Firestore - FILTER: showOnHome === true
    const productsRef = collection(db, "products");
    const q = query(productsRef, where("showOnHome", "==", true));
    const snapshot = await getDocs(q);

    const products = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Kiểm tra các trường bắt buộc
      if (data.name && data.price !== undefined && data.available !== false) {
        products.push({
          id: doc.id,
          ...data,
        });
      }
    });

    console.log(`✅ Tải được ${products.length} sản phẩm từ Firestore`);

    // Render sản phẩm vào DOM
    renderProducts(products);

    // Khởi tạo event listeners cho các nút "Add to Cart"
    initProductCartButtons();

    // Khởi tạo Scroll Reveal Animations
    initScrollReveal();

    // ✅ Khởi tạo Hero Transition (enable card click -> detail page animation)
    initHeroTransition();

    // ✅ Đánh dấu đã load xong
    isProductsLoaded = true;
    isLoadingProducts = false;
  } catch (error) {
    console.error("❌ Lỗi khi tải sản phẩm:", error);
    isLoadingProducts = false;

    const grid = document.getElementById("home-products-grid");
    if (grid) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">
          <p>⚠️ Không thể tải sản phẩm. Vui lòng tải lại trang.</p>
        </div>
      `;
    }
  }
}

/**
 * Render sản phẩm với glassmorphism cards + VIP lock overlay
 */
function renderProducts(products) {
  const grid = document.getElementById("home-products-grid");
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">
        <p>📦 Chưa có sản phẩm nào. Vui lòng quay lại sau.</p>
      </div>
    `;
    return;
  }

  const html = products
    .map((product) => {
      // ✅ PRIORITY 3: Handle VIP Lock
      // Field có thể là requiredVIP hoặc requiredVipLevel
      const requiredVipLevel =
        product.requiredVIP || product.requiredVipLevel || 0;
      const isVIPOnly = product.isVIPOnly || false;
      const currentUserVip = store.getState().user?.data?.vipLevel || 0;

      // Kiểm tra user có đủ VIP không
      const isUserVIPEnough = currentUserVip >= requiredVipLevel;
      const hasVipRequirement = requiredVipLevel > 0;

      // VIP badge
      const vipBadge =
        hasVipRequirement && isVIPOnly
          ? `<div class="vip-badge-overlay">⭐ VIP ${requiredVipLevel}+</div>`
          : "";

      // VIP Lock Overlay - làm mờ card nếu user không đủ VIP
      const vipLockOverlay =
        hasVipRequirement && !isUserVIPEnough
          ? `<div class="vip-lock-overlay">
               <div class="lock-icon">🔒</div>
               <div class="lock-text">VIP ${requiredVipLevel}+ Only</div>
             </div>`
          : "";

      // Format giá tiền theo định dạng Việt Nam
      const formattedPrice = new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        minimumFractionDigits: 0,
      }).format(product.price);

      // ✅ FIX: Better placeholder image from Unsplash
      const placeholderUrl =
        "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&h=500&fit=crop";
      const imageUrl = product.image || placeholderUrl;

      // Nút CTA - Disabled nếu user không đủ VIP
      const buttonText =
        hasVipRequirement && !isUserVIPEnough
          ? `🔒 VIP ${requiredVipLevel}+ Only`
          : "🛒 Thêm vào giỏ";
      const buttonDisabled =
        hasVipRequirement && !isUserVIPEnough ? "disabled" : "";

      return `
        <div class="product-card ${hasVipRequirement && !isUserVIPEnough ? "vip-locked" : ""}" 
             data-scroll-reveal
             data-product-id="${product.id}"
             data-product-image="${imageUrl}"
             style="cursor: ${hasVipRequirement && !isUserVIPEnough ? "not-allowed" : "pointer"};">
          <div class="product-image-container">
            <img
              src="${imageUrl}"
              alt="${product.name}"
              class="product-image"
              loading="lazy"
              onerror="this.src='${placeholderUrl}'"
            />
            ${vipBadge}
            ${vipLockOverlay}
          </div>
          <div class="product-card-content">
            <h3 class="product-name">${product.name}</h3>
            <p class="product-price">${formattedPrice}</p>
            <button
              class="add-to-cart-btn"
              data-product-id="${product.id}"
              data-product-name="${product.name}"
              data-product-price="${product.price}"
              data-product-image="${imageUrl}"
              data-product-required-vip="${requiredVipLevel}"
              ${buttonDisabled}
            >
              ${buttonText}
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  grid.innerHTML = html;
}

/**
 * Khởi tạo event listeners cho nút "Add to Cart"
 */
function initProductCartButtons() {
  const buttons = document.querySelectorAll(".add-to-cart-btn");

  if (!buttons.length) {
    console.log("Không tìm thấy nút Add to Cart");
    return;
  }

  // Update trạng thái nút dựa trên VIP level hiện tại
  updateAllButtonStates();

  // Subscribe to store changes
  store.subscribe(() => {
    updateAllButtonStates();
  });

  // Thêm click handlers
  buttons.forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const product = {
        id: button.getAttribute("data-product-id"),
        name: button.getAttribute("data-product-name"),
        price: parseInt(button.getAttribute("data-product-price")),
        image: button.getAttribute("data-product-image"),
        requiredVip: parseInt(button.getAttribute("data-product-required-vip")),
      };

      handleAddToCart(product, button);
    });
  });
}

/**
 * Update trạng thái của tất cả nút Add to Cart dựa trên VIP level
 */
function updateAllButtonStates() {
  const state = store.getState();
  const userVipLevel = state.user?.data?.vipLevel || 0;

  const buttons = document.querySelectorAll(".add-to-cart-btn");

  buttons.forEach((button) => {
    const requiredVip = parseInt(
      button.getAttribute("data-product-required-vip"),
    );

    if (userVipLevel >= requiredVip) {
      // Người dùng có quyền truy cập
      button.disabled = false;
      button.classList.remove("btn-disabled");
      button.title = "";
    } else {
      // Không có quyền truy cập
      button.disabled = true;
      button.classList.add("btn-disabled");
      button.title = `🔒 Chỉ dành cho VIP ${requiredVip}+ (Hiện tại: VIP ${userVipLevel})`;
    }
  });
}

/**
 * Xử lý thêm vào giỏ hàng với kiểm tra VIP level
 */
function handleAddToCart(product, button) {
  const state = store.getState();
  const user = state.user?.data;
  const userVipLevel = user?.vipLevel || 0;

  // Kiểm tra người dùng đã đăng nhập
  if (!user) {
    toastInfo("🔐 Vui lòng đăng nhập để mua hàng", 3000);
    setTimeout(() => {
      window.location.href = "/login";
    }, 500);
    return;
  }

  // Kiểm tra VIP Level
  if (userVipLevel < product.requiredVip) {
    toastError(
      `🔒 Sản phẩm này dành cho VIP ${product.requiredVip}+! Hiện tại: VIP ${userVipLevel}`,
      4000,
    );
    return;
  }

  // Thêm vào giỏ hàng
  store.dispatch({
    type: ACTION_TYPES.ADD_TO_CART,
    payload: {
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      requiredVip: product.requiredVip,
      quantity: 1,
    },
  });

  // Hiển thị thông báo thành công
  toastSuccess(`✅ ${product.name} đã được thêm vào giỏ!`, 3000);

  // Mở giỏ hàng
  store.dispatch({
    type: ACTION_TYPES.TOGGLE_CART,
  });

  // Thêm animation cho nút
  button.classList.add("btn-clicked");
  setTimeout(() => button.classList.remove("btn-clicked"), 600);
}

// ===== HERO TRANSITION EFFECT =====
/**
 * ✅ Hero Transition: Lưu product image position để animate trên product detail page
 * Khi user click card -> lưu position + image URL vào sessionStorage
 * Khi product.html load -> animate image từ old position ra center
 */
function initHeroTransition() {
  const cards = document.querySelectorAll("[data-product-id]");

  cards.forEach((card) => {
    // Chỉ add listener nếu card không bị lock (VIP level không đủ)
    if (card.classList.contains("vip-locked")) {
      return; // Skip locked products
    }

    card.addEventListener("click", (e) => {
      // Không trigger nếu user click vào button
      if (e.target.closest(".add-to-cart-btn")) {
        return;
      }

      const productId = card.getAttribute("data-product-id");
      const imageUrl = card.getAttribute("data-product-image");
      const imageEl = card.querySelector(".product-image");

      if (!imageEl) return;

      // Lấy vị trí card trên màn hình
      const rect = imageEl.getBoundingClientRect();

      // Lưu hero transition data vào sessionStorage
      sessionStorage.setItem(
        "heroTransition",
        JSON.stringify({
          productId,
          imageUrl,
          fromRect: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          },
          timestamp: Date.now(),
        }),
      );

      console.log(`✨ Hero transition saved for product ${productId}`, rect);

      // Navigate to product detail page
      window.location.href = `/product?id=${productId}`;
    });
  });
}

// ===== SCROLL REVEAL ANIMATION =====
/**
 * Khởi tạo Scroll Reveal Animation cho sản phẩm
 * Sử dụng Intersection Observer để phát hiện khi element vào view
 */
function initScrollReveal() {
  const elements = document.querySelectorAll("[data-scroll-reveal]");

  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("scroll-revealed");
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  elements.forEach((el) => {
    observer.observe(el);
  });
}

// ===== EASTER EGG: VIP 10 RAINBOW NAME & SPARKLES =====
/**
 * Khởi tạo Easter Egg cho VIP 10 trong Navbar
 * - Rainbow text animation cho tên
 * - Sparkles xung quanh avatar
 * - Crown badge
 */
export async function initVip10EasterEgg() {
  try {
    const state = store.getState();
    const user = state.user?.data;

    // Kiểm tra nếu là VIP 10 và active
    if (user?.vipLevel === 10) {
      const userNameEl = document.querySelector(".user-name-display");
      const avatarEl = document.querySelector(".user-avatar-display");

      if (userNameEl) {
        // Thêm Rainbow Text Effect
        userNameEl.classList.add("vip10-rainbow-text");
        userNameEl.innerHTML = `👑 ${user.name || "Elite Patron"} 👑`;
      }

      if (avatarEl) {
        // Thêm Sparkles Animation
        createSparklesAnimation(avatarEl);
      }
    }
  } catch (error) {
    console.error("Lỗi VIP 10 easter egg:", error);
  }
}

/**
 * Tạo hiệu ứng Sparkles xung quanh Avatar
 * Sử dụng requestAnimationFrame cho mượt mà
 */
function createSparklesAnimation(container) {
  // Thêm CSS cho container
  container.style.position = "relative";
  container.classList.add("vip10-sparkles-container");

  // Tạo sparkle particles
  const sparkleCount = 8;
  const sparkles = [];

  for (let i = 0; i < sparkleCount; i++) {
    const sparkle = document.createElement("div");
    sparkle.classList.add("sparkle");
    container.appendChild(sparkle);

    sparkles.push({
      element: sparkle,
      angle: (i / sparkleCount) * Math.PI * 2,
      distance: 50,
      opacity: 0,
    });
  }

  // Animation loop using requestAnimationFrame
  let time = 0;
  const animate = () => {
    time += 0.02;

    sparkles.forEach((sparkle, index) => {
      // Orbit animation
      const x = Math.cos(sparkle.angle + time) * sparkle.distance;
      const y = Math.sin(sparkle.angle + time) * sparkle.distance;

      // Opacity fluctuation (blink effect)
      const opacityWave = (Math.sin(time * 3 + index) + 1) / 2;
      const opacity = opacityWave * 0.8 + 0.2;

      sparkle.element.style.transform = `translate(${x}px, ${y}px) scale(${opacity})`;
      sparkle.element.style.opacity = opacity;
    });

    requestAnimationFrame(animate);
  };

  animate();
}

// ===== ELITE PATRONS =====
let elitePatronsUnsubscribe = null; // ✅ FIX: Track listener to prevent duplicate

/**
 * Load và render Elite Patrons (Top 10 VIP Users)
 * - ✅ FIX: Check if already initialized (prevent duplicate listeners)
 * - ✅ FIX: Use Set to deduplicate by uid
 * - ✅ FIX: Xóa html cũ trước khi render mới
 */
export async function initElitePatrons() {
  // ✅ FIX: Chỉ init 1 lần duy nhất
  if (isElitaPatronsInitialized) {
    console.log("📌 Elite Patrons đã được init rồi");
    return;
  }
  isElitaPatronsInitialized = true;

  try {
    const { db } = await import("../services/firebase.service.js");
    const { collection, query, where, orderBy, limit, onSnapshot } =
      await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

    const marqueeContainer = document.getElementById("elite-marquee");
    if (!marqueeContainer) return;

    // Query cho Top 10 VIP users (totalSpent >= 500 triệu)
    const usersRef = collection(db, "users");
    const q = query(
      usersRef,
      where("totalSpent", ">=", 500000000),
      orderBy("totalSpent", "desc"),
      limit(10),
    );

    // ✅ FIX: Hủy listener cũ nếu có (tránh duplicate listeners)
    if (elitePatronsUnsubscribe) {
      elitePatronsUnsubscribe();
    }

    // Real-time listener - chỉ set up một lần
    elitePatronsUnsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        // ✅ FIX: Xóa sạch html cũ TRƯỚC khi render mới
        marqueeContainer.innerHTML = "";

        // ✅ FIX: Dùng Set để tránh duplicate uid (dedup)
        const uniquePatrons = new Map(); // Map<uid, patron>
        const patrons = [];

        querySnapshot.forEach((doc) => {
          const userData = doc.data();
          const uid = doc.id; // ✅ FIX: Dùng doc.id làm unique identifier
          const totalSpent = parseInt(userData.totalSpent) || 0;

          // ✅ FIX: Chỉ thêm nếu chưa có uid này (dedup)
          if (!uniquePatrons.has(uid) && userData.name && totalSpent > 0) {
            uniquePatrons.set(uid, {
              uid,
              name: userData.name,
              totalSpent: totalSpent,
            });
            patrons.push(uniquePatrons.get(uid));
          }
        });

        // Sort by totalSpent descending
        patrons.sort((a, b) => b.totalSpent - a.totalSpent);

        if (patrons.length === 0) {
          marqueeContainer.innerHTML = `
            <div class="elite-patron tier-10">
              🏆 Trở thành Legend đầu tiên!
            </div>
          `;
          return;
        }

        let html = "";
        patrons.forEach((patron, index) => {
          const rank = index + 1;
          const crownEmoji = rank === 1 ? "👑" : "💎";

          const formattedMoney = new Intl.NumberFormat("vi-VN", {
            style: "currency",
            currency: "VND",
            minimumFractionDigits: 0,
          }).format(patron.totalSpent);

          html += `
            <div class="elite-patron tier-10" style="display: flex; align-items: center; gap: 12px; padding: 12px 20px;">
              <span style="font-weight: 900; min-width: 30px; text-align: center;">#${rank} ${crownEmoji}</span>
              <span style="flex: 1;">${patron.name}</span>
              <span style="color: #d4af37; font-weight: 700; font-size: 0.9rem;">${formattedMoney}</span>
            </div>
          `;
        });

        // ✅ FIX: Không duplicate vào marquee nữa - đã đủ rồi
        marqueeContainer.innerHTML = html;
      },
      (error) => {
        console.error("Lỗi khi tải Elite Patrons:", error);
        marqueeContainer.innerHTML = `<div class="elite-patron">⚠️ Không thể tải dữ liệu</div>`;
      },
    );
  } catch (error) {
    console.error("Lỗi khởi tạo Elite Patrons:", error);
  }
}

// ===== INITIALIZATION =====
// ✅ FIX: Chỉ chạy ONCE duy nhất - consolidate DOMContentLoaded logic
/**
 * Render Moments of Excellence - Featured products where showOnHome === true
 * - Displays products in a premium grid layout
 * - Shows discount badges if discount > 0
 * - Uses object-fit: cover for consistent image sizing
 * - Includes hover scale effect
 */
async function renderMomentsOfExcellence() {
  const container = document.getElementById("moments-container");
  if (!container) return;

  try {
    // Get products from store (already loaded by loadPremiumProducts)
    const state = store.getState();
    const allProducts = state.products?.list || [];

    // Filter products where showOnHome === true
    const momentsProducts = allProducts
      .filter((p) => p.showOnHome === true)
      .slice(0, 6);

    if (momentsProducts.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #c89b3c;">
          <p>✨ Featured moments coming soon...</p>
        </div>
      `;
      return;
    }

    const html = momentsProducts
      .map((product) => {
        const discount = product.discount || 0;
        const finalPrice = product.price * (1 - discount / 100);
        const formattedOriginal = Math.floor(product.price).toLocaleString(
          "vi-VN",
        );
        const formattedFinal = Math.floor(finalPrice).toLocaleString("vi-VN");

        const placeholderUrl =
          "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&h=500&fit=crop";
        const imageUrl = product.image || placeholderUrl;

        const discountBadge =
          discount > 0
            ? `<div class="moment-discount-badge">-${Math.floor(discount)}%</div>`
            : "";

        return `
          <div class="moment-card" data-product-id="${product.id}">
            <div class="moment-image-wrapper">
              <img 
                src="${imageUrl}" 
                alt="${product.name}"
                class="moment-image"
                loading="lazy"
                onerror="this.src='${placeholderUrl}'"
              />
              ${discountBadge}
            </div>
            <div class="moment-content">
              <h3 class="moment-title">${product.name}</h3>
              <p class="moment-category">${product.category || "Premium Coffee"}</p>
              <div class="moment-price-group">
                ${discount > 0 ? `<span class="moment-price-original">${formattedOriginal}đ</span>` : ""}
                <span class="moment-price">${formattedFinal}đ</span>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = html;

    // Add click handlers to view product details
    container.querySelectorAll(".moment-card").forEach((card) => {
      card.addEventListener("click", () => {
        const productId = card.getAttribute("data-product-id");
        window.location.href = `/pages/product.html?id=${productId}`;
      });
    });
  } catch (error) {
    console.error("❌ Error rendering moments:", error);
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">
        <p>⚠️ Unable to load moments.</p>
      </div>
    `;
  }
}

export function initHomePage() {
  // ✅ Chỉ call 1 lần từ index.html
  loadPremiumProducts();
  initElitePatrons();
  initVip10EasterEgg();

  // ✅ NEW: Render Moments of Excellence after products are loaded
  setTimeout(() => {
    renderMomentsOfExcellence();
  }, 500);
}

// Auto-init nếu file được load trực tiếp (không qua import)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initHomePage();
  });
} else {
  initHomePage();
}
