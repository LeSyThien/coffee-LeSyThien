import { ACTION_TYPES } from './actions.js';

const initialState = { items: [], total: 0 };

const calculateTotal = (items) => 
  items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

export function cartReducer(state = initialState, action) {
  switch (action.type) {
    case ACTION_TYPES.ADD_TO_CART: {
      const product = action.payload;
      const existingItem = state.items.find(item => item.id === product.id);
      
      let newItems;
      if (existingItem) {
        newItems = state.items.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        newItems = [...state.items, { ...product, quantity: 1 }];
      }

      return { items: newItems, total: calculateTotal(newItems) };
    }

    case ACTION_TYPES.UPDATE_CART: {
      const { productId, quantity } = action.payload;
      const newItems = state.items
        .map(item => item.id === productId ? { ...item, quantity } : item)
        .filter(item => item.quantity > 0);

      return { items: newItems, total: calculateTotal(newItems) };
    }

    case ACTION_TYPES.CLEAR_CART:
      return initialState;

    default:
      return state;
  }
}