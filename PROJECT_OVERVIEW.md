# Project Overview - coffee-LeSyThien

## 1. Project Scope & Architecture

### Core folders

- `js/pages/`: page-specific controllers and view behaviors
  - `admin.js`: admin dashboard, deposit review, order management
  - `deposit.js`: user deposit flow, QR generation, confirm transfer
  - `home.js`: home page rendering, product listing
  - `main.js`: main startup logic
  - `product.js`: product detail page behaviors
  - `profile.js`: user profile, VIP badge, reward display

- `js/services/`: backend & business services
  - `firebase.service.js`: Firebase init, auth, user document upkeep, product CRUD, order status updates, member rank logic
  - `transaction.service.js`: wallet deposit requests, checkout atomic flow, review submission
  - `vip.service.js`: VIP purchase workflow and client-side VIP guardrails
  - `balance-transaction.service.js`: new atomic admin approval service
  - `role.service.js`: role management helpers
  - `toast.service.js`: notification UI helpers

- `js/core/`: shared initialization and rendering
  - `auth-init.js`: authentication restore, realtime listeners, cart sync
  - `lifecycle.js`: page lifecycle utilities
  - `render.js`: shared DOM rendering helpers

## 2. Firestore Naming Conventions & Collections

### Primary Firestore fields

- `uid`, `userId`
- `email`, `name`, `phone`, `address`, `avatar`
- `role` (`user`, `admin`)
- `balance`, `totalSpent`
- `vipLevel`, `isVipActive`, `vipExpiration`, `vipPackageType`, `lastVipPurchaseDate`, `isPermanent`
- `createdAt`, `updatedAt`

### Deposit-specific fields

- `amount`
- `status` (`pending`, `checking`, `success`, `failed`, `expired`, `suspicious`)
- `paymentMethod`
- `txnId`
- `transactionCode`
- `transferContent`
- `expiresAt`
- `hasUserConfirmed`
- `approvedAt`, `processedBy`
- `reason`

### Order / transaction fields

- `clientRequestId`
- `originalTotal`, `discountAmount`, `discountPercent`, `memberRank`, `total`
- `requiredVip`
- `items` (list)
- `orderId`, `txId`

### Audit / balance logs

- `balance_logs` collection
  - `type`, `userId`, `depositId`, `amount`
  - `balanceBefore`, `balanceAfter`
  - `totalSpentBefore`, `totalSpentAfter`
  - `vipLevelBefore`, `vipLevelAfter`
  - `vipRankUpgraded`, `transactionCode`, `processedBy`, `createdAt`

## 3. Key Functions

### Core service functions

- `calculateMemberRank(totalSpent)`
- `ensureUserDocument(user, initialData)`
- `loginWithGoogle()`, `logoutUser()`
- `updateOrderStatus(orderId, newStatus)`
- `cancelOrderWithStockRestore(orderId)`

### Transaction service functions

- `depositTransaction(db, userId, amount, paymentMethodOrOptions)`
- `checkoutTransaction(db, userId, orderData, clientRequestId)`
- `submitReviewTransaction(db, userId, productId, orderId, rating, comment)`

### VIP service functions

- `purchaseVipPackage(packageType)`
- `animateNumber(elementId, startValue, endValue, duration)`

### Admin flow functions

- `approveDepositRequest(db, depositId, adminUid)`
- `approveDepositHandler({ depositId })`
- `rejectDepositHandler({ depositId, reason })`

### Page-level functions

- `createDepositRequest()`
- `markAsTransferred()`
- `resumeActiveRequest()`
- `renderStatusState(requestData)`
- `initializeAuth()`
- `renderNavbar(state)`

## 4. Data Model Summary

### `users` collection

- `uid`, `name`, `email`, `role`
- `balance`, `totalSpent`
- `vipLevel`, `isVipActive`, `vipExpiration`
- `vipPackageType`, `lastVipPurchaseDate`, `isPermanent`
- `createdAt`, `updatedAt`

### `products` collection

- `name`, `description`, `price`, `image`
- `category`, `stock`, `discount`
- `available`, `showOnHome`, `requiredVipLevel`
- `isExclusiveVIP`, `updatedAt`

### `deposit_requests` collection

- `userId`, `amount`, `status`
- `paymentMethod`, `txnId`, `transactionCode`, `transferContent`
- `hasUserConfirmed`, `expiresAt`
- `createdAt`, `updatedAt`, `approvedAt`, `processedBy`

## 5. Deposit Flow (current behavior)

### Stage 1: Create deposit request

1. User selects amount and generates QR.
2. Frontend creates `txnId` and `transactionCode`.
3. A new `deposit_requests` document is written with:
   - `status: "pending"`
   - `hasUserConfirmed: false`
   - `createdAt == request.time`
   - `transactionCode` validated and canonicalized
4. UI begins real-time listening for approval updates.

### Stage 2: User confirms transfer

1. User taps "Tôi đã chuyển".
2. Only `hasUserConfirmed` and `updatedAt` are updated by the client.
3. User cannot mutate `status` directly.
4. UI transitions to waiting/review state.

### Stage 3: Admin review + approval

1. Admin reviews pending transfer requests.
2. Admin approves via atomic transaction.
3. System updates:
   - `deposit_requests.status` → `success`
   - `users.balance` += amount
   - `users.totalSpent` += amount
   - `users.vipLevel` recalculated if needed
   - `balance_logs` persisted

## 6. VIP Status Computation

### Loyalty tiers by `totalSpent`

- `>= 500,000,000` → VIP 10
- `>= 320,000,000` → VIP 9
- `>= 160,000,000` → VIP 8
- `>= 80,000,000` → VIP 7
- `>= 40,000,000` → VIP 6
- `>= 20,000,000` → VIP 5
- `>= 10,000,000` → VIP 4
- `>= 5,000,000` → VIP 3
- `>= 1,000,000` → VIP 2
- `>= 500,000` → VIP 1
- otherwise `Member`

### Active VIP requirements

- `isVipActive == true`
- `vipExpiration` is in the future or equals `9999-12-31T23:59:59Z`
- `isPermanent` is preserved once set true

## 7. Security Hardening Notes

- The current rules are already strong, but `deposit_requests` required tightening.
- User updates must not mutate `status`.
- `transactionCode` is now validated with length and pattern checks.
- `createdAt == request.time` reduces forged document creation.
- `hasUserConfirmed` is the safe client-side signal for admin review.
- Admin approval is centralized in an atomic `approveDepositRequest()` transaction.

## 8. Recommended Next Review Areas

1. Remove legacy `evidenceImage` logic from the deposit flow.
2. Harden `deposit_requests` admin transitions for `checking`, `failed`, `expired`.
3. Add `balance_logs` read filters and retention policy.
4. Validate `txnId` / `transactionCode` consistently across UI and rules.

---

## 9. Essential Collections for the next expert

- `users`
- `products`
- `orders`
- `transactions`
- `deposit_requests`
- `carts`
- `notifications`
- `balance_logs`

---

## 10. Summary for handoff

This project is organized around a secure deposit workflow and a rewards-based VIP system.
The key architectural change is separating user-side confirmation (`hasUserConfirmed`) from admin-controlled status transitions.
All critical financial state changes are now atomic and logged with `balance_logs`.
