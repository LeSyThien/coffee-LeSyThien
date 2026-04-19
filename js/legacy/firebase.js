/**
 * ============================================================================
 * LUMINA COFFEE - FIREBASE INITIALIZATION & CORE SERVICES
 * Description: Initializes Firebase app, Auth, and Firestore.
 * Provides singleton instances and standardized database access wrappers.
 * Architecture: ES Modules, Strict Mode, Modular Service Exports.
 * ============================================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/**
 * FIREBASE CONFIGURATION
 * Note: In a real production app, these values would be populated via CI/CD
 * pipelines or environment variables. For this MVP, they are hardcoded as required.
 * Replace these placeholder values with your actual Firebase Project keys.
 */
const firebaseConfig = {
  apiKey: "AIzaSyBlOUebYGGUMMOblOi3plg0tPK0qG831gw",
  authDomain: "coffee-c5cec.firebaseapp.com",
  projectId: "coffee-c5cec",
  storageBucket: "coffee-c5cec.firebasestorage.app",
  messagingSenderId: "1009919056362",
  appId: "1:1009919056362:web:2e8eabc12192b4b2c8fa93",
  measurementId: "G-DE83KMT60V",
};

// 1. Initialize Firebase Application
let app;
try {
  app = initializeApp(firebaseConfig);
  console.info("Firebase Application Initialized Successfully.");
} catch (error) {
  console.error("Firebase Initialization Failed:", error);
  // Halt execution if critical infra fails
  throw new Error(
    "Critical Infrastructure Failure: Unable to connect to Firebase.",
  );
}

// 2. Initialize Core Services
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Standardize Google Login scopes
googleProvider.addScope("profile");
googleProvider.addScope("email");

/**
 * FIRESTORE SECURITY RULES REFERENCE
 * (Documented here for architecture alignment as per system requirements)
 * * rules_version = '2';
 * service cloud.firestore {
 * match /databases/{database}/documents {
 * match /users/{userId} {
 * allow read, write: if request.auth != null && request.auth.uid == userId;
 * }
 * match /products/{productId} {
 * allow read: if true;
 * allow write: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
 * }
 * match /orders/{orderId} {
 * allow read: if request.auth != null;
 * allow create: if request.auth != null;
 * allow update: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
 * }
 * }
 * }
 */

/**
 * ============================================================================
 * DATABASE UTILITY WRAPPERS
 * Implementing standardized access methods to abstract raw Firestore calls,
 * handle errors gracefully, and provide clear interfaces for other modules.
 * ============================================================================
 */

/**
 * Generic function to fetch a single document from a collection.
 * @param {string} collectionName - Name of the Firestore collection.
 * @param {string} documentId - The ID of the document.
 * @returns {Promise<Object|null>} The document data or null if not found.
 */
async function fetchDocument(collectionName, documentId) {
  try {
    const docRef = doc(db, collectionName, documentId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.warn(`Document not found in ${collectionName}: ${documentId}`);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching document from ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Generic function to fetch all documents from a collection, with optional querying.
 * @param {string} collectionName - Name of the collection.
 * @param {Array} queryConstraints - Array of Firestore query constraints (e.g., where, orderBy).
 * @returns {Promise<Array>} Array of document objects.
 */
async function fetchCollection(collectionName, queryConstraints = []) {
  try {
    const collRef = collection(db, collectionName);
    const q = query(collRef, ...queryConstraints);
    const querySnapshot = await getDocs(q);

    const results = [];
    querySnapshot.forEach((doc) => {
      results.push({ id: doc.id, ...doc.data() });
    });
    return results;
  } catch (error) {
    console.error(`Error fetching collection ${collectionName}:`, error);
    throw error;
  }
}

/**
 * Secure transaction wrapper to handle critical financial operations (like checkout).
 * @param {Function} transactionCallback - The logic to execute within the transaction.
 * @returns {Promise<any>} The result of the transaction.
 */
async function executeSecureTransaction(transactionCallback) {
  try {
    const result = await runTransaction(db, transactionCallback);
    console.info("Secure transaction completed successfully.");
    return result;
  } catch (error) {
    console.error("Secure transaction failed:", error);
    throw error; // Re-throw to be handled by the UI layer (e.g., show toast)
  }
}

/**
 * Realtime Listener Wrapper for Collections
 * Used primarily for Admin Dashboard and User Order Tracking.
 * @param {string} collectionName - Collection to listen to.
 * @param {Array} queryConstraints - Query parameters.
 * @param {Function} callback - Function to execute on data change.
 * @returns {Function} Unsubscribe function to clean up listener.
 */
function listenToCollection(collectionName, queryConstraints, callback) {
  const collRef = collection(db, collectionName);
  const q = query(collRef, ...queryConstraints);

  return onSnapshot(
    q,
    (snapshot) => {
      const data = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      callback(data);
    },
    (error) => {
      console.error(`Realtime listener error on ${collectionName}:`, error);
    },
  );
}

/**
 * Wait for Auth State Initialization
 * Prevents UI flicker by resolving only when Firebase Auth has figured out the user's state.
 * @returns {Promise<Object|null>} The Firebase user object.
 */
function waitForAuthInit() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe(); // Clean up immediately after first resolution
      resolve(user);
    });
  });
}

/**
 * ============================================================================
 * EXPORTS
 * Exposing the initialized services and standardized wrappers for the app.
 * ============================================================================
 */
export {
  app,
  auth,
  db,
  googleProvider,
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  fetchDocument,
  fetchCollection,
  executeSecureTransaction,
  listenToCollection,
  waitForAuthInit,
};
