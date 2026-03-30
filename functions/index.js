const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

/**
 * HTTPS Callable Cloud Function: Set User Role
 *
 * ⚠️ SECURITY:
 * - Only callable by authenticated users with admin custom claim
 * - Checks context.auth.token.admin === true
 * - Validates role parameter
 * - Updates both Auth (custom claims) and Firestore
 *
 * @param {Object} data - Function input
 * @param {string} data.email - User email to promote/demote
 * @param {string} data.role - Target role ("admin" or "user")
 * @param {Object} context - Firebase context (auth, etc.)
 * @returns {Object} Success response with uid and role
 */
exports.setUserRole = functions.https.onCall(async (data, context) => {
  // 🔥 1. SECURITY CHECK: Verify caller is admin
  if (!context.auth) {
    console.error("❌ UNAUTHORIZED: No auth context");
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User not authenticated",
    );
  }

  if (context.auth.token.admin !== true) {
    console.error(
      `❌ PERMISSION DENIED: User ${context.auth.uid} attempted role change without admin access`,
    );
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can change user roles",
    );
  }

  // 🔥 2. VALIDATE INPUT
  const { email, role } = data;

  if (!email || typeof email !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Email is required and must be a string",
    );
  }

  if (!role || !["admin", "user"].includes(role)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      'Role must be either "admin" or "user"',
    );
  }

  console.log(
    `📝 Admin ${context.auth.uid} is setting role for ${email} to ${role}`,
  );

  try {
    // 🔥 3. GET USER BY EMAIL
    console.log(`🔍 Looking up user: ${email}`);
    const userRecord = await auth.getUserByEmail(email);
    const uid = userRecord.uid;
    console.log(`✅ Found user ${uid} with email ${email}`);

    // 🔥 4. SET CUSTOM CLAIMS
    const customClaims = role === "admin" ? { admin: true } : { admin: false };
    console.log(`🔑 Setting custom claims for ${uid}:`, customClaims);
    await auth.setCustomUserClaims(uid, customClaims);
    console.log(`✅ Custom claims updated`);

    // 🔥 5. UPDATE FIRESTORE
    const userRef = db.collection("users").doc(uid);
    console.log(`📄 Updating Firestore document for ${uid}`);
    await userRef.update({
      role: role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: context.auth.uid,
    });
    console.log(`✅ Firestore updated`);

    // 🔥 6. RETURN SUCCESS
    return {
      success: true,
      message: `User ${email} role updated to ${role}`,
      uid: uid,
      email: email,
      role: role,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    // 🔥 ERROR HANDLING
    console.error(
      `❌ Error setting role for ${email}:`,
      error.message || error,
    );

    // Map Firebase Auth errors to HTTP errors
    if (error.code === "auth/user-not-found") {
      throw new functions.https.HttpsError(
        "not-found",
        `User with email ${email} not found`,
      );
    }

    if (error.code === "auth/invalid-email") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Invalid email format: ${email}`,
      );
    }

    // Generic error handling
    throw new functions.https.HttpsError(
      "internal",
      `Failed to update user role: ${error.message}`,
    );
  }
});

/**
 * HTTPS Callable Cloud Function: Get All Users (Admin only)
 *
 * Returns list of all users with their roles for UI display
 *
 * @param {Object} data - Function input (empty)
 * @param {Object} context - Firebase context
 * @returns {Array} Array of user objects with uid, email, role
 */
exports.getAllUsers = functions.https.onCall(async (data, context) => {
  // 🔥 SECURITY CHECK
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User not authenticated",
    );
  }

  if (context.auth.token.admin !== true) {
    console.error(
      `❌ PERMISSION DENIED: User ${context.auth.uid} attempted to fetch all users without admin access`,
    );
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can view all users",
    );
  }

  try {
    console.log(`🔍 Admin ${context.auth.uid} fetching all users`);

    // Get all users from Firestore
    const usersSnapshot = await db.collection("users").get();
    const users = [];

    usersSnapshot.forEach((doc) => {
      const userData = doc.data();
      users.push({
        uid: doc.id,
        email: userData.email || "N/A",
        name: userData.name || "N/A",
        role: userData.role || "user",
        createdAt: userData.createdAt || null,
        updatedAt: userData.updatedAt || null,
      });
    });

    console.log(`✅ Retrieved ${users.length} users`);
    return {
      success: true,
      count: users.length,
      users: users,
    };
  } catch (error) {
    console.error("❌ Error fetching users:", error.message || error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to fetch users: ${error.message}`,
    );
  }
});

/**
 * HTTPS Callable Cloud Function: Revoke Admin Role from User
 *
 * Convenience function to quickly demote an admin to regular user
 *
 * @param {Object} data - Function input
 * @param {string} data.uid - UID of user to demote
 * @param {Object} context - Firebase context
 * @returns {Object} Success response
 */
exports.revokeAdminRole = functions.https.onCall(async (data, context) => {
  // 🔥 SECURITY CHECK
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User not authenticated",
    );
  }

  if (context.auth.token.admin !== true) {
    console.error(
      `❌ PERMISSION DENIED: User ${context.auth.uid} attempted to revoke admin role without admin access`,
    );
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can revoke roles",
    );
  }

  const { uid } = data;

  if (!uid || typeof uid !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "UID is required and must be a string",
    );
  }

  try {
    console.log(`📝 Admin ${context.auth.uid} revoking admin role from ${uid}`);

    // Revoke custom claims
    await auth.setCustomUserClaims(uid, { admin: false });

    // Update Firestore
    await db.collection("users").doc(uid).update({
      role: "user",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: context.auth.uid,
    });

    console.log(`✅ Admin role revoked for ${uid}`);

    return {
      success: true,
      message: `Admin role revoked for user ${uid}`,
      uid: uid,
      role: "user",
    };
  } catch (error) {
    console.error(`❌ Error revoking admin role from ${uid}:`, error.message);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to revoke admin role: ${error.message}`,
    );
  }
});

/**
 * 🔥 SECURITY FIX: Approve Transaction (Server-Side Admin Validation)
 *
 * ⚠️ CRITICAL:
 * - This MUST run on Cloud Functions (backend) to prevent user bypass
 * - Original code: frontend runTransaction() was exploitable
 * - New code: Server verifies admin claim before approval
 *
 * @param {Object} data - Function input
 * @param {string} data.txId - Transaction ID
 * @param {string} data.type - "deposit" or "payment"
 * @param {number} data.amount - Amount in VND
 * @param {Object} context - Firebase context (auth, uid)
 * @returns {Object} Success response
 */
exports.approveTransaction = functions.https.onCall(async (data, context) => {
  // 🔥 1. SECURITY CHECK: Verify caller is admin
  if (!context.auth) {
    console.error("❌ UNAUTHORIZED: No auth context");
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User not authenticated",
    );
  }

  if (context.auth.token.admin !== true) {
    console.error(
      `❌ PERMISSION DENIED: User ${context.auth.uid} attempted to approve transaction without admin access`,
    );
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can approve transactions",
    );
  }

  // 🔥 2. VALIDATE INPUT
  const { txId, type } = data;
  // ⚠️ SECURITY: DO NOT trust amount from client
  // Amount will be read from database

  if (!txId || typeof txId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "txId is required and must be a string",
    );
  }

  if (!["deposit", "payment"].includes(type)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      'type must be either "deposit" or "payment"',
    );
  }

  console.log(`📝 Admin ${context.auth.uid} is approving transaction ${txId}`);

  try {
    // 🔥 3. ATOMIC TRANSACTION
    let result = null;
    await db.runTransaction(async (transaction) => {
      const txRef = db.collection("transactions").doc(txId);
      const txSnap = await transaction.get(txRef);

      if (!txSnap.exists()) {
        throw new Error("Transaction not found");
      }

      const txData = txSnap.data();
      const amount = txData.amount; // ⚠️ READ FROM DB, NOT CLIENT

      // Validate amount from database
      if (typeof amount !== "number" || amount <= 0) {
        throw new Error("Invalid transaction amount in database");
      }

      // Double-click prevention
      if (txData.status !== "pending") {
        throw new Error(`Transaction is ${txData.status}, not pending`);
      }

      // Get user document
      const userRef = db.collection("users").doc(txData.userId);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists()) {
        throw new Error("User not found");
      }

      const userData = userSnap.data();
      const currentBalance = Number(userData.balance || 0);

      if (type === "deposit") {
        // Update balance
        transaction.update(userRef, {
          balance: currentBalance + amount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update transaction
        transaction.update(txRef, {
          status: "success",
          approvedBy: context.auth.uid,
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Create notification
        const notifRef = db.collection("notifications").doc();
        transaction.set(notifRef, {
          userId: txData.userId,
          type: "transaction",
          message: `Deposit of ${amount.toLocaleString("vi-VN")} VND has been approved`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
        });

        result = {
          success: true,
          message: "Deposit approved",
          newBalance: currentBalance + amount,
        };
      } else if (type === "payment") {
        // Check sufficient balance
        if (currentBalance < amount) {
          throw new Error("Insufficient balance for payment");
        }

        // Update balance
        transaction.update(userRef, {
          balance: currentBalance - amount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update order if exists
        if (txData.orderId) {
          const orderRef = db.collection("orders").doc(txData.orderId);
          const orderSnap = await transaction.get(orderRef);
          if (orderSnap.exists()) {
            transaction.update(orderRef, {
              status: "confirmed",
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        // Update transaction
        transaction.update(txRef, {
          status: "success",
          approvedBy: context.auth.uid,
          approvedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Create notification
        const notifRef = db.collection("notifications").doc();
        transaction.set(notifRef, {
          userId: txData.userId,
          type: "transaction",
          message: `Payment of ${amount.toLocaleString("vi-VN")} VND has been approved`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
        });

        result = {
          success: true,
          message: "Payment approved",
          newBalance: currentBalance - amount,
        };
      }
    });

    console.log(`✅ Transaction ${txId} approved successfully`);
    return result;
  } catch (error) {
    console.error(
      `❌ Error approving transaction ${txId}:`,
      error.message || error,
    );
    throw new functions.https.HttpsError(
      "internal",
      `Failed to approve transaction: ${error.message}`,
    );
  }
});

/**
 * 🔥 SECURITY FIX: Reject Transaction (Server-Side Admin Validation)
 *
 * @param {Object} data - Function input
 * @param {string} data.txId - Transaction ID to reject
 * @param {Object} context - Firebase context
 * @returns {Object} Success response
 */
exports.rejectTransaction = functions.https.onCall(async (data, context) => {
  // 🔥 1. SECURITY CHECK
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User not authenticated",
    );
  }

  if (context.auth.token.admin !== true) {
    console.error(
      `❌ PERMISSION DENIED: User ${context.auth.uid} attempted to reject transaction without admin access`,
    );
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can reject transactions",
    );
  }

  const { txId } = data;

  if (!txId || typeof txId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "txId is required and must be a string",
    );
  }

  console.log(`📝 Admin ${context.auth.uid} is rejecting transaction ${txId}`);

  try {
    await db.runTransaction(async (transaction) => {
      const txRef = db.collection("transactions").doc(txId);
      const txSnap = await transaction.get(txRef);

      if (!txSnap.exists()) {
        throw new Error("Transaction not found");
      }

      const txData = txSnap.data();

      // Check if still pending
      if (txData.status !== "pending") {
        throw new Error(`Transaction is ${txData.status}, not pending`);
      }

      // Update transaction status
      transaction.update(txRef, {
        status: "rejected",
        rejectedBy: context.auth.uid,
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Create notification
      const notifRef = db.collection("notifications").doc();
      transaction.set(notifRef, {
        userId: txData.userId,
        type: "transaction",
        message: "Your transaction has been rejected",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });
    });

    console.log(`✅ Transaction ${txId} rejected successfully`);
    return {
      success: true,
      message: "Transaction rejected",
      txId: txId,
    };
  } catch (error) {
    console.error(
      `❌ Error rejecting transaction ${txId}:`,
      error.message || error,
    );
    throw new functions.https.HttpsError(
      "internal",
      `Failed to reject transaction: ${error.message}`,
    );
  }
});
