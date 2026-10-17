// 预览页公用脚本：注入和正式代码相同的网点变量，把 <i data-icon="名"> 换成 7×7 像素图标。
// 只给 docs/design/innovation/ 里的静态预览用，正式开发用 src/ui/bitmap.jsx。
import { ICONS7 } from "../../../src/ui/icons7.js";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function tile(threshold, color) {
  const rects = BAYER.map((v, i) => (v < threshold ? `<rect x="${(i % 4) * 2}" y="${Math.floor(i / 4) * 2}" width="2" height="2"/>` : "")).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" shape-rendering="crispEdges" fill="${color}">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
const root = document.documentElement.style;
[2, 4, 6, 8].forEach((t, i) => root.setProperty(`--dither-${i + 1}`, tile(t, "#C9CCD3")));
[4, 8, 12, 16].forEach((t, i) => root.setProperty(`--dither-ink-${i + 1}`, tile(t, "#0D0E10")));
[4, 8].forEach((t, i) => root.setProperty(`--dither-signal-${i + 1}`, tile(t, "#FF4F1F")));

document.querySelectorAll("i[data-icon]").forEach((el) => {
  const rows = ICONS7[el.dataset.icon];
  if (!rows) return;
  const px = el.dataset.size === "28" ? 28 : 14;
  const rects = rows.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ""))).join("");
  el.outerHTML = `<svg class="pixel-icon" width="${px}" height="${px}" viewBox="0 0 7 7" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`;
});
document.documentElement.dataset.ready = "1";
