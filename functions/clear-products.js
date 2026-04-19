/**
 * Clear Products Collection Script
 * Run this once to delete all documents in the 'products' collection
 * Usage: node clear-products.js (from functions folder)
 */
import admin from "firebase-admin";
import serviceAccount from "./serviceAccountKey.json" with { type: "json" };

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function clearProductsCollection() {
  try {
    console.log("🗑️ Starting to clear products collection...");

    const productsRef = db.collection("products");
    const snapshot = await productsRef.get();

    if (snapshot.empty) {
      console.log("📭 Products collection is already empty");
      process.exit(0);
    }

    let deletedCount = 0;
    const batch = db.batch();

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deletedCount++;
    });

    await batch.commit();

    console.log(
      `🗑️ Successfully deleted ${deletedCount} products from collection`,
    );
    process.exit(0);
  } catch (error) {
    console.error("❌ Error clearing products collection:", error);
    process.exit(1);
  }
}

clearProductsCollection();
