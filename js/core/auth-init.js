/**
 * SHARED AUTH INITIALIZATION FOR ALL PAGES
 * This file must be imported by EVERY page to ensure:
 * 1. Firebase Auth session is restored on page load
 * 2. User state is synced to store immediately
 * 3. Real-time listeners (user data, orders) are active
 * 4. isAuthReady flag prevents flash of "Guest"
 *
 * Import in every page's script:
 * import { initializeAuth } from "./core/auth-init.js";
 */

import {
  auth,
  db,
  handleGoogleRedirectResult,
  calculateMemberRank,
  checkAndApplyVIP10AutoPromotion,
} from "../services/firebase.service.js";
import {
  onAuthStateChanged,
  getIdTokenResult,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc,
  onSnapshot,
  query,
  collection,
  where,
  orderBy,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import store from "../store/index.js";
import { ACTION_TYPES } from "../store/actions.js";
import { renderCart } from "../components/cart.js";

// Track unsubscribe functions to clean up listeners
let unsubscribeUserSnapshot = null;
let unsubscribeOrdersSnapshot = null;
let unsubscribeProductsSnapshot = null;
let unsubscribeCartSnapshot = null;
let unsubscribeAuthStateChanged = null;
let isInitialized = false;
let isCloudCartUpdate = false;
let lastCartSnapshot = "";

async function syncCartToFirestore(userId, cart) {
  try {
    if (!userId) return;
    const cartRef = doc(db, "carts", userId);
    await setDoc(cartRef, {
      items: Array.isArray(cart.items) ? cart.items : [],
      total: Number(cart.total) || 0,
      updatedAt: serverTimestamp(),
    });
    renderCart(); // Force re-render cart UI after sync
  } catch (error) {
    console.error("☁️ Cart sync failed:", error);
  }
}

async function ensureCartCloudState(user) {
  if (!user) return;
  const userId = user.uid;
  const localCart = store.getState().cart;
  const cartRef = doc(db, "carts", userId);

  try {
    const cartDoc = await getDoc(cartRef);

    if (!cartDoc.exists() || !cartDoc.data()?.items?.length) {
      await setDoc(cartRef, {
        items: Array.isArray(localCart.items) ? localCart.items : [],
        total: Number(localCart.total) || 0,
        updatedAt: serverTimestamp(),
      });
      renderCart(); // Force re-render after initial sync
      return;
    }

    const firestoreCart = cartDoc.data();
    const cartPayload = {
      items: Array.isArray(firestoreCart.items) ? firestoreCart.items : [],
      total: Number(firestoreCart.total) || 0,
    };

    const currentCart = store.getState().cart;
    const hasChanged =
      JSON.stringify(currentCart) !== JSON.stringify(cartPayload);

    if (hasChanged) {
      store.dispatch({ type: ACTION_TYPES.SET_CART, payload: cartPayload });
      renderCart(); // Force re-render after fetching from Firestore
    }

    // Subscribe to remote cart changes for real-time multi-device sync
    if (unsubscribeCartSnapshot) unsubscribeCartSnapshot();
    unsubscribeCartSnapshot = onSnapshot(cartRef, (snapshot) => {
      const remoteCart = snapshot.data();
      if (!remoteCart) return;

      const payload = {
        items: Array.isArray(remoteCart.items) ? remoteCart.items : [],
        total: Number(remoteCart.total) || 0,
      };

      const fingerprint = JSON.stringify(payload);
      if (fingerprint === lastCartSnapshot) return;

      lastCartSnapshot = fingerprint;
      isCloudCartUpdate = true;
      store.dispatch({ type: ACTION_TYPES.SET_CART, payload });
      renderCart(); // Re-render when remote cart updates
    });
  } catch (error) {
    console.error("☁️ Cart initialize sync failed:", error);
  }
}

/**
 * Initialize Firebase Auth - restores session and sets up realtime listeners
 * Can be called multiple times safely - only initializes once
 */
export async function initializeAuth() {
  // Prevent duplicate initialization
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  // ⚡ SPEED: Check sessionStorage for quick auth state
  const wasLoggedIn = sessionStorage.getItem("isLoggedIn") === "true";
  const storedUserId = sessionStorage.getItem("userId");

  // If we detect the user was logged in, set UI state immediately
  if (wasLoggedIn && storedUserId) {
    // This prevents the loading spinner from showing for returning users
    // The actual data will be synced when onAuthStateChanged fires
    store.dispatch({
      type: ACTION_TYPES.SET_AUTH_READY,
      payload: true,
    });
  }

  // Handle redirect sign-in results first (for signInWithRedirect flow)
  try {
    await handleGoogleRedirectResult();
  } catch (error) {
    console.error("Failed to process sign-in redirect:", error);
  }

  // Set up auth state listener (only set up once)
  unsubscribeAuthStateChanged = onAuthStateChanged(auth, (user) => {
    // Clean up old listeners first
    if (unsubscribeUserSnapshot) {
      unsubscribeUserSnapshot();
      unsubscribeUserSnapshot = null;
    }
    if (unsubscribeOrdersSnapshot) {
      unsubscribeOrdersSnapshot();
      unsubscribeOrdersSnapshot = null;
    }
    if (unsubscribeProductsSnapshot) {
      unsubscribeProductsSnapshot();
      unsubscribeProductsSnapshot = null;
    }

    // Always subscribe to products (available to all visitors)
    store.dispatch({
      type: ACTION_TYPES.SET_PRODUCTS_LOADING,
      payload: true,
    });

    const isHomePage =
      window.location.pathname.includes("index.html") ||
      window.location.pathname.endsWith("/") ||
      window.location.pathname.includes("/pages/index.html");

    const productsQuery = isHomePage
      ? query(
          collection(db, "products"),
          where("available", "==", true),
          where("isExclusiveVIP", "==", false),
        )
      : query(
          collection(db, "products"),
          where("available", "==", true),
          where("isVIPOnly", "==", false),
        );

    // Note: If Firebase throws a composite index error, create an index for (available, isVIPOnly, showOnHome).
    unsubscribeProductsSnapshot = onSnapshot(
      productsQuery,
      (querySnap) => {
        const productsList = [];
        querySnap.forEach((doc) => {
          productsList.push({
            id: doc.id,
            ...doc.data(),
          });
        });
        store.dispatch({
          type: ACTION_TYPES.SET_PRODUCTS,
          payload: productsList,
        });
      },
      (error) => {
        console.error("❌ Products listener error:", error);
        store.dispatch({
          type: ACTION_TYPES.SET_PRODUCTS_LOADING,
          payload: false,
        });
      },
    );

    if (user) {
      // 1. Subscribe to user data updates (realtime)
      // ⚠️ CRITICAL: Set isAuthReady INSIDE the user snapshot callback,
      // not before it, to prevent race condition where admin.js checks
      // userData before it loads from Firestore
      unsubscribeUserSnapshot = onSnapshot(
        doc(db, "users", user.uid),
        async (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();

            // Calculate VIP level from totalSpent
            const totalSpent = Number(userData.totalSpent) || 0;
            const memberRank = calculateMemberRank(totalSpent);

            // Check for admin custom claim with email fallback
            const idTokenResult = await user.getIdTokenResult();
            let isAdmin = idTokenResult.claims.admin === true;

            // Fallback: If no admin claim, check if email matches admin email
            if (!isAdmin && user.email === "sythien09@gmail.com") {
              isAdmin = true;
            }

            // Add admin flag and VIP level to user data for client-side checks
            const userDataWithAdmin = {
              ...userData,
              isAdmin,
              vipLevel: memberRank.rank,
            };

            store.dispatch({
              type: ACTION_TYPES.SET_USER,
              payload: userDataWithAdmin,
            });

            // 💾 SYNC CACHE: Update localStorage with latest user data for instant navbar render
            try {
              const cacheData = {
                displayName: userData.displayName || userData.name || "",
                balance: Number(userData.balance) || 0,
                photoURL: userData.photoURL || user.photoURL || "",
                vipLevel: memberRank.rank,
                lastUpdated: Date.now(),
              };
              localStorage.setItem("cached_user", JSON.stringify(cacheData));
            } catch (error) {
              console.warn("⚠️ Failed to update user cache:", error);
            }

            // 🔟 CHECK FOR VIP 10 AUTO-PROMOTION (when totalSpent >= 500M)
            checkAndApplyVIP10AutoPromotion(user.uid);

            // 🎁 CHECK FOR VIP UPSELL OPPORTUNITY
            checkVipUpsellOpportunity(user.uid, userData);

            // ⚡ SPEED: Store login state in sessionStorage for instant page loads next time
            sessionStorage.setItem("isLoggedIn", "true");
            sessionStorage.setItem("userId", user.uid);
            sessionStorage.setItem("userEmail", user.email || "");

            // 2. Subscribe to orders (realtime) with admin/user filters
            const ordersQuery = isAdmin
              ? query(collection(db, "orders"), orderBy("createdAt", "desc"))
              : query(
                  collection(db, "orders"),
                  where("userId", "==", user.uid),
                  orderBy("createdAt", "desc"),
                );

            unsubscribeOrdersSnapshot = onSnapshot(
              ordersQuery,
              (querySnap) => {
                const ordersList = [];
                querySnap.forEach((doc) => {
                  ordersList.push({
                    id: doc.id,
                    ...doc.data(),
                  });
                });
                store.dispatch({
                  type: ACTION_TYPES.SET_ORDERS,
                  payload: ordersList,
                });
              },
              (error) => {
                console.error("❌ Orders listener error:", error);
              },
            );

            // Cloud-cart sync: compare localStorage cart with Firestore and keep in sync
            ensureCartCloudState(user);

            // Store subscriber that writes local actions back to Firestore cart
            store.subscribe(() => {
              if (!auth.currentUser) return;
              if (isCloudCartUpdate) {
                isCloudCartUpdate = false;
                return;
              }

              const currentCart = store.getState().cart;
              const fingerprint = JSON.stringify(currentCart);
              if (fingerprint === lastCartSnapshot) return;

              lastCartSnapshot = fingerprint;
              syncCartToFirestore(auth.currentUser.uid, currentCart);
            });

            // ✅ Mark auth as ready AFTER user data is available
            // This ensures admin.js won't redirect before userData loads
            store.dispatch({
              type: ACTION_TYPES.SET_AUTH_READY,
              payload: true,
            });
          }
        },
        (error) => {
          console.error("❌ User data listener error:", error);
          // Even if user doc fails to load, mark auth as ready (to prevent hanging)
          store.dispatch({
            type: ACTION_TYPES.SET_AUTH_READY,
            payload: true,
          });
        },
      );
    } else {
      // Clear state
      store.dispatch({
        type: ACTION_TYPES.SET_USER,
        payload: null,
      });
      store.dispatch({
        type: ACTION_TYPES.SET_ORDERS,
        payload: [],
      });

      // ⚡ SPEED: Clear sessionStorage when user logs out
      sessionStorage.removeItem("isLoggedIn");
      sessionStorage.removeItem("userId");
      sessionStorage.removeItem("userEmail");

      // ✅ Mark auth as ready when user is NOT authenticated
      store.dispatch({
        type: ACTION_TYPES.SET_AUTH_READY,
        payload: true,
      });
    }
  });
}

/**
 * REPLACEMENT: Show VIP Upsell Modal (Glassmorphism)
 */
async function checkVipUpsellOpportunity(userId, userData) {
  try {
    const totalSpent = Number(userData?.totalSpent) || 0;
    const isVipActive = userData?.isVipActive === true;
    const vipLevel = Number(userData?.vipLevel) || 0;

    // CRITICAL FIX: Don't show upsell if spending <5M OR already VIP active OR VIP 10+ (permanent)
    // VIP 10 users are legends and shouldn't be bothered with subscription upsells
    if (totalSpent < 5000000 || isVipActive || vipLevel >= 10) {
      return;
    }

    const dismissKey = `hideVipUpsell_${userId}`;
    const dismissedData = localStorage.getItem(dismissKey);

    if (dismissedData) {
      const { expiryTime } = JSON.parse(dismissedData);
      if (Date.now() < expiryTime) {
        return;
      }
      localStorage.removeItem(dismissKey);
    }

    showUpsellModal(userId, totalSpent, dismissKey);
  } catch (error) {
    console.error("❌ VIP Upsell check failed:", error);
  }
}

/**
 * Show VIP Upsell Modal in center of screen
 */
function showUpsellModal(userId, totalSpent, dismissKey) {
  if (document.getElementById("upsell-modal-overlay")) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "upsell-modal-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(10, 10, 11, 0.7);
    backdrop-filter: blur(8px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const modal = document.createElement("div");
  modal.id = "vipUpsellModal";
  modal.style.cssText = `
    background: linear-gradient(135deg, rgba(45, 27, 60, 0.95), rgba(60, 35, 80, 0.9));
    border: 1px solid rgba(208, 129, 190, 0.3);
    border-radius: 20px;
    padding: 40px;
    max-width: 450px;
    width: 90%;
    backdrop-filter: blur(20px);
    box-shadow: 0 8px 32px rgba(208, 129, 190, 0.2);
    animation: slideUp 0.3s ease-out;
  `;

  modal.innerHTML = `
    <style>
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(40px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 12px;">💎</div>
      <h2 style="color: #d081be; font-size: 1.8rem; margin: 0 0 8px;">Đẳng cấp bị bỏ lỡ!</h2>
      <p style="color: rgba(245, 241, 230, 0.8); margin: 0; font-size: 0.95rem;">Ông giáo đã chi tiêu tổng cộng</p>
    </div>
    <div style="background: rgba(208, 129, 190, 0.1); border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: center;">
      <p style="color: #d4af37; font-size: 2rem; font-weight: 900; margin: 0;">₫${totalSpent.toLocaleString("vi-VN")}</p>
      <p style="color: rgba(245, 241, 230, 0.6); font-size: 0.9rem; margin: 8px 0 0;">nhưng vẫn chưa là Hội viên VIP!</p>
    </div>
    <button id="upsell-activate-btn" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #d081be, #9b59b6); color: #fff; border: none; border-radius: 10px; font-weight: 700; font-size: 1rem; cursor: pointer; margin-bottom: 12px; box-shadow: 0 4px 15px rgba(208, 129, 190, 0.4); transition: all 0.3s ease;">
      🚀 Kích hoạt Đẳng cấp ngay
    </button>
    <label style="display: flex; align-items: center; gap: 10px; color: rgba(245, 241, 230, 0.7); font-size: 0.9rem; cursor: pointer;">
      <input type="checkbox" id="upsell-hide-checkbox" style="width: 18px; height: 18px; cursor: pointer; accent-color: #d081be;">
      <span>Không hiện lại trong 24 giờ</span>
    </label>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const hideCheckbox = document.getElementById("upsell-hide-checkbox");
  hideCheckbox?.addEventListener("change", () => {
    if (hideCheckbox.checked) {
      const exp = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem(dismissKey, JSON.stringify({ expiryTime: exp }));
    }
  });

  const btn = document.getElementById("upsell-activate-btn");
  btn?.addEventListener("click", () => {
    const modal = document.getElementById("vipUpsellModal");
    if (modal) modal.remove();
    overlay.remove();
    window.location.href = "/pages/vip.html";
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      const modal = document.getElementById("vipUpsellModal");
      if (modal) modal.remove();
      overlay.remove();
    }
  });
}

/**
 * Cleanup all listeners (call on app unload if needed)
 */
export function cleanupAuth() {
  if (unsubscribeUserSnapshot) {
    unsubscribeUserSnapshot();
    unsubscribeUserSnapshot = null;
  }
  if (unsubscribeOrdersSnapshot) {
    unsubscribeOrdersSnapshot();
    unsubscribeOrdersSnapshot = null;
  }
  if (unsubscribeProductsSnapshot) {
    unsubscribeProductsSnapshot();
    unsubscribeProductsSnapshot = null;
  }
  if (unsubscribeCartSnapshot) {
    unsubscribeCartSnapshot();
    unsubscribeCartSnapshot = null;
  }
  if (unsubscribeAuthStateChanged) {
    unsubscribeAuthStateChanged();
    unsubscribeAuthStateChanged = null;
  }
}
