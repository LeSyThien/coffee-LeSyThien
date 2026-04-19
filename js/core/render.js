import store from "../store/index.js";
import { renderNavbar } from "../components/navbar.js";
import { renderCart } from "../components/cart.js";
import { renderProducts } from "../components/products.js";
import { initializeToastContainer } from "../services/toast.service.js";

export function initRender() {
  // Initialize toast container (global UI element)
  initializeToastContainer();

  // Lần render đầu tiên khi khởi tạo
  const initialState = store.getState();
  renderNavbar(initialState);
  renderCart(initialState);
  renderProducts(initialState);

  // Subscribe để tự động render khi State thay đổi
  store.subscribe(() => {
    const state = store.getState();

    // Tách biệt render để tối ưu (có thể thêm logic so sánh shallow-equal ở đây)
    renderNavbar(state);
    renderCart(state);
    renderProducts(state);
  });
}
