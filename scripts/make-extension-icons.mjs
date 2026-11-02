// 由 browser-extension/niuma-collect/icons/icon.svg 生成收藏插件图标 icon-16/32/48/128.png（manifest 的 icons 与 action.default_icon 引用）。
// 不加依赖：本机 Chrome 无头截图出 512 透明底大图，再用 sips 缩到各尺寸。Chrome 路径可用 NIUMA_CHROME 覆盖。
// 用法：node scripts/make-extension-icons.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const DIR = resolve("browser-extension/niuma-collect/icons");
const chromePath = process.env.NIUMA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const work = mkdtempSync(join(tmpdir(), "niuma-icon-"));
const big = join(work, "icon-512.png");
execFileSync(chromePath, ["--headless=new", `--user-data-dir=${join(work, "profile")}`, "--no-first-run", "--hide-scrollbars",
  "--default-background-color=00000000", "--window-size=512,512", `--screenshot=${big}`, pathToFileURL(join(DIR, "icon.svg")).href], { stdio: "ignore" });
for (const size of [16, 32, 48, 128]) {
  execFileSync("sips", ["-z", String(size), String(size), big, "--out", join(DIR, `icon-${size}.png`)], { stdio: "ignore" });
}
rmSync(work, { recursive: true, force: true });
console.log(`已生成 ${DIR}/icon-16.png、icon-32.png、icon-48.png、icon-128.png`);
