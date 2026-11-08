// 月度用户策略 v2 页面的纯逻辑（docs/策略规则/03-Schema-v2.md 第 2、3.3、6 节）：标签推导、证据与日期显示、两份月度文档的差异。
// 页面标签由 status + evidenceStrength 推导，不存储；这里不读接口、不改输入，便于测试。

export const REGIONS = [["uk", "英国"], ["us", "美国"], ["hk", "香港"], ["au", "澳洲"], ["ca", "加拿大"], ["other", "其他"]];
export const REGION_NAME = Object.fromEntries(REGIONS);
export const COUNTRY_NAME = { uk: "英国", us: "美国", hk: "香港", au: "澳洲", ca: "加拿大", sg: "新加坡", my: "马来西亚", nz: "新西兰", mo: "澳门", ie: "爱尔兰" };
export const PRIORITY_TONE = { 主战场: "ink", 次要: "frame", 平稳: "neutral" };
// 地区单元 8 字段（03 第 6.1 节）。
export const FIELDS = [["scn", "①", "用户情境"], ["node", "②", "关键节点"], ["task", "③", "待办任务"], ["pain", "④", "核心痛点"], ["need", "⑤", "需求状态"], ["barrier", "⑥", "决策障碍"], ["opp", "⑦", "机会点"], ["basis", "⑧", "研判依据"]];
export const BIZCARD_FIELDS = ["本月重要变化", "用户观察", "存量用户情况", "产品与资源约束", "负责人特别判断"];
export const BIZ_TYPES = ["事实记录", "业务观察", "管理判断"];
export const BIZCARD_HINT = {
  本月重要变化: "相较上月，业务上值得注意的变化",
  用户观察: "咨询热点、典型问题、已观察到的需求",
  存量用户情况: "老学员下一阶段任务、续报要关注的问题",
  产品与资源约束: "当前可用产品、重要师资限制、既定活动",
  负责人特别判断: "本月最关心、希望 AI 深入检验的问题",
};
// 障碍体系 v2（docs/策略规则/02-障碍体系v2.md）。
export const BARRIER_NAME = {
  "BR-M1": "没意识到需要", "BR-M2": "觉得还来得及", "BR-M3": "不信任辅导效果", "BR-M4": "有替代方案", "BR-M5": "学术诚信顾虑",
  "BR-C1": "嫌贵", "BR-C2": "怕选错", "BR-C3": "没时间", "BR-C4": "需要家长同意", "BR-O1": "没被触达", "BR-F1": "方案不匹配任务",
  "BR-R1": "上阶段体验或效果一般", "BR-R2": "下阶段没有明确任务", "BR-R3": "导师或课程衔接不上", "BR-R4": "已有余量", "BR-R5": "续费价格无优势",
};
export const VERIFICATION = { verified: "官网核实", ruled: "人工裁定", source: "原表", guess: "推测", conflict: "冲突未决" };
const STAGE = { undergraduate: "本科", postgraduate: "研究生" };
const ROUTE = { available: "可补", unavailable: "暂不可用", research: "需研究" };
const TYPE_NAME = { task: "待办任务", academic_need: "学业需求", pain: "核心痛点", need_strength: "需求强度", readiness: "购买准备度", barrier: "决策障碍" };

export const stageName = (v) => STAGE[v] || v || "";
export const routeText = (r) => (r ? `${r.source || "（待研究）"} · ${ROUTE[r.status] || r.status || ""}${r.suggestion ? `：${r.suggestion}` : r.reason ? `：${r.reason}` : ""}` : "");

// 状态 × 强度 → [文字, 色调]。依据已变化优先（I-06）。
export function statusLabel(c, stale = false) {
  if (stale) return ["依据已变化", "red"];
  if (c.status === "known") return ["已知 · 强", "green"];
  if (c.status === "inferred") return c.evidenceStrength === "partial" ? ["推断 · 中", "blue"] : ["推断 · 弱", "weak"];
  if (c.status === "unknown") return ["未知", "amber"];
  return ["不适用", "neutral"];
}

// 判断条目的类型标签（03 第 3.3 节末的推导规则）。
export function kindLabel(c, evidenceById = {}) {
  if (c.claimType === "task") return c.status === "known" ? "客观任务" : "待办任务";
  if (c.claimType === "academic_need") {
    const direct = (c.evidenceRefs || []).some((id) => ["business", "voice"].includes(evidenceById[id]?.kind));
    return c.status === "known" && c.evidenceStrength === "strong" && direct ? "已验证需求" : "潜在需求";
  }
  if (c.claimType === "pain") return c.painKind === "observed" ? "实际困难" : "典型困难";
  if (c.claimType === "need_strength") return `需求强度 ${c.level || "未知"}`;
  if (c.claimType === "readiness") return `购买准备度 ${c.level || "未知"}`;
  if (c.claimType === "barrier") return `${BARRIER_NAME[c.barrierCode] || c.barrierCode || "障碍"}${c.barrierRole === "primary" ? "（主）" : ""}`;
  return TYPE_NAME[c.claimType] || "";
}

// 引用的证据里，版本已变或已不在当前快照的（只有拿到当前 Evidence 时才判断）。
export function staleRefs(c, evidenceById) {
  if (!evidenceById || !c.refVersions) return [];
  return Object.entries(c.refVersions).filter(([id, v]) => !evidenceById[id] || evidenceById[id].evidenceVersion !== v).map(([id]) => id);
}
export const isStale = (c, evidenceById) => staleRefs(c, evidenceById).length > 0;
export const BRIEF_KEYS = [["common", "共性"], ["diff", "差异"], ["external", "外部因素"]];
// 版本编号：REV-2026-12-3 → r3；下一个版本 = 当月版本数 + 1（服务端按同样规则编号）。
export const revNo = (id) => (id ? `r${String(id).split("-").at(-1)}` : "—");
export const nextRevNo = (count) => `r${(count || 0) + 1}`;
// 回退生成的版本：confirmedFrom = "rollback:<旧版本>"，返回旧版本 id；不是回退返回 null。
export const rollbackSource = (from) => (from?.startsWith("rollback:") ? from.slice("rollback:".length) : null);
// 证据在行内的短说明：背景卡写类型，时间线写日期。
export const evidenceWhen = (e) => (e.kind === "business" ? e.bizType : dateText(e.dates));

// 「伦敦大学学院 UCL」→「UCL」；没有英文缩写就用全名。
export function shortSchool(school = "") {
  const parts = String(school).trim().split(/\s+/);
  const last = parts.at(-1);
  return parts.length > 1 && /^[\x20-\x7e]+$/.test(last) ? last : school;
}
const md = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : "");
export const span = (from, to) => (!from ? "" : !to || from === to ? md(from) : `${md(from)}–${md(to)}`);
export function dateText(dates = {}) {
  if (dates.precision === "day" && dates.from) return span(dates.from, dates.to);
  if (dates.precision === "month" && dates.months?.length) return `${dates.months.join("、")} 月内`;
  return "日期不明";
}
export const evidenceName = (e) => (e.kind === "business" ? `背景卡 · ${e.field || ""}` : `${shortSchool(e.school)} ${e.eventType === "其他" ? e.header || "其他" : e.eventType || ""}`.trim());
export const sortKey = (e) => e.dates?.from || e.dates?.months?.[0] || "9999";

// 情境编号在地区内的序号：「情境 1 / 2」。
export const scenarioNo = (region, id) => (region?.scenarios || []).indexOf(id) + 1;

/* ---------- 差异 ---------- */
// 两份月度文档的差异，按页面能读懂的位置列出：核心结论、全局研判、地区优先级与空情境原因、情境、判断。
// 每项 { kind: add | mod | del, id?, where, before, after }。omit 里的 Claim id 不列（例如单独处理的手写内容）。
export function diffDocs(before, after, { omit = [] } = {}) {
  const out = [], skip = new Set(omit);
  const b = before || {}, a = after || {};
  const push = (kind, where, x, y, id) => out.push({ kind, where, before: x ?? "", after: y ?? "", ...(id && { id }) });
  const pair = (where, x, y, id) => { if (x === y) return; push(!x ? "add" : !y ? "del" : "mod", where, x, y, id); };
  pair("核心结论", b.brief?.judgement?.text, a.brief?.judgement?.text);
  for (const [key, name] of BRIEF_KEYS) {
    const x = b.brief?.[key] || [], y = a.brief?.[key] || [];
    for (let i = 0; i < Math.max(x.length, y.length); i++) pair(`全局研判 · ${name} ${i + 1}`, itemText(x[i]), itemText(y[i]));
  }
  const regionsB = new Map((b.regions || []).map((r) => [r.key, r])), regionsA = new Map((a.regions || []).map((r) => [r.key, r]));
  for (const [key, name] of REGIONS) {
    const x = regionsB.get(key), y = regionsA.get(key);
    pair(`${name} · 策略优先级`, priorityText(x?.priority), priorityText(y?.priority));
    pair(`${name} · 空情境原因`, x?.emptyReason || "", y?.emptyReason || "");
  }
  const where = (doc, c) => {
    const s = (doc.scenarios || []).find((x) => x.id === c.scenario);
    const r = (doc.regions || []).find((x) => x.key === s?.region);
    const multi = (r?.scenarios || []).length > 1;
    return `${REGION_NAME[s?.region] || "未知地区"}${multi ? ` · 情境 ${scenarioNo(r, c.scenario)}` : ""} · ${TYPE_NAME[c.claimType] || c.claimType}`;
  };
  byId(b.scenarios, a.scenarios, (x, y, id) => {
    const s = y || x;
    pair(`${REGION_NAME[s.region] || ""} · 用户情境 ${id}`, scenarioText(x), scenarioText(y), id);
  });
  byId(b.claims, a.claims, (x, y, id) => {
    if (skip.has(id)) return;
    pair(where(y ? a : b, y || x), claimText(x), claimText(y), id);
  });
  return out;
}
function byId(xs = [], ys = [], fn) {
  const mx = new Map(xs.map((x) => [x.id, x])), my = new Map(ys.map((y) => [y.id, y]));
  for (const id of new Set([...mx.keys(), ...my.keys()])) fn(mx.get(id), my.get(id), id);
}
const itemText = (x) => (x ? `${x.text}（${statusLabel(x)[0]}）` : "");
const priorityText = (p) => (!p ? "" : `${p.value || "待研判"}${p.reason ? `：${p.reason}` : ""}`);
const scenarioText = (s) => (s ? `${s.phase} · ${s.keyTask}（面向 ${s.targetRelation}）` : "");
export const claimText = (c) => (c ? `${c.text}（${statusLabel(c)[0]}${c.origin === "manual" ? " · 你写的" : ""}）` : "");
export const countChanges = (list) => ({ add: list.filter((x) => x.kind === "add").length, mod: list.filter((x) => x.kind === "mod").length, del: list.filter((x) => x.kind === "del").length });

/* ---------- 旧版存档（docs/策略规则/04-迁移映射.md 第 4、5 节） ---------- */
// 旧条目可能是「[正文, 来源]」或纯文本。
export const legacyText = (item) => (Array.isArray(item) ? item[0] : typeof item === "string" ? item : item?.text ?? JSON.stringify(item));
