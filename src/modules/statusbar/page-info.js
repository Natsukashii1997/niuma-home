import { daysToDeadline, shiftMonth } from "../../constants.js";

// 底栏「跟着页面」（用户 2026-10-19 选定 C 版）：最前面一个彩色小方块，后面直接写这一页的数据从哪来、新不新、要注意什么；
// 右边写这一页能按的快捷键。没有自己数据源的页面（品牌、业务、项目、Agent、设置）和首页一样显示全部来源。
// 方块：ok 绿 = 正常；warn 琥珀 = 读取失败、太久没同步或截止 ≤3 天；off 灰空心 = 未接入或从没读过。

export const STALE_DAYS = 7;
const toDate = (at) => new Date(String(at).replace(" ", "T"));
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const short = (at, now) => (sameDay(toDate(at), now) ? at.slice(11, 16) : at.slice(5, 16));

// 一个来源 → { label, tone, value, title }。stale 为 true 时，超过 STALE_DAYS 天没成功也标琥珀。
export function sourceItem(label, s, { stale = false, now = new Date() } = {}) {
  if (!s || s.state === "off") return { label, tone: "off", value: "未接入", title: `${label}：接口还没实现` };
  if (s.state === "never") return { label, tone: "off", value: "未读取", title: `${label}：已接入，还没有成功读取过` };
  if (s.state === "error") return { label, tone: "warn", value: s.at ? `失败 · 上次 ${short(s.at, now)}` : "失败", title: `${label}：${s.error || "最近一次读取失败"}${s.at ? `（上次成功 ${s.at}）` : ""}` };
  const days = s.at ? Math.floor((now - toDate(s.at)) / 86400000) : 0;
  if (stale && days >= STALE_DAYS) return { label, tone: "warn", value: `${short(s.at, now)} · ${days} 天没同步`, title: `${label}已经 ${days} 天没同步（上次 ${s.at}）` };
  return { label, tone: "ok", value: s.at ? short(s.at, now) : "正常", title: `${label}：最近一次成功 ${s.at || ""}` };
}

// 底栏浮层与首页汇总用的全部来源（与 /api/v3/status 的 sources 对应）。
export function allSources(src = {}, now = new Date()) {
  const nas = src.nas?.state === "ok"
    ? { label: "NAS", tone: "ok", value: `${src.nas.network || "已连接"}${src.nas.thumbBytes != null ? ` · 缩略图 ${Math.round(src.nas.thumbBytes / 1048576)} MB` : ""}`, title: `NAS：最近一次扫描 ${src.nas.at || ""}` }
    : sourceItem("NAS", src.nas, { now });
  return [
    { group: "飞书", ...sourceItem("日报", src.daily, { now }) },
    { group: "飞书", ...sourceItem("周报", src.weekly, { now }) },
    { group: "飞书", ...sourceItem("时间线", src.timeline, { stale: true, now }) },
    { group: "飞书", ...sourceItem("知识库", src.kb, { now }) },
    { group: "NAS", ...nas },
    { group: "Voice", ...voiceItem(src.voice, now) },
  ];
}

function voiceItem(v, now) {
  if (v?.state === "ok" && v.limit) return { label: "Voice", tone: v.used >= v.limit * 0.8 ? "warn" : "ok", value: `本月 ¥${Number(v.used).toFixed(2)} / ${v.limit}`, title: `本月预算 ${v.limit} 元，已用 ${Number(v.used).toFixed(2)} 元` };
  return sourceItem("Voice", v, { now });
}

// 交付截止 = 交付月前一个月最后一天。
export function deliveryOf(now = new Date()) {
  const month = shiftMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, 1);
  const [y, m] = month.split("-").map(Number);
  const end = new Date(y, m - 1, 0);
  return { month, label: `${m} 月`, deadline: `${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`, days: daysToDeadline(month, now) };
}

const worst = (items) => (items.some((i) => i.tone === "warn") ? "warn" : items.some((i) => i.tone === "ok") ? "ok" : "off");
const latest = (src, now) => {
  const at = Object.values(src).filter((s) => s?.state === "ok" && s.at).map((s) => s.at).sort().pop();
  return at ? short(at, now) : "";
};

// 书柜里真能用的操作（用户 2026-10-23：原先列的 ⌘Z / ⇧⌘N / F2 / ⌘X ⌘V 都没实现，换掉）；搜索是底栏的 ⌘K 按钮
const KB_KEYS = [["拖动", "移到别的层或盒子"], ["悬停层名", "改名"]];

// segments：每段是若干片，片为字符串或 { hot }（信号橙数字）；段与段之间画竖线。
// 返回 { tone, segments, title, keys }；keys 为本页快捷键，不含 ⌘K（⌘K 由底栏另外放一个可点的按钮）。
export function pageInfo(page, { data, error, todos, now = new Date() } = {}) {
  if (!data) return error
    ? { tone: "warn", segments: [["状态读取失败"]], title: String(error), keys: [] }
    : { tone: "off", segments: [["读取状态…"]], title: "", keys: [] };
  const src = data.sources || {};
  const d = deliveryOf(now);
  const deliverySeg = [`交付 ${d.label} · 截止 ${d.deadline} · 剩 `, { hot: String(d.days) }, " 天"];
  const one = (item, extra = []) => ({ tone: item.tone, segments: [[`${item.label} ${item.value}${item.tone === "ok" && /\d:\d\d$/.test(item.value) ? " 同步" : ""}`], ...extra], title: item.title, keys: [] });

  if (page === "marketing") return { tone: d.days <= 3 ? "warn" : "ok", segments: [deliverySeg], title: "交付截止：交付月前一个月的最后一天", keys: [] };
  if (page === "user") {
    const t = sourceItem("时间线", src.timeline, { stale: true, now });
    const anomaly = (todos || []).find((x) => x.kind === "时间线");
    const label = anomaly?.text.replace(/条异常待确认$/, "条AI推测");
    const n = label && /^(\d+)\s*(.*)$/.exec(label);
    return one(t, n ? [[{ hot: n[1] }, ` ${n[2]}`]] : anomaly ? [[label]] : []);
  }
  if (page === "kb") return { ...one(sourceItem("知识库", src.kb, { now }), [["只建快捷方式，不动原文"]]), keys: KB_KEYS };
  if (page === "reports") {
    const items = [sourceItem("日报", src.daily, { now }), sourceItem("周报", src.weekly, { now })];
    const text = items.map((i) => `${i.label} ${i.value}`).join(" · ") + (items.every((i) => i.tone === "ok") ? " 同步" : "");
    return { tone: worst(items), segments: [[text]], title: items.map((i) => i.title).join("\n"), keys: [] };
  }
  if (page === "voice") return one(voiceItem(src.voice, now));

  // 首页及没有专属来源的页面：全部来源汇总 + 交付倒数
  const items = allSources(src, now), on = items.filter((i) => i.tone !== "off"), bad = items.filter((i) => i.tone === "warn");
  const last = latest(src, now);
  const head = bad.length ? `${bad.length} 个来源异常：${bad.map((i) => i.label).join("、")}`
    : on.length ? `${on.length}/${on.length} 个来源正常${last ? ` · 最近 ${last}` : ""}` : "数据源都还没读取";
  return { tone: worst(items), segments: [[head], deliverySeg], title: "点开看各来源最近一次读取时间", keys: [] };
}
