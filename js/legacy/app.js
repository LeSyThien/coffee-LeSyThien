// import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";

// import {
//   getAuth,
//   createUserWithEmailAndPassword,
//   signInWithEmailAndPassword,
//   updateProfile,
//   onAuthStateChanged,
//   signOut,
//   GoogleAuthProvider,
//   signInWithPopup,
// } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

// import {
//   getFirestore,
//   collection,
//   getDocs,
// } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// /* FIREBASE CONFIG */

// const firebaseConfig = {
//   apiKey: "AIzaSyBlOUebYGGUMMOblOi3plg0tPK0qG831gw",
//   authDomain: "coffee-c5cec.firebaseapp.com",
//   projectId: "coffee-c5cec",
//   storageBucket: "coffee-c5cec.firebasestorage.app",
//   messagingSenderId: "1009919056362",
//   appId: "1:1009919056362:web:2e8eabc12192b4b2c8fa93",
//   measurementId: "G-DE83KMT60V",
// };

// /* INIT */

// const app = initializeApp(firebaseConfig);
// const auth = getAuth(app);
// const db = getFirestore(app);

// /* USER DROPDOWN */

// const userBtn = document.getElementById("userBtn");
// const dropdown = document.getElementById("dropdown");

// if (userBtn && dropdown) {
//   userBtn.onclick = () => {
//     dropdown.style.display =
//       dropdown.style.display === "flex" ? "none" : "flex";
//   };
// }

// /* AUTH STATE */

// onAuthStateChanged(auth, (user) => {
//   if (!dropdown) return;

//   if (user) {
//     dropdown.innerHTML = `
// <p style="padding:10px">${user.email}</p>
// <button id="logout">Logout</button>
// `;

//     const logoutBtn = document.getElementById("logout");

//     if (logoutBtn) {
//       logoutBtn.onclick = async () => {
//         await signOut(auth);
//         location.reload();
//       };
//     }
//   } else {
//     dropdown.innerHTML = `
// <a href="login.html">Login</a>
// `;
//   }
// });

// /* REGISTER */

// const registerBtn = document.getElementById("registerBtn");

// if (registerBtn) {
//   registerBtn.onclick = async () => {
//     try {
//       const email = document.getElementById("email").value;
//       const password = document.getElementById("password").value;
//       const name = document.getElementById("name").value;

//       const userCredential = await createUserWithEmailAndPassword(
//         auth,
//         email,
//         password,
//       );

//       await updateProfile(userCredential.user, {
//         displayName: name,
//       });

//       alert("Register success");

//       location.href = "login.html";
//     } catch (err) {
//       console.error(err);
//       alert(err.message);
//     }
//   };
// }

// /* LOGIN */

// const loginBtn = document.getElementById("loginBtn");

// if (loginBtn) {
//   loginBtn.onclick = async () => {
//     try {
//       const email = document.getElementById("email").value;
//       const password = document.getElementById("password").value;

//       await signInWithEmailAndPassword(auth, email, password);

//       alert("Login success");

//       location.href = "index.html";
//     } catch (err) {
//       console.error(err);
//       alert(err.message);
//     }
//   };
// }

// /* GOOGLE LOGIN */

// const googleBtn = document.getElementById("googleLogin");

// if (googleBtn) {
//   googleBtn.onclick = async () => {
//     try {
//       const provider = new GoogleAuthProvider();

//       await signInWithPopup(auth, provider);

//       location.href = "index.html";
//     } catch (err) {
//       console.error(err);
//       alert(err.message);
//     }
//   };
// }

// /* USER STATUS */

// const status = document.getElementById("userStatus");

// if (status) {
//   onAuthStateChanged(auth, (user) => {
//     if (user) {
//       status.textContent = "Hello " + user.email;
//     } else {
//       status.textContent = "Not logged";
//     }
//   });
// }
// /* LOAD PRODUCTS */

// const loadBtn = document.getElementById("loadProducts");

// if (loadBtn) {
//   loadBtn.onclick = async () => {
//     const container = document.getElementById("products");

//     const snapshot = await getDocs(collection(db, "products"));

//     container.innerHTML = "";

//     snapshot.forEach((doc) => {
//       const data = doc.data();

//       const el = document.createElement("div");

//       el.className = "product";

//       el.innerHTML = `
//       <div class="product-card">

//         <img src="${data.image}" alt="${data.name}">

//         <h3>${data.name}</h3>

//         <p class="price">
//         ${data.price.toLocaleString("vi-VN")} VND
//         </p>

//         <button class="buy-btn">Đặt hàng</button>
//         <button class="details-btn">Xem chi tiết</button>

//       </div>
//       `;

//       container.appendChild(el);
//     });
//   };
// }
// window.onload = () => {
//   loadBtn.click();
// };
// loadBtn.onclick = async () => {
//   const container = document.getElementById("products");

//   const snapshot = await getDocs(collection(db, "products"));

//   container.innerHTML = "";

//   snapshot.forEach((doc) => {
//     const data = doc.data();

//     const el = document.createElement("div");
//     el.className = "product";

//     el.innerHTML = `
//       <div class="product-card">
//         <img src="${data.image}" alt="${data.name}">
//         <h3>${data.name}</h3>
//         <p class="price">${data.price.toLocaleString("vi-VN")} VND</p>
//         <button class="buy-btn">Đặt hàng</button>
//       </div>
//     `;

//     container.appendChild(el);
//   });
// };
