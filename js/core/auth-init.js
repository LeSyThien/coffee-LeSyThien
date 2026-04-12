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
