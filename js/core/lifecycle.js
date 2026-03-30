export function createComponent(renderFn) {
  let cleanupFns = [];

  return {
    mount(state) {
      // Thực hiện render và nhận về các hàm cleanup (nếu có)
      const cleanup = renderFn(state);
      if (typeof cleanup === 'function') {
        cleanupFns.push(cleanup);
      }
    },
    unmount() {
      cleanupFns.forEach(fn => fn());
      cleanupFns = [];
    }
  };
}