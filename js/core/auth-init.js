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

import { auth, db } from "../services/firebase.service.js";
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
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import store from "../store/index.js";
import { ACTION_TYPES } from "../store/actions.js";

// Track unsubscribe functions to clean up listeners
let unsubscribeUserSnapshot = null;
let unsubscribeOrdersSnapshot = null;
let unsubscribeProductsSnapshot = null;
let unsubscribeAuthStateChanged = null;
let isInitialized = false;

/**
 * Initialize Firebase Auth - restores session and sets up realtime listeners
 * Can be called multiple times safely - only initializes once
 */
export function initializeAuth() {
  // Prevent duplicate initialization
  if (isInitialized) {
    console.log("⚠️ Auth already initialized, skipping");
    return;
  }
  isInitialized = true;

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
    unsubscribeProductsSnapshot = onSnapshot(
      query(
        collection(db, "products"),
        where("available", "==", true),
        orderBy("createdAt", "desc"),
      ),
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
      },
    );

    if (user) {
      console.log("✅ Auth restored:", user.email);

      // 1. Subscribe to user data updates (realtime)
      // ⚠️ CRITICAL: Set isAuthReady INSIDE the user snapshot callback,
      // not before it, to prevent race condition where admin.js checks
      // userData before it loads from Firestore
      unsubscribeUserSnapshot = onSnapshot(
        doc(db, "users", user.uid),
        async (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();

            // Check for admin custom claim
            const idTokenResult = await user.getIdTokenResult();
            const isAdmin = idTokenResult.claims.admin === true;

            // Add admin flag to user data for client-side checks
            const userDataWithAdmin = { ...userData, isAdmin };

            store.dispatch({
              type: ACTION_TYPES.SET_USER,
              payload: userDataWithAdmin,
            });
            console.log("✅ User data synced");
            console.log("🔥 UID:", user.uid);
            console.log("🔥 FIRESTORE USER:", userDataWithAdmin);

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
      console.log("❌ Not authenticated");

      // Clear state
      store.dispatch({
        type: ACTION_TYPES.SET_USER,
        payload: null,
      });
      store.dispatch({
        type: ACTION_TYPES.SET_ORDERS,
        payload: [],
      });

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
  if (unsubscribeAuthStateChanged) {
    unsubscribeAuthStateChanged();
    unsubscribeAuthStateChanged = null;
  }
}
