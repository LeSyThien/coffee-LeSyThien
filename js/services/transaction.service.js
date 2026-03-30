import {
  doc,
  collection,
  serverTimestamp,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  getDoc,
  increment,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Calculate bonus rate based on deposit amount
function getBonusRate(amount) {
  if (amount >= 50_000_000) return 0.035; // 3.5%
  if (amount >= 10_000_000) return 0.015; // 1.5%
  if (amount >= 1_000_000) return 0.005; // 0.5%
  return 0; // No bonus for amounts < 1M
}

// 1. Deposit transaction (client-simulated, secure intent via deposit_requests collection)
export async function depositTransaction(
  db,
  userId,
  amount,
  paymentMethod = "bank",
) {
  if (!userId) return { success: false, error: "User ID is required" };

  // ✅ SECURITY FIX: Ensure amount is a number, not a string
  amount = Number(amount);

  if (!amount || amount <= 0)
    return { success: false, error: "Amount must be greater than 0" };
  if (amount < 1000)
    return { success: false, error: "Minimum deposit amount is 1,000đ" };

  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists())
      return { success: false, error: "User does not exist" };

    // Create deposit request in deposit_requests collection
    const depositRequestRef = await addDoc(collection(db, "deposit_requests"), {
      userId,
      amount, // Ensure this is a number
      status: "pending",
      paymentMethod,
      createdAt: serverTimestamp(),
    });

    return {
      success: true,
      pending: true,
      depositId: depositRequestRef.id,
      message: `Deposit request created. Waiting for admin approval.`,
    };
  } catch (error) {
    console.warn("Deposit transaction failed:", error);
    return { success: false, error: error.message || "Deposit failed" };
  }
}

// 2. Checkout transaction - secure wallet flow via orders + transactions (client simulation)
// clientRequestId: unique ID for this request (prevents duplicate orders on retry)
export async function checkoutTransaction(
  db,
  userId,
  orderData,
  clientRequestId,
) {
  if (!userId) return { success: false, error: "User ID is required" };
  if (!orderData || !orderData.items || orderData.items.length === 0)
    return { success: false, error: "Cart is empty" };
  if (!orderData.total || orderData.total <= 0)
    return { success: false, error: "Invalid order total" };
  if (!clientRequestId)
    return { success: false, error: "Client request ID is required" };

  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return { success: false, error: "User does not exist" };
    }

    const currentBalance = Number(userSnap.data().balance || 0);
    const totalAmount = Number(orderData.total || 0);

    if (currentBalance < totalAmount) {
      return {
        success: false,
        error: "Insufficient balance",
        required: totalAmount - currentBalance,
      };
    }

    const userEmail = userSnap.data().email || "Unknown";

    const orderRef = await addDoc(collection(db, "orders"), {
      userId,
      userEmail,
      items: orderData.items,
      total: totalAmount,
      status: "pending",
      clientRequestId,
      createdAt: serverTimestamp(),
    });

    const txRef = await addDoc(collection(db, "transactions"), {
      userId,
      orderId: orderRef.id,
      type: "payment",
      amount: totalAmount,
      status: "pending",
      createdAt: serverTimestamp(),
    });

    return {
      success: true,
      pending: true,
      orderId: orderRef.id,
      txId: txRef.id,
    };
  } catch (error) {
    console.warn("Checkout transaction failed:", error);
    return { success: false, error: error.message || "Checkout failed" };
  }
}
