import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";
import { fileURLToPath } from "node:url";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],

  // dev 态 base-ui 热更：`@berkshire/base-ui/client` 的包 exports 指向已构建 dist（宿主静态 import
  // 的是产物，改源码不进 HMR 图）。dev 下把该 specifier 别名到 **源码入口** `src/client/index.tsx`，
  // 使 Vite 直接变换 `.tsx` + `.module.css` → 组件改动即时 Fast Refresh（对齐仓库「组件 .tsx 归
  // Vite Fast Refresh」意图与 demo 插件 client 半身的 dev 源码态）。生产 `build` 不走此别名，仍吃
  // 包 exports 的 dist 产物（插件即发布件）。
  resolve: {
    alias:
      command === "serve"
        ? [
            {
              find: "@berkshire/base-ui/client",
              replacement: fileURLToPath(
                new URL("../../packages/plugins/base-ui/src/client/index.tsx", import.meta.url),
              ),
            },
          ]
        : [],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
