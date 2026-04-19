import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { calculateMemberRank } from "./firebase.service.js";

// Helper function to retry Firestore operations on network errors.
async function retryFirestoreOperation(
  operation,
  maxRetries = 3,
  delay = 1000,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const isNetworkError =
        error.code === "unavailable" ||
        error.code === "deadline-exceeded" ||
        String(error.message || "").includes("QUIC_PROTOCOL_ERROR") ||
        String(error.message || "").includes("NETWORK_ERROR");

      if (!isNetworkError || attempt >= maxRetries) {
        throw error;
      }

      console.warn(
        `Firestore operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`,
        error.message,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  throw new Error("Retry limit exceeded");
}

function normalizeDepositOptions(paymentMethodOrOptions) {
  if (
    paymentMethodOrOptions &&
    typeof paymentMethodOrOptions === "object" &&
    !Array.isArray(paymentMethodOrOptions)
  ) {
    return {
      paymentMethod: paymentMethodOrOptions.paymentMethod || "bank",
      txnId: paymentMethodOrOptions.txnId || "",
      transactionCode: paymentMethodOrOptions.transactionCode || "",
      transferContent: paymentMethodOrOptions.transferContent || "",
      expiresAt: paymentMethodOrOptions.expiresAt || null,
    };
  }

  return {
    paymentMethod: paymentMethodOrOptions || "bank",
    txnId: "",
    transactionCode: "",
    transferContent: "",
    expiresAt: null,
  };
}

function buildSystemTxnId() {
  const now = Date.now();
  return `NAP_${now}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function isValidTransactionCode(code) {
  return typeof code === "string" && /^[A-Z0-9]{8,20}$/.test(code);
}

// Tạo deposit request theo kiểu cộng dồn field mới, không đổi tên field cũ.
export async function depositTransaction(
  db,
  userId,
  amount,
  paymentMethodOrOptions = "bank",
) {
  if (!userId) return { success: false, error: "User ID is required" };

  amount = Number(amount);

  if (!amount || amount <= 0) {
    return { success: false, error: "Amount must be greater than 0" };
  }

  if (amount < 1000) {
    return { success: false, error: "Minimum deposit amount is 1,000đ" };
  }

  const {
    paymentMethod,
    txnId: providedTxnId,
    transactionCode,
    transferContent,
    expiresAt,
  } = normalizeDepositOptions(paymentMethodOrOptions);

  if (!isValidTransactionCode(transactionCode)) {
    return {
      success: false,
      error: "Mã giao dịch không hợp lệ. Mã phải gồm 8-20 ký tự hoa và số.",
    };
  }

  const pendingRequestQuery = query(
    collection(db, "deposit_requests"),
    where("userId", "==", userId),
    where("status", "==", "pending"),
  );
  const pendingRequestSnap = await getDocs(pendingRequestQuery);
  if (!pendingRequestSnap.empty) {
    return {
      success: false,
      error:
        "Bạn đã có một yêu cầu nạp tiền đang chờ xử lý. Vui lòng đợi admin xác nhận trước khi gửi yêu cầu mới.",
    };
  }

  const txnId = providedTxnId || buildSystemTxnId();

  try {
    const existingTxnQuery = query(
      collection(db, "deposit_requests"),
      where("transactionCode", "==", transactionCode),
    );
    const existingTxnSnap = await getDocs(existingTxnQuery);
    const status = existingTxnSnap.empty ? "pending" : "suspicious";

    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return { success: false, error: "User does not exist" };
    }

    const depositPayload = {
      userId,
      amount,
      status,
      paymentMethod,
      txnId,
      transactionCode,
      transferContent,
      hasUserConfirmed: false,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (expiresAt) {
      depositPayload.expiresAt = expiresAt;
    }

    const depositRequestRef = await addDoc(
      collection(db, "deposit_requests"),
      depositPayload,
    );

    return {
      success: true,
      pending: status === "pending",
      suspicious: status === "suspicious",
      depositId: depositRequestRef.id,
      txnId,
      transactionCode,
      transferContent,
      status,
      message:
        status === "suspicious"
          ? "Mã giao dịch trùng. Yêu cầu đã được ghi nhận và đánh dấu suspicious."
          : "Yêu cầu đã được ghi nhận. Đang chờ đối soát.",
    };
  } catch (error) {
    console.warn("Deposit transaction failed:", error);
    return { success: false, error: error.message || "Deposit failed" };
  }
}

// 2. Checkout transaction - secure wallet flow via orders + transactions.
export async function checkoutTransaction(
  db,
  userId,
  orderData,
  clientRequestId,
) {
  if (!userId) return { success: false, error: "User ID is required" };
  if (!orderData || !orderData.items || orderData.items.length === 0) {
    return { success: false, error: "Cart is empty" };
  }
  if (!orderData.total || orderData.total <= 0) {
    return { success: false, error: "Invalid order total" };
  }
  if (!clientRequestId) {
    return { success: false, error: "Client request ID is required" };
  }

  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await retryFirestoreOperation(() => getDoc(userRef));

    if (!userSnap.exists()) {
      return { success: false, error: "User does not exist" };
    }

    const userData = userSnap.data();
    const currentBalance = Number(userData.balance || 0);
    const currentTotalSpent = Number(userData.totalSpent || 0);
    const totalAmount = Number(orderData.total || 0);

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
    let createdOrderId = null;
    let createdTxId = null;

    await retryFirestoreOperation(() =>
      runTransaction(db, async (tx) => {
        const productRefs = orderData.items.map((item) =>
          doc(db, "products", item.id),
        );

        for (let index = 0; index < orderData.items.length; index += 1) {
          const item = orderData.items[index];
          const productRef = productRefs[index];
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
          total: finalTotal,
          status: "pending",
          clientRequestId,
          createdAt: serverTimestamp(),
        });

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

        tx.update(userRef, {
          balance: currentBalance - finalTotal,
          totalSpent: currentTotalSpent + finalTotal,
          updatedAt: serverTimestamp(),
        });
      }),
    );

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

// 3. Review submission with atomic average rating calculation.
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

    await runTransaction(db, async (tx) => {
      const productRef = doc(db, "products", productId);
      const productSnap = await tx.get(productRef);

      if (!productSnap.exists()) {
        throw new Error("Product not found!");
      }

      const productData = productSnap.data();
      const currentTotalStars = Number(productData.totalStars || 0);
      const currentReviewCount = Number(productData.reviewCount || 0);
      const newTotalStars = currentTotalStars + rating;
      const newReviewCount = currentReviewCount + 1;
      const newAvgRating = newTotalStars / newReviewCount;

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

      tx.update(productRef, {
        totalStars: newTotalStars,
        reviewCount: newReviewCount,
        avgRating: newAvgRating,
        updatedAt: serverTimestamp(),
      });
    });

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
