// 业务页设计稿公共脚本：数据读取、格式化、外框、营收完成度卡、SVG 小工具。不引入任何图表库。
(function () {
  const BIZ = window.BIZ, REV = window.REV;

  /* ---------- 网点（照抄 src/ui/bitmap.jsx 的 Bayer 4×4） ---------- */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const tile = (t, color) => {
    const rects = BAYER.map((v, i) => (v < t ? `<rect x="${(i % 4) * 2}" y="${Math.floor(i / 4) * 2}" width="2" height="2"/>` : "")).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" shape-rendering="crispEdges" fill="${color}">${rects}</svg>`;
  };
  const root = document.documentElement.style;
  [2, 4, 6, 8].forEach((t, i) => root.setProperty(`--dither-${i + 1}`, `url("data:image/svg+xml,${encodeURIComponent(tile(t, "#C9CCD3"))}")`));
  [4, 8, 12, 16].forEach((t, i) => root.setProperty(`--dither-ink-${i + 1}`, `url("data:image/svg+xml,${encodeURIComponent(tile(t, "#0D0E10"))}")`));
  // SVG 内用的网点 pattern：<defs> 里放一次，fill="url(#d-ink-2)"
  const patterns = () => {
    const make = (id, t, color) => `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse">${BAYER.map((v, i) => (v < t ? `<rect x="${(i % 4) * 2}" y="${Math.floor(i / 4) * 2}" width="2" height="2" fill="${color}"/>` : "")).join("")}</pattern>`;
    return `<defs>${make("d-gray-2", 4, "#C9CCD3")}${make("d-gray-3", 6, "#C9CCD3")}${make("d-ink-1", 4, "#0D0E10")}${make("d-ink-2", 8, "#0D0E10")}${make("d-uni", 6, "#C23B30")}${make("d-intl", 6, "#1E8E4E")}${make("d-appeal", 6, "#2563EB")}${make("d-signal", 6, "#FF4F1F")}</defs>`;
  };

  /* ---------- 像素图标（7×7，取自 src/ui/icons7.js） ---------- */
  const ICONS = {
    business: ["......#", "....#.#", "....#.#", "..#.#.#", "..#.#.#", "#.#.#.#", "#######"],
    trend: ["...####", ".....##", "....#.#", "...#...", "#.#....", ".#.....", "......."],
    alert: ["...#...", "..#.#..", "..#.#..", ".#.#.#.", ".#...#.", "#..#..#", "#######"],
    home: ["...#...", "..###..", ".#####.", "#######", ".#...#.", ".#.#.#.", ".#.#.#."],
    refresh: [".####..", "#....#.", "#......", "#...###", "#....#.", "#....#.", ".####.."],
    external: ["...####", ".....##", "....#.#", "#..#..#", "#.#....", "#......", "#####.."],
    up: [".......", "...#...", "..#.#..", ".#...#.", "#.....#", ".......", "......."],
    down: [".......", "#.....#", ".#...#.", "..#.#..", "...#...", ".......", "......."],
  };
  const icon = (name, size = 14, color = "currentColor") => {
    const cell = size / 7, rows = ICONS[name] || ICONS.business;
    const rects = rows.flatMap((r, y) => [...r].map((c, x) => (c === "#" ? `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>` : ""))).join("");
    return `<svg class="pixel-icon" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="${color}" shape-rendering="crispEdges">${rects}</svg>`;
  };

  /* ---------- 格式化 ---------- */
  const nf = (n, d = 0) => n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
  const wan = (n, d = 0) => `${nf(n / 1e4, d)}`; // 只给数，单位另写
  const money = n => (Math.abs(n) >= 1e8 ? `${nf(n / 1e8, 2)} 亿` : `${nf(n / 1e4, Math.abs(n) >= 1e6 ? 0 : 1)} 万`);
  const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
  const signed = (x, d = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d)}%`;
  const pts = (x, d = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d)} 个点`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  /* ---------- 数据 ---------- */
  const LINES = {
    total: { name: "总营收", chart: "总营收", color: "var(--text)", hex: "#0D0E10" },
    uni: { name: "大学辅导", short: "大学", chart: "大学辅导趋势 - 总营收", pie: "当月大学营收占比", color: "var(--uni)", hex: "#C23B30" },
    intl: { name: "国际课程", short: "国课", chart: "国际课程趋势 - 总营收", pie: "当月国课营收占比", color: "var(--intl)", hex: "#1E8E4E" },
    appeal: { name: "申诉服务", short: "申诉", chart: "申诉趋势 - 总营收", pie: "当月申诉营收占比", color: "var(--appeal)", hex: "#2563EB" },
  };
  const byName = name => BIZ.charts.find(c => c.name === name);
  const [year, month] = BIZ.period.split("-").map(Number);
  const day = Number(BIZ.updatedAt.slice(8, 10));
  const daysInMonth = new Date(year, month, 0).getDate();
  const cur = month - 1; // 当月在 categories 里的下标
  // 趋势：thisY / lastY 为 12 个月数组；partial 为当月下标（未过完）
  function trend(key) {
    const c = byName(key === "conv" ? "总转化率趋势" : LINES[key].chart);
    const last = c.series.find(s => s.name === String(year - 1)).values, now = c.series.find(s => s.name === String(year)).values;
    const sum = (a, n) => a.slice(0, n).reduce((s, v) => s + (v || 0), 0);
    const ytd = sum(now, cur), ytdLast = sum(last, cur);
    return { chart: c, unit: c.unit, months: c.categories, now, last, partial: cur,
      ytd, ytdLast, ytdYoY: ytd / ytdLast - 1,
      cur: now[cur], lastSame: last[cur], pace: now[cur] / day * daysInMonth };
  }
  function share(key, dim) {
    const name = BIZ.charts.map(c => c.name).find(n => n.startsWith(`${LINES[key].pie} - ${dim}`));
    const c = name && byName(name);
    if (!c) return null;
    const items = [...c.items].sort((a, b) => b.value - a.value).map(i => ({ ...i, share: i.value / c.total }));
    return { chart: c, name, dim, total: c.total, items, count: items.length, onlyBlank: items.length === 1 && items[0].label === "未填写" };
  }
  // 前 n 项 + 其他（其他永远放最后、单独样式）
  function topN(s, n) {
    if (s.items.length <= n + 1) return s.items;
    const rest = s.items.slice(n), v = rest.reduce((a, i) => a + i.value, 0);
    return [...s.items.slice(0, n), { label: `其他 ${rest.length} 项`, value: v, share: v / s.total, other: true }];
  }

  /* ---------- 外框 ---------- */
  function frame(version) {
    const page = document.getElementById("page");
    const nav = ["首页", "策略", "营销", "Voice", "项目", "带教", "品牌", "业务", "Agent", "日/周报", "飞书知识库"];
    const shell = document.createElement("div");
    shell.innerHTML = `<div class="chrome"><span class="chrome-dots"><i></i><i></i><i></i></span><span class="chrome-path">牛马之家 / <b>业务</b></span><span class="draft-flag">设计稿 ${esc(version)} · 数据 ${esc(BIZ.updatedAt)}</span></div>
      <div class="layout"><nav class="sidebar"><div class="brand"><i></i>牛马之家</div>${nav.map(n => `<a class="${n === "业务" ? "active" : ""}">${icon(n === "业务" ? "business" : "home")}${n}</a>`).join("")}</nav><main class="main"></main></div>`;
    page.replaceWith(shell);
    shell.querySelector(".main").append(page);
  }

  /* ---------- 营收完成度卡（沿用现有，只读展示） ---------- */
  function revenueCard() {
    const r = REV, t = r.timePct;
    const NAME = { uni: "大学辅导", intl: "国际课程", appeal: "申诉服务" };
    const item = it => {
      if (it.rate != null) return `<div class="rev-item rev-rate"><div class="rev-head"><span class="rev-name">${it.name}</span></div><span class="rev-pct">${pct(it.rate)}</span><div class="rev-nums tnum">上月 <b class="rev-last">${pct(it.lastMonthRate)}</b></div></div>`;
      const p = it.current / it.target, tone = p >= t ? "ok" : p >= t - 0.15 ? "warn" : "risk";
      const lit = Math.round(p * 20);
      return `<div class="rev-item is-${tone} line-${it.key}"><div class="rev-head"><span class="rev-name">${NAME[it.key] || it.name}</span><span class="rev-tone">${{ ok: "跟上进度", warn: "略落后", risk: "落后" }[tone]}</span></div>
        <span class="rev-pct">${Math.round(p * 100)}%</span>
        <span class="pixel-bar">${Array.from({ length: 20 }, (_, i) => `<i class="${i < lit ? "on" : ""}"></i>`).join("")}<b style="left:${t * 100}%"></b></span>
        <div class="rev-nums tnum"><span class="rev-cur">当前 ${nf(it.current / 1e4, 1)} 万</span>目标 ${nf(it.target / 1e4, 1)} 万</div></div>`;
    };
    return `<section class="card"><div class="card-head"><h3>${icon("trend")} 业务营收完成度</h3><span class="small muted">${r.period} · 时间进度 ${Math.round(t * 100)}%（竖线） · 沿用现有，不在本次重做范围</span></div>
      <div class="rev-groups">${r.groups.map(g => `<div class="rev-row cols-${g.items.length}"><span class="rev-group">${g.label}</span>${g.items.map(item).join("")}</div>`).join("")}</div></section>`;
  }

  /* ---------- SVG 小工具 ---------- */
  const niceStep = raw => { const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
  function scale(lo, hi, count = 4) {
    const step = niceStep((hi - lo) / count || 1);
    const min = Math.floor(lo / step) * step, max = Math.ceil(hi / step) * step;
    const ticks = []; for (let v = min; v <= max + step / 2; v += step) ticks.push(v);
    return { min, max, ticks, step };
  }
  // 按容器真实宽度画（避免 viewBox 缩放把 11px 字缩小），宽度变化时重画
  function mount(el, render) {
    let w = 0;
    const draw = () => { const nw = Math.floor(el.clientWidth); if (nw && nw !== w) { w = nw; el.innerHTML = render(w); } };
    new ResizeObserver(draw).observe(el); draw();
  }
  // 中文大致宽度估算：汉字 ≈ 字号，其他 ≈ 0.6 字号
  const textW = (s, size = 11) => [...String(s)].reduce((a, c) => a + (/[　-鿿＀-￯]/.test(c) ? size : size * 0.62), 0);
  const fit = (s, maxW, size = 11) => { s = String(s); if (textW(s, size) <= maxW) return s; while (s.length > 1 && textW(s + "…", size) > maxW) s = s.slice(0, -1); return s + "…"; };

  /* ---------- 今年 vs 去年折线（V1 / V3 共用） ----------
     今年实线 + 实心方点，去年灰色虚线；线尾直接写年份，不用图例。
     当月未过完：空心方点 + 「至今」；projection 时在同一列画虚线到「推算」空心点。 */
  function lineChart(w, t, o = {}) {
    const h = o.h || 240, color = o.color || "var(--text)", isPct = t.unit === "percent";
    const L = o.left ?? 44, R = 48, T = o.labels ? 26 : 22, B = 24 + (o.yoy ? 30 : 0);
    const vals = [...t.now, ...t.last, ...(o.projection ? [t.pace] : [])].filter(v => v != null);
    const sc = isPct ? scale(Math.min(...vals) - 0.02, Math.max(...vals) + 0.01, 4) : scale(0, Math.max(...vals), 4);
    const n = t.months.length, plotW = w - L - R, plotH = h - T - B;
    const x = i => L + plotW * (i + 0.5) / n, y = v => T + plotH * (1 - (v - sc.min) / (sc.max - sc.min));
    const fmtV = v => (isPct ? pct(v, 1) : nf(v / 1e4));
    const tick = v => (isPct ? `${Math.round(v * 100)}%` : nf(v / 1e4));
    const path = arr => arr.map((v, i) => (v == null ? "" : `${i === 0 || arr[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join("");
    const every = plotW / n < 34 ? 2 : 1;
    let s = `<svg class="chart" width="${w}" height="${h}">${patterns()}`;
    s += sc.ticks.map(v => `<line class="grid" x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${tick(v)}</text>`).join("");
    if (!isPct && o.unitLabel !== false) s += `<text x="${L - 6}" y="${T - 14}" text-anchor="end">万元</text>`;
    s += t.months.map((m, i) => (i % every ? "" : `<text x="${x(i)}" y="${T + plotH + 16}" text-anchor="middle" class="${i === t.partial ? "ink b" : ""}">${Number(m)}月</text>`)).join("");
    // 当月列：浅网点底，提示「这一列还没过完」
    s += `<rect x="${x(t.partial) - plotW / n / 2}" y="${T}" width="${plotW / n}" height="${plotH}" fill="url(#d-gray-2)"/>`;
    s += `<path d="${path(t.last)}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    s += t.last.map((v, i) => (v == null ? "" : `<rect x="${x(i) - 2.5}" y="${y(v) - 2.5}" width="5" height="5" fill="var(--muted)"><title>${year - 1} 年 ${i + 1} 月 · ${fmtV(v)}${isPct ? "" : " 万"}</title></rect>`)).join("");
    s += `<path d="${path(t.now.map((v, i) => (i === t.partial ? null : v)))}" fill="none" stroke="${color}" stroke-width="2"/>`;
    if (t.now[t.partial] != null && t.now[t.partial - 1] != null) s += `<line x1="${x(t.partial - 1)}" y1="${y(t.now[t.partial - 1])}" x2="${x(t.partial)}" y2="${y(t.now[t.partial])}" stroke="${color}" stroke-width="2" stroke-dasharray="2 3"/>`;
    t.now.forEach((v, i) => {
      if (v == null) return;
      const part = i === t.partial, above = t.last[i] == null || v >= t.last[i];
      s += `<rect x="${x(i) - 4}" y="${y(v) - 4}" width="8" height="8" fill="${part ? "var(--panel)" : color}" stroke="${color}" stroke-width="${part ? 2 : 0}"><title>${year} 年 ${i + 1} 月${part ? "（至今）" : ""} · ${fmtV(v)}${isPct ? "" : " 万"}</title></rect>`;
      if (o.labels && !(part && o.projection)) s += `<text x="${x(i)}" y="${above ? y(v) - 9 : y(v) + 18}" text-anchor="middle" class="ink">${fmtV(v)}</text>`;
      if (part) s += `<text x="${x(i) + 8}" y="${y(v) + 4}" class="sans" fill="${color}" style="fill:${color}">${o.projection ? `至今 ${fmtV(v)}` : "至今"}</text>`;
    });
    if (o.projection && t.now[t.partial] != null) {
      const px = x(t.partial), py = y(t.pace);
      s += `<line x1="${px}" x2="${px}" y1="${y(t.now[t.partial]) - 5}" y2="${py + 5}" stroke="${color}" stroke-width="1.5" stroke-dasharray="2 2"/>`;
      s += `<rect x="${px - 4}" y="${py - 4}" width="8" height="8" fill="var(--panel)" stroke="var(--signal)" stroke-width="2" stroke-dasharray="2 1"/>`;
      s += `<text x="${px + 8}" y="${py + 4}" class="sans" style="fill:var(--signal)">推算 ${fmtV(t.pace)}</text>`;
    }
    // 线尾年份
    const lastIdx = arr => arr.reduce((a, v, i) => (v != null ? i : a), -1);
    const ia = lastIdx(t.now), ib = lastIdx(t.last);
    let ya = y(t.now[ia]), yb = y(t.last[ib]);
    if (ia !== t.partial && Math.abs(ya - yb) < 14) { if (ya < yb) { ya -= 7; yb += 7; } else { ya += 7; yb -= 7; } }
    if (ia !== t.partial) s += `<text x="${x(ia) + 8}" y="${ya + 4}" class="b" style="fill:${color}">${year}</text>`;
    s += `<text x="${x(ib) + 6}" y="${yb + 4}">${year - 1}</text>`;
    if (o.yoy) {
      const yy = T + plotH + 40;
      s += `<text x="${L - 6}" y="${yy}" text-anchor="end">同比</text>`;
      const everyY = plotW / n < 44 ? 2 : 1;
      t.now.forEach((v, i) => {
        if (v == null || t.last[i] == null || i % everyY) return;
        const part = i === t.partial, r = isPct ? (part ? null : v - t.last[i]) : (part ? t.pace : v) / t.last[i] - 1;
        if (r == null) return;
        // 翻倍以上写成倍数，免得 +2393% 挤爆一行
        const txt = isPct ? `${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(1)}` : r >= 1 ? `${part ? "≈" : ""}×${nf(r + 1, r >= 9 ? 0 : 1)}` : `${part ? "≈" : ""}${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(0)}%`;
        s += `<text x="${x(i)}" y="${yy}" text-anchor="middle" style="fill:${r >= 0 ? "var(--ok)" : "var(--risk)"}">${txt}</text>`;
      });
    }
    return s + "</svg>";
  }

  window.K = { BIZ, REV, LINES, year, month, day, daysInMonth, cur, trend, share, topN, frame, revenueCard, icon, patterns, nf, wan, money, pct, signed, pts, esc, scale, mount, textW, fit, lineChart };
})();
