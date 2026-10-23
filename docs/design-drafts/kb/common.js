// 知识库页重设计 · 三版共用脚本（只在本机演示，不连任何接口）：
// 外框、像素图标、Bayer 网点、目录模型（规则同 src/modules/kb/kb-canvas.js 的 canvasModel）、拖放示意、按帧计时。
// 拖放只改页面里的副本：标「同步中」约 20 帧（≈1.3 秒）后显示「已写入飞书，回读一致」的示意提示，并注明是稿件。
(function () {
  const KB = window.KB, ICONS7 = window.ICONS7;
  const FRAME = 66.7;
  const TYPE = { docx: "DOC", doc: "DOC", sheet: "SHT", bitable: "BASE", file: "FILE", slides: "PPT", mindnote: "MIND" };
  const TYPE_ZH = { docx: "文档", doc: "旧文档", sheet: "表格", bitable: "多维表", file: "文件", slides: "幻灯片", mindnote: "思维笔记" };
  const TY_CLS = { sheet: "is-sht", bitable: "is-base", file: "is-file" };
  const params = new URLSearchParams(location.search);

  // ---- 网点：照 bitmap.jsx 的 ditherTile ----
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const tile = (t, c) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" shape-rendering="crispEdges" fill="${c}">${BAYER.map((v, i) => (v < t ? `<rect x="${(i % 4) * 2}" y="${Math.floor(i / 4) * 2}" width="2" height="2"/>` : "")).join("")}</svg>`)}")`;
  const root = document.documentElement.style;
  [2, 4, 6, 8].forEach((t, i) => root.setProperty(`--dither-${i + 1}`, tile(t, "#C9CCD3")));
  [4, 8, 12, 16].forEach((t, i) => root.setProperty(`--dither-ink-${i + 1}`, tile(t, "#0D0E10")));
  [4, 8].forEach((t, i) => root.setProperty(`--dither-signal-${i + 1}`, tile(t, "#FF4F1F")));

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const icon = (name, size = 14) => {
    const rows = ICONS7[name]; if (!rows) return "";
    const rects = rows.flatMap((r, y) => [...r].map((c, x) => (c === "#" ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ""))).join("");
    return `<svg class="pixel-icon" width="${size}" height="${size}" viewBox="0 0 7 7" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`;
  };
  const frames = (n, onFrame, done) => { let f = 0; const t = setInterval(() => { f += 1; onFrame?.(f); if (f >= n) { clearInterval(t); done?.(); } }, FRAME); };

  // ---- 目录模型 ----
  const tree = JSON.parse(JSON.stringify(KB.tree));
  const docs = KB.docs;
  const isDir = (n) => !!n.kids;
  const count = (n) => (n.kids ? n.kids.reduce((s, k) => s + count(k), 0) : 1);
  const latest = (n) => (n.kids ? n.kids.reduce((m, k) => { const v = latest(k); return v > m ? v : m; }, "") : docs[n.id]?.updated || "");
  const mmdd = (s) => (s ? s.slice(5) : "—");
  const today = "2026-10-23";
  const isNew = (s) => !!s && s >= "2026-10-21" && s <= today;
  function model() {
    const marked = new Set(KB.ruleIds);
    const groups = [], loose = [];
    for (const n of tree) (n.kids || marked.has(n.id) ? groups : loose).push(n);
    groups.forEach((g) => { g.kids ||= []; });
    return { groups, loose };
  }
  function locate(id, list = tree, parent = null) {
    for (const n of list) {
      if (n.id === id) return { node: n, parent, siblings: list };
      if (n.kids) { const h = locate(id, n.kids, n); if (h) return h; }
    }
    return null;
  }
  const ty = (n) => (isDir(n) ? `<span class="ty is-dir">DIR</span>` : `<span class="ty ${TY_CLS[docs[n.id]?.type] || ""}" title="${esc(TYPE_ZH[docs[n.id]?.type] || "文档")}">${TYPE[docs[n.id]?.type] || "DOC"}</span>`);
  const sc = () => ""; // 用户 10-23：不要「快捷」小色块
  const date = (n) => { const d = isDir(n) ? latest(n) : docs[n.id]?.updated; return `<span class="date${isNew(d) ? " is-new" : ""}">${mmdd(d)}</span>`; };
  const ext = (n) => (docs[n.id]?.url ? `<a class="ext" href="${esc(docs[n.id].url)}" target="_blank" rel="noreferrer" title="打开飞书原文" draggable="false">${icon("external")}</a>` : "");

  // ---- 搜索 ----
  const state = { q: "", busy: new Set(), note: "" };
  const hit = (n) => { const q = state.q.trim().toLowerCase(); return !q || n.name.toLowerCase().includes(q) || (docs[n.id]?.excerpt || "").toLowerCase().includes(q); };
  const hits = (n) => (hit(n) && !n.kids ? 1 : 0) + (n.kids || []).reduce((s, k) => s + hits(k), 0);

  // ---- 外框 ----
  const NAV = [["home", "首页"], ["target", "策略"], ["marketing", "营销"], ["voice", "Voice"], ["project", "项目"], ["mentor", "带教"], ["brand", "品牌"], ["business", "业务"], ["agent", "Agent"], ["reports", "日/周报"], ["kb", "飞书知识库"]];
  function shell(versionLabel) {
    const page = document.getElementById("page");
    const total = model().groups.reduce((s, g) => s + count(g), 0) + model().loose.length;
    document.body.insertAdjacentHTML("afterbegin", `<div class="chrome"><span class="chrome-dots"><i></i><i></i><i></i></span><span class="chrome-path">牛马之家 / <b>飞书知识库</b></span><span>127.0.0.1:5280</span></div>`);
    const layout = document.createElement("div"); layout.className = "layout";
    layout.innerHTML = `<nav class="sidebar"><div class="brand"><i></i><strong>牛马之家</strong></div>${NAV.map(([i, l]) => `<a class="${l === "飞书知识库" ? "active" : ""}">${icon(i)}${l}</a>`).join("")}<span class="spacer"></span><a>${icon("settings")}设置</a></nav>`;
    page.parentNode.insertBefore(layout, page); layout.appendChild(page); page.classList.add("main");
    page.insertAdjacentHTML("afterbegin", `<header class="page-header"><h1>飞书知识库</h1><p class="page-subtitle">「${esc(KB.space)}」：分组就是飞书一级目录，在这里拖动就是在飞书里整理</p></header>
      <div class="kb-toolbar"><label class="search">${icon("search")}<input id="kb-q" placeholder="搜 ${total} 篇的标题或摘要" aria-label="搜索知识库"></label>
      <button class="btn is-dashed">${icon("plus")}新建分组</button><span class="spacer"></span>
      <span class="kb-sync-at">上次同步飞书 ${esc(KB.readAt)}</span><button class="btn" title="上次同步飞书 ${esc(KB.readAt)}">${icon("refresh")}同步飞书</button><button class="btn">${icon("clock")}最近收藏</button></div>`);
    document.body.insertAdjacentHTML("beforeend", `<span class="draft-mark">设计稿 · ${esc(versionLabel)} · 数据为 ${esc(KB.readAt)} 只读快照</span>`);
    document.getElementById("kb-q").addEventListener("input", (e) => { state.q = e.target.value; NB.render(); });
  }

  // ---- 拖放：data-doc 可拖，.drop[data-drop] 可放（"" = 根目录 / 待归类） ----
  let dragId = null;
  function move(id, parentId) {
    const here = locate(id); if (!here) return false;
    if ((here.parent?.id || "") === parentId || id === parentId) return false;
    if (parentId && here.node.kids && locate(parentId, here.node.kids)) return false;
    here.siblings.splice(here.siblings.indexOf(here.node), 1);
    if (!parentId) tree.push(here.node); else { const p = locate(parentId); (p.node.kids ||= []).push(here.node); }
    const to = parentId ? locate(parentId).node.name : "待归类";
    state.busy.add(id); NB.render();
    frames(20, null, () => { state.busy.delete(id); state.note = `「${here.node.name}」移到「${to}」：已写入飞书，回读一致（稿件示意，没有真实写入）`; NB.render(); NB.onLanded?.(parentId); });
    return true;
  }
  function wireDrag() {
    document.addEventListener("dragstart", (e) => {
      const el = e.target.closest?.("[data-doc]"); if (!el) return;
      dragId = el.dataset.doc; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId);
      requestAnimationFrame(() => el.classList.add("is-dragging"));
    });
    document.addEventListener("dragend", () => { dragId = null; document.querySelectorAll(".is-dragging,.is-over").forEach((x) => x.classList.remove("is-dragging", "is-over")); });
    document.addEventListener("dragover", (e) => {
      const t = dragId && e.target.closest?.(".drop[data-drop]"); if (!t) return;
      e.preventDefault();
      document.querySelectorAll(".drop.is-over").forEach((x) => x !== t && x.classList.remove("is-over"));
      t.classList.add("is-over");
    });
    document.addEventListener("drop", (e) => {
      const t = dragId && e.target.closest?.(".drop[data-drop]"); if (!t) return;
      e.preventDefault(); const id = dragId; dragId = null; move(id, t.dataset.drop);
    });
  }

  // ---- 网点悬停：逐帧加密到 2 档，移开逐档退回 ----
  function wireDither() {
    const go = (el, target) => {
      clearInterval(el._dt);
      el._dt = setInterval(() => {
        const lv = Number(el.dataset.level || 0); if (lv === target) { clearInterval(el._dt); return; }
        el.dataset.level = String(lv + (target > lv ? 1 : -1));
      }, FRAME);
    };
    document.addEventListener("mouseover", (e) => { const el = e.target.closest?.("[data-dither]"); if (el && !el.contains(e.relatedTarget)) go(el, 2); });
    document.addEventListener("mouseout", (e) => { const el = e.target.closest?.("[data-dither]"); if (el && !el.contains(e.relatedTarget)) go(el, 0); });
  }

  // ---- 状态示意（?demo=1）：一张散卡正被拖、05 分组是落点、一篇在同步中 ----
  // 「同步中」字样：总表行放在标题格里，其余放在日期前
  const markBusy = (el) => {
    if (!el || el.querySelector(".busy")) return;
    el.classList.add("is-busy");
    const tag = `<span class="busy">同步中</span>`, name = el.querySelector(".v3-name");
    const d = el.querySelector(".date");
    name ? name.insertAdjacentHTML("beforeend", tag) : d ? d.insertAdjacentHTML("beforebegin", tag) : el.insertAdjacentHTML("beforeend", tag);
  };
  // ?demo=05：一张散卡正被拖（取页面上最后一处，即卡片本身）、该编号分组是落点、第一组里一篇在同步中
  function demo() {
    if (!params.has("demo")) return;
    const m = model(), pre = params.get("demo") || "05", g = m.groups.find((x) => x.name.startsWith(pre)) || m.groups[0];
    const a = m.loose[0], b = m.groups[0].kids.find((k) => !k.kids);
    if (a) [...document.querySelectorAll(`[data-doc="${a.id}"]`)].pop()?.classList.add("is-dragging");
    document.querySelector(`.drop[data-drop="${g.id}"]`)?.classList.add("is-over");
    if (b) markBusy(document.querySelector(`[data-doc="${b.id}"]`));
  }
  // 截图用（?h=1）：量出内容实际高度，写到 body 上，截图脚本按这个高度截全页
  function measure() {
    if (!params.has("h")) return;
    const page = document.getElementById("page");
    let b = page.lastElementChild.getBoundingClientRect().bottom + scrollY;
    const ix = document.querySelector(".v2-index"); if (ix) b = Math.max(b, ix.getBoundingClientRect().top + scrollY + ix.scrollHeight);
    document.body.dataset.h = String(Math.ceil(b + 56));
  }

  const hash = (id) => { let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h; };
  const NB = window.NB = { hash, TY_ICON: { docx: "file", doc: "file", sheet: "grid", bitable: "canvas", file: "archive" }, KB, docs, tree, icon, esc, frames, model, locate, isDir, count, latest, mmdd, isNew, ty, sc, date, ext, hit, hits, state, TYPE, TYPE_ZH, move, params,
    render: () => {},
    start(label, render) {
      NB.render = () => {
        render();
        state.busy.forEach((id) => document.querySelectorAll(`[data-doc="${id}"]`).forEach(markBusy));
        demo();
        const note = document.getElementById("kb-note");
        if (note) { note.hidden = !state.note; note.innerHTML = state.note ? `${icon("check")}<span>${esc(state.note)}</span><button class="icon-btn" onclick="NB.state.note='';NB.render()" aria-label="关闭">${icon("close")}</button>` : ""; }
      };
      shell(label); wireDrag(); wireDither(); NB.render();
      document.fonts.ready.then(() => setTimeout(measure, 50));
    },
  };
})();
