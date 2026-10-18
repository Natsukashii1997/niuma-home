// 扩展隔离实测：Playwright 自带 Chromium 加载未打包扩展；synthetic.feishu.cn 的请求被拦截、直接返回合成页面（不走网络）；
// 浏览器代理指向不存在的本机端口，除 127.0.0.1 外一律连不出去；收藏接口为 5293 隔离服务。
import { mkdtempSync } from "node:fs";
import path from "node:path";
const [EXT, OUT, PW, DIR] = process.argv.slice(2);
const { chromium } = await import(path.join(PW, "playwright/index.mjs"));
const B = "http://127.0.0.1:5293";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (name, cond, extra = "") => console.log(`${cond ? "通过" : "失败"} · ${name}${extra ? " · " + extra : ""}`);

const page_html = (p) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>合成文档页</title><style>body{margin:0;font:15px/1.8 -apple-system,"PingFang SC",sans-serif;color:#1f2329;background:#fff}header{height:56px;display:flex;align-items:center;padding:0 24px;border-bottom:1px solid #e5e6eb;color:#646a73;font-size:13px}main{max-width:760px;margin:40px auto;padding:0 24px}h1{font-size:30px;margin:0 0 16px}p{color:#3c4043}.note{padding:8px 12px;background:#f5f6f7;font-size:13px;color:#646a73}</style></head><body><header>合成文档页（隔离验收，不是飞书）· ${p}</header><main><h1>${{ "/wiki/MktDoc001": "双十一促销方案（合成）", "/docx/MultiDoc002": "AI 营销复盘（合成）", "/wiki/NoHit003": "读书笔记：城市漫游（合成）", "/file/CloudFile006": "云盘文件（合成）", "/wiki/Unknown008": "Agent 提示词笔记（合成）" }[p] || "合成页面"}</h1><p class="note">这是隔离验收用的合成页面，地址 synthetic.feishu.cn 的请求在测试浏览器里被拦截，由本机直接返回这页，不访问网络。</p><p>正文段落一：用于检查右下角按钮不遮挡主要内容。</p><p>正文段落二。</p></main></body></html>`;

// 接口层：来源校验与 requestId 去重（不经扩展，直接打 5293）
const pairing = await (await fetch(`${B}/api/v3/kb/collect/pairing`)).json();
const post = (headers, body) => fetch(`${B}/api/v3/kb/collect`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }).then(async (r) => [r.status, await r.json()]);
let [st, body] = await post({ origin: "https://evil.example" }, { url: "https://synthetic.feishu.cn/wiki/NoHit003", requestId: crypto.randomUUID() });
ok("外来 Origin 被拒", st === 403, `${st} ${body.code}`);
[st, body] = await post({ origin: "chrome-extension://abc" }, { url: "https://synthetic.feishu.cn/wiki/NoHit003", requestId: crypto.randomUUID() });
ok("扩展来源无配对码被拒", st === 403 && body.code === "COLLECT_PAIRING_REQUIRED", `${st}`);
[st, body] = await post({ origin: "chrome-extension://abc", "x-niuma-collect-code": "0".repeat(64) }, { url: "", requestId: crypto.randomUUID() });
ok("扩展来源错码被拒", st === 403, `${st}`);
const pr = await fetch(`${B}/api/v3/kb/collect/pairing`, { headers: { origin: "chrome-extension://abc" } });
ok("扩展来源读不到配对码", pr.status === 403, `${pr.status}`);

const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(DIR, "profile-")), {
  channel: "chromium", headless: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--proxy-server=http://127.0.0.1:9", "--disable-background-networking", "--disable-component-update", "--no-pings", "--disable-sync", "--disable-domain-reliability"],
});
const outside = new Set();
await ctx.route("**/*", (route) => { const u = new URL(route.request().url()); if (u.hostname === "synthetic.feishu.cn") return route.fulfill({ contentType: "text/html; charset=utf-8", body: page_html(u.pathname) }); if (["127.0.0.1", "localhost"].includes(u.hostname) || u.protocol === "chrome-extension:") return route.continue(); outside.add(u.host); return route.abort(); });
let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
sw.on("console", (m) => console.log("SW: " + m.text()));
const extId = new URL(sw.url()).host;
const page = await ctx.newPage();
const doc = async (p) => { await page.goto(`https://synthetic.feishu.cn${p}`); await sleep(1500); };
const click = async () => { await page.locator("button.main").click(); await sleep(1500); return (await page.locator(".tip").innerText().catch(() => "")).replace(/\n/g, " / "); };
const shot = (name) => page.screenshot({ path: path.join(OUT, name) });

await doc("/wiki/MktDoc001");
ok("文档页出现收藏按钮", await page.locator("button.main").isVisible());
let t = await click();
ok("未配对时提示去填配对码", /需要配对/.test(t), t);
await shot("扩展-未配对-1440.png");

// 弹窗：错码 → 检查不通过；正确码 + 端口 5293 → 配对成功
const pop = await ctx.newPage();
await pop.setViewportSize({ width: 330, height: 430 });
await pop.goto(`chrome-extension://${extId}/popup.html`);
await pop.fill("#code", "f".repeat(64)); await pop.fill("#port", "5293"); await pop.click("button[type=submit]"); await sleep(1200);
ok("弹窗：错码检查不通过", /检查没通过/.test(await pop.locator("#status").innerText()), await pop.locator("#status").innerText());
await pop.fill("#code", pairing.code); await pop.click("button[type=submit]"); await sleep(1200);
const popStatus = await pop.locator("#status").innerText();
ok("弹窗：正确码配对成功", /配对成功/.test(popStatus), popStatus);
await pop.fill("#code", "");
await pop.screenshot({ path: path.join(OUT, "扩展-弹窗配对成功.png") });
await pop.close();

await doc("/wiki/MktDoc001");
t = await click(); ok("唯一命中：已收藏", /已收藏到「📢 营销策划」/.test(t), t); await shot("扩展-已收藏-1440.png");
t = await click(); ok("再点同一篇：已在库中，不新建", /已经在知识库里了/.test(t), t); await shot("扩展-已在库中-1440.png");
await doc("/docx/MultiDoc002");
t = await click(); ok("多命中：取排最前的", /已收藏到「📢 营销策划」/.test(t) && /排最前/.test(t), t);
await doc("/file/CloudFile006");
t = await click(); ok("云盘来源：没有收藏", /没有收藏/.test(t) && /云盘/.test(t), t); await shot("扩展-云盘来源-1440.png");
await doc("/drive/home");
ok("非文档页不显示按钮", (await page.locator("button.main").count()) === 0);
await doc("/wiki/Unknown008");
t = await click(); ok("结果不明：停住并引导去核对", /结果不明/.test(t), t); await shot("扩展-结果不明-1440.png");
t = await click(); ok("结果不明后再点：仍锁住", /结果不明/.test(t), t);
const before = ctx.pages().length;
const homeBtn = page.locator(".tip button.link", { hasText: "去牛马之家核对" });
ok("「去牛马之家核对」按钮可见", await homeBtn.isVisible());
if (await homeBtn.count()) await homeBtn.click(); await sleep(2000);
const home = ctx.pages().slice(before)[0];
ok("「去牛马之家核对」打开收藏页", Boolean(home) && home.url().startsWith(`${B}/`), home ? home.url() : `页面数 ${ctx.pages().length}，SW 日志见下`);
if (home) await home.close();

// 断网：端口改到没人监听的 5299 → 提示没连上；改回 5293 再点 → 收藏一次
await sw.evaluate(() => chrome.storage.local.set({ port: 5299 }));
await doc("/wiki/NoHit003");
t = await click(); ok("没连上牛马之家", /没连上/.test(t), t);
const pend = await sw.evaluate(() => chrome.storage.local.get("pending"));
ok("断网后保留 requestId", Object.keys(pend.pending || {}).length === 1);
await sw.evaluate(() => chrome.storage.local.set({ port: 5293 }));
t = await click(); ok("恢复后再点：兜底目录收藏", /已收藏到「🗃️ 杂项其他」/.test(t), t);
const pend2 = await sw.evaluate(() => chrome.storage.local.get("pending"));
ok("收藏后清掉 requestId", Object.keys(pend2.pending || {}).length === 0);

// 配对码被换掉：扩展里的旧码失效
await sw.evaluate(() => chrome.storage.local.set({ code: "e".repeat(64) }));
await doc("/wiki/MktDoc001");
t = await click(); ok("配对码不对：提示重新填写", /需要配对/.test(t) && /不对/.test(t), t);

// requestId 去重（接口层）：同一 requestId 两次只建一条
const rid = crypto.randomUUID();
const a = await post({}, { url: "https://synthetic.feishu.cn/docx/MultiDoc002", requestId: rid });
const b = await post({}, { url: "https://synthetic.feishu.cn/docx/MultiDoc002", requestId: rid });
ok("同一 requestId 返回同一结果", JSON.stringify(a) === JSON.stringify(b), `${a[0]}`);
const recent = await (await fetch(`${B}/api/v3/kb/collect/recent`)).json();
ok("最近收藏条数", true, recent.items.map((x) => `${x.title}:${x.status}`).join("，"));

ok("页面没有请求其他外部地址", outside.size === 0, [...outside].join(","));
await ctx.close();
console.log(log.join("\n"));
