// 第二轮（V6–V9）共用：沉浸式外框（窗口条 + 图标侧栏 + 状态栏）、紧凑页头、关卡详情抽屉、时间换算。
// 这一轮路线图占满主区，详情点开才出现；外框只保留导航必需的部分。
import { LINES, LINKS, SEASON, TRAINEES, byId, doneCount, lineStars, PASS } from "./data.js";
import { icon, installBitmap, detailHTML, frames } from "./draft.js";

const DAY = 864e5;
export const START = new Date(2026, 8, 1);                     // 入职 09-01 = 第 1 周起点
export const TODAY = new Date(2026, 9, 23);                    // 稿子里的「今天」
export const NOW_W = (TODAY - START) / DAY / 7;                // 连续周数 7.43，落在第 8 周
export const md = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const weekStart = (w) => md(new Date(START.getTime() + (w - 1) * 7 * DAY));
export const midOf = (n) => (n.week[0] - 1 + n.week[1]) / 2;   // 计划周期中点（连续周数）
export const endOf = (n) => n.week[1];                         // 计划结束（连续周数）
export const isLate = (n) => n.status === "doing" && n.week[1] < SEASON.week;
export const lateWeeks = (n) => SEASON.week - n.week[1];
// 月份分界（连续周数）：9 月 1 日为 0
export const MONTH_MARKS = [9, 10, 11, 12, 1, 2].map((m, i) => {
  const d = new Date(m >= 9 ? 2026 : 2027, m - 1, 1);
  return { name: `${m} 月`, w: Math.max(0, (d - START) / DAY / 7), i };
});
export const LINE_COLOR = { biz: "#0D0E10", ai: "#2563EB" };

// 跨线依赖说明：前一关的哪份产出被后一关用到
export const LINK_NOTE = { "B3>A3": "访谈纪要", "A4>B5": "进度自动化表", "B5>A6": "上线的项目" };
export const linkNote = (from, to) => LINK_NOTE[`${from}>${to}`] || "产出";

export function lineOf(n) { return LINES.find((l) => l.nodes.some((x) => x.id === n.id)); }
export function prereqs(n) {
  const l = lineOf(n), i = l.nodes.findIndex((x) => x.id === n.id);
  return { prev: i > 0 ? l.nodes[i - 1] : null, feeds: LINKS.filter(([, to]) => to === n.id).map(([from]) => byId(from)) };
}
export function unlockText(n) {
  const { prev, feeds } = prereqs(n);
  const parts = [];
  if (prev) parts.push(`${prev.id} 达到 ${PASS} 分`);
  feeds.forEach((f) => parts.push(`拿到 ${f.id} 的${linkNote(f.id, n.id)}`));
  return parts.join("，");
}
// 地图上放得下的短说明；完整解锁条件在详情里
export function shortUnlock(n) {
  const { prev, feeds } = prereqs(n);
  return `需 ${[prev && `${prev.id} 达标`, ...feeds.map((f) => `${f.id} 产出`)].filter(Boolean).join(" + ")}`;
}
export function scoreLine(n) {
  if (n.status === "locked") return shortUnlock(n);
  if (n.status === "done") return `${n.score} 分 · ${n.at} 通关`;
  return `${n.score} 分 · 差 ${PASS - n.score} 分通关`;
}

/* ---------- 外框 ---------- */
const RAIL = [["home", "首页"], ["target", "策略"], ["marketing", "营销"], ["voice", "Voice"], ["project", "项目"], ["mentor", "带教"], ["brand", "品牌"], ["business", "业务"], ["agent", "Agent"], ["reports", "日/周报"], ["kb", "飞书知识库"]];

export function mountStage({ version }) {
  installBitmap();
  document.getElementById("app").innerHTML = `
  <div class="stg-app">
    <header class="chrome"><span class="chrome-dots"><i></i><i></i><i></i></span>
      <span class="chrome-path">niuma-home / <b>带教</b> / 培养路径</span>
      <span class="draft-mark">设计稿 · ${version}</span><span class="chrome-time">14:32</span></header>
    <div class="stg-body">
      <nav class="stg-rail" aria-label="模块"><span class="mp-brand">${icon("mentor")}</span>
        ${RAIL.map(([i, l]) => `<a class="${l === "带教" ? "active" : ""}" title="${l}">${icon(i)}</a>`).join("")}
        <span class="spacer"></span><a title="设置">${icon("settings")}</a></nav>
      <main class="stg" id="page"></main>
    </div>
    <footer class="stg-status"><span><i class="dot"></i>飞书 已连接</span><span><i class="dot"></i>日志 10-23 14:30 同步</span><span><i class="dot is-off"></i>评分 示例数据</span><span class="spacer"></span><span>⌘K 搜索</span><span>127.0.0.1:5280</span></footer>
  </div>`;
  return document.getElementById("page");
}

// 紧凑页头：模块页签 + 管培生切换 + 关键数字。cls 用来让各版本换皮肤
export function stageHead(cls = "", extra = "") {
  const [biz, ai] = LINES;
  const total = biz.nodes.length + ai.nodes.length;
  return `<header class="stg-head ${cls}">
    <div class="stg-crumb"><h1>带教</h1><nav class="stg-tabs"><a>带教答疑</a><a class="on">培养路径</a></nav></div>
    <div class="stg-people">${TRAINEES.map((t, i) => `<button type="button" class="${i === 0 ? "on" : ""}">${t.name}<small>${t.role.split(" · ")[1]}</small></button>`).join("")}</div>
    <span class="spacer"></span>
    <div class="stg-kpis">
      <span><b>W${SEASON.week}</b>/ ${SEASON.weeks} 周</span>
      <span><b>${doneCount(biz) + doneCount(ai)}</b>/ ${total} 关通关</span>
      <span><b>${lineStars(biz) + lineStars(ai)}</b>/ ${total * 3} 星</span>
      <span class="is-warn"><b>2</b>份待评分</span>
    </div>${extra}
  </header>`;
}

/* ---------- 关卡详情抽屉 ---------- */
// host 里追加一个抽屉；open(n) 打开关卡，openRaw(标题, 内容) 打开任意内容；按帧从右侧滑入（3 帧），Esc 或 × 关闭。
// extra(n) 可在关卡详情上方插入各版本自己的内容（如 V7 的「第几段坡」）
export function makeDrawer(host, { cls = "", head = (n) => `${n.id} · ${n.stage}`, extra = null } = {}) {
  host.insertAdjacentHTML("beforeend", `<aside class="stg-drawer ${cls}" hidden><div class="stg-drawer-head"><span class="stg-drawer-title"></span><button type="button" class="stg-x" aria-label="关闭">${icon("close")}</button></div><div class="stg-drawer-body"></div></aside>`);
  const el = host.lastElementChild;
  const close = () => { if (el.hidden) return; el.hidden = true; host.dispatchEvent(new CustomEvent("drawer", { detail: null })); };
  el.querySelector(".stg-x").onclick = close;
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  const show = (title, body, id) => {
    el.querySelector(".stg-drawer-title").innerHTML = title;
    el.querySelector(".stg-drawer-body").innerHTML = body;
    el.querySelector(".stg-drawer-body").scrollTop = 0;
    const wasHidden = el.hidden;
    el.hidden = false;
    host.dispatchEvent(new CustomEvent("drawer", { detail: id }));
    if (!wasHidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const steps = ["translateX(66%)", "translateX(33%)", ""];
    el.style.transform = steps[0];
    frames((f) => { el.style.transform = steps[f] ?? ""; return f < 2; });
  };
  return {
    el, close,
    isOpen: () => !el.hidden,
    open(n) {
      const { feeds } = prereqs(n);
      show(head(n),
        (extra ? extra(n) : "") +
        (n.status === "locked" ? `<div class="stg-note">${icon("lock")}<span><b>解锁条件</b>　${unlockText(n)}</span></div>` : "") +
        (feeds.length && n.status !== "locked" ? `<div class="stg-note is-link">${icon("link")}<span><b>跨线</b>　用到 ${feeds.map((f) => `${f.id} 的${linkNote(f.id, n.id)}`).join("、")}</span></div>` : "") +
        detailHTML(n), n.id);
    },
    openRaw(title, body, id = null) { show(title, body, id); },
  };
}
