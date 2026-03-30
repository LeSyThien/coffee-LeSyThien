import { ACTION_TYPES } from "./actions.js";

const initialState = {
  list: [],
  loading: false,
  error: null,
};

export function productReducer(state = initialState, action) {
  switch (action.type) {
    case ACTION_TYPES.SET_PRODUCTS:
      return {
        ...state,
        list: action.payload || [],
        loading: false,
        error: null,
      };

    default:
      return state;
  }
}
