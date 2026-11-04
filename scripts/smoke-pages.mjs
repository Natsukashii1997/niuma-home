// 页面冒烟（2026-10-23 审核第 17 条）：用本机 Chrome 无头模式逐个打开全部路由（含 ⌘K 面板、自言自语抽屉），
// 核对：没有 JS 异常和 console.error / console.warn、没有发出任何非 GET 请求、主区有内容；每页截图。
// 用法：
//   npm run smoke                                   先 npm run build；用临时数据目录起隔离服务（假 lark-cli，不连飞书），跑完关掉
//   npm run smoke -- --base http://127.0.0.1:5280   只读打开一个已经在跑的服务（如正式 5280；脚本不点任何写操作）
//   可选：--out <目录>（默认 ~/Library/Application Support/NiumaHome/evidence/smoke-<时间>/）、--width 1440、--strict（资源加载失败如 502 也算失败）
// 不加依赖：Chrome 路径可用 NIUMA_CHROME 覆盖。退出码 0 = 全过，1 = 有问题。
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createServer } from "node:net";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/(\d{8})(\d{4})/, "$1-$2");
const out = resolve(opt("--out", join(homedir(), "Library/Application Support/NiumaHome/evidence", `smoke-${stamp}`)));
const width = Number(opt("--width", 1440));
const strict = args.includes("--strict");
const chromePath = process.env.NIUMA_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ROUTES = ["", "user/timeline", "user/timeline/country", "user/timeline/anomalies", "user/strategy", "user/playbook",
  "marketing/plans", "marketing/prices", "marketing/materials", "marketing/brief", "voice", "projects/board", "projects/campaign", "projects/overview",
  "mentor", "mentor/path", "brand", "business", "assistants", "reports", "kb", "settings"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((r) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => r(port)); }); });

if (!existsSync(chromePath)) { console.error(`找不到 Chrome：${chromePath}（可用 NIUMA_CHROME 指定）`); process.exit(2); }
mkdirSync(out, { recursive: true });
const cleanups = [];
let base = opt("--base", "");
if (!base) {
  if (!existsSync(resolve("dist/index.html"))) { console.error("没有 dist/index.html：先 npm run build"); process.exit(2); }
  const data = mkdtempSync(join(tmpdir(), "niuma-smoke-data-")), fakeBin = mkdtempSync(join(tmpdir(), "niuma-smoke-bin-"));
  writeFileSync(join(fakeBin, "lark-cli"), "#!/bin/sh\necho '冒烟环境不连飞书' >&2\nexit 1\n"); chmodSync(join(fakeBin, "lark-cli"), 0o755);
  const port = await freePort();
  const server = spawn(process.execPath, ["server/index.mjs"], { env: { ...process.env, WORKDESK_DATA_DIR: data, PORT: String(port), PATH: `${fakeBin}:${process.env.PATH}` }, stdio: ["ignore", "pipe", "pipe"] });
  const serverLog = [];
  server.stdout.on("data", (d) => serverLog.push(String(d))); server.stderr.on("data", (d) => serverLog.push(String(d)));
  cleanups.push(async () => { server.kill(); await new Promise((r) => server.once("exit", r)); for (const d of [data, fakeBin]) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
  base = `http://127.0.0.1:${port}`;
  for (let k = 0; k < 50; k++) { try { if ((await fetch(`${base}/api/v3/status`)).ok) break; } catch { /* 还没起来 */ } await sleep(200); if (k === 49) { console.error("隔离服务没有起来：", serverLog.join("")); process.exit(2); } }
  console.log(`隔离服务 ${base}（临时数据目录，假 lark-cli）`);
}

const prof = mkdtempSync(join(tmpdir(), "niuma-smoke-chrome-"));
const devPort = await freePort();
const chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${devPort}`, `--user-data-dir=${prof}`, "--hide-scrollbars", "--no-first-run", "--window-size=1600,1000", "about:blank"], { stdio: "ignore" });
cleanups.push(async () => { chrome.kill(); await new Promise((r) => chrome.once("exit", r)); rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
let ws;
for (let k = 0; k < 50 && !ws; k++) {
  try { const list = await (await fetch(`http://127.0.0.1:${devPort}/json/list`)).json(); const p = list.find((t) => t.type === "page"); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch { /* 等 Chrome */ }
  if (!ws) await sleep(200);
}
const cleanup = async () => { for (const f of cleanups) await f(); };
if (!ws) { console.error("Chrome 没有起来"); await cleanup(); process.exit(2); }
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const wait = new Map();
let errors = [], writes = [], resources = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(`异常：${m.params.exceptionDetails?.exception?.description?.slice(0, 200) || m.params.exceptionDetails?.text}`);
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) errors.push(`console.${m.params.type}：${m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 200)}`);
  if (m.method === "Log.entryAdded" && ["error", "warning"].includes(m.params.entry.level)) resources.push(`${m.params.entry.level}：${m.params.entry.text.slice(0, 120)} ${m.params.entry.url || ""}`);
  if (m.method === "Network.requestWillBeSent" && m.params.request.method !== "GET") writes.push(`${m.params.request.method} ${m.params.request.url}`);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => (await send("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(out, `${name}.png`), Buffer.from(r.result.data, "base64")); };
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });

const results = [];
const check = async (name, extra = "") => {
  const info = await js(`const main = document.querySelector("main.main"); return { text: (main?.innerText || "").trim().length, loading: !!document.querySelector(".state-loading"), version: document.querySelector(".sb-host")?.textContent || "" ${extra ? `, ...(${extra})` : ""} };`);
  const problems = [...errors, ...writes.map((w) => `非 GET 请求：${w}`), ...(strict ? resources : [])];
  if (!info || info.text < 20) problems.push("主区没有内容");
  results.push({ name, ok: !problems.length, problems, resources: [...resources], info });
  console.log(`${problems.length ? "✗" : "✓"} ${name}${info ? ` · 主区 ${info.text} 字${info.loading ? " · 还在读取" : ""}` : ""}${resources.length ? ` · 资源加载失败 ${resources.length}` : ""}${problems.length ? `\n    ${problems.join("\n    ")}` : ""}`);
  errors = []; writes = []; resources = [];
};
for (const route of ROUTES) {
  await send("Page.navigate", { url: `${base}/#/${route}` }); await sleep(route === "" ? 2500 : 1800);
  await shot(`${String(ROUTES.indexOf(route) + 1).padStart(2, "0")}-${route.replace(/\//g, "_") || "home"}`);
  await check(`/${route}`);
}
// ⌘K 面板：按键打开，核对面板出现并有结果行，Esc 关闭
await js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })); await new Promise((r) => setTimeout(r, 800));`);
await shot("23-cmdk");
await check("⌘K 命令面板", `{ open: !!document.querySelector(".cmdk"), rows: document.querySelectorAll(".cmdk [role=option], .cmdk li, .cmdk button").length }`);
if (!results.at(-1).info?.open) { results.at(-1).ok = false; results.at(-1).problems.push("⌘K 面板没有打开"); }
await js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await new Promise((r) => setTimeout(r, 300));`);
// 自言自语抽屉：点窗口条按钮打开，核对抽屉出现
await js(`document.querySelector(".chrome-btn")?.click(); await new Promise((r) => setTimeout(r, 1500));`);
await shot("24-selftalk");
await check("自言自语抽屉", `{ open: !!document.querySelector("aside.selftalk") }`);
if (!results.at(-1).info?.open) { results.at(-1).ok = false; results.at(-1).problems.push("抽屉没有打开"); }

const failed = results.filter((r) => !r.ok);
const summary = { base, width, at: new Date().toISOString(), version: results[0]?.info?.version || "", pages: results.length, failed: failed.length, results };
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`\n${results.length} 项，${failed.length} 项有问题；截图与 summary.json 在 ${out}`);
ws.close(); await cleanup();
process.exit(failed.length ? 1 : 0);
