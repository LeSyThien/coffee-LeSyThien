# CoffeeShop - Hệ thống demo cửa hàng cà phê

## 1. Mục tiêu

Dự án này là một website demo cửa hàng cà phê với đăng ký/đăng nhập Firebase, login Google, và load sản phẩm từ Firestore.

## 2. Các trang

- `index.html`: Trang chính hiển thị danh sách sản phẩm và menu người dùng.
- `login.html`: Trang đăng nhập email/password và Google.
- `register.html`: Trang đăng ký tài khoản mới.
- `app.js`: JavaScript điều khiển Firebase Auth + Firestore + DOM.
- `style.css`: CSS của giao diện trang chính (index).

## 3. Các tính năng đã làm

1. Kết nối Firebase (auth + firestore).
2. Đăng ký bằng email/password và cập nhật `displayName`.
3. Đăng nhập bằng email/password.
4. Đăng nhập bằng Google (Google OAuth popup).
5. Hiển thị trạng thái người dùng (`userStatus`) và menu dropdown.
6. Đăng xuất.
7. Load danh sách sản phẩm từ Firestore collection `products` và hiển thị thẻ sản phẩm.
8. Hiển thị menu user trong dropdown tương ứng với trạng thái login.

## 4. ID HTML quan trọng (để người khác hiểu rõ)

### chung:

- `userBtn`: nút mở dropdown user.
- `dropdown`: khung dropdown user.
- `userStatus`: hiển thị trạng thái người dùng ("Hello ..."/"Not logged").

### index.html:

- `loadProducts`: nút Load Products.
- `products`: container chứa danh sách sản phẩm.
- `balance`: hiển thị số dư (hiện đang cố định 0).

### login.html:

- `email`: input email.
- `password`: input password.
- `loginBtn`: nút Login.
- `googleLogin`: nút Login with Google.
- `togglePass`: icon bật/tắt xem mật khẩu.

### register.html:

- `name`: input tên.
- `email`: input email.
- `password`: input password.
- `registerBtn`: nút Register.

## 5. Cách chạy

1. Mở `index.html` (hoặc `login.html`, `register.html`) bằng trình duyệt.
2. Nếu dùng Firebase, đảm bảo config trong `app.js` đúng.
3. Click `Load Products` để load dữ liệu từ Firestore.

## 6. Các điểm cần cải tiến tiếp theo

- Thêm valid form (email đúng định dạng, password tối thiểu).
- Thêm xử lý lỗi đẹp hơn (UI message thay vì alert mặc định).
- Thêm chức năng giỏ hàng (cập nhật số tiền khi bấm "Đặt hàng").
- Thêm tìm kiếm thực sự theo input `search`.
- Triển khai SPA với chuyển trang mượt hơn.

## 7. Ghi chú mã nguồn quan trọng

- `onAuthStateChanged(auth, callback)`: luôn kiểm tra trạng thái login và cập nhật UI.
- `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `signInWithPopup`, `signOut` dùng để xử lý Auth.
- `getDocs(collection(db, "products"))`: load dữ liệu sản phẩm.
- Hàm `loadBtn.onclick` được dùng 2 lần (có thể gộp lại 1 lần cho sạch).

---

✅ Dễ hiểu: Ai mở `readme.md` này sẽ nắm được nhanh các phần đã làm, các id để chỉnh sửa, và cách test app.
