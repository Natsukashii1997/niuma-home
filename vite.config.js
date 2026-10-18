import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

// 底栏显示的版本号：构建时的提交号
const version = (() => { try { return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { return "dev"; } })();

// 开发页面用 5281，/api 转给本机服务（默认 5280）。
const api = `http://127.0.0.1:${Number(process.env.WORKDESK_API_PORT || 5280)}`;

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    host: "127.0.0.1",
    port: 5281,
    strictPort: true,
    proxy: { "/api": api },
  },
});
