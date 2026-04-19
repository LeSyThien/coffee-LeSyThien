import rootReducer from "./reducer.js";

const loadCartFromStorage = () => {
  try {
    const savedCart = localStorage.getItem("cart");
    if (!savedCart) return { items: [], total: 0 };

    const parsed = JSON.parse(savedCart);
    if (!parsed || !Array.isArray(parsed.items)) return { items: [], total: 0 };

    return {
      items: parsed.items,
      total: Number(parsed.total) || 0,
    };
  } catch (e) {
    console.warn("Failed to parse saved cart from localStorage", e);
    return { items: [], total: 0 };
  }
};

const initialState = {
  user: { data: null, loading: false, error: null },
  products: { list: [], loading: false, error: null },
  cart: loadCartFromStorage(),
  orders: { list: [], loading: false, error: null },
  ui: {
    isAuthReady: false,
    cartOpen: false,
    searchQuery: "",
    loadingGlobal: false,
    toast: null,
  },
};

function createStore(reducer, preloadedState) {
  let state = preloadedState;
  let listeners = [];

  /**
   * Lấy state hiện tại (Read-only)
   */
  function getState() {
    return state;
  }

  /**
   * Đăng ký listener lắng nghe sự thay đổi của state
   * @param {Function} listener
   * @returns {Function} Hàm unsubscribe
   */
  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new Error("Listener phải là một function.");
    }

    let isSubscribed = true;
    listeners.push(listener);

    // Trả về hàm cleanup (unsubscribe)
    return function unsubscribe() {
      if (!isSubscribed) return;
      isSubscribed = false;
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Gửi action để thay đổi state
   * @param {Object} action - Bắt buộc phải có thuộc tính `type`
   */
  function dispatch(action) {
    if (typeof action !== "object" || action === null || !action.type) {
      throw new Error('Action phải là một object chứa thuộc tính "type".');
    }

    // Update state thông qua reducer (Pure Function)
    state = reducer(state, action);

    // Persist cart changes to localStorage
    if (
      action.type === "CART/ADD_TO_CART" ||
      action.type === "CART/REMOVE_FROM_CART" ||
      action.type === "CART/UPDATE_CART" ||
      action.type === "CART/CLEAR_CART" ||
      action.type === "CART/SET_CART"
    ) {
      try {
        localStorage.setItem("cart", JSON.stringify(state.cart));
      } catch (e) {
        console.warn("Could not persist cart to localStorage", e);
      }
    }

    // Notify tới tất cả các component/hàm đang subscribe
    const currentListeners = [...listeners]; // Copy để tránh bug nếu listener tự unsubscribe trong lúc chạy
    for (let i = 0; i < currentListeners.length; i++) {
      currentListeners[i]();
    }

    return action;
  }

  // Khởi tạo state ban đầu
  dispatch({ type: "@@INIT/COFFEE_STORE" });

  return {
    getState,
    dispatch,
    subscribe,
  };
}

// Khởi tạo và export Singleton Store
const store = createStore(rootReducer, initialState);

export default store;
