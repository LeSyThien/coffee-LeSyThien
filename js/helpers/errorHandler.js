import store from '../store/index.js';
import { ACTION_TYPES } from '../store/actions.js';

export function handleError(error) {
  const message = error.message || "An unknown error occurred";
  
  // Ghi log ra console cho dev
  console.error("[App Error]:", error);

  // Cập nhật trạng thái lỗi vào store để UI hiển thị (Toast/Alert)
  store.dispatch({ 
    type: ACTION_TYPES.SET_USER_ERROR, 
    payload: message 
  });
  
  store.dispatch({
    type: ACTION_TYPES.PUSH_TOAST,
    payload: { type: 'error', message }
  });
}