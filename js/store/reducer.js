import { userReducer } from "./user.reducer.js";
import { cartReducer } from "./cart.reducer.js";
import { ordersReducer } from "./orders.reducer.js";
import { uiReducer } from "./ui.reducer.js";
import { productReducer } from "./product.reducer.js";

export default function rootReducer(state = {}, action) {
  return {
    user: userReducer(state.user, action),
    products: productReducer(state.products, action),
    cart: cartReducer(state.cart, action),
    orders: ordersReducer(state.orders, action),
    ui: uiReducer(state.ui, action),
  };
}
