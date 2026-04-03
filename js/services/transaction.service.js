// Helper function to retry Firestore operations on network errors
async function retryFirestoreOperation(
  operation,
  maxRetries = 3,
  delay = 1000,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isNetworkError =
        error.code === "unavailable" ||
        error.code === "deadline-exceeded" ||
        error.message.includes("QUIC_PROTOCOL_ERROR") ||
        error.message.includes("NETWORK_ERROR");

      if (isNetworkError && attempt < maxRetries) {
        console.warn(
          `Firestore operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`,
          error.message,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
}

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
    const userSnap = await retryFirestoreOperation(() => getDoc(userRef));

    if (!userSnap.exists()) {
      return { success: false, error: "User does not exist" };
    }

    const userData = userSnap.data();
    const currentBalance = Number(userData.balance || 0);
    const currentTotalSpent = Number(userData.totalSpent || 0);
    let totalAmount = Number(orderData.total || 0);

    // Calculate member discount
    const memberInfo = calculateMemberRank(currentTotalSpent);
    const discountPercent = memberInfo.discount;
    const discountAmount = Math.round(totalAmount * (discountPercent / 100));
    const finalTotal = totalAmount - discountAmount;

    if (currentBalance < finalTotal) {
      return {
        success: false,
        error: "Insufficient balance",
        required: finalTotal - currentBalance,
      };
    }

    const userEmail = userData.email || "Unknown";

    // Atomic cart checkout + inventory update + totalSpent update
    let createdOrderId = null;
    let createdTxId = null;

    await retryFirestoreOperation(() =>
      runTransaction(db, async (tx) => {
        const productRefs = orderData.items.map((item) =>
          doc(db, "products", item.id),
        );

        for (let i = 0; i < orderData.items.length; i++) {
          const item = orderData.items[i];
          const productRef = productRefs[i];

          const productSnap = await tx.get(productRef);
          if (!productSnap.exists()) {
            throw new Error(`Sản phẩm ${item.name} không tồn tại!`);
          }

          const currentStock = Number(productSnap.data()?.stock || 0);
          if (currentStock < item.quantity) {
            throw new Error(`Sản phẩm ${item.name} đã hết hàng!`);
          }

          const newStock = currentStock - item.quantity;
          tx.update(productRef, {
            stock: newStock,
            available: newStock > 0,
            updatedAt: serverTimestamp(),
          });
        }

        // Create order with discount info
        const orderRef = doc(collection(db, "orders"));
        createdOrderId = orderRef.id;
        tx.set(orderRef, {
          userId,
          userEmail,
          items: orderData.items,
          originalTotal: totalAmount,
          discountAmount,
          discountPercent,
          memberRank: memberInfo.title,
          total: finalTotal, // Final amount after discount
          status: "pending",
          clientRequestId,
          createdAt: serverTimestamp(),
        });

        // Create transaction record
        const txRef = doc(collection(db, "transactions"));
        createdTxId = txRef.id;
        tx.set(txRef, {
          userId,
          orderId: orderRef.id,
          type: "payment",
          originalAmount: totalAmount,
          discountAmount,
          amount: finalTotal,
          memberRank: memberInfo.title,
          status: "pending",
          createdAt: serverTimestamp(),
        });

        // Update user: deduct balance and accumulate totalSpent
        tx.update(userRef, {
          balance: currentBalance - finalTotal,
          totalSpent: currentTotalSpent + finalTotal, // Track actual spent amount
          updatedAt: serverTimestamp(),
        });
      }),
    );

    console.log(
      "📦 Inventory Updated | 💳 Member Discount Applied: " +
        discountPercent +
        "%",
    );

    // Return updated member info after successful checkout
    const newMemberInfo = calculateMemberRank(currentTotalSpent + finalTotal);

    return {
      success: true,
      pending: true,
      orderId: createdOrderId,
      txId: createdTxId,
      discount: {
        percent: discountPercent,
        amount: discountAmount,
        finalTotal,
        memberRank: memberInfo.title,
        newMemberRank: newMemberInfo.title,
        rankUpgraded: newMemberInfo.rank > memberInfo.rank,
      },
    };
  } catch (error) {
    return { success: false, error: error.message || "Checkout failed" };
  }
}

// 4. Review submission with atomic average rating calculation
export async function submitReviewTransaction(
  db,
  userId,
  productId,
  orderId,
  rating,
  comment,
) {
  if (!userId || !productId || !orderId) {
    return { success: false, error: "Missing required fields" };
  }

  rating = Number(rating);
  if (rating < 1 || rating > 5) {
    return { success: false, error: "Rating must be between 1 and 5" };
  }

  try {
    let createdReviewId = null;

    // Atomic transaction: Create review + Update product rating
    await runTransaction(db, async (tx) => {
      const productRef = doc(db, "products", productId);
      const productSnap = await tx.get(productRef);

      if (!productSnap.exists()) {
        throw new Error("Product not found!");
      }

      const productData = productSnap.data();
      const currentTotalStars = Number(productData.totalStars || 0);
      const currentReviewCount = Number(productData.reviewCount || 0);

      // Calculate new average rating
      const newTotalStars = currentTotalStars + rating;
      const newReviewCount = currentReviewCount + 1;
      const newAvgRating = newTotalStars / newReviewCount;

      // Create review document
      const reviewRef = doc(collection(db, "reviews"));
      createdReviewId = reviewRef.id;
      tx.set(reviewRef, {
        userId,
        productId,
        orderId,
        rating,
        comment: comment || "",
        createdAt: serverTimestamp(),
        adminReply: null,
        adminReplyAt: null,
      });

      // Update product with new rating
      tx.update(productRef, {
        totalStars: newTotalStars,
        reviewCount: newReviewCount,
        avgRating: newAvgRating,
        updatedAt: serverTimestamp(),
      });
    });

    console.log("⭐ Review Submitted & Rating Updated");
    return {
      success: true,
      reviewId: createdReviewId,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || "Review submission failed",
    };
  }
}
