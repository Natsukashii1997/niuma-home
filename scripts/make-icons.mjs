// 由 public/favicon.svg（16×16 像素品牌标）生成应用图标 PNG：按整数倍放大、四周留同色边，不做抗锯齿。
// 用法：node scripts/make-icons.mjs  → public/icons/*.png，以及 macOS 应用图标 desktop/macos/AppIcon-1024.png
// （圆角底板 824、四周透明 100，与 Safari 生成的程序坞图标同尺寸）
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const svg = readFileSync("public/favicon.svg", "utf8");
const bg = svg.match(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/)[1];
const grid = Array.from({ length: 16 }, () => Array(16).fill(bg));
for (const [, d, fill] of svg.matchAll(/<path d="([^"]+)" fill="(#[0-9A-Fa-f]{6})"/g)) {
  for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(w); i += 1) grid[Number(y)][Number(x) + i] = fill;
  }
}

function png(size, cell, plate = null) {
  const pad = (size - cell * 16) / 2;
  const ch = plate ? 4 : 3;
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const raw = Buffer.alloc(size * (size * ch + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * ch + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const gx = Math.floor((x - pad) / cell);
      const gy = Math.floor((y - pad) / cell);
      const inside = gx >= 0 && gx < 16 && gy >= 0 && gy < 16;
      const px = rgb(inside ? grid[gy][gx] : bg);
      if (plate) px.push(onPlate(x + 0.5, y + 0.5, size, plate) ? 255 : 0);
      px.forEach((v, i) => { raw[y * (size * ch + 1) + 1 + x * ch + i] = v; });
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8; // 位深
  head[9] = plate ? 6 : 2; // RGBA（圆角外透明）/ RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", head),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 点是否落在圆角底板内
function onPlate(x, y, size, { inset, radius }) {
  const lo = inset + radius, hi = size - inset - radius;
  const dx = Math.max(lo - x, 0, x - hi), dy = Math.max(lo - y, 0, y - hi);
  return x >= inset && x <= size - inset && y >= inset && y <= size - inset && dx * dx + dy * dy <= radius * radius;
}

mkdirSync("public/icons", { recursive: true });
// 尺寸 → 每格像素；边距 = (尺寸 - 16 × 每格) / 2
for (const [name, size, cell] of [["icon-192", 192, 10], ["icon-512", 512, 28], ["apple-touch-icon", 180, 10]]) {
  writeFileSync(`public/icons/${name}.png`, png(size, cell));
}
writeFileSync("desktop/macos/AppIcon-1024.png", png(1024, 46, { inset: 100, radius: 185 }));
console.log("已生成 public/icons/icon-192.png、icon-512.png、apple-touch-icon.png、desktop/macos/AppIcon-1024.png");
