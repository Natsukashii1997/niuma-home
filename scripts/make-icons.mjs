// 由用户给的应用图标原图 desktop/macos/AppIcon-source.png（512×512，圆角底板外透明、带阴影；用户 2026-10-28 换成「牛趴文件夹」）
// 生成应用图标 PNG，用 macOS 自带 sips 缩放。浏览器标签页图标 public/favicon.svg 是另画的 16×16 像素品牌标，不由这里生成。
// 用法：node scripts/make-icons.mjs  → public/icons/*.png，以及 macOS 应用图标 desktop/macos/AppIcon-1024.png
// （原图缩到 988 再四周补透明到 1024，圆角底板约 824 宽，与 Safari 生成的程序坞图标同尺寸）
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const SOURCE = "desktop/macos/AppIcon-source.png";
const sips = (...args) => execFileSync("sips", args, { stdio: "ignore" });

mkdirSync("public/icons", { recursive: true });
for (const [name, size] of [["icon-192", 192], ["icon-512", 512], ["apple-touch-icon", 180]]) {
  sips("-z", String(size), String(size), SOURCE, "--out", `public/icons/${name}.png`);
}
sips("-z", "988", "988", SOURCE, "--out", "desktop/macos/AppIcon-1024.png");
sips("-p", "1024", "1024", "desktop/macos/AppIcon-1024.png");
console.log("已生成 public/icons/icon-192.png、icon-512.png、apple-touch-icon.png、desktop/macos/AppIcon-1024.png");
