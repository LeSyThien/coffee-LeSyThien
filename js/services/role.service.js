/**
 * Role Management Service
 *
 * REFACTORED: Now using direct Firestore fetches instead of Cloud Functions
 * Cloud Functions calls are commented out until Blaze plan is enabled
 *
 * Requirements:
 * - Import necessary Firestore functions
 * - Client must be authenticated and have admin role for sensitive operations
 */

// ❌ DEPRECATED - Cloud Functions calls (kept for future Blaze deployment)
/* import {
  httpsCallable,
  connectFunctionsEmulator,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { functions } from "./firebase.service.js"; */

import { auth, db } from "./firebase.service.js";
import { getIdTokenResult } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  getDocs,
  query,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Set user role (promote/demote) - Direct Firestore implementation
 *
 * @param {string} email - User email (client-side only, actual updates done via Firestore rules)
 * @param {string} role - Target role ("admin" or "user")
 * @returns {Promise<Object>} Result with success status and message
 */
export async function setUserRole(email, role) {
  try {
    // ❌ CLOUD FUNCTIONS VERSION (commented out for Blaze deployment):
    /* const setUserRoleFunction = httpsCallable(functions, "setUserRole");
    console.log(`📝 Calling setUserRole with:`, { email, role });
    const result = await setUserRoleFunction({
      email: email.toLowerCase().trim(),
      role: role,
    });
    console.log("✅ setUserRole response:", result.data);
    return {
      success: true,
      data: result.data,
      message: result.data.message,
    }; */

    // ✅ DIRECT FIRESTORE VERSION (current implementation):
    console.log(`📝 Using direct Firestore to set role:`, { email, role });

    // Verify current user is admin (security check)
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return {
        success: false,
        error: "unauthenticated",
        message: "You must be logged in",
      };
    }

    const tokenResult = await getIdTokenResult(currentUser);
    if (tokenResult.claims.admin !== true) {
      return {
        success: false,
        error: "permission-denied",
        message: "You don't have permission to change user roles",
      };
    }

    // Validate input
    if (!email || !email.includes("@")) {
      return {
        success: false,
        error: "invalid-argument",
        message: "Invalid email format",
      };
    }

    if (!["admin", "user"].includes(role)) {
      return {
        success: false,
        error: "invalid-argument",
        message: 'Role must be "admin" or "user"',
      };
    }

    // ⚠️ NOTE: This updates the local users collection
    // In production with Cloud Functions + set-admin.js, this would also:
    // - Call auth.setCustomUserClaims(uid, { admin: true/false })
    // - User would need to logout and login to refresh token

    // For now, we'll try to find and update the user document
    // (This requires backend admin privileges via Firestore rules)
    console.log(
      `⚠️  NOTE: Direct Firestore role updates require Firestore rules to allow authenticated+admin updates`,
    );
    console.log(
      `   Alternatively, use: node functions/set-admin.js "${email}" "${role}"`,
    );

    return {
      success: false,
      error: "not-implemented",
      message:
        "Use Cloud Functions (set-admin.js) to set user roles. Update requires backend access.",
    };
  } catch (error) {
    console.error("❌ setUserRole error:", error);

    let message = "Failed to update user role";
    if (error.message) {
      message = error.message;
    }

    return {
      success: false,
      error: error.code || "unknown",
      message: message,
    };
  }
}

/**
 * Get all users (admin only) - Direct Firestore implementation
 *
 * @returns {Promise<Object>} Array of users with their roles
 */
export async function getAllUsers() {
  try {
    // ❌ CLOUD FUNCTIONS VERSION (commented out for Blaze deployment):
    /* const getAllUsersFunction = httpsCallable(functions, "getAllUsers");
    console.log("🔍 Fetching all users...");
    const result = await getAllUsersFunction({});
    console.log(`✅ Retrieved ${result.data.count} users`, result.data.users);
    return {
      success: true,
      data: result.data,
      users: result.data.users,
    }; */

    // ✅ DIRECT FIRESTORE VERSION (current implementation):
    console.log("🔍 Fetching all users from Firestore...");

    // Verify current user is admin (security check)
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn("⚠️  User not authenticated");
      return {
        success: false,
        error: "unauthenticated",
        message: "You must be logged in",
      };
    }

    // Verify admin role before fetching
    const tokenResult = await getIdTokenResult(currentUser);
    if (tokenResult.claims.admin !== true) {
      console.warn("⚠️  User does not have admin claim");
      return {
        success: false,
        error: "permission-denied",
        message: "You don't have permission to view all users",
      };
    }

    // Fetch all users from Firestore
    const usersRef = collection(db, "users");
    const querySnapshot = await getDocs(usersRef);

    const users = [];
    querySnapshot.forEach((docSnap) => {
      const userData = docSnap.data();
      users.push({
        uid: docSnap.id,
        email: userData.email,
        name: userData.name,
        role: userData.role || "user",
        balance: userData.balance || 0,
        createdAt: userData.createdAt,
        updatedAt: userData.updatedAt,
      });
    });

    console.log(`✅ Retrieved ${users.length} users from Firestore`);

    return {
      success: true,
      data: { count: users.length, users },
      users: users,
    };
  } catch (error) {
    console.error("❌ getAllUsers error:", error);

    let message = "Failed to fetch users";

    if (error.code === "permission-denied") {
      message = "You don't have permission to view all users";
    } else if (error.code === "unauthenticated") {
      message = "You must be logged in";
    } else if (error.message) {
      message = error.message;
    }

    return {
      success: false,
      error: error.code,
      message: message,
    };
  }
}

/**
 * Revoke admin role from user - Cloud Functions only (requires Blaze plan)
 *
 * @param {string} uid - User UID
 * @returns {Promise<Object>} Result with success status
 */
export async function revokeAdminRole(uid) {
  try {
    console.error("❌ revokeAdminRole not yet implemented for Firestore");
    console.log("⚠️  Use: node functions/set-admin.js <email> user");

    return {
      success: false,
      error: "not-implemented",
      message: "Use Cloud Functions (set-admin.js) with Blaze plan enabled",
    };

    // ❌ CLOUD FUNCTIONS VERSION (commented out for Blaze deployment):
    /* const revokeAdminRoleFunction = httpsCallable(functions, "revokeAdminRole");
    console.log(`📝 Calling revokeAdminRole for ${uid}`);
    const result = await revokeAdminRoleFunction({ uid });
    console.log("✅ revokeAdminRole response:", result.data);
    return {
      success: true,
      data: result.data,
      message: result.data.message,
    }; */
  } catch (error) {
    console.error("❌ revokeAdminRole error:", error);

    let message = "Failed to revoke admin role";

    if (error.code === "permission-denied") {
      message = "You don't have permission to revoke roles";
    } else if (error.code === "unauthenticated") {
      message = "You must be logged in";
    } else if (error.message) {
      message = error.message;
    }

    return {
      success: false,
      error: error.code,
      message: message,
    };
  }
}

/**
 * Promote user to admin (convenience wrapper)
 *
 * @param {string} email - User email
 * @returns {Promise<Object>} Result
 */
export async function promoteToAdmin(email) {
  return setUserRole(email, "admin");
}

/**
 * Demote user to regular user (convenience wrapper)
 *
 * @param {string} email - User email
 * @returns {Promise<Object>} Result
 */
export async function demoteToUser(email) {
  return setUserRole(email, "user");
}
