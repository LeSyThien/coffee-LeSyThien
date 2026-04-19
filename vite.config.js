import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".", // Chạy từ thư mục gốc
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        // Liệt kê tất cả các file HTML của m ở đây để Vite tìm thấy
        main: resolve(__dirname, "pages/index.html"),
        login: resolve(__dirname, "pages/login.html"),
        register: resolve(__dirname, "pages/register.html"),
        admin: resolve(__dirname, "pages/admin.html"),
        deposit: resolve(__dirname, "pages/deposit.html"),
        products: resolve(__dirname, "pages/products.html"),
        profile: resolve(__dirname, "pages/profile.html"),
        // Nếu còn trang nào khác (vip.html, orders.html...) thì m thêm dòng vào đây nhé
      },
    },
  },
  server: {
    port: 5173,
    open: "/pages/index.html",
    proxy: {
      // 1. Xử lý riêng cho trang chủ "/"
      "^/$": {
        target: "http://localhost:5173",
        rewrite: () => "/pages/index.html",
      },
      // 2. Xử lý cho các trang còn lại (giữ nguyên đống cũ)
      "^/(login|register|admin|deposit|profile|products|orders|vip|vip-products|about|contact)$":
        {
          target: "http://localhost:5173",
          rewrite: (path) => `/pages${path}.html`,
        },
    },
  },
});
