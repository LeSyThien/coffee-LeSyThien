#!/usr/bin/env node

/**
 * Firebase Admin Setup Script
 *
 * This script helps set custom admin claims for users
 *
 * Usage:
 *   node set-admin.js <email> [role]
 *
 * Examples:
 *   node set-admin.js admin@example.com admin      # Make admin
 *   node set-admin.js user@example.com user        # Make regular user
 *   node set-admin.js admin@example.com            # Defaults to admin
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
❌ Missing arguments!

Usage:
  node set-admin.js <email> [role]

Examples:
  node set-admin.js admin@example.com
  node set-admin.js admin@example.com admin
  node set-admin.js user@example.com user

Setup:
1. Download serviceAccountKey.json from Firebase Console
   → Settings ⚙️ → Service Accounts → Generate new private key
2. Place it in the functions/ directory
3. Run this script
  `);
  process.exit(1);
}

const email = args[0].toLowerCase().trim();
const role = args[1] || "admin";

if (!email.includes("@")) {
  console.error("❌ Invalid email format");
  process.exit(1);
}

if (!["admin", "user"].includes(role)) {
  console.error('❌ Role must be "admin" or "user"');
  process.exit(1);
}

// Find serviceAccountKey.json
const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`
❌ serviceAccountKey.json not found!

To get it:
1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project
3. Click Settings ⚙️ (top left)
4. Go to "Service Accounts" tab
5. Click "Generate New Private Key"
6. Save the file as "serviceAccountKey.json" in the functions/ directory
  `);
  process.exit(1);
}

try {
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
} catch (error) {
  console.error("❌ Error loading serviceAccountKey.json:", error.message);
  process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();

async function setUserRole() {
  try {
    console.log(`\n🔍 Looking up user: ${email}`);

    // Get user by email
    const user = await auth.getUserByEmail(email);
    const uid = user.uid;

    console.log(`✅ Found user: ${uid}`);

    // Set custom claims
    const claims = role === "admin" ? { admin: true } : { admin: false };

    console.log(`🔑 Setting custom claims:`, claims);
    await auth.setCustomUserClaims(uid, claims);

    console.log(`✅ Custom claims updated in Firebase Auth`);

    // Update Firestore
    console.log(`📄 Updating Firestore...`);
    await db.collection("users").doc(uid).update({
      role: role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: "admin-script",
    });

    console.log(`✅ Firestore updated`);

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ SUCCESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User: ${email}
UID:  ${uid}
Role: ${role.toUpperCase()}

⚠️  IMPORTANT:
The user must restart their session for changes to take effect:
  1. Logout of the app
  2. Wait 1-2 seconds
  3. Login again

Then check:
- Admin Dashboard should be accessible if admin
- Role changes visible in admin UI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);

    if (error.code === "auth/user-not-found") {
      console.log(`💡 User "${email}" not found in Firebase Auth`);
      console.log(`   Make sure they have signed up first.\n`);
    } else if (error.code === "auth/invalid-email") {
      console.log(`💡 Invalid email format: "${email}"\n`);
    }

    process.exit(1);
  }
}

// Run
setUserRole()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });
