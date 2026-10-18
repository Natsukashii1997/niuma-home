// 牛马之家 · 收藏（后台）：把「当前标签页」的飞书文档地址发给本机牛马之家的 POST /api/v3/kb/collect。
// 地址取浏览器给的标签页地址，不信任页面内容；只发 origin + pathname，不带查询参数。
// 同一篇文档请求没拿到回应（断网、超时）时保留 requestId，再点一次用同一个 requestId 去问，后端只执行一次，不会重复创建。

const DOC = /^\/(wiki|docx|sheets|base|slides|mindnotes|file)\/[A-Za-z0-9]+/;
const ready = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

function docUrl(raw) {
  try {
    const u = new URL(raw), h = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.username || u.password || u.port || !(h.endsWith(".feishu.cn") || h.endsWith(".larksuite.com")) || !DOC.test(u.pathname)) return "";
    return u.origin + u.pathname;
  } catch { return ""; }
}

async function settings() {
  await ready;
  const { code = "", port = 5280 } = await chrome.storage.local.get(["code", "port"]);
  return { code, base: `http://127.0.0.1:${Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : 5280}` };
}

async function post(body) {
  const { code, base } = await settings();
  if (!/^[a-f0-9]{64}$/.test(code)) return { ok: false, kind: "pairing", error: "还没填配对码：点浏览器右上角的拼图图标 →「牛马之家 · 收藏」，填入牛马之家「设置 → 扩展配对码」" };
  let r;
  try {
    r = await fetch(`${base}/api/v3/kb/collect`, { method: "POST", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(60000), headers: { "content-type": "application/json", "x-niuma-collect-code": code }, body: JSON.stringify(body) });
  } catch { return { ok: false, kind: "offline", error: "没连上牛马之家：请确认本机牛马之家在运行" }; }
  const data = await r.json().catch(() => null);
  if (r.ok) return { ok: true, ...data };
  if (data?.code === "COLLECT_PAIRING_REQUIRED") return { ok: false, kind: "pairing", error: "配对码不对或已更换：到牛马之家「设置 → 扩展配对码」复制新码，点拼图图标重新填写" };
  if (data?.receipt || data?.code === "COLLECT_PENDING" || r.status >= 500) return { ok: false, kind: "unknown", error: data?.error || `牛马之家返回 ${r.status}`, receipt: data?.receipt };
  if (r.status === 404 && !data?.code) return { ok: false, kind: "error", error: "牛马之家还没有收藏接口（待 T12 后端交付）" };
  return { ok: false, kind: "error", error: data?.error || `收藏失败（${r.status}）` };
}

async function collect(sender) {
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) throw new Error("只能从飞书文档页收藏");
  const url = docUrl(sender.tab.url || sender.url);
  if (!url) throw new Error("这个页面不是飞书文档");
  await ready;
  const { pending = {} } = await chrome.storage.local.get("pending");
  const requestId = pending[url] || crypto.randomUUID();
  pending[url] = requestId;
  await chrome.storage.local.set({ pending });
  const res = await post({ url, requestId });
  // 只有没拿到回应时保留 requestId；其余（成功、明确失败、结果不明已有记录）都清掉，后端按文档锁住未核对的记录。
  if (res.kind !== "offline") { delete pending[url]; await chrome.storage.local.set({ pending }); }
  return res;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "COLLECT") {
    collect(sender).then(reply, (e) => reply({ ok: false, kind: "error", error: e.message }));
    return true;
  }
  if (msg?.type === "OPEN_HOME") {
    settings().then(({ base }) => chrome.tabs.create({ url: `${base}/#/kb/collect` }));
    return false;
  }
  if (msg?.type === "CHECK") {
    // 用空链接试一次：配对正确会得到 400 COLLECT_URL_INVALID（什么都不会写入）。
    settings().then(async ({ code, base }) => {
      if (!/^[a-f0-9]{64}$/.test(code)) return reply({ ok: false, error: "配对码应为 64 位小写十六进制" });
      try {
        const r = await fetch(`${base}/api/v3/kb/collect`, { method: "POST", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(10000), headers: { "content-type": "application/json", "x-niuma-collect-code": code }, body: JSON.stringify({ url: "", requestId: crypto.randomUUID() }) });
        const data = await r.json().catch(() => null);
        reply(data?.code === "COLLECT_URL_INVALID" ? { ok: true } : { ok: false, error: data?.code === "COLLECT_PAIRING_REQUIRED" ? "配对码不对" : data?.error || `牛马之家返回 ${r.status}` });
      } catch { reply({ ok: false, error: "没连上牛马之家" }); }
    });
    return true;
  }
  return false;
});
