/**
 * ============================================================================
 * LUMINA COFFEE - AUTHENTICATION MODULE
 * Description: Handles Login, Registration, Session persistence, Google OAuth,
 * Firestore user synchronization, and role-based UI toggling.
 * Architecture: ES Modules, Firebase Auth Integration.
 * ============================================================================
 */

import {
  auth,
  db,
  googleProvider,
  doc,
  setDoc,
  getDoc,
  waitForAuthInit,
} from "./firebase.js";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

import {
  Toast,
  showGlobalLoader,
  hideGlobalLoader,
  getInitials,
  formatCurrency,
} from "./utils.js";

/**
 * Global state for the current authenticated user's Firestore profile.
 * Contains role, balance, etc., which isn't in standard Firebase Auth.
 */
export let currentUserProfile = null;

/**
 * Evaluates Firebase Error Codes and returns user-friendly messages.
 * @param {Object} error - Firebase Error Object.
 * @returns {string} Human-readable error message.
 */
function getAuthErrorMessage(error) {
  switch (error.code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password. Please try again.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password is too weak. Please use a stronger password.";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";
    case "auth/popup-closed-by-user":
      return "Login popup was closed before completing.";
    default:
      console.error("Unhandled Auth Error:", error);
      return "An unexpected authentication error occurred.";
  }
}

/**
 * Synchronizes Firebase Auth user with Firestore 'users' collection.
 * Creates a new document if it's their first time logging in (e.g., via Google).
 * @param {Object} user - Firebase Auth User object.
 * @param {string} customName - Optional name for standard email registration.
 * @returns {Promise<Object>} The user's Firestore profile data.
 */
async function syncFirestoreUser(user, customName = null) {
  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      // User exists, return profile
      return userSnap.data();
    } else {
      // First time login, create Firestore document based on DB schema requirements
      const newProfile = {
        uid: user.uid,
        name: customName || user.displayName || "Coffee Lover",
        email: user.email,
        role: "user", // Default role; Admins are set manually in DB
        balance: 0, // Starting balance
        createdAt: new Date(),
      };

      await setDoc(userRef, newProfile);
      console.info(
        `New user profile created in Firestore for UID: ${user.uid}`,
      );
      return newProfile;
    }
  } catch (error) {
    console.error("Error syncing Firestore user:", error);
    throw error;
  }
}

/**
 * Handles standard Email & Password Login.
 * @param {string} email - User email.
 * @param {string} password - User password.
 * @returns {Promise<boolean>} True if successful.
 */
export async function loginWithEmail(email, password) {
  showGlobalLoader("Authenticating...");
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );
    currentUserProfile = await syncFirestoreUser(userCredential.user);
    Toast.success(`Welcome back, ${currentUserProfile.name}!`);
    hideGlobalLoader();
    return true;
  } catch (error) {
    hideGlobalLoader();
    Toast.error(getAuthErrorMessage(error));
    return false;
  }
}

/**
 * Handles standard Email & Password Registration.
 * @param {string} name - User's full name.
 * @param {string} email - User email.
 * @param {string} password - User password.
 * @returns {Promise<boolean>} True if successful.
 */
export async function registerWithEmail(name, email, password) {
  showGlobalLoader("Creating your account...");
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );

    // Update Firebase Auth Profile
    await updateProfile(userCredential.user, { displayName: name });

    // Create Firestore Profile
    currentUserProfile = await syncFirestoreUser(userCredential.user, name);

    Toast.success("Account created successfully!");
    hideGlobalLoader();
    return true;
  } catch (error) {
    hideGlobalLoader();
    Toast.error(getAuthErrorMessage(error));
    return false;
  }
}

/**
 * Handles Google OAuth Login via Popup.
 * @returns {Promise<boolean>} True if successful.
 */
export async function loginWithGoogle() {
  showGlobalLoader("Connecting to Google...");
  try {
    const result = await signInWithPopup(auth, googleProvider);
    currentUserProfile = await syncFirestoreUser(result.user);
    Toast.success(`Welcome, ${currentUserProfile.name}!`);
    hideGlobalLoader();
    return true;
  } catch (error) {
    hideGlobalLoader();
    Toast.error(getAuthErrorMessage(error));
    return false;
  }
}

/**
 * Logs out the current user and redirects to home.
 */
export async function logoutUser() {
  showGlobalLoader("Logging out...");
  try {
    await signOut(auth);
    currentUserProfile = null;
    window.location.href = "/";
  } catch (error) {
    hideGlobalLoader();
    Toast.error("Failed to log out. Please try again.");
    console.error("Logout Error:", error);
  }
}

/**
 * Updates the Global Navigation Bar UI based on authentication state.
 * @param {Object} profile - Firestore user profile data (null if guest).
 */
export function updateNavbarUI(profile) {
  const guestSection = document.getElementById("auth-guest");
  const userSection = document.getElementById("auth-user");

  if (!guestSection || !userSection) return; // Not on a page with navbar

  if (profile) {
    // Authenticated
    guestSection.classList.add("hidden");
    userSection.classList.remove("hidden");

    // Update User Details
    document.getElementById("nav-username").textContent = profile.name;
    document.getElementById("nav-avatar").textContent = getInitials(
      profile.name,
    );
    document.getElementById("nav-balance").textContent = formatCurrency(
      profile.balance || 0,
    );

    // Admin Badge injection (if applicable)
    if (profile.role === "admin") {
      const dropdown = document.getElementById("profileDropdown");
      if (dropdown && !document.getElementById("admin-dashboard-link")) {
        const adminLink = document.createElement("a");
        adminLink.href = "admin/admin.html";
        adminLink.className = "dropdown-item accent";
        adminLink.id = "admin-dashboard-link";
        adminLink.innerHTML = "🛡️ Admin Dashboard";
        dropdown.insertBefore(adminLink, dropdown.firstChild);
      }
    }
  } else {
    // Guest
    guestSection.classList.remove("hidden");
    userSection.classList.add("hidden");
  }
}

/**
 * Core initialization: Listens for auth state changes on page load.
 * Resolves the global loading state once Firebase determines auth status.
 */
export async function initAuthObserver() {
  const user = await waitForAuthInit();

  if (user) {
    try {
      currentUserProfile = await syncFirestoreUser(user);
      updateNavbarUI(currentUserProfile);
    } catch (error) {
      console.error("Failed to load user profile during init:", error);
      updateNavbarUI(null);
    }
  } else {
    currentUserProfile = null;
    updateNavbarUI(null);
  }

  // Setup generic listeners if elements exist
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutUser);
  }

  // Profile Dropdown Toggle Logic
  const profileBtn = document.getElementById("profileBtn");
  const profileDropdown = document.getElementById("profileDropdown");

  if (profileBtn && profileDropdown) {
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle("hidden");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", () => {
      if (!profileDropdown.classList.contains("hidden")) {
        profileDropdown.classList.add("hidden");
      }
    });
  }

  // Hide loader now that auth state is resolved
  hideGlobalLoader();

  return currentUserProfile;
}
