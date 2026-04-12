import { auth } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const userBtn = document.getElementById("userBtn");
const dropdown = document.getElementById("dropdown");

if (userBtn) {
  userBtn.onclick = () => {
    dropdown.style.display =
      dropdown.style.display === "flex" ? "none" : "flex";
  };
}

onAuthStateChanged(auth, (user) => {
  const status = document.getElementById("userStatus");

  if (!status) return;

  if (user) {
    status.textContent = "Hello " + user.email;
  } else {
    status.textContent = "Not logged";
  }
});
