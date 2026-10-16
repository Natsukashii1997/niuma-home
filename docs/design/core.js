/* 位图风原型基础件（无构建、无依赖）。对应 src/ui/bitmap.jsx 的 6 种按帧动效，规则见 docs/STYLE-GUIDE.md。
   动效一律按帧跳变（约 15 帧/秒），不用缓动和 CSS transition；系统开启「减少动态效果」时直接显示终态。 */
window.P = (() => {
  const P = { pages: {}, mounts: [] };
  P.FRAME = 1000 / 15;
  P.reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  P.esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  P.$ = (sel, root = document) => root.querySelector(sel);
  P.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // 按帧计时：回调返回 false 停止；页面切换时统一取消。
  const timers = new Set();
  P.frames = (onFrame) => {
    let frame = 0;
    const id = setInterval(() => { frame += 1; if (onFrame(frame) === false) { clearInterval(id); timers.delete(id); } }, P.FRAME);
    timers.add(id);
    return () => { clearInterval(id); timers.delete(id); };
  };
  P.stopAll = () => { timers.forEach(clearInterval); timers.clear(); };

  /* ---------- 7×7 像素图标 ---------- */
  const ICONS = {
    home: ["...#...", "..###..", ".#####.", "#######", ".#...#.", ".#.#.#.", ".#.#.#."],
    month: [".#...#.", "#######", "#.....#", "#.###.#", "#.#...#", "#.###.#", "#######"],
    insight: [".......", "..###..", ".#...#.", "#..#..#", ".#...#.", "..###..", "......."],
    canvas: ["#######", "#..#..#", "#..#..#", "#######", "#.#...#", "#.#...#", "#######"],
    project: ["######.", "#....#.", "#...#..", "######.", "#......", "#......", "#......"],
    kb: ["###.###", "#..#..#", "#..#..#", "#..#..#", "#..#..#", "###.###", "...#..."],
    agent: ["...#...", ".#####.", "#.....#", "#.#.#.#", "#.....#", ".#####.", ".#...#."],
    reports: ["#####..", "#...##.", "#.....#", "#.###.#", "#.....#", "#.###.#", "#######"],
    settings: ["..#.#..", ".#####.", "##...##", ".#...#.", "##...##", ".#####.", "..#.#.."],
    calendar: [".#...#.", "#######", "#.....#", "#.#.#.#", "#.....#", "#.#.#.#", "#######"],
    price: ["#.....#", ".#...#.", "..#.#..", "#######", "...#...", "#######", "...#..."],
    image: ["#######", "#.....#", "#.##..#", "#.##..#", "#....##", "#.#####", "#######"],
    brief: ["####...", "#..##..", "#...##.", "#.###.#", "#.....#", "#.###.#", "#######"],
    bolt: ["....##.", "...##..", "..##...", ".#####.", "...##..", "..##...", ".##...."],
    timeline: ["#......", "#.###..", "#......", "#.#####", "#......", "#.##...", "#......"],
    target: ["#######", "#.....#", "#.###.#", "#.#.#.#", "#.###.#", "#.....#", "#######"],
    voice: ["...#...", ".#.#.#.", ".#.#.#.", "##.#.##", ".#.#.#.", ".#.#.#.", "...#..."],
    strategy: ["#.....#", ".#...#.", "..###..", "..#.#..", "..###..", ".#...#.", "#.....#"],
    mentor: ["..###..", "..###..", "...#...", ".#####.", "#.###.#", "..#.#..", "..#.#.."],
    chat: ["#######", "#.....#", "#.#.#.#", "#.....#", "#######", "##.....", "#......"],
    clock: [".#####.", "#..#..#", "#..#..#", "#..##.#", "#.....#", "#.....#", ".#####."],
    star: ["...#...", "...#...", "#######", ".#####.", "..###..", ".##.##.", "#.....#"],
    archive: ["#######", "#######", ".#...#.", ".#.#.#.", ".#...#.", ".#...#.", ".#####."],
    folder: ["###....", "#..####", "#.....#", "#.....#", "#.....#", "#.....#", "#######"],
    file: ["####...", "#..##..", "#...##.", "#.....#", "#.....#", "#.....#", "#######"],
    link: ["...###.", "..#...#", "...#..#", "..#.#..", "#..#...", "#...#..", ".###..."],
    nas: ["#######", "#.....#", "#.#.###", "#######", "#.....#", "#.#.###", "#######"],
    spark: ["...#...", "...#...", "..#.#..", "##...##", "..#.#..", "...#...", "...#..."],
    lock: ["..###..", ".#...#.", ".#...#.", "#######", "#..#..#", "#..#..#", "#######"],
    filter: ["#######", ".#...#.", "..#.#..", "...#...", "...#...", "...#...", "...#..."],
    up: ["...#...", "..###..", ".#.#.#.", "...#...", "...#...", "...#...", "...#..."],
    move: ["...#...", "..###..", "#..#..#", "#######", "#..#..#", "..###..", "...#..."],
    gate: ["#######", "#.....#", "#.###.#", "#.#.#.#", "#.###.#", "#.....#", "#######"],
    edit: [".....##", "....###", "...###.", "..###..", ".###...", "##.....", "#......"],
    upload: ["...#...", "..###..", ".#.#.#.", "...#...", "#..#..#", "#.....#", "#######"],
    external: ["...####", ".....##", "....#.#", "#..#..#", "#.#....", "#......", "#####.."],
    plus: ["...#...", "...#...", "...#...", "#######", "...#...", "...#...", "...#..."],
    close: ["#.....#", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "#.....#"],
    check: [".......", "......#", ".....#.", "#...#..", ".#.#...", "..#....", "......."],
    left: ["...#...", "..#....", ".#.....", "#######", ".#.....", "..#....", "...#..."],
    right: ["...#...", "....#..", ".....#.", "#######", ".....#.", "....#..", "...#..."],
    down: [".......", "#.....#", ".#...#.", "..#.#..", "...#...", ".......", "......."],
    refresh: [".####..", "#....#.", "#......", "#...###", "#....#.", "#....#.", ".####.."],
    copy: ["####...", "#..#...", "#.####.", "#.#..#.", "###..#.", "..#..#.", "..####."],
    send: ["#......", "##.....", "#.##...", "#...##.", "#.##...", "##.....", "#......"],
    download: ["...#...", "...#...", "...#...", "#.###.#", "#..#..#", "#.....#", "#######"],
    alert: ["...#...", "..#.#..", "..#.#..", ".#.#.#.", ".#...#.", "#..#..#", "#######"],
    search: [".###...", "#...#..", "#...#..", "#...#..", ".###...", "....##.", ".....##"],
  };
  P.icon = (name, size = 14, cls = "") => {
    const rows = ICONS[name];
    if (!rows) return "";
    let rects = "";
    rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === "#") rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
    return `<svg class="pixel-icon ${cls}" width="${size}" height="${size}" viewBox="0 0 7 7" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`;
  };

  /* ---------- 1-bit 头像 ---------- */
  P.avatar = (seed, size = 28) => {
    let h = 2166136261;
    for (const ch of String(seed)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    let rects = "";
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 3; x += 1) if ((h >>> (y * 3 + x)) & 1) {
      rects += `<rect x="${x + 1}" y="${y + 1}" width="1" height="1"/>`;
      if (x < 2) rects += `<rect x="${5 - x}" y="${y + 1}" width="1" height="1"/>`;
    }
    return `<svg class="bit-avatar" width="${size}" height="${size}" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"><rect width="7" height="7" fill="var(--panel)"/><g fill="var(--text)">${rects}</g></svg>`;
  };

  /* ---------- 抖动网点（Bayer 4×4） ---------- */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const tile = (t, color) => {
    const r = BAYER.map((v, i) => (v < t ? `<rect x="${(i % 4) * 2}" y="${Math.floor(i / 4) * 2}" width="2" height="2"/>` : "")).join("");
    return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" shape-rendering="crispEdges" fill="${color}">${r}</svg>`)}")`;
  };
  P.installDither = () => {
    const root = document.documentElement.style;
    [2, 4, 6, 8].forEach((t, i) => root.setProperty(`--dither-${i + 1}`, tile(t, "#C9CCD3")));
    [4, 8, 12, 16].forEach((t, i) => root.setProperty(`--dither-ink-${i + 1}`, tile(t, "#0D0E10")));
    [4, 8].forEach((t, i) => root.setProperty(`--dither-signal-${i + 1}`, tile(t, "#FF4F1F")));
    const running = new WeakMap();
    const step = (el, target) => {
      running.get(el)?.();
      if (P.reduced()) { el.dataset.level = String(target); return; }
      running.set(el, P.frames(() => {
        const level = Number(el.dataset.level || 0);
        if (level === target) return false;
        el.dataset.level = String(level + Math.sign(target - level));
      }));
    };
    document.addEventListener("pointerover", (e) => { const el = e.target.closest?.("[data-dither]"); if (el && !el.contains(e.relatedTarget)) step(el, 4); });
    document.addEventListener("pointerout", (e) => { const el = e.target.closest?.("[data-dither]"); if (el && !el.contains(e.relatedTarget)) step(el, 0); });
  };

  /* ---------- ① 点阵数字滚动 ---------- */
  // 标记：<span class="flip-number" data-flip="1234">；只滚变化的位，个位先停、高位后停，停住时闪一帧橙色。
  P.flip = (el, value) => {
    const target = String(value ?? el.dataset.flip);
    const from = el.dataset.shown ?? target.replace(/\d/g, "0");
    el.dataset.shown = target;
    el.setAttribute("aria-label", target);
    const paint = (cells) => { el.innerHTML = cells.map((c) => `<span aria-hidden="true"${c.flash ? ' class="flash"' : ""}>${P.esc(c.ch)}</span>`).join(""); };
    if (P.reduced() || from === target) { paint([...target].map((ch) => ({ ch }))); return; }
    const len = Math.max(from.length, target.length);
    const a = from.padStart(len, " "), b = target.padStart(len, " ");
    P.frames((frame) => {
      let moving = false;
      const cells = [...b].map((ch, i) => {
        if (!/\d/.test(ch) || a[i] === ch) return { ch };
        const stopAt = 3 + (len - 1 - i) * 2;
        if (frame > stopAt) return { ch };
        if (frame === stopAt) return { ch, flash: true };
        moving = true;
        return { ch: String((Number(ch) - (stopAt - frame) + 100) % 10) };
      }).filter((c, i) => c.ch !== " " || i >= len - target.length);
      paint(cells);
      if (!moving && frame > 3 + len * 2) return false;
    });
  };

  /* ---------- ② 点阵亮起 ---------- */
  // data: [{label, value, hint}]；从左到右、自下而上逐点点亮，最新一批橙色；highlight 列常亮橙色。
  P.dotMatrix = (el, data, { rows = 10, highlight = -1, unit = "", dot = 10 } = {}) => {
    const max = Math.max(1, ...data.map((d) => d.value));
    const filled = data.map((d) => (d.value > 0 ? Math.max(1, Math.round((d.value / max) * rows)) : 0));
    const total = filled.reduce((s, n) => s + n, 0);
    let order = 0;
    const cols = data.map((d, c) => {
      let dots = "";
      for (let r = 0; r < rows; r += 1) dots += r < filled[c] ? `<i data-o="${order++}"></i>` : "<i></i>";
      return `<div class="dot-col" data-col="${c}" title="${P.esc(`${d.hint || d.label}：${d.value}${unit}`)}">${dots}</div>`;
    }).join("");
    el.innerHTML = `<div class="dot-matrix" style="--dot:${dot}px">
      <div class="dot-matrix-grid" style="--cols:${data.length}">${cols}</div>
      <div class="dot-matrix-labels" style="--cols:${data.length}">${data.map((d, c) => `<span${c === highlight ? ' class="hot"' : ""}>${P.esc(d.label)}</span>`).join("")}</div>
      <div class="dot-matrix-readout label">&nbsp;</div></div>`;
    const dotsAll = P.$$("i[data-o]", el);
    const readout = P.$(".dot-matrix-readout", el);
    const batch = Math.max(1, Math.ceil(total / 15));
    const paint = (lit) => dotsAll.forEach((d) => {
      const o = Number(d.dataset.o), col = Number(d.parentElement.dataset.col);
      const on = o < lit, fresh = on && lit < total && o >= lit - batch;
      d.className = on ? (fresh || col === highlight ? "on hot" : "on") : "";
    });
    if (P.reduced()) paint(total); else P.frames((f) => { paint(Math.min(total, f * batch)); if (f * batch >= total) return false; });
    P.$$(".dot-col", el).forEach((colEl) => {
      colEl.addEventListener("pointerenter", () => {
        const c = Number(colEl.dataset.col);
        P.$$(".dot-col", el).forEach((x) => x.classList.toggle("is-hover", x === colEl));
        readout.textContent = `${data[c].hint || data[c].label} · ${data[c].value}${unit}`;
      });
    });
    el.addEventListener("pointerleave", () => { P.$$(".dot-col", el).forEach((x) => x.classList.remove("is-hover")); readout.innerHTML = "&nbsp;"; });
  };

  /* ---------- ⑤ 方块光标逐字打出 ---------- */
  P.typeText = (el, text, onDone) => {
    const render = (n, cursor, off) => {
      const shown = P.esc(text.slice(0, n)).replace(/(\d+(?:[.,:]\d+)*%?)/g, '<span class="type-num">$1</span>');
      el.innerHTML = shown + (cursor ? `<span class="type-cursor${off ? " off" : ""}" aria-hidden="true"></span>` : "");
    };
    if (P.reduced()) { render(text.length, false); onDone?.(); return; }
    let shown = 0;
    P.frames((frame) => {
      if (frame <= 16) { render(0, true, Math.floor((frame - 1) / 4) % 2 === 1); return true; }
      shown = Math.min(text.length, shown + Math.max(1, Math.ceil((text.length - shown) / 14)));
      render(shown, shown < text.length);
      if (shown >= text.length) { onDone?.(); return false; }
    });
  };

  /* ---------- ⑥ 按帧加载 ---------- */
  P.progressHTML = (label = "LOADING") => `<div class="step-progress" role="progressbar" aria-label="${P.esc(label)}">
    <div class="step-progress-head"><span class="label">${P.esc(label)}</span><span class="num">0%</span></div>
    <div class="step-progress-cells">${"<i></i>".repeat(20)}</div></div>`;
  P.runProgress = (el, { label = "LOADING", doneLabel = "DONE", onDone } = {}) => {
    el.innerHTML = P.progressHTML(label);
    const cells = P.$$(".step-progress-cells i", el), num = P.$(".num", el), lab = P.$(".label", el);
    const finish = () => { cells.forEach((c) => c.classList.add("on")); num.innerHTML = `${P.icon("check")} 100%`; lab.textContent = doneLabel; onDone?.(); };
    if (P.reduced()) { finish(); return; }
    P.frames((f) => {
      const n = Math.min(20, Math.floor(f / 1.5));
      cells.forEach((c, i) => c.classList.toggle("on", i < n));
      num.textContent = `${n * 5}%`;
      if (n >= 20) { finish(); return false; }
    });
  };

  /* ---------- ③ 像素溶解转场（只在切换模块时） ---------- */
  P.dissolve = (canvas, area, swap) => {
    const box = area.getBoundingClientRect();
    const left = Math.max(0, box.left), top = Math.max(0, box.top);
    const width = Math.min(innerWidth, box.right) - left, height = Math.min(innerHeight, box.bottom) - top;
    if (P.reduced() || width <= 0 || height <= 0 || document.hidden) { swap(); return; }
    const dpr = devicePixelRatio || 1;
    Object.assign(canvas.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, display: "block" });
    canvas.width = Math.ceil(width * dpr); canvas.height = Math.ceil(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#EDEEF1";
    const size = 16, cols = Math.ceil(width / size), count = cols * Math.ceil(height / size);
    const shuffled = () => { const l = Array.from({ length: count }, (_, i) => i); for (let i = l.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l; };
    const cover = shuffled(), reveal = shuffled(), third = Math.ceil(count / 3);
    const cell = (i, fill) => { const x = (i % cols) * size, y = Math.floor(i / cols) * size; if (fill) ctx.fillRect(x, y, size, size); else ctx.clearRect(x, y, size, size); };
    const id = setInterval(() => {
      cell.frame = (cell.frame || 0) + 1;
      const f = cell.frame;
      if (f <= 3) cover.slice((f - 1) * third, f * third).forEach((i) => cell(i, true));
      if (f === 3) swap();
      if (f >= 4 && f <= 6) reveal.slice((f - 4) * third, (f - 3) * third).forEach((i) => cell(i, false));
      if (f === 6) { canvas.style.display = "none"; clearInterval(id); }
    }, P.FRAME);
  };

  /* ---------- 物料缩略图（原型用：CSS 画的假海报，真实版为 NAS 缩略图） ---------- */
  // kind: price | trial | course | event | grid9 | grid3 | long
  P.poster = (kind, { title = "", big = "", sub = "", seed = 1, accent = false } = {}) => {
    const lines = (n, w = [90, 70, 80, 60]) => Array.from({ length: n }, (_, i) => `<i style="width:${w[(i + seed) % w.length]}%"></i>`).join("");
    if (kind === "grid9" || kind === "grid3") {
      const n = kind === "grid9" ? 9 : 3;
      const tiles = Array.from({ length: n }, (_, i) => {
        const t = (i + seed) % 4;
        const inner = i === 4 && n === 9 ? `<b class="num">${P.esc(big || "11.11")}</b>` : t === 0 ? `<span class="pt-ink"></span>` : t === 1 ? `<span class="pt-dither"></span>` : `<span class="pt-lines">${lines(2)}</span>`;
        return `<span class="pt-tile${accent && i === 4 ? " is-accent" : ""}">${inner}</span>`;
      }).join("");
      return `<span class="poster poster-${kind}">${tiles}</span>`;
    }
    const head = { price: "PRICE", trial: "TRIAL", course: "COURSE", event: "EVENT", long: "CASE" }[kind] || "";
    return `<span class="poster poster-${kind}${accent ? " is-accent" : ""}">
      <span class="pt-head"><em>${head}</em><span class="pt-logo"></span></span>
      <span class="pt-title">${P.esc(title)}</span>
      ${big ? `<b class="pt-big num">${P.esc(big)}</b>` : `<span class="pt-dither pt-block"></span>`}
      <span class="pt-lines">${lines(3)}</span>
      ${sub ? `<span class="pt-sub">${P.esc(sub)}</span>` : ""}
      <span class="pt-foot"><span class="pt-qr"></span><span class="pt-lines">${lines(1)}</span></span>
    </span>`;
  };

  /* ---------- 小部件 ---------- */
  P.tag = (text, tone = "") => `<span class="tag${tone ? ` tag-${tone}` : ""}">${P.esc(text)}</span>`;
  P.ditherBar = (v, tone = "") => `<span class="dither-bar${tone ? ` is-${tone}` : ""}" role="img" aria-label="${Math.round(v * 100)}%"><span class="dither-bar-fill" style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></span></span>`;
  P.pips = (done, total) => `<span class="kpi-pips">${Array.from({ length: total }, (_, i) => `<i${i < done ? "" : ' class="off"'}></i>`).join("")}</span>`;
  P.card = ({ title, icon, extra = "", body, cls = "", bodyCls = "" }) => `<section class="card ${cls}">
    <div class="card-head"><h2>${icon ? P.icon(icon) : ""}${title}</h2><div class="card-extra">${extra}</div></div>
    <div class="card-body ${bodyCls}">${body}</div></section>`;
  P.money = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  P.signed = (n) => (n > 0 ? `+${P.money(n)}` : n < 0 ? `−${P.money(-n)}` : "±0");

  // 弹窗：内容为 HTML；关闭按钮 [data-close]
  P.openModal = (html, cls = "") => {
    const m = P.$("#modal");
    m.className = `modal ${cls}`;
    m.innerHTML = html;
    m.showModal();
    P.$$("[data-close]", m).forEach((b) => b.addEventListener("click", () => m.close()));
    return m;
  };

  // 轻提示：如实写明做了什么；原型里不写「成功」。
  P.toast = (text) => {
    let t = P.$("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
    t.innerHTML = `${P.icon("check")}<span>${P.esc(text)}</span>`;
    t.hidden = false;
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.hidden = true; }, 2600);
  };

  return P;
})();
