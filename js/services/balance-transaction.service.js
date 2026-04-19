import {
  doc,
  collection,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { calculateMemberRank } from "./firebase.service.js";

// Utility function to update user cache in localStorage
function updateUserCache(userId, newBalance, newVipLevel) {
  try {
    const cachedUser = localStorage.getItem("cached_user");
    if (cachedUser) {
      const cacheData = JSON.parse(cachedUser);
      cacheData.balance = newBalance;
      cacheData.vipLevel = newVipLevel;
      cacheData.lastUpdated = Date.now();
      localStorage.setItem("cached_user", JSON.stringify(cacheData));
    }
  } catch (error) {
    console.warn("⚠️ Failed to update balance cache:", error);
  }
}

export async function approveDepositRequest(db, depositId, adminUid = null) {
  if (!depositId) {
    throw new Error("Deposit ID is required");
  }

  return runTransaction(db, async (transaction) => {
    const depositRef = doc(db, "deposit_requests", depositId);
    const depositSnap = await transaction.get(depositRef);

    if (!depositSnap.exists()) {
      throw new Error("Deposit request not found");
    }

    const depositData = depositSnap.data();
    const currentStatus = String(depositData.status || "pending").toLowerCase();

    if (currentStatus === "success") {
      return { success: true, alreadyProcessed: true, depositId };
    }

    if (depositData.status === "suspicious" || currentStatus === "suspicious") {
      throw new Error(
        "Suspicious transaction cannot be approved automatically",
      );
    }

    if (depositData.hasUserConfirmed !== true) {
      throw new Error("User has not confirmed transfer");
    }

    if (depositData.isDeleted === true) {
      throw new Error("Cannot approve deleted deposit request");
    }

    if (
      depositData.expiresAt &&
      typeof depositData.expiresAt.toMillis === "function" &&
      depositData.expiresAt.toMillis() < Date.now()
    ) {
      throw new Error("Deposit request expired");
    }

    if (currentStatus !== "pending") {
      throw new Error("Deposit request already processed");
    }

    const amount = Number(depositData.amount || 0);
    if (!(amount > 0)) {
      throw new Error("Invalid deposit amount");
    }

    const userId = depositData.userId;
    if (!userId) {
      throw new Error("Deposit request missing userId");
    }

    const userRef = doc(db, "users", userId);
    const userSnap = await transaction.get(userRef);

    if (!userSnap.exists()) {
      throw new Error("User not found");
    }

    const userData = userSnap.data();
    const currentBalance = Number(userData.balance || 0);
    const currentTotalSpent = Number(userData.totalSpent || 0);
    const currentVipLevel = Number(userData.vipLevel || 0);
    const newBalance = currentBalance + amount;
    const newTotalSpent = currentTotalSpent + amount;
    const upgradeInfo = calculateMemberRank(newTotalSpent);
    const newVipLevel = upgradeInfo.rank;

    const balanceLogRef = doc(collection(db, "balance_logs"));

    transaction.update(depositRef, {
      status: "success",
      approvedAt: serverTimestamp(),
      processedBy: adminUid || "system",
      updatedAt: serverTimestamp(),
    });

    transaction.update(userRef, {
      balance: newBalance,
      totalSpent: newTotalSpent,
      vipLevel: newVipLevel,
      updatedAt: serverTimestamp(),
    });

    transaction.set(balanceLogRef, {
      userId,
      depositId,
      type: "deposit_approval",
      amount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      totalSpentBefore: currentTotalSpent,
      totalSpentAfter: newTotalSpent,
      vipLevelBefore: currentVipLevel,
      vipLevelAfter: newVipLevel,
      vipRankUpgraded: newVipLevel > currentVipLevel,
      transactionCode: depositData.transactionCode || depositData.txnId || null,
      createdAt: serverTimestamp(),
      processedBy: adminUid || "system",
    });

    // Update user cache immediately for instant UI updates
    updateUserCache(userId, newBalance, newVipLevel);

    return {
      success: true,
      depositId,
      userId,
      amount,
      balanceAfter: newBalance,
      totalSpentAfter: newTotalSpent,
      vipLevelAfter: newVipLevel,
      vipRankUpgraded: newVipLevel > currentVipLevel,
    };
  });
}
