import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 开发页面用 5281，/api 转给本机服务（默认 5280）。
const api = `http://127.0.0.1:${Number(process.env.WORKDESK_API_PORT || 5280)}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5281,
    strictPort: true,
    proxy: { "/api": api },
  },
});
