import { href } from "../../router.js";
import { PROMO_FIELDS, deliveryMonth, shortMonth } from "../../constants.js";

// ⌘K 命令面板的索引与搜索（第三轮提案 2）。只用页面已经读到的接口建索引，不新增接口；这里全是纯函数，便于测试。
// 条目：{ id, kind, title, sub, keys, href | copy, icon, go, preview, sample }。href 打开页面；copy 是要复制的文字。

export const SCOPES = [["all", "全部"], ["page", "页面"], ["sku", "SKU"], ["school", "学校"], ["need", "需求"], ["doc", "文档"], ["action", "操作"]];
const ORDER = ["sku", "action", "school", "need", "doc", "page"];
export const GROUP_LABEL = { recent: "最近", page: "页面", sku: "SKU", school: "学校", need: "主线需求", doc: "文档 · 知识库", action: "操作" };

// 页面与页签：标题写「模块 · 页签」，keys 带英文路由名，输入 price、kb 也能找到。
const PAGES = [
  ["home", "首页", "home", "今日日程、交付月、待我处理"],
  ["marketing/campaign", "营销 · 营销战役", "marketing", "本月战役的节点、物料决定与复盘"],
  ["marketing/plans", "营销 · 月度促销", "marketing", "按月份、业务线录入促销方案，下方是方案汇总"],
  ["marketing/prices", "营销 · 价格记录", "price", "各 SKU 的价格方案：总价、单价和毛利"],
  ["marketing/materials", "营销 · 物料沉淀", "image", "物料墙、营销物料、设计参考"],
  ["marketing/brief", "营销 · 设计 brief", "brief", "交付月物料的设计需求"],
  ["user/timeline", "用户 · 用户时间线", "timeline", "各国大学的选课、开学、考试、出分"],
  ["user/timeline/country", "用户 · 时间线明细表", "timeline", "按国家看每所学校的全部节点"],
  ["user/timeline/anomalies", "用户 · 时间线异常待确认", "alert", "日期冲突、不完整，需要人工确认"],
  ["user/strategy", "用户 · 用户策略", "user", "主线需求 → 拆解 → 行动"],
  ["voice", "Voice", "voice", "留学之声：大家在说什么"],
  ["brand", "品牌", "brand", "品牌资料"],
  ["business", "业务", "business", "营收与业务线指标"],
  ["projects/board", "项目 · 项目推进", "project", "各项目的阶段、节点和负责人"],
  ["projects/mentor", "项目 · 管培带教", "mentor", "管培生日志、卡点与提问"],
  ["kb", "知识库", "kb", "整理「常浩的知识库」"],
  ["assistants", "Agent", "agent", "文案助手等 Agent 对话"],
  ["reports", "日/周报", "reports", "日报、周报"],
  ["settings", "设置", "settings", "数据源、口径与配置"],
];

export function buildPages() {
  return PAGES.map(([path, title, icon, sub]) => ({
    id: `page:${path}`, kind: "page", title, sub, keys: path.replace(/\//g, " "), icon, go: "跳转",
    href: href(...path.split("/")), preview: { kind: "page", desc: sub },
  }));
}

const policyText = (r) => `${r.month} ${r.line} · ${r.sku}\n${PROMO_FIELDS.map(([f, l]) => `${l}：${r[f]}`).join("\n")}`;

// SKU：按「业务线 + SKU」合并促销表，预览用最近一个月的政策。
export function buildSkus(promos = []) {
  const bySku = new Map();
  for (const r of promos) {
    const key = `${r.line}|${r.sku}`;
    if (!bySku.has(key)) bySku.set(key, []);
    bySku.get(key).push(r);
  }
  return [...bySku.values()].map((rows) => {
    rows.sort((a, b) => b.month.localeCompare(a.month));
    const [latest] = rows;
    return {
      id: `sku:${latest.line}|${latest.sku}`, kind: "sku", title: `${latest.sku} · ${latest.line}`, sub: `正价 ${latest.price}`,
      keys: `${latest.sku} ${latest.line}`, icon: "price", go: "档案",
      href: href("marketing", "sku", latest.line, latest.sku),
      preview: { kind: "sku", line: latest.line, sku: latest.sku, latest, months: rows.map((r) => r.month) },
    };
  });
}

// 学校：来自时间线明细表；预览列出今天以后最近的 4 个节点。
export function buildSchools(tl, today) {
  if (!tl?.table) return [];
  const names = Object.fromEntries(tl.countries || []);
  return Object.entries(tl.table).flatMap(([code, rows]) => rows.map((s) => {
    const full = s.abbr ? `${s.school} ${s.abbr}` : s.school;
    const next = (tl.agenda || [])
      .filter((e) => (e.school === full || e.school.startsWith(s.school)) && (e.to || e.from) >= today)
      .sort((a, b) => a.from.localeCompare(b.from)).slice(0, 4);
    return {
      id: `school:${code}|${s.school}`, kind: "school", title: full, sub: names[code] || code,
      keys: `${s.abbr || ""} ${names[code] || ""}`, icon: "timeline", go: "明细表",
      href: href("user", "timeline", "country", s.abbr || s.school),
      preview: { kind: "school", country: names[code] || code, next },
    };
  }));
}

export function buildNeeds(data) {
  return (data?.needs || []).map((n) => ({
    id: `need:${n.id}`, kind: "need", title: `${n.seg} · ${n.node}`, sub: `${n.when} · ${n.schools} 校 · ${n.status}`,
    keys: `${n.need} ${n.pain}`, icon: "target", go: "用户策略",
    href: href("user", "strategy", n.id), preview: { kind: "need", need: n },
  }));
}

// 文档：遍历知识库目录树，只收文件；路径写到上一级目录。
export function buildDocs(kb) {
  if (!kb?.tree) return [];
  const out = [];
  const walk = (nodes, path) => nodes.forEach((n) => {
    if (n.file) {
      const d = kb.docs?.[n.id] || {};
      out.push({
        id: `doc:${n.id}`, kind: "doc", title: n.name, sub: path.join(" / ") || "根目录",
        keys: `${(d.tags || []).join(" ")} ${d.excerpt || ""}`, icon: "file", go: "知识库",
        href: href("kb", n.id), preview: { kind: "doc", path: path.join(" / ") || "根目录", doc: d },
      });
    }
    if (n.kids) walk(n.kids, [...path, n.name]);
  });
  walk(kb.tree, []);
  return out;
}

// 操作：跳到能完成这件事的页面；「复制政策」直接复制，不离开当前页。
export function buildActions(promos = [], dm = deliveryMonth()) {
  const m = shortMonth(dm);
  const fixed = [
    ["plans", `录入 ${m}促销方案`, "edit", "月度促销 · 粘贴方案原文 → 解析 → 确认", href("marketing", "plans", dm, "大学辅导")],
    ["campaign", `打开 ${m}营销战役`, "marketing", "节点、物料决定与复盘", href("marketing", "campaign")],
    ["brief", `写 ${m}设计 brief`, "brief", "逐节填写，文案助手可以起草", href("marketing", "brief")],
    ["wall", "看物料墙", "image", "每月交付了哪些物料、沿用了哪一版", href("marketing", "materials", "wall")],
    ["anomalies", "处理时间线异常", "alert", "冲突和推测的日期，逐条确认", href("user", "timeline", "anomalies")],
    ["needs", "审主线需求", "target", "采纳后才拆解策略、才能被促销关联", href("user", "strategy")],
    ["chat", "和 Agent 新开对话", "agent", "文案助手等", href("assistants")],
  ].map(([key, title, icon, sub, to]) => ({ id: `action:${key}`, kind: "action", title, sub, keys: key, icon, go: "跳转", href: to, preview: { kind: "action", desc: sub } }));
  const copies = buildSkus(promos).map(({ preview: { latest } }) => ({
    id: `action:copy|${latest.line}|${latest.sku}`, kind: "action", title: `复制 ${latest.sku}（${latest.line}）${shortMonth(latest.month)}政策`,
    sub: "试听 / 正价 / 新签 / 续费", keys: "copy 复制政策", icon: "copy", go: "复制",
    copy: policyText(latest), preview: { kind: "action", desc: `把 ${latest.month} 的四项政策复制到剪贴板，不离开当前页。` },
  }));
  return [...fixed, ...copies];
}

// 输入以「>」开头时只搜操作。
export function parseQuery(text, scope) {
  const t = text.trimStart();
  if (t.startsWith(">")) return { scope: "action", q: t.slice(1).trim() };
  return { scope, q: text.trim() };
}

// 打分：标题开头命中 3，标题包含 2，副标题或关键词包含 1，不命中 0。不区分大小写；空格分开的几个词都要命中。
export function score(item, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const title = item.title.toLowerCase(), rest = `${item.sub || ""} ${item.keys || ""}`.toLowerCase();
  let total = 0;
  for (const w of words) {
    const s = title.startsWith(w) ? 3 : title.includes(w) ? 2 : rest.includes(w) ? 1 : 0;
    if (!s) return 0;
    total += s;
  }
  return total;
}

// 搜索结果按组排列；「全部」里每组最多 perGroup 条，单一范围最多 50 条。空输入返回 null，由面板显示「最近」。
export function search(items, text, scope = "all", perGroup = 5) {
  const p = parseQuery(text, scope);
  if (!p.q) return null;
  const hits = items.filter((it) => p.scope === "all" || it.kind === p.scope)
    .map((it) => [it, score(it, p.q)]).filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);
  return ORDER.map((kind) => {
    const list = hits.filter(([it]) => it.kind === kind).map(([it]) => it);
    return { kind, label: GROUP_LABEL[kind], total: list.length, items: list.slice(0, p.scope === "all" ? perGroup : 50) };
  }).filter((g) => g.total);
}

// 最近打开：存在本机浏览器里，最多 5 条；只存能跳转的条目。读写失败时当作没有记录。
export const RECENT_KEY = "work-desk:cmdk-recent";
export function readRecent(getStorage = () => globalThis.localStorage) {
  try { const v = JSON.parse(getStorage().getItem(RECENT_KEY)); return Array.isArray(v) ? v.filter((x) => x && x.id && x.href) : []; }
  catch { return []; }
}
export function pushRecent(item, getStorage = () => globalThis.localStorage) {
  const entry = { id: item.id, kind: item.kind, title: item.title, sub: item.sub, icon: item.icon, href: item.href, go: item.go };
  const next = [entry, ...readRecent(getStorage).filter((x) => x.id !== item.id)].slice(0, 5);
  try { getStorage().setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* 存储不可用时只是不记最近 */ }
  return next;
}
