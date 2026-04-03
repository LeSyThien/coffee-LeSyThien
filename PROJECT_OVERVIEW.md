# ☕ Coffee E-Commerce Platform - Developer Reference

**Project**: Premium Coffee E-Commerce Web Application
**Built On**: Firebase (Authentication, Firestore, Cloud Functions)
**Frontend**: Vanilla JavaScript + HTML/CSS
**State Management**: Custom Redux-like store pattern
**Last Updated**: April 1, 2026

---

## 🔧 Phase 4 Refactoring (Component-Based Architecture)

**Status**: ✅ **FINAL SYSTEM REPAIR COMPLETE - ZERO EXCUSES**

**Critical Fixes Applied** (Final Repair Patch):

1. ✅ Added missing `premium-style.css` link to ALL pages (products, orders, profile, deposit, product)
2. ✅ Fixed **renderNavbar is not defined** error in product.js line 154 - removed duplicate renderNavbar() call
3. ✅ Fixed **renderCart is not defined** error in profile.html line 1319 - removed manual render calls (initNavbar() + initCart() handles this)
4. ✅ Removed **logout button from avatar dropdown** - only accessible on profile.html now (prevents accidental logout)
5. ✅ Removed **all verbose console.log spam** - "Store updated - re-rendering navbar" eliminated
6. ✅ Verified **cart button event binding** re-runs on each render (no "dead" button clicks)
7. ✅ Verified **body padding-top: 80px** in base.css prevents navbar overlap on all pages
8. ✅ Ensured **all event listeners properly re-bind** after innerHTML in renderNavbar()

**Previous Implementation**:

- Extracted Navbar & Cart as reusable components with `initNavbar()` and `initCart()` exports
- Navbar Updated: 5+ navigation links (Home, Menu, Orders, Our Story, Contact)
- ID Preservation: `#navbar-root`, `#nav-search`, `#balance-display`, `#avatar-btn`, `#cart-root`, `#cart-items-container`, `#cart-total`
- CSS Externalization: All non-component styles moved to `css/premium-style.css`
- Layout Fix: 1400px max-width container eliminates horizontal scroll on 1920px displays

---

## 📦 Store State Structure

```javascript
{
  user: { data, loading, error },          // Firebase auth + Firestore user doc
  products: { list, loading, error },      // All available products
  cart: { items, total },                  // Client-side cart (localStorage persisted)
  orders: { list, loading, error },        // User's orders from Firestore
  ui: {
    isAuthReady,                           // Auth restored from session
    cartOpen,                              // Cart sidebar visibility
    searchQuery,                           // Search input value
    loadingGlobal,                         // Global loading state
    toast                                  // Toast notification state
  }
}
```

---

## 🗂️ Component Structure

### Navbar Component (`js/components/navbar.js`)

**Export**: `initNavbar()`

**Critical IDs**:

- `#navbar-root` - Render target
- `#nav-search` - Search input
- `#balance-display` - User balance display (with pulse animation class)
- `#avatar-btn` - Avatar container/profile trigger
- `#logout-btn` - Logout button (inside dropdown)
- `#profile-dropdown` - Profile menu container

**Features**:

- Real-time store subscription for balance/cart updates
- Search autocomplete with product filtering
- Profile dropdown with admin dashboard link
- Logout with 3s hold (NOT implemented - button just calls logoutUser immediately)

### Cart Component (`js/components/cart.js`)

**Export**: `initCart()`

**Critical IDs**:

- `#cart-root` - Render target
- `#cart-items-container` - Items list
- `#cart-total` - Total amount display

**Features**:

- Slide-in animation from right (CSS class `.open`)
- Real-time balance validation for checkout
- Checkout transaction handling
- Cart persistence via localStorage

### HTML Entry Point (`pages/index.html`)

```html
<div id="navbar-root"></div>
<!-- Navbar renders here -->
<div id="cart-root"></div>
<!-- Cart renders here -->
```

---

## 🔐 Core IDs for Integration

| ID                      | Usage                                        | File                     |
| ----------------------- | -------------------------------------------- | ------------------------ |
| `#navbar-root`          | Navbar container                             | navbar.js                |
| `#nav-search`           | Search input                                 | navbar.js                |
| `#balance-display`      | Balance with `.balance-pop` animation        | navbar.js                |
| `#avatar-btn`           | Profile avatar button                        | navbar.js                |
| `#logout-btn`           | Logout button with 3s hold (inside dropdown) | navbar.js                |
| `#profile-dropdown`     | Profile menu                                 | navbar.js                |
| `#cart-root`            | Cart sidebar container                       | cart.js                  |
| `#cart-items-container` | Cart items list                              | cart.js                  |
| `#cart-total`           | Total price display                          | cart.js                  |
| `#banner-carousel`      | Hero section                                 | index.html + carousel.js |
| `#products`             | Products grid                                | products.js              |
| `#cart-btn`             | Cart toggle button                           | navbar.js                |

---

## 📊 Firestore Collections

### Users (`/users/{userId}`)

| Field       | Type      | Access            |
| ----------- | --------- | ----------------- |
| `uid`       | string    | Own only          |
| `email`     | string    | Own only          |
| `name`      | string    | Own only          |
| `balance`   | number    | Admin can update  |
| `role`      | string    | "user" or "admin" |
| `avatar`    | URL       | Own only          |
| `createdAt` | Timestamp | Immutable         |

### Products (`/products/{productId}`)

| Field        | Type    | Notes              |
| ------------ | ------- | ------------------ |
| `name`       | string  | Required           |
| `price`      | number  | Required           |
| `discount`   | number  | Percentage (0-100) |
| `stock`      | number  | Required           |
| `available`  | boolean | Public visibility  |
| `showOnHome` | boolean | Homepage only      |
| `image`      | URL     | Optional           |
| `avgRating`  | number  | 1-5 stars          |

### Orders (`/orders/{orderId}`)

| Field             | Type      | Notes                                            |
| ----------------- | --------- | ------------------------------------------------ |
| `userId`          | string    | Immutable                                        |
| `items`           | array     | `{productId, name, price, quantity, finalPrice}` |
| `total`           | number    | Immutable                                        |
| `status`          | string    | "pending" → "completed"                          |
| `clientRequestId` | string    | Deduplication key                                |
| `createdAt`       | Timestamp | Immutable                                        |
| `completedAt`     | Timestamp | Set on approval                                  |

### Transactions (`/transactions/{txId}`)

| Field     | Type   | Status Flow                                       |
| --------- | ------ | ------------------------------------------------- |
| `userId`  | string | Immutable                                         |
| `type`    | string | "deposit" \| "payment"                            |
| `amount`  | number | Immutable, > 0                                    |
| `status`  | string | "pending" → "approved" \| "rejected" \| "expired" |
| `orderId` | string | For payments only                                 |

### Deposit Requests (`/deposit_requests/{requestId}`)

| Field           | Type      | Notes                                |
| --------------- | --------- | ------------------------------------ |
| `userId`        | string    | Immutable                            |
| `amount`        | number    | Min 1,000đ                           |
| `status`        | string    | "pending" → "approved" \| "rejected" |
| `paymentMethod` | string    | bank, momo, etc.                     |
| `createdAt`     | Timestamp | Immutable                            |

**Bonus Rates (on approval)**:

- 50M+: +3.5%
- 10M-50M: +1.5%
- 1M-10M: +0.5%
- <1M: No bonus

---

## 🔄 Core Flows

### Authentication

1. User logs in via Google or email/password
2. Firebase creates auth user
3. `initializeAuth()` checks if Firestore user doc exists
4. If not: Create user doc with balance=0, role="user"
5. Set up real-time listeners for user/orders/products
6. Store populated, UI renders

### Order & Checkout

1. User adds items to cart (store → localStorage)
2. Clicks "Checkout" button
3. Verify current balance >= total (read from Firestore)
4. Create order doc: `{ userId, items, total, status: "pending", clientRequestId }`
5. Create transaction doc: `{ userId, type: "payment", amount, status: "pending" }`
6. Admin approves → balance decremented → order status → "completed"
7. User sees order in orders.html

### Deposit

1. User requests deposit (amount, payment method)
2. System creates deposit_requests doc: `{ status: "pending" }`
3. Admin sees pending requests in admin.html
4. Admin verifies payment received
5. Admin clicks "Approve" → balance += (amount + bonus)
6. User balance updated in real-time

---

## 🔐 Firestore Security Rules

**Write Protection**:

- Users: Can only update own name/email/phone
- Admin: Can update balance/role (only admins)
- Orders: userId immutable, status changes by owner/admin
- Products: Admin only
- Transactions: Admin only, amount immutable
- Deposit Requests: User creates own, admin approves

**Read Protection**:

- Users: Own doc or admin
- Products: Public (anyone)
- Orders: Own orders or admin
- Transactions: Own or admin
- Deposits: Own or admin

---

## ⚠️ Current Limitations & Roadmap

### Known Issues

1. **No Cloud Functions**: All logic client-side. Upgrade to Blaze plan for atomicity.
2. **No Real Payments**: Manual bank transfers + admin approval.
3. **No Inventory Locks**: Two users can order same item if stock < demand.
4. **No Email Notifications**: In-app only.
5. **Cart Not Synced**: Lost if device changed.

### Phase 5+ Improvements

- ✅ Cloud Functions for atomic multi-doc updates
- 💳 Stripe/Momo payment integration
- 📦 Real inventory with reservation system
- 📧 Email notifications (Node.js)
- 📱 Mobile app (React Native)
- 🎁 Loyalty program & subscriptions

---

## 🛠️ Developer Quick-Start

### Add a Page Component

1. Create `pages/newpage.html` with `<div id="navbar-root"></div>`
2. Import in main script: `initNavbar()`, `initializeAuth()`
3. Navbar + auth system auto-loaded

### Update Navbar Links

Edit [js/components/navbar.js](js/components/navbar.js#L89-L94):

```javascript
<a href="page.html" class="nav-link">
  Link Text
</a>
```

### Add Store Subscription

```javascript
store.subscribe(() => {
  const state = store.getState();
  renderUI(state);
});
```

### Debug Firestore Rules

Use Firestore Emulator or test in Console with:

```javascript
import { getDocs, collection } from "firebase-firestore";
const snap = await getDocs(collection(db, "docs"));
```

---

## 📂 File Organization

```
js/
├── main.js                      # Entry point with initNavbar(), initCart()
├── components/
│   ├── navbar.js               # initNavbar() export
│   ├── cart.js                 # initCart() export
│   └── ...
├── services/
│   ├── firebase.service.js
│   ├── transaction.service.js
│   └── role.service.js
├── store/
│   ├── index.js                # Store creation & getState()
│   └── (reducers)
└── core/
    ├── auth-init.js            # Session restoration
    └── ...
```

---

## 📝 Key Patterns

### Action Types

```javascript
ACTION_TYPES.SET_USER = "USER/SET_USER";
ACTION_TYPES.ADD_TO_CART = "CART/ADD_TO_CART";
```

### Dispatch

```javascript
store.dispatch({
  type: ACTION_TYPES.SET_USER,
  payload: userData,
});
```

### Subscribe

```javascript
store.subscribe(() => {
  const state = store.getState();
  if (state.user.data?.balance) {
    updateBalance(state.user.data.balance);
  }
});
```

---

## 🚀 Deployment

1. GitHub Pages: `npm run build` → `/dist` folder
2. Firebase Hosting: `firebase deploy`
3. Cloud Functions: `firebase deploy --only functions`

**Security**: All Firestore rules enforced at DB layer. Client-side checks = UX only.

---

**Documentation**: April 1, 2026 | Component-Based Architecture Complete
