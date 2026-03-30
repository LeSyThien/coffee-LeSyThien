# ☁️ Cloud Functions Setup Guide

## 📋 Overview

This guide covers the setup and deployment of Cloud Functions for managing user roles in your Firebase project.

### Functions Deployed:

1. **setUserRole** - Set user role (admin/user) with custom claims
2. **getAllUsers** - Fetch all users (admin only)
3. **revokeAdminRole** - Revoke admin role from user

---

## 🚀 Prerequisites

Before deploying, ensure you have:

- [Node.js](https://nodejs.org/) (v18+) installed
- [Firebase CLI](https://firebase.google.com/docs/cli) installed
- A Firebase project already set up (with Firestore and Authentication)
- Admin access to your Firebase project

### Install Firebase CLI

```bash
npm install -g firebase-tools
```

### Login to Firebase

```bash
firebase login
```

---

## 📁 Project Structure

```
coffee-LeSyThien/
├── functions/
│   ├── package.json          # Dependencies
│   └── index.js              # Cloud Functions code
├── js/
│   ├── admin.js              # Admin UI (updated)
│   └── services/
│       ├── firebase.service.js   # Firebase app config
│       └── role.service.js       # Frontend API for role management
├── pages/
│   └── admin.html            # Admin dashboard (updated)
└── firestore.rules           # Firestore security rules
```

---

## 🔧 Deployment Steps

### 1. Initialize Firebase Project (if not done)

```bash
cd functions
firebase init functions
```

When prompted:

- Select your Firebase project
- Choose JavaScript
- Say "No" to ESLint

### 2. Install Dependencies

```bash
cd functions
npm install
```

This installs:

- `firebase-admin@^12.0.0`
- `firebase-functions@^5.0.0`

### 3. Deploy Cloud Functions

```bash
firebase deploy --only functions
```

**Output Example:**

```
✔ functions[setUserRole]: Successful
✔ functions[getAllUsers]: Successful
✔ functions[revokeAdminRole]: Successful

✓ Deploy complete!

Function URL: https://asia-southeast1-coffee-c5cec.cloudfunctions.net/setUserRole
```

### 4. Verify Deployment

```bash
firebase functions:list
```

---

## 🔑 Setting Custom Claims (One-Time Setup)

After deploying functions, you need to promote at least one user to admin via Firebase Admin SDK.

### Option A: Firebase Console (Manual)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Navigate to **Authentication** → **Users**
3. Click on a user
4. Scroll down to **Custom Claims**
5. Add:
   ```json
   { "admin": true }
   ```
6. Click **Save**
7. That user must **logout and login again** for claims to take effect

### Option B: Firebase Admin SDK (Recommended)

Use this Node.js script to set admin claims:

```javascript
// set-admin.js
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "coffee-c5cec",
});

async function setAdmin(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });

    // Update Firestore
    await admin.firestore().collection("users").doc(user.uid).update({
      role: "admin",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ ${email} is now admin`);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Run: node set-admin.js your-email@gmail.com
setAdmin(process.argv[2]).then(() => process.exit(0));
```

Get your `serviceAccountKey.json` from:

- Firebase Console → Settings ⚙️ → Service Accounts → Generate new private key

Run:

```bash
node set-admin.js your-email@gmail.com
```

---

## 🔐 Security Configuration

### Firestore Rules Already Updated

The `firestore.rules` file has been updated to support admin custom claims:

```firestore
function isAuth() {
  return request.auth != null;
}

function isAdmin() {
  return isAuth() && request.auth.token.admin == true;
}
```

### Verify Rules Deployment

```bash
firebase deploy --only firestore:rules
```

---

## 📱 Frontend Configuration

### 1. Firebase Region

In `js/services/firebase.service.js`, the functions region is set to:

```javascript
export const functions = getFunctions(app, "asia-southeast1");
```

**Change this if your Firebase functions are in a different region:**

```javascript
// For US region:
export const functions = getFunctions(app, "us-central1");

// For EU region:
export const functions = getFunctions(app, "europe-west1");
```

Find your region in [Firebase Console](https://console.firebase.google.com/) → Functions → Region

### 2. Verify Connection

Check browser console (F12) for logs:

- ✅ `📝 Calling setUserRole with:` - Function called successfully
- ❌ `❌ setUserRole error:` - Connection issue

---

## 🧪 Testing

### Test via Admin Dashboard

1. Login as an admin
2. Go to **Admin Dashboard** → **User Roles**
3. Enter a user's email
4. Click **Make Admin** or **Remove Admin**
5. Check console (F12) for logs

### Test via Firebase Emulator

```bash
firebase emulators:start --only functions
```

Then set the functions to use the emulator in your code:

```javascript
if (location.hostname === "localhost") {
  connectFunctionsEmulator(functions, "localhost", 5001);
}
```

### Manual Testing (cURL)

Get your function URL from `firebase deploy` output, then:

```bash
curl -X POST https://asia-southeast1-coffee-c5cec.cloudfunctions.net/setUserRole \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ID_TOKEN" \
  -d '{
    "email": "user@example.com",
    "role": "admin"
  }'
```

---

## 📊 Monitoring & Logs

### View Function Logs

```bash
firebase functions:log
```

Or in [Firebase Console](https://console.firebase.google.com/):

- Navigate to **Functions** → Click function name → **Logs** tab

### Common Issues

**Issue**: `functions/permission-denied`

- **Solution**: User calling function is not admin. Set custom claims first.

**Issue**: `functions/not-found`

- **Solution**: User email not found in Firebase Auth

**Issue**: `functions/unauthenticated`

- **Solution**: User not logged in. Check Firebase Auth state.

---

## 🔄 Updating Functions

### Make Changes

Edit `functions/index.js`, then redeploy:

```bash
firebase deploy --only functions
```

### Rollback to Previous Version

Check Cloud Functions in Firebase Console → previous versions available there

---

## ⚠️ Important Notes

### Custom Claims Cache

When you set custom claims:

```javascript
await admin.auth().setCustomUserClaims(uid, { admin: true });
```

The user must **logout and login again** for the claims to take effect in the ID token.

### Token Refresh

In the frontend, to get fresh claims:

```javascript
const idTokenResult = await user.getIdTokenResult(true); // true = force refresh
```

### Billing

Cloud Functions have **free tier**:

- 2M invocations/month free
- 400,000 GB-seconds/month free

Check [Firebase Pricing](https://firebase.google.com/pricing)

---

## 📝 Example Usage

### Promote User to Admin

```javascript
import { promoteToAdmin } from "./js/services/role.service.js";

const result = await promoteToAdmin("user@example.com");

if (result.success) {
  console.log("✅ User promoted:", result.message);
} else {
  console.error("❌ Error:", result.message);
}
```

### Get All Users

```javascript
import { getAllUsers } from "./js/services/role.service.js";

const result = await getAllUsers();

if (result.success) {
  console.log("Users:", result.users);
  result.users.forEach((user) => {
    console.log(`${user.email} - ${user.role}`);
  });
}
```

### Demote Admin to User

```javascript
import { demoteToUser } from "./js/services/role.service.js";

const result = await demoteToUser("admin@example.com");

if (result.success) {
  console.log("✅ User demoted:", result.message);
}
```

---

## 🆘 Troubleshooting

### Functions Not Appearing After Deploy

1. Check `firebase deploy --only functions` output for errors
2. Verify `functions/index.js` is valid JavaScript
3. Check `functions/package.json` dependencies

### Cloud Function Timeout

Increase timeout in `functions/index.js`:

```javascript
exports.setUserRole = functions
  .runWith({ timeoutSeconds: 60 })
  .https.onCall(async (data, context) => {
    // ... function code
  });
```

### CORS Errors

HTTPS callable functions automatically handle CORS. If issues persist:

```javascript
// In functions/index.js - add at the top
const cors = require("cors")({ origin: true });

exports.setUserRole = functions.https.onCall(async (data, context) => {
  // CORS handled automatically for https.onCall
});
```

---

## 📚 Resources

- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Cloud Functions for Firebase Guides](https://firebase.google.com/docs/functions/get-started)
- [Firebase Admin SDK](https://firebase.google.com/docs/database/admin/start)
- [Custom Claims](https://firebase.google.com/docs/auth/admin-sdk-set-custom-claims)

---

## ✅ Checklist

- [ ] Firebase CLI installed and logged in
- [ ] `functions/` directory created with `package.json` and `index.js`
- [ ] Dependencies installed: `npm install` in `functions/`
- [ ] Functions deployed: `firebase deploy --only functions`
- [ ] At least one user set as admin
- [ ] Admin logged out and back in (to refresh claims)
- [ ] Firestore rules deployed
- [ ] Firebase functions region configured in frontend
- [ ] Admin dashboard accessible
- [ ] Role management UI visible in admin dashboard

---

**Now your Cloud Functions are ready for production!** 🚀
