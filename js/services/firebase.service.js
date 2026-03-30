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
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyBlOUebYGGUMMOblOi3plg0tPK0qG831gw",
  authDomain: "coffee-c5cec.firebaseapp.com",
  projectId: "coffee-c5cec",
  storageBucket: "coffee-c5cec.firebasestorage.app",
  messagingSenderId: "1009919056362",
  appId: "1:1009919056362:web:2e8eabc12192b4b2c8fa93",
  measurementId: "G-DE83KMT60V",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-southeast1"); // Set region matching your Firebase project
export { httpsCallable }; // ✅ Export for Cloud Function calls
const provider = new GoogleAuthProvider();

// 1. Login với Google
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Kiểm tra/Tạo user trong Firestore
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // Use {merge: true} to ensure existing fields (like role set by admin) are preserved
      // This prevents accidentally overwriting admin-assigned fields
      await setDoc(
        userRef,
        {
          uid: user.uid,
          name: user.displayName,
          email: user.email,
          balance: 0,
          role: "user",
          createdAt: new Date(),
        },
        { merge: true },
      );
    } else {
      // Document exists - ensure essential fields are present (safe update only needed fields)
      const existingData = userSnap.data();

      // Only update name/email if they've changed in Google account
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
    }
    return user;
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
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

// 3. Admin: Update order status (pending → completed/cancelled)
export const updateOrderStatus = async (orderId, newStatus) => {
  // Validate status transition
  const validStatuses = ["pending", "completed", "cancelled"];
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

/**
 * Safely ensure user document exists with critical fields
 * Use this instead of setDoc to avoid overwriting existing fields
 * @param {string} userId - User ID
 * @param {object} initialData - Initial data (only used if document doesn't exist)
 */
export const ensureUserDocument = async (userId, initialData = {}) => {
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // Create new document with default fields + any initial data
      await setDoc(
        userRef,
        {
          uid: userId,
          balance: 0,
          role: "user",
          createdAt: new Date(),
          ...initialData, // Safe: spreads initialData on top (can override defaults)
        },
        { merge: true },
      );
    }

    return { success: true, created: !userSnap.exists() };
  } catch (error) {
    console.error("Ensure user document failed:", error);
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
