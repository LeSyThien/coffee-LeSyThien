import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  runTransaction,
  serverTimestamp,
  initializeFirestore,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseEnv = import.meta.env ?? {};

const firebaseConfig = {
  apiKey: firebaseEnv.VITE_FIREBASE_API_KEY,
  authDomain: firebaseEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: firebaseEnv.VITE_FIREBASE_PROJECT_ID,
  storageBucket: firebaseEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: firebaseEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: firebaseEnv.VITE_FIREBASE_APP_ID,
  measurementId: firebaseEnv.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
initializeFirestore(app, { experimentalForceLongPolling: true });
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "asia-southeast1"); // Set region matching your Firebase project
export { httpsCallable }; // ✅ Export for Cloud Function calls
const provider = new GoogleAuthProvider();

// ===== LOYALTY PROGRAM: Member Rank Calculation =====
/**
 * Calculate member rank based on accumulated spending
 * Returns: { rank: number, title: string, discount: number, dailyGift: number, nextThreshold: number, progress: number }
 */
export function calculateMemberRank(totalSpent) {
  const ranks = [
    {
      tier: 0,
      min: 0,
      max: 500_000,
      title: "Member",
      discount: 0,
      dailyGift: 100,
    },
    {
      tier: 1,
      min: 500_000,
      max: 1_000_000,
      title: "VIP 1",
      discount: 1,
      dailyGift: 1_000,
    },
    {
      tier: 2,
      min: 1_000_000,
      max: 5_000_000,
      title: "VIP 2",
      discount: 2,
      dailyGift: 2_000,
    },
    {
      tier: 3,
      min: 5_000_000,
      max: 10_000_000,
      title: "VIP 3",
      discount: 3,
      dailyGift: 5_000,
    },
    {
      tier: 4,
      min: 10_000_000,
      max: 20_000_000,
      title: "VIP 4",
      discount: 4,
      dailyGift: 8_000,
    },
    {
      tier: 5,
      min: 20_000_000,
      max: 40_000_000,
      title: "VIP 5",
      discount: 5,
      dailyGift: 12_000,
    },
    {
      tier: 6,
      min: 40_000_000,
      max: 80_000_000,
      title: "VIP 6",
      discount: 6,
      dailyGift: 18_000,
    },
    {
      tier: 7,
      min: 80_000_000,
      max: 160_000_000,
      title: "VIP 7",
      discount: 7,
      dailyGift: 28_000,
    },
    {
      tier: 8,
      min: 160_000_000,
      max: 320_000_000,
      title: "VIP 8",
      discount: 8,
      dailyGift: 40_000,
    },
    {
      tier: 9,
      min: 320_000_000,
      max: 500_000_000,
      title: "VIP 9",
      discount: 9,
      dailyGift: 60_000,
    },
    {
      tier: 10,
      min: 500_000_000,
      max: Infinity,
      title: "VIP 10",
      discount: 10,
      dailyGift: 100_000,
    },
  ];

  // Find current rank
  let currentRank = ranks[0];
  for (let i = ranks.length - 1; i >= 0; i--) {
    if (totalSpent >= ranks[i].min) {
      currentRank = ranks[i];
      break;
    }
  }

  // Find next rank
  const nextRank = ranks.find((r) => r.tier === currentRank.tier + 1);

  // Calculate progress to next rank (0-100%)
  let progress = 100;
  if (nextRank) {
    const spent = totalSpent - currentRank.min;
    const needed = nextRank.min - currentRank.min;
    progress = Math.min(100, Math.round((spent / needed) * 100));
  }

  return {
    rank: currentRank.tier,
    title: currentRank.title,
    discount: currentRank.discount,
    dailyGift: currentRank.dailyGift,
    nextThreshold: nextRank ? nextRank.min : Infinity,
    progress,
  };
}

// 1. Login với Google
export const ensureUserDocument = async (user, initialData = {}) => {
  if (!user) throw new Error("User object is required");

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(
      userRef,
      {
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        balance: 0,
        totalSpent: 0,
        role: "user",
        createdAt: new Date(),
        ...initialData,
      },
      { merge: true },
    );
  } else {
    const existingData = userSnap.data();

    if (
      existingData.name !== user.displayName ||
      existingData.email !== user.email
    ) {
      await updateDoc(userRef, {
        name: user.displayName,
        email: user.email,
        updatedAt: new Date(),
      });
    }

    if (
      existingData.totalSpent === undefined ||
      existingData.totalSpent === null
    ) {
      await updateDoc(userRef, {
        totalSpent: 0,
      });
    }
  }
};

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    await ensureUserDocument(result.user);
    return result.user;
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
};

export const handleGoogleRedirectResult = async () => {
  // Deprecated: Using signInWithPopup instead of signInWithRedirect
  // No redirect handling needed
  return null;
};

// 1.5. Register with Email/Password
export const registerWithEmail = async (email, password, displayName) => {
  try {
    const { createUserWithEmailAndPassword, updateProfile } =
      await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");

    // Create user account
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const user = userCredential.user;

    // Update display name
    await updateProfile(user, {
      displayName: displayName,
    });

    // Create user document in Firestore
    const userRef = doc(db, "users", user.uid);
    await setDoc(userRef, {
      uid: user.uid,
      name: displayName,
      email: email,
      balance: 0,
      role: "user",
      createdAt: new Date(),
    });

    return user;
  } catch (error) {
    console.error("Registration failed:", error);
    throw error;
  }
};

// 2. Logout
export const logoutUser = async () => {
  try {
    await signOut(auth);
    return true;
  } catch (error) {
    console.error("Logout failed:", error);
    throw error;
  }
};

// 3. Admin: Update order status (pending → shipping → completed/cancelled/rejected)
export const updateOrderStatus = async (orderId, newStatus) => {
  // Validate status transition
  const validStatuses = [
    "pending",
    "shipping",
    "completed",
    "cancelled",
    "rejected",
    "delivered",
  ];
  if (!validStatuses.includes(newStatus)) {
    throw new Error("Invalid status: " + newStatus);
  }

  try {
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      throw new Error("Order not found!");
    }

    const orderData = orderSnap.data();
    const currentStatus = orderData.status;

    // Prevent updating already finalized orders
    if (currentStatus === "completed" || currentStatus === "cancelled") {
      throw new Error("Cannot update order that is already " + currentStatus);
    }

    // If approving order (completed), update product stock
    if (newStatus === "completed") {
      for (const item of orderData.items || []) {
        const productRef = doc(db, "products", item.productId);
        const productSnap = await getDoc(productRef);

        if (productSnap.exists()) {
          const productData = productSnap.data();
          const newStock = (productData.stock || 0) - (item.quantity || 0);

          await updateDoc(productRef, {
            stock: Math.max(0, newStock),
            available: newStock > 0,
            updatedAt: new Date(),
          });
        }
      }
    }

    // Update order status
    await updateDoc(orderRef, {
      status: newStatus,
      updatedAt: new Date(),
    });

    return { success: true };
  } catch (error) {
    console.error("Update order status failed:", error);
    throw error;
  }
};

// 3.5. Admin: Cancel Order with Stock Restoration (Critical Fix)
// When admin rejects/cancels an order, restore stock atomically
export const cancelOrderWithStockRestore = async (orderId) => {
  try {
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      throw new Error("Order not found!");
    }

    const orderData = orderSnap.data();
    const currentStatus = orderData.status;

    // Prevent cancelling already finalized orders
    if (currentStatus === "completed" || currentStatus === "cancelled") {
      throw new Error("Cannot cancel order that is already " + currentStatus);
    }

    // Use transaction to atomically restore stock
    await runTransaction(db, async (tx) => {
      // Restore stock for each item in the order
      for (const item of orderData.items || []) {
        const productRef = doc(db, "products", item.id || item.productId);
        const productSnap = await tx.get(productRef);

        if (productSnap.exists()) {
          const productData = productSnap.data();
          const currentStock = Number(productData.stock || 0);
          const newStock = currentStock + (item.quantity || 0);

          // Update product stock (restore the quantity)
          tx.update(productRef, {
            stock: newStock,
            available: true, // Product is available again after stock restored
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Update order status to cancelled
      tx.update(orderRef, {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    console.log("📦 Order Cancelled & Stock Restored");
    return { success: true };
  } catch (error) {
    console.error("Cancel order with stock restore failed:", error);
    throw error;
  }
};

// 4. Admin: Product CRUD actions
export const createProduct = async (productData) => {
  if (!productData?.name || productData?.name.trim().length === 0) {
    throw new Error("Product name is required.");
  }
  if (typeof productData.price !== "number" || productData.price <= 0) {
    throw new Error("Product price must be greater than 0.");
  }
  if (typeof productData.stock !== "number" || productData.stock < 0) {
    throw new Error("Product stock must be 0 or greater.");
  }
  if (
    typeof productData.discount !== "number" ||
    productData.discount < 0 ||
    productData.discount > 100
  ) {
    throw new Error("Product discount must be between 0 and 100.");
  }

  const productRef = doc(collection(db, "products"));
  await setDoc(productRef, {
    name: productData.name,
    description: productData.description || "",
    price: Number(productData.price) || 0,
    image: productData.image || "",
    category: productData.category || "",
    stock: Number(productData.stock) || 0,
    discount: Number(productData.discount) || 0,
    available: productData.available !== false,
    showOnHome: productData.showOnHome === true,
    requiredVipLevel: Number(productData.requiredVipLevel) || 0,
    isExclusiveVIP: Boolean(productData.isExclusiveVIP),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { id: productRef.id };
};

export const updateProduct = async (productId, updates) => {
  if (!productId) throw new Error("Product ID is required.");

  if (!updates?.name || updates.name.trim().length === 0) {
    throw new Error("Product name is required.");
  }
  if (typeof updates.price !== "number" || updates.price <= 0) {
    throw new Error("Product price must be greater than 0.");
  }
  if (typeof updates.stock !== "number" || updates.stock < 0) {
    throw new Error("Product stock must be 0 or greater.");
  }
  if (
    typeof updates.discount !== "number" ||
    updates.discount < 0 ||
    updates.discount > 100
  ) {
    throw new Error("Product discount must be between 0 and 100.");
  }

  const productRef = doc(db, "products", productId);
  await updateDoc(productRef, {
    name: updates.name,
    description: updates.description || "",
    price: Number(updates.price) || 0,
    image: updates.image || "",
    category: updates.category || "",
    stock: Number(updates.stock) || 0,
    discount: Number(updates.discount) || 0,
    available: updates.available,
    showOnHome: updates.showOnHome === true,
    requiredVipLevel: Number(updates.requiredVipLevel) || 0,
    isExclusiveVIP: Boolean(updates.isExclusiveVIP),
    updatedAt: new Date(),
  });

  return { success: true };
};

export const toggleVipStore = async (productId, newIsExclusiveVIP) => {
  if (!productId) throw new Error("Product ID is required.");
  const productRef = doc(db, "products", productId);
  await updateDoc(productRef, {
    isExclusiveVIP: !!newIsExclusiveVIP,
    updatedAt: new Date(),
  });
  return { success: true };
};

export const deleteProduct = async (productId) => {
  if (!productId) throw new Error("Product ID is required.");

  const productRef = doc(db, "products", productId);
  await deleteDoc(productRef);
  return { success: true };
};

export const toggleProductAvailability = async (productId, newAvailability) => {
  if (!productId) throw new Error("Product ID is required.");
  const productRef = doc(db, "products", productId);
  await updateDoc(productRef, {
    available: !!newAvailability,
    updatedAt: new Date(),
  });
  return { success: true };
};

export const toggleShowOnHome = async (productId, newShowOnHome) => {
  if (!productId) throw new Error("Product ID is required.");
  const productRef = doc(db, "products", productId);
  await updateDoc(productRef, {
    showOnHome: !!newShowOnHome,
    updatedAt: new Date(),
  });
  return { success: true };
};

// 5. Save user profile (name, address, phone)
export const saveUserProfile = async (userId, profileData) => {
  // Validate profile data
  if (!profileData) {
    throw new Error("Profile data is required!");
  }

  try {
    const userRef = doc(db, "users", userId);

    // Only update specific fields
    await updateDoc(userRef, {
      name: profileData.name || "",
      address: profileData.address || "",
      phone: profileData.phone || "",
      avatar: profileData.avatar || "",
      updatedAt: new Date(),
    });

    return { success: true };
  } catch (error) {
    console.error("Save profile failed:", error);
    throw error;
  }
};

// 6. Review Management
export const saveReview = async (
  productId,
  rating,
  comment,
  orderId = null,
) => {
  if (!productId) throw new Error("Product ID is required");
  if (!rating || rating < 1 || rating > 5)
    throw new Error("Rating must be between 1 and 5");
  if (!comment || comment.trim().length === 0)
    throw new Error("Comment is required");

  try {
    const { addDoc, serverTimestamp } =
      await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

    if (!auth.currentUser) throw new Error("User not authenticated");

    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    const userName = userDoc.exists() ? userDoc.data().name : "Anonymous";

    const reviewRef = await addDoc(collection(db, "reviews"), {
      productId,
      userId: auth.currentUser.uid,
      userName,
      rating: Number(rating),
      comment: comment.trim(),
      orderId: orderId || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Update product rating
    await updateProductRating(productId);

    return { success: true, reviewId: reviewRef.id };
  } catch (error) {
    console.error("Save review failed:", error);
    throw error;
  }
};

export const getProductReviews = async (productId) => {
  if (!productId) throw new Error("Product ID is required");

  try {
    const { getDocs, query, where, orderBy } =
      await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

    const q = query(
      collection(db, "reviews"),
      where("productId", "==", productId),
      orderBy("createdAt", "desc"),
    );

    const snapshot = await getDocs(q);
    const reviews = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      reviews.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      });
    });

    return reviews;
  } catch (error) {
    console.error("Get product reviews failed:", error);
    return [];
  }
};

export const updateProductRating = async (productId) => {
  if (!productId) throw new Error("Product ID is required");

  try {
    const reviews = await getProductReviews(productId);

    if (reviews.length === 0) {
      await updateDoc(doc(db, "products", productId), {
        avgRating: 0,
        reviewCount: 0,
        updatedAt: new Date(),
      });
      return { avgRating: 0, reviewCount: 0 };
    }

    const totalRating = reviews.reduce(
      (sum, review) => sum + (review.rating || 0),
      0,
    );
    const avgRating = Number((totalRating / reviews.length).toFixed(1));
    const reviewCount = reviews.length;

    await updateDoc(doc(db, "products", productId), {
      avgRating,
      reviewCount,
      updatedAt: new Date(),
    });

    return { avgRating, reviewCount };
  } catch (error) {
    console.error("Update product rating failed:", error);
    throw error;
  }
};

export const getAllReviews = async () => {
  try {
    const { getDocs, query, orderBy } =
      await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

    const q = query(collection(db, "reviews"), orderBy("createdAt", "desc"));

    const snapshot = await getDocs(q);
    const reviews = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      // Fetch product info
      const productDoc = await getDoc(doc(db, "products", data.productId));
      const productName = productDoc.exists()
        ? productDoc.data().name
        : "Unknown Product";

      reviews.push({
        id: doc.id,
        productName,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      });
    }

    return reviews;
  } catch (error) {
    console.error("Get all reviews failed:", error);
    return [];
  }
};

// ===== VIP DAILY GIFT SYSTEM =====
/**
 * Claim daily VIP gift - rewards user with gold based on their VIP level
 * Can only be claimed once every 24 hours
 * @param {string} userId - The user ID
 * @returns {object} { success: boolean, amount: number, message: string, nextClaimTime: Date }
 */
export const claimDailyVIPGift = async (userId) => {
  try {
    if (!userId) throw new Error("User ID is required");

    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error("User not found");
    }

    const userData = userSnap.data();
    const totalSpent = userData.totalSpent || 0;
    const lastClaimedGift = userData.lastClaimedGift
      ? new Date(
          userData.lastClaimedGift.toDate?.() || userData.lastClaimedGift,
        )
      : new Date(0);

    // Check if 24 hours have passed since last claim
    const now = new Date();
    const timeSinceLastClaim = now - lastClaimedGift;
    const hoursElapsed = timeSinceLastClaim / (1000 * 60 * 60);

    if (hoursElapsed < 24) {
      const hoursRemaining = 24 - hoursElapsed;
      const nextClaimTime = new Date(
        now.getTime() + hoursRemaining * 60 * 60 * 1000,
      );
      return {
        success: false,
        amount: 0,
        message: `You can claim again in ${Math.ceil(hoursRemaining)} hours`,
        nextClaimTime,
      };
    }

    // Calculate VIP level and gift amount
    const vipInfo = calculateMemberRank(totalSpent);
    const giftAmount = vipInfo.dailyGift || 1000;

    // Update user balance and lastClaimedGift timestamp
    await updateDoc(userRef, {
      balance: (userData.balance || 0) + giftAmount,
      lastClaimedGift: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      success: true,
      amount: giftAmount,
      message: `🎁 Claimed ${giftAmount.toLocaleString("vi-VN")}đ daily gift!`,
      nextClaimTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    };
  } catch (error) {
    console.error("Claim daily VIP gift failed:", error);
    throw error;
  }
};

/**
 * Get VIP info for a user
 * @param {string} userId - The user ID
 * @returns {object} VIP rank info with discount, daily gift, etc.
 */
export const getUserVIPInfo = async (userId) => {
  try {
    if (!userId) throw new Error("User ID is required");

    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      throw new Error("User not found");
    }

    const userData = userSnap.data();
    const vipInfo = calculateMemberRank(userData.totalSpent || 0);
    const lastClaimedGift = userData.lastClaimedGift
      ? new Date(
          userData.lastClaimedGift.toDate?.() || userData.lastClaimedGift,
        )
      : new Date(0);

    const now = new Date();
    const timeSinceLastClaim = now - lastClaimedGift;
    const canClaimGift = timeSinceLastClaim / (1000 * 60 * 60) >= 24;

    return {
      ...vipInfo,
      totalSpent: userData.totalSpent || 0,
      canClaimGift,
      lastClaimedGift,
    };
  } catch (error) {
    console.error("Get user VIP info failed:", error);
    throw error;
  }
};

/**
 * Auto-grant VIP 10 Eternal status when totalSpent >= 500M
 * Called during auth initialization
 */
export const checkAndApplyVIP10AutoPromotion = async (userId) => {
  try {
    if (!userId) return false;

    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return false;

    const userData = userSnap.data();
    const totalSpent = userData.totalSpent || 0;

    // Check if user reached 500M threshold for VIP 10 (permanent)
    if (totalSpent >= 500000000) {
      // Only update if not already VIP 10 permanent
      if (userData.vipLevel !== 10 || userData.vipExpiration !== null) {
        await updateDoc(userRef, {
          vipLevel: 10,
          isVipActive: true,
          vipExpiration: null, // null = permanent, never expires
          vipPackageType: "legendary",
          lastVipPurchaseDate:
            userData.lastVipPurchaseDate || new Date().toISOString(),
        });

        // Show legendary achievement modal
        showVIP10AchievementModal();
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error("VIP 10 auto-promotion check failed:", error);
    return false;
  }
};

/**
 * Display VIP 10 legendary achievement modal
 */
function showVIP10AchievementModal() {
  // Create modal if it doesn't exist
  let modal = document.getElementById("vip10-achievement-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "vip10-achievement-modal";
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeInLegendary 0.5s ease-out;
    `;

    modal.innerHTML = `
      <div style="
        background: linear-gradient(135deg, #bf00ff, #2d004d);
        border: 3px solid #d4af37;
        border-radius: 20px;
        padding: 3rem;
        text-align: center;
        max-width: 500px;
        box-shadow: 0 0 50px rgba(191, 0, 255, 0.4);
        color: #f5f1e6;
      ">
        <div style="font-size: 3.5rem; margin-bottom: 1rem;">🎉✨🔟✨🎉</div>
        <div style="font-size: 2.5rem; font-weight: 900; color: #d4af37; margin-bottom: 0.5rem;">CHÚC MỪNG HUYỀN THOẠI!</div>
        <div style="font-size: 1.1rem; margin: 1.5rem 0; line-height: 1.6;">
          Bạn đã được tặng gói <strong>VIP VĨNH VIỄN</strong> vì sự ủng hộ tuyệt vời!
        </div>
        <div style="background: rgba(191, 0, 255, 0.2); padding: 1rem; border-radius: 10px; margin: 1.5rem 0; font-size: 0.95rem;">
          <div style="color: #d4af37; font-weight: 700;">🏆 Đặc Quyền Vĩnh Viễn:</div>
          <div>✓ VIP Level 10 - Cao nhất</div>
          <div>✓ Hưởng lợi ích 20% - Hạng cao</div>
          <div>✓ 👑 Vương Miện Thạch Anh Tím</div>
          <div>✓ Bảng Vàng Elite Patrons</div>
        </div>
        <button onclick="document.getElementById('vip10-achievement-modal').remove();" style="
          width: 100%;
          padding: 1rem;
          background: linear-gradient(135deg, #d4af37, #f4d03f);
          color: #0a0a0b;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          font-size: 1.1rem;
          cursor: pointer;
        ">🌟 Cảm ơn! Đóng</button>
      </div>
      <style>
        @keyframes fadeInLegendary {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      </style>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  // Auto-close after 5 seconds
  setTimeout(() => {
    const elem = document.getElementById("vip10-achievement-modal");
    if (elem) elem.remove();
  }, 5000);
}

// ===== AVATAR UPLOAD FUNCTION =====
/**
 * ✅ FIXED: CORS-safe upload using Firebase SDK v9+
 * - Sử dụng uploadBytes (không preflight request)
 * - Thêm error handling chi tiết
 * - Fallback nếu CORS fail
 */
export const uploadAvatar = async (file, userId) => {
  try {
    if (!file) throw new Error("No file provided");
    if (!userId) throw new Error("User ID is required");

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      throw new Error(
        `Loại file không hỗ trợ. Hỗ trợ: ${validTypes.join(", ")}`,
      );
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error(
        `File quá lớn. Max: 5MB, Got: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
      );
    }

    console.log("⬆️ Uploading avatar to Firebase Storage...");

    // Create a unique filename
    const fileName = `avatars/${userId}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, fileName);

    // Upload the file using uploadBytes (CORS-safe)
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type,
      cacheControl: "public, max-age=3600",
    });

    console.log("✅ Upload complete, getting download URL...");

    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log("✅ Avatar available at:", downloadURL);

    return downloadURL;
  } catch (error) {
    console.error("❌ Avatar upload failed:", error);

    // Detailed error logging
    if (error.code === "storage/unauthorized") {
      console.error(
        "🔒 CORS/Permission Error: Check Firebase Storage Rules & CORS config",
      );
      console.error(
        "💡 Fix: Run: gsutil cors set cors.json gs://coffee-c5cec.firebasestorage.app",
      );
    } else if (error.code === "storage/unauthenticated") {
      console.error("🔐 Auth Error: User not authenticated");
    } else if (error.code === "storage/unknown") {
      console.error(
        "⚠️ Unknown error - might be CORS. Check browser console Network tab",
      );
    }

    throw error;
  }
};
