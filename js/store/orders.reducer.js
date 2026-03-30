import { ACTION_TYPES } from "./actions.js";

const initialState = { list: [], loading: false, error: null };

export function ordersReducer(state = initialState, action) {
  switch (action.type) {
    case ACTION_TYPES.SET_ORDERS_LOADING:
      return { ...state, loading: action.payload, error: null };

    case ACTION_TYPES.SET_ORDERS:
      return { ...state, list: action.payload, loading: false };

    case ACTION_TYPES.SET_ORDERS_ERROR:
      return { ...state, error: action.payload, loading: false };

    default:
      return state;
  }
}
