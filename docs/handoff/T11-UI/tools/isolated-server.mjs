// 隔离验收启动器（会话临时文件，不进仓库）：复用 t10 真实路由，飞书项目/战役读取换成合成数据；
// PATH 首位放 lark-cli / codex 失败替身，其他外部读取一律失败，不可能触达真实飞书或模型。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const ROOT = process.env.T10_ROOT, DIST = process.env.T10_DIST, port = Number(process.env.PORT);
if (!process.env.WORKDESK_DATA_DIR || !DIST || !port || port === 5280) throw new Error("必须指定隔离数据目录、构建目录和非 5280 端口");
const imp = (p) => import(path.join(ROOT, p));
// 网络兜底：服务端只允许访问本机，其他地址一律拒绝（防止任何真实外部读取）。
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => { const u = new URL(String(url)); if (!["127.0.0.1", "localhost"].includes(u.hostname)) return Promise.reject(new Error(`隔离验收：拒绝访问外部地址 ${u.hostname}`)); return realFetch(url, opts); };
// 合成 Codex 重置来源（不是 aihot.news 的真实数据）：CODEX_SCENARIO=unknown 时不给重置时间。
const codexSource = () => {
  const now = Date.now(), iso = (ms) => new Date(ms).toISOString();
  const scheduled = process.env.CODEX_SCENARIO !== "unknown";
  return { checkedAt: iso(now - 600000),
    events: scheduled ? [{ id: "syn-e1", status: "announced", schedule: { from: iso(now + 2 * 86400000), through: iso(now + 2 * 86400000 + 5 * 3600000), label: "北京时间 合成 · 两天后 15:00" } }] : [],
    activities: [{ id: "syn-p1", kind: "event_update", action: "announce", eventIds: ["syn-e1"], publishedAt: iso(now - 3600000), url: "https://x.com/synthetic_author/status/1", originalText: "Synthetic notice for isolated acceptance: usage limits reset window is announced, this sentence is intentionally long to test wrapping.", text: "合成公告（隔离验收用）：用量重置窗口已预告，这句话故意写长，用来检查换行。" }] };
};
const { openDb } = await imp("server/db.mjs");
const { json, match } = await imp("server/http.mjs");
const marketing = await imp("server/routes/marketing.mjs"), assistants = await imp("server/routes/assistants.mjs"), workspace = await imp("server/routes/workspace.mjs"), v3 = await imp("server/routes/v3.mjs");
const projectSource = { people: [],
  projects: [{ id: "remote-a", 项目名称: "飞书模板 · 院校合作推进", 状态: ["推进中"] }, { id: "remote-b", 项目名称: "飞书模板 · 管培轮岗", 状态: ["调研中"] }],
  nodes: [
    { id: "n1", 所属项目: [{ id: "remote-a" }], 任务事项: "需求访谈", 节点类型: [], 环节阶段: ["调研阶段"], 是否完成: true, 截止时间: null },
    { id: "n2", 所属项目: [{ id: "remote-a" }], 任务事项: "方案评审", 节点类型: [], 环节阶段: ["实施阶段"], 是否完成: false, 截止时间: null },
    { id: "n3", 所属项目: [{ id: "remote-b" }], 任务事项: "轮岗排期", 节点类型: [], 环节阶段: ["实施阶段"], 是否完成: false, 截止时间: null },
  ] };
const campaignRows = [
  { id: "c1", 模板序号: 1, 任务事项: "确定主题", 节点类型: ["普通任务"], 环节阶段: ["筹备阶段"], 父记录: [] },
  { id: "c2", 模板序号: 2, 任务事项: "物料上线", 节点类型: ["普通任务"], 环节阶段: ["实施阶段"], 父记录: [] },
];
const v3Options = { codex: { fetcher: async () => new Response(JSON.stringify(codexSource()), { status: 200, headers: { "content-type": "application/json" } }) }, projects: { readSource: async () => structuredClone(projectSource) }, campaign: { readSource: async () => ({ rows: structuredClone(campaignRows), rev: 1 }) } };
const db = openDb();
const routes = [...marketing.routes(db), ...assistants.routes(db), ...workspace.routes(db, undefined, undefined, v3Options), ...v3.routes(db)];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) {
    const asked = path.join(DIST, path.normalize(url.pathname));
    const file = asked.startsWith(DIST + path.sep) && path.extname(asked) ? asked : path.join(DIST, "index.html");
    const body = await readFile(file).catch(() => null);
    if (!body) return json(res, 404, { error: "文件不存在" });
    res.writeHead(200, { "content-type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
    return res.end(body);
  }
  const found = match(routes, req.method, url.pathname);
  if (!found) return json(res, 404, { error: "接口不存在" });
  try { await found.handler(req, res, { params: found.params, url }); } catch (e) { console.error(e); json(res, 500, { error: e.message }); }
}).listen(port, "127.0.0.1", () => console.log(`隔离验收 http://127.0.0.1:${port} 数据=${process.env.WORKDESK_DATA_DIR}`));
