// 底栏重设计样稿：四个版本的静态渲染。数据是 2026-10-18 22:27 从本机 5280 只读接口取的快照，
// 不发请求。mount(version, opts) 把真实页面的 footer.statusbar 换成样稿，也可在 mock.html 里单独看。
import { ICONS7 } from "../../../src/ui/icons7.js";

export const SNAP = {
  checkedAt: "22:27",
  sources: [ // /api/v3/status
    { group: "飞书", label: "日报", tone: "ok", value: "22:16" },
    { group: "飞书", label: "周报", tone: "ok", value: "22:16" },
    { group: "飞书", label: "时间线", tone: "ok", value: "22:14" },
    { group: "飞书", label: "知识库", tone: "ok", value: "22:15" },
    { group: "NAS", label: "NAS", tone: "off", value: "未接入" },
    { group: "Voice", label: "Voice", tone: "off", value: "未接入" },
  ],
  delivery: { month: "2026-11", deadline: "10-31", days: 13, today: 18, monthDays: 31 }, // src/constants.js
  campaign: { name: "2026 双11冲分节", start: "10-15", end: "11-11", day: 4, total: 28, left: 24, done: 0, nodes: 8 }, // /api/v3/campaigns/current
  todos: [{ kind: "时间线", text: "330 条异常待确认", href: "#/user/timeline/anomalies" }], // /api/v3/home/todo
  projects: { active: 1, nodes: 17, done: 0, overdue: 0 }, // /api/v3/projects
  version: "93dd9e6",
};

const icon = (name) => {
  const rows = ICONS7[name] || [];
  const rects = rows.flatMap((r, y) => [...r].map((c, x) => (c === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ""))).join("");
  return `<svg class="pixel-icon" width="14" height="14" viewBox="0 0 7 7" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`;
};
const kbdK = `<kbd>⌘K</kbd>`;
const okCount = SNAP.sources.filter((s) => s.tone === "ok").length;
const onCount = SNAP.sources.filter((s) => s.tone !== "off").length;

function sourcePop(left) {
  const rows = SNAP.sources.map((s) => `<li><i class="sbx-dot is-${s.tone}"></i>${s.group === s.label ? s.label : `${s.group} · ${s.label}`}<span>${s.value}</span></li>`).join("");
  return `<div class="sbx-pop" style="${left}"><h4>数据源 · ${SNAP.checkedAt} 检查</h4><ul>${rows}</ul><div class="foot">${okCount}/${onCount} 已接入来源正常 · 版本 ${SNAP.version}</div></div>`;
}

/* A 截止条：底栏只回答「还有多少时间」。左：本月日历格 + 交付截止倒数；中：当前战役进度；右：数据源收成一个点 + ⌘K */
function A({ pop }) {
  const d = SNAP.delivery, c = SNAP.campaign;
  const cells = Array.from({ length: d.monthDays }, (_, i) => {
    const day = i + 1;
    return `<i class="${day < d.today ? "past" : day === d.today ? "today" : ""}${day === d.monthDays ? " dead" : ""}" title="10-${String(day).padStart(2, "0")}"></i>`;
  }).join("");
  const bar = `<span class="bar"><b style="width:${Math.round((c.day / c.total) * 100)}%"></b></span>`;
  const popHtml = pop === "deadline"
    ? `<div class="sbx-pop" style="left:12px"><h4>交付截止 · 10-31 周六</h4><ul><li class="is-cur">11 月方案、物料提交<span>剩 13 天</span></li><li>12 月交付截止<span>11-30 · 剩 43 天</span></li></ul><div class="foot">截止 = 交付月前一个月最后一天 · 点击打开 11 月营销方案</div></div>`
    : pop === "source" ? sourcePop("right:12px") : "";
  return `<footer class="sbx sbx-a" aria-label="时间与截止">
    <a href="#/marketing" title="交付截止：交付月前一个月的最后一天"><span class="sbx-days" aria-hidden="true">${cells}</span><span class="lead">交付 11 月</span><span class="muted wide">截止 ${d.deadline} ·</span><span class="big">剩 <span class="sig">${d.days}</span> 天</span></a>
    <span class="sep wide"></span>
    <a class="wide" href="#/marketing" title="当前战役 ${c.start} → ${c.end}">${icon("target")}<span>${c.name}</span>${bar}<span class="muted">第 <span class="num">${c.day}</span>/${c.total} 天 · 剩 ${c.left} 天</span></a>
    <span class="grow"></span>
    <button title="数据源：${okCount}/${onCount} 正常">${`<i class="sbx-dot"></i>`}<span class="muted wide">数据源</span></button>
    <button title="打开命令面板">${kbdK}<span class="wide">命令</span></button>
  </footer>${popHtml}`;
}

/* B 计数托盘：底栏回答「有多少事等我处理」。每格 = 图标 + 数字 + 名称，>0 才是墨色，需要动手的用信号橙；点格子跳到对应页面 */
function B({ pop }) {
  const t = SNAP.todos.length, p = SNAP.projects, d = SNAP.delivery;
  const cell = (ic, n, lbl, title, cls = "", tag = "a") => `<${tag} class="cell ${cls}${n === 0 ? " is-zero" : ""}" title="${title}">${icon(ic)}<span class="num">${n}</span><span class="lbl">${lbl}</span></${tag}>`;
  const popHtml = pop === "todo"
    ? `<div class="sbx-pop" style="left:0"><h4>待办 · ${t} 项</h4><ul>${SNAP.todos.map((x) => `<li class="is-cur">${x.kind} · ${x.text}<span>去处理 →</span></li>`).join("")}</ul><div class="foot">同首页「待办」卡，数据 /api/v3/home/todo</div></div>`
    : pop === "source" ? sourcePop("right:160px") : "";
  return `<footer class="sbx sbx-b" aria-label="待处理">
    ${cell("alert", t, "待办", "首页待办：时间线 330 条异常待确认", "is-hot")}
    ${cell("project", p.active, "项目推进中", "项目页：推进中 1 个，节点 0/17 完成")}
    ${cell("clock", p.overdue, "节点逾期", "项目节点逾期：0")}
    ${cell("calendar", d.days, "天到交付截止", "交付月 2026-11，截止 10-31")}
    <button class="cell" title="数据源：${okCount}/${onCount} 正常"><i class="sbx-dot"></i><span class="num">${okCount}/${onCount}</span><span class="lbl">数据源</span></button>
    <span class="grow"></span>
    <button class="tail wide" title="打开命令面板">${kbdK}命令</button>
    <span class="muted wide">版本 ${SNAP.version}</span>
  </footer>${popHtml}`;
}

/* C 跟着页面：左边写「这一页的数据从哪来、新不新、有什么要注意」，右边写这一页能用的快捷键。换页内容就换 */
const PAGES = {
  home: { name: "首页", ic: "home", info: `<i class="sbx-dot"></i>${okCount}/${onCount} 个来源正常<span class="muted wide">· 最近 22:16</span><span class="sep wide"></span><span class="wide">交付 11 月 · 剩 <span class="sig">13</span> 天</span>`, keys: [["⌘K", "命令"], ["Esc", "关闭浮层"]] },
  user: { name: "用户 / 时间线", ic: "user", info: `<i class="sbx-dot"></i>时间线 <span class="num">22:14</span> 同步<span class="sep"></span><span class="sig">330</span> 条异常待确认`, keys: [["⌘K", "命令"], ["Esc", "关闭"]] },
  kb: { name: "知识库", ic: "kb", info: `<i class="sbx-dot"></i>知识库 <span class="num">22:15</span> 同步<span class="muted wide">· 只建快捷方式，不动原文</span>`, keys: [["⌘Z", "撤销"], ["⇧⌘N", "新建目录"], ["F2", "改名"], ["⌘X ⌘V", "移动"]] },
  marketing: { name: "营销", ic: "marketing", info: `交付 11 月 · 截止 10-31 · 剩 <span class="sig">13</span> 天<span class="sep wide"></span><span class="wide">双11冲分节 第 4/28 天</span>`, keys: [["⌘K", "命令"]] },
};
function C({ page = "home", pop }) {
  const p = PAGES[page];
  const popHtml = pop === "source" ? sourcePop("left:12px") : "";
  return `<footer class="sbx sbx-c" aria-label="本页状态">
    <span class="page">${icon(p.ic)}<span class="wide">${p.name}</span></span>
    <button title="点开看全部数据源">${p.info}</button>
    <span class="grow"></span>
    <span class="keys wide">${p.keys.map(([k, t]) => `<span><kbd>${k}</kbd>${t}</span>`).join("")}</span>
    <span class="muted wide" title="当前运行的版本">${SNAP.version}</span>
  </footer>${popHtml}`;
}

/* D 一句话：整条只说当下最该看的一件事，按优先级排：来源异常 > 截止 ≤3 天 > 待办 > 一切正常时的交付倒数。右边可翻看其余几条 */
const NOTES = [
  { lvl: "hot", text: `时间线有 <span class="sig">330</span> 条异常待确认`, go: "去确认 →" },
  { lvl: "ok", text: `交付 11 月方案 · 截止 10-31 · 还有 <span class="sig">13</span> 天`, go: "看方案 →" },
  { lvl: "ok", text: `双11冲分节 第 4/28 天 · 8 个节点还没开始`, go: "看战役 →" },
];
function D({ pop, idx = 0 }) {
  const n = NOTES[idx];
  const popHtml = pop === "list"
    ? `<div class="sbx-pop" style="right:12px"><h4>提醒 · ${NOTES.length} 条（按优先级）</h4><ul>${NOTES.map((x, i) => `<li class="${i === idx ? "is-cur" : ""}">${x.text}<span>${x.go}</span></li>`).join("")}<li><i class="sbx-dot"></i>${okCount}/${onCount} 个数据源正常<span>22:27 检查</span></li></ul><div class="foot">版本 ${SNAP.version} · 有新提醒时方块光标逐字打出</div></div>`
    : "";
  return `<footer class="sbx sbx-d" aria-label="提醒">
    <span class="lvl ${n.lvl === "ok" ? "is-ok" : ""}"><i></i></span>
    <a class="msg" href="#/user/timeline/anomalies"><span class="t">${n.text}</span><span class="cursor"></span><span class="muted wide">${n.go}</span></a>
    <button class="pager" title="翻看其余提醒">${idx + 1}/${NOTES.length} ${icon("up")}</button>
    <button class="wide" title="打开命令面板">${kbdK}</button>
  </footer>${popHtml}`;
}

const VERSIONS = { A, B, C, D };

export function render(version, opts = {}) {
  return VERSIONS[version](opts);
}

// 注入真实页面：隐藏现有底栏，挂上样稿，并让 --statusbar-h 跟着样稿高度走。
export function mount(version, opts = {}) {
  if (!document.querySelector("link[data-sbx]")) {
    const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: new URL("./bars.css", import.meta.url).href });
    link.dataset.sbx = "1";
    document.head.append(link);
  }
  document.querySelectorAll("footer.statusbar, .sb-panel").forEach((el) => (el.style.display = "none"));
  document.querySelector("[data-sbx-root]")?.remove();
  const root = Object.assign(document.createElement("div"), { innerHTML: render(version, opts) });
  root.dataset.sbxRoot = version;
  document.body.append(root);
  document.documentElement.style.setProperty("--statusbar-h", version === "A" ? "30px" : "26px");
}
