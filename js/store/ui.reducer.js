import { ACTION_TYPES } from "./actions.js";

const initialState = {
  isAuthReady: false,
  cartOpen: false,
  searchQuery: "",
  loadingGlobal: false,
  toast: [],
};

export function uiReducer(state = initialState, action) {
  switch (action.type) {
    case ACTION_TYPES.SET_AUTH_READY:
      return { ...state, isAuthReady: action.payload };

    case ACTION_TYPES.TOGGLE_CART:
      return { ...state, cartOpen: !state.cartOpen };

    case ACTION_TYPES.SET_GLOBAL_LOADING:
      return { ...state, loadingGlobal: action.payload };

    case ACTION_TYPES.SET_SEARCH_QUERY:
      return { ...state, searchQuery: action.payload };

    case ACTION_TYPES.PUSH_TOAST:
      return { ...state, toast: [...state.toast, action.payload] };

    default:
      return state;
  }
}
