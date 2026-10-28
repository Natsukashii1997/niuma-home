// 由用户给的应用图标原图 desktop/macos/AppIcon-source.png（512×512，圆角底板外透明、带阴影；用户 2026-10-28 换成「牛趴文件夹」）
// 生成应用图标 PNG。浏览器标签页图标 public/favicon.svg 是另画的 16×16 像素品牌标，不由这里生成。
// 用法：node scripts/make-icons.mjs  → public/icons/*.png（sips 直接缩放；brand-mark 取满版图），以及 macOS 应用图标 desktop/macos/AppIcon-1024.png
// macOS 26 起，带透明边和阴影的图标会被系统缩小并套上灰色底板；所以 AppIcon 用 AppKit 裁出原图底板（PLATE，原图像素坐标，左下为原点），
// 透明处铺底板同色黑，画满 1024 方图，圆角交给系统切。换原图时按新图重量 PLATE。
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const SOURCE = "desktop/macos/AppIcon-source.png";
const sips = (...args) => execFileSync("sips", args, { stdio: "ignore" });

mkdirSync("public/icons", { recursive: true });
for (const [name, size] of [["icon-192", 192], ["icon-512", 512], ["apple-touch-icon", 180]]) {
  sips("-z", String(size), String(size), SOURCE, "--out", `public/icons/${name}.png`);
}
const PLATE = [42, 51.5, 427, 427];
const FULL_BLEED = `ObjC.import('AppKit');
function run([src, out, x, y, w, h]) {
  const img = $.NSImage.alloc.initWithContentsOfFile(src);
  img.setSize($.NSMakeSize(512, 512));
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(null, 1024, 1024, 8, 4, true, false, $.NSCalibratedRGBColorSpace, 0, 0);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep));
  $.NSColor.colorWithSRGBRedGreenBlueAlpha(5 / 255, 6 / 255, 8 / 255, 1).setFill;
  $.NSRectFill($.NSMakeRect(0, 0, 1024, 1024));
  img.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, 1024, 1024), $.NSMakeRect(+x, +y, +w, +h), $.NSCompositingOperationSourceOver, 1);
  $.NSGraphicsContext.restoreGraphicsState;
  return rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $()).writeToFileAtomically(out, true);
}`;
execFileSync("osascript", ["-l", "JavaScript", "-e", FULL_BLEED, SOURCE, "desktop/macos/AppIcon-1024.png", ...PLATE.map(String)], { stdio: "ignore" });
// 侧栏品牌标（BrandMark，显示 28px）：取满版方图，方角与原来的像素品牌标一致；按 4 倍出图。
sips("-z", "112", "112", "desktop/macos/AppIcon-1024.png", "--out", "public/icons/brand-mark.png");
console.log("已生成 public/icons/icon-192.png、icon-512.png、apple-touch-icon.png、brand-mark.png、desktop/macos/AppIcon-1024.png");
