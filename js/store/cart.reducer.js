import { ACTION_TYPES } from "./actions.js";

const initialState = { items: [], total: 0 };

// Calculate final price considering discount
const calculateItemPrice = (item) => {
  if (item.finalPrice) return item.finalPrice;
  const discount = Number(item.discount) || 0;
  return item.price * (1 - discount / 100);
};

const calculateTotal = (items) =>
  items.reduce(
    (sum, item) => sum + calculateItemPrice(item) * item.quantity,
    0,
  );

export function cartReducer(state = initialState, action) {
  switch (action.type) {
    case ACTION_TYPES.ADD_TO_CART: {
      const product = action.payload;
      // Ensure finalPrice is calculated
      const finalPrice =
        product.finalPrice ||
        product.price * (1 - (product.discount || 0) / 100);
      const productWithPrice = { ...product, finalPrice };

      const existingItem = state.items.find((item) => item.id === product.id);

      let newItems;
      if (existingItem) {
        newItems = state.items.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      } else {
        newItems = [...state.items, { ...productWithPrice, quantity: 1 }];
      }

      return { items: newItems, total: calculateTotal(newItems) };
    }

    case ACTION_TYPES.UPDATE_CART: {
      const { productId, quantity } = action.payload;
      const newItems = state.items
        .map((item) => (item.id === productId ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0);

      return { items: newItems, total: calculateTotal(newItems) };
    }

    case ACTION_TYPES.CLEAR_CART:
      return initialState;

    default:
      return state;
  }
}
