import { ACTION_TYPES } from './actions.js';

const initialState = { data: null, loading: false, error: null };

export function userReducer(state = initialState, action) {
  switch (action.type) {
    case ACTION_TYPES.SET_USER_LOADING:
      return { ...state, loading: action.payload, error: null };
    case ACTION_TYPES.SET_USER:
      return { ...state, data: action.payload, loading: false };
    case ACTION_TYPES.SET_USER_ERROR:
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}