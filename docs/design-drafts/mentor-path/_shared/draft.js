// 设计稿共用件：应用外框、像素图标、抖动网点变量、按帧动效、关卡详情面板。
// 只在设计稿里用；图标直接复用仓库 src/ui/icons7.js，网点算法与 src/ui/bitmap.jsx 一致。
import { ICONS7 } from "../../../../src/ui/icons7.js";
import { PASS, STATUS_TEXT, STATUS_TONE, stars, TRAINEES } from "./data.js";

// 稿子里补的两个图标，照 7×7 实心网格画
const EXTRA = {
  flag: ["#......", "#####..", "######.", "#####..", "#......", "#......", "#......"],
  crown: [".......", "#..#..#", "##.#.##", "#######", "#######", ".#####.", "......."],
};
const ICONS = { ...ICONS7, ...EXTRA };

export function icon(name, size = 14) {
  const rows = ICONS[name];
  if (!rows) return "";
  const px = size > 20 ? 28 : 14;
  const rects = rows.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ""))).join("");
  return `<svg class="pixel-icon" width="${px}" height="${px}" viewBox="0 0 7 7" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`;
}

/* ---------- 抖动网点（Bayer 4×4），与 installBitmap 相同 ---------- */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function ditherTile(threshold, color) {
  const rects = BAYER.map((v, i) => (v < threshold ? `<rect x="${(i % 4) * 2}" y="${Math.floor(i / 4) * 2}" width="2" height="2"/>` : "")).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" shape-rendering="crispEdges" fill="${color}">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
const FRAME = 1000 / 15;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export function frames(onFrame) {
  let f = 0;
  const t = setInterval(() => { f += 1; if (onFrame(f) === false) clearInterval(t); }, FRAME);
  return () => clearInterval(t);
}
export function installBitmap() {
  const root = document.documentElement.style;
  [2, 4, 6, 8].forEach((t, i) => root.setProperty(`--dither-${i + 1}`, ditherTile(t, "#C9CCD3")));
  [4, 8, 12, 16].forEach((t, i) => root.setProperty(`--dither-ink-${i + 1}`, ditherTile(t, "#0D0E10")));
  [4, 8].forEach((t, i) => root.setProperty(`--dither-signal-${i + 1}`, ditherTile(t, "#FF4F1F")));
  const running = new WeakMap();
  const step = (el, target) => {
    running.get(el)?.();
    if (reduced()) { el.dataset.level = String(target); return; }
    running.set(el, frames(() => {
      const level = Number(el.dataset.level || 0);
      if (level === target) return false;
      el.dataset.level = String(level + Math.sign(target - level));
    }));
  };
  document.addEventListener("pointerover", (e) => { const el = e.target.closest?.("[data-dither]"); if (el && !el.contains(e.relatedTarget)) step(el, 4); });
  document.addEventListener("pointerout", (e) => { const el = e.target.closest?.("[data-dither]"); if (el && !el.contains(e.relatedTarget)) step(el, 0); });
}

/* ---------- 应用外框：窗口条 + 侧栏 + 主区（带教 → 培养路径） ---------- */
const NAV = [["home", "首页"], ["target", "策略"], ["marketing", "营销"], ["voice", "Voice"], ["project", "项目"], ["mentor", "带教"], ["brand", "品牌"], ["business", "业务"], ["agent", "Agent"], ["reports", "日/周报"], ["kb", "飞书知识库"]];

export function mountShell({ version, tab = "path", subtitle, actions = "", counts }) {
  installBitmap();
  const app = document.getElementById("app");
  const tabs = [["qa", "带教答疑"], ["path", "培养路径"]];
  app.innerHTML = `
  <div class="app">
    <header class="chrome"><span class="chrome-dots"><i></i><i></i><i></i></span>
      <span class="chrome-path">niuma-home / <b>带教</b> / ${tab === "qa" ? "答疑" : "培养路径"}</span>
      <span class="draft-mark">设计稿 · ${version}</span><span class="chrome-time">14:32</span></header>
    <div class="layout">
      <nav class="sidebar"><div class="brand"><span class="brand-mark mp-brand">${icon("mentor", 28)}</span>
        <span class="brand-name"><strong>牛马之家</strong><span class="label">niuma home</span></span></div>
        <div class="nav-group">${NAV.map(([i, l]) => `<a class="${l === "带教" ? "active" : ""}">${icon(i)}<span class="nav-label">${l}</span></a>`).join("")}</div>
        <div class="spacer"></div><a>${icon("settings")}<span class="nav-label">设置</span></a>
        <div class="sidebar-foot label">local · 127.0.0.1</div></nav>
      <main class="main">
        <header class="page-header"><div><h1>带教</h1></div><div class="page-actions"><span class="sample-badge" title="设计稿：全部为模拟数据">示例</span></div></header>
        <nav class="tabs">${tabs.map(([k, l]) => `<a class="${k === tab ? "active" : ""}">${l}</a>`).join("")}</nav>
        <p class="tab-desc">${subtitle}</p>
        <div class="toolbar mp-toolbar">
          <div class="person-tabs">${TRAINEES.map((t, i) => `<button type="button" class="${i === 0 ? "active" : ""}"><span><strong>${t.name}</strong><span class="small">${t.role}</span></span>${counts ? `<b class="mq-count is-ask tnum" title="提问">${counts[i]}</b>` : ""}</button>`).join("")}</div>
          <span class="spacer"></span>${actions}
        </div>
        <div id="page"></div>
      </main>
    </div>
  </div>`;
  return document.getElementById("page");
}

/* ---------- 小部件 ---------- */
export const tag = (text, tone = "neutral") => `<span class="tag${tone === "neutral" ? "" : ` tag-${tone}`}">${text}</span>`;
export const statusTag = (n) => tag(STATUS_TEXT[n.status], STATUS_TONE[n.status]);
export function starRow(n, cls = "") {
  const k = n.status === "done" ? stars(n.score) : 0;
  return `<span class="mp-stars ${cls}" title="${k} 星">${[0, 1, 2].map((i) => `<i class="${i < k ? "on" : ""}">${icon("star")}</i>`).join("")}</span>`;
}
export function ditherBar(pct, cls = "") {
  return `<span class="dither-bar ${cls}" role="img" aria-label="${pct}%"><span class="dither-bar-fill" style="width:${pct}%"></span><i class="mp-passline" style="left:${PASS}%"></i></span>`;
}
export const weeks = (n) => `第 ${n.week[0]}–${n.week[1]} 周`;

// 关卡详情：阶段目标 / 要做的事 / 产出物 / 评分标准。opts.cols=true 时要做的事与产出物并排
export function detailHTML(n, opts = {}) {
  const todoDone = n.todoDone ?? (n.status === "done" ? n.todo.length : 0);
  const outDone = n.outDone ?? (n.status === "done" ? n.output.length : 0);
  const total = n.rubric.reduce((s, x) => s + (x.score ?? 0), 0);
  const locked = n.status === "locked";
  const scoreBlock = locked
    ? `<div class="mp-score is-locked">${icon("lock")}<span class="small muted">完成前置关卡后解锁</span></div>`
    : `<div class="mp-score"><span class="num mp-score-num">${n.score}</span><span class="mp-score-of mono">/ 100</span>${starRow(n)}</div>`;
  return `
  <div class="mp-detail ${opts.cols ? "is-cols" : ""}">
    <div class="mp-detail-head">
      <div class="mp-detail-title">
        <span class="row mp-gap6">${tag(n.id, "frame")}<span class="label">${n.stage}</span>${n.boss ? tag(`${icon("crown")}BOSS 关`, "orange") : ""}${statusTag(n)}</span>
        <h3>${n.title}</h3>
        <span class="small muted mono">${weeks(n)}${n.at ? ` · 最近评分 ${n.at}` : ""} · 评分人 常浩</span>
      </div>
      ${scoreBlock}
    </div>
    <section class="mp-sec"><span class="label">阶段目标</span><p>${n.goal}</p></section>
    <div class="mp-sec-pair">
      <section class="mp-sec"><span class="label">要做的事 · ${todoDone}/${n.todo.length}</span>
        <ul class="mp-todo">${n.todo.map((t, i) => `<li class="${i < todoDone ? "done" : ""}"><i class="mp-box">${i < todoDone ? icon("tick") : ""}</i>${t}</li>`).join("")}</ul></section>
      <section class="mp-sec"><span class="label">产出物</span>
        <ul class="mp-out">${n.output.map((o, i) => `<li>${icon("file")}<span>${o}</span>${i < outDone ? tag(n.status === "done" ? "已交" : "初稿", n.status === "done" ? "green" : "amber") : tag(locked ? "—" : "未交")}</li>`).join("")}</ul></section>
    </div>
    <section class="mp-sec"><span class="label">评分标准 · 满分 100，${PASS} 分通关</span>
      <table class="mp-rubric"><tbody>
        ${n.rubric.map((x) => `<tr><td>${x.name}${x.note ? `<span class="small muted"> · ${x.note}</span>` : ""}</td><td class="tnum muted">${x.weight}</td><td class="tnum">${x.score ?? "—"}</td></tr>`).join("")}
      </tbody><tfoot><tr><td>合计</td><td class="tnum muted">100</td><td class="tnum"><b>${locked ? "—" : total}</b></td></tr></tfoot></table>
      ${locked ? "" : `<div class="mp-bar-row">${ditherBar(n.score)}<span class="small mono ${n.score >= PASS ? "ok-text" : "warn-text"}">${n.score >= PASS ? "已过通关线" : `差 ${PASS - n.score} 分通关`}</span></div>`}
    </section>
    ${opts.actions === false ? "" : `<div class="mp-actions">
      ${locked ? `<button class="btn" disabled>${icon("lock")}未解锁</button>` : `<button class="btn">${icon("link")}打开产出物</button>`}
      <span class="spacer"></span>
      ${n.status === "doing" ? `<button class="btn btn-primary">${icon("edit")}评分</button>` : n.status === "done" ? `<button class="btn">${icon("edit")}改评分</button>` : ""}
    </div>`}
  </div>`;
}

// 当前关卡的橙色方块按帧闪烁（两帧亮、两帧灭，约 4 次/秒）
export function blinkCurrent(sel = ".is-current-blink") {
  if (reduced()) return;
  let on = true;
  frames((f) => { if (f % 4 === 0) { on = !on; document.querySelectorAll(sel).forEach((el) => el.classList.toggle("off", !on)); } });
}

// 进入页面时进度格逐格点亮（StepProgress 同款节奏）
export function lightCells(sel = ".mp-cells") {
  document.querySelectorAll(sel).forEach((wrap) => {
    const cells = [...wrap.querySelectorAll("i[data-on]")];
    if (reduced()) { cells.forEach((c) => c.classList.add("on")); return; }
    let k = 0;
    frames(() => { if (k >= cells.length) return false; cells[k++].classList.add("on"); });
  });
}

export function statStrip(items) {
  return `<div class="stat-strip">${items.map((it) => `<div class="stat${it.tone ? ` is-${it.tone}` : ""}"><span class="stat-label">${it.label}</span><span class="stat-value">${it.value}${it.unit ? `<small>${it.unit}</small>` : ""}</span><span class="stat-foot">${it.foot || ""}</span></div>`).join("")}</div>`;
}
