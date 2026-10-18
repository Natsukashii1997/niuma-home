// 无头 Chrome 截图器（会话临时文件）：全新临时配置目录，只访问 127.0.0.1 隔离服务。
// 用法：node shot.mjs <steps.json>；steps: [{url, width, height, eval?, wait?, out?, full?}]
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const steps = JSON.parse(readFileSync(process.argv[2], "utf8"));
const profile = mkdtempSync(path.join(process.env.SHOT_TMP || tmpdir(), "chrome-"));
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const wait = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expr) => { const r = await send("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value; };
await send("Page.enable"); await send("Runtime.enable");
const results = [];
try {
  for (const s of steps) {
    if (s.width) await send("Emulation.setDeviceMetricsOverride", { width: s.width, height: s.height, deviceScaleFactor: 2, mobile: s.width < 768 });
    if (s.url) { await send("Page.navigate", { url: s.url }); await sleep(s.wait ?? 1800); }
    if (s.eval) { results.push({ step: s.name, value: await run(s.eval) }); await sleep(s.after ?? 600); }
    if (s.out) {
      let clip;
      if (s.clip) { const r = await run(`const el=document.querySelector(${JSON.stringify(s.clip)}); scrollTo(0,0); await new Promise(r=>setTimeout(r,200)); const b=el.getBoundingClientRect(); return {x:b.x+scrollX-8,y:b.y+scrollY-8,width:b.width+16,height:b.height+16};`); clip = { ...r, scale: 1 }; }
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!(s.full || clip), ...(clip ? { clip } : {}) });
      writeFileSync(s.out, Buffer.from(shot.result.data, "base64")); results.push({ step: s.name, out: s.out });
    }
  }
} finally { console.log(JSON.stringify(results, null, 1)); ws.close(); chrome.kill(); }
