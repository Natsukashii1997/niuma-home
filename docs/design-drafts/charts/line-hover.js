// 折线图样稿的画法：业务页 TrendChart 与 Voice TrendChart 的 SVG 照 JSX 逐行搬成字符串，
// 只多两层——每点数值（point-labels.js 避让）与悬停 / 键盘的竖线 + 数据卡。计算直接用项目的 chart-math.js。
import { niceScale, yoy } from "/src/modules/business/chart-math.js";
import { labelLayout } from "/src/modules/voice/label-layout.js";
import { placeLabels } from "./point-labels.js";

const DOTS = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].flatMap((v, i) => v < 4 ? [[(i % 4) * 2, Math.floor(i / 4) * 2]] : []);
export const nf = (n, d = 0) => n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const wan = n => nf(n / 1e4);
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const exact = (value, unit) => value == null ? "无数据" : unit === "percent" ? `${(value * 100).toFixed(2)}%` : `${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`;
export const yoyText = (r, unit, estimated) => {
  const sign = r >= 0 ? "+" : "−";
  if (unit === "percent") return `${sign}${Math.abs(r * 100).toFixed(1)}`;
  return `${estimated ? "≈" : ""}${r >= 1 ? `×${nf(r + 1, r >= 9 ? 0 : 1)}` : `${sign}${Math.abs(r * 100).toFixed(0)}%`}`;
};
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
// 估宽：11px 字，Geist Mono 每字 0.6 个字号；中文按 1 个字号（与 BusinessCharts 的 textWidth 同一思路）
const tw = (s, size = 11, mono = true) => [...s].reduce((a, c) => a + (/[　-鿿＀-￯]/.test(c) ? size : size * (mono ? 0.6 : 0.56)), 0);

// ─── 业务页 TrendChart ─────────────────────────────────────────────
// 画布几何 + 标签摆放，只按宽度算一次；悬停只换高亮层
export function trendModel(t, ctx, { w, height, projection }) {
  const isPct = t.unit === "percent", n = t.categories.length;
  const vals = [...t.now, ...t.last, ...(projection && t.pace != null ? [t.pace] : [])].filter(v => v != null);
  const L = 44, R = 48, T = 26, B = 54, plotW = Math.max(0, w - L - R), plotH = height - T - B;
  const sc = isPct ? niceScale(Math.min(...vals) - 0.02, Math.max(...vals) + 0.01) : niceScale(0, Math.max(...vals));
  const x = i => L + plotW * (i + 0.5) / n, y = v => T + plotH * (1 - (v - sc.min) / (sc.max - sc.min));
  const fmt = v => isPct ? pct(v) : wan(v);
  const lastIdx = arr => arr.reduce((a, v, i) => v != null ? i : a, -1);
  const ia = lastIdx(t.now), ib = lastIdx(t.last);
  let ya = ia >= 0 ? y(t.now[ia]) : 0, yb = ib >= 0 ? y(t.last[ib]) : 0;
  if (ia !== t.partial && Math.abs(ya - yb) < 14) [ya, yb] = ya < yb ? [ya - 7, yb + 7] : [ya + 7, yb - 7];

  // 障碍：两条线的每一段、每个方点、「至今 / 推算」与线尾年份这些固定文字
  const segments = [], marks = [], boxes = [];
  const seg = (arr, skip) => arr.forEach((v, i) => { const u = arr[i + 1]; if (v != null && u != null && !skip?.(i)) segments.push([x(i), y(v), x(i + 1), y(u)]); });
  seg(t.now); seg(t.last);
  t.now.forEach((v, i) => v != null && marks.push({ x: x(i) - 4, y: y(v) - 4, w: 8, h: 8 }));
  t.last.forEach((v, i) => v != null && marks.push({ x: x(i) - 2.5, y: y(v) - 2.5, w: 5, h: 5 }));
  const part = t.partial >= 0 ? { x: x(t.partial), y: y(t.now[t.partial]), text: `至今 ${fmt(t.now[t.partial])}` } : null;
  if (part) boxes.push({ x: part.x + 8, y: part.y - 5, w: tw(part.text, 11, false), h: 11 });
  const pace = projection && t.pace != null ? { y: y(t.pace), text: `推算 ${fmt(t.pace)}` } : null;
  if (pace) {
    segments.push([part.x, part.y - 5, part.x, pace.y + 5]);
    marks.push({ x: part.x - 4, y: pace.y - 4, w: 8, h: 8 });
    boxes.push({ x: part.x + 8, y: pace.y - 5, w: tw(pace.text, 11, false), h: 11 });
  }
  if (ia >= 0 && ia !== t.partial) boxes.push({ x: x(ia) + 8, y: ya - 5, w: 27, h: 11 });
  if (ib >= 0) boxes.push({ x: x(ib) + 6, y: yb - 5, w: 27, h: 11 });

  // 标签：同一列里高的点往上标、低的点往下标；今年先摆，去年后摆
  const items = [];
  t.now.forEach((v, i) => { if (v != null && i !== t.partial) items.push({ key: `n${i}`, i, kind: "now", x: x(i), y: y(v), r: 4, text: fmt(v), side: t.last[i] == null || v >= t.last[i] ? "up" : "down" }); });
  t.last.forEach((v, i) => { if (v != null) items.push({ key: `l${i}`, i, kind: "last", x: x(i), y: y(v), r: 4, text: fmt(v), side: t.now[i] != null && i !== t.partial && t.now[i] < v ? "up" : "down" }); });
  const pos = placeLabels(items, { segments, marks, boxes, bounds: { x: L - 4, y: 4, w: w - L, h: T + plotH - 4 } });
  return { t, ctx, w, height, projection, isPct, n, L, R, T, B, plotW, plotH, sc, x, y, fmt, ia, ib, ya, yb, part, pace, labels: items.map((it, k) => ({ ...it, ...pos[k] })) };
}

export function trendSVG(m, { color = "var(--text)", active = -1, dotsId }) {
  const { t, ctx, w, height, isPct, n, L, R, T, plotW, plotH, sc, x, y, fmt } = m;
  const tick = v => isPct ? `${Math.round(v * 100)}%` : wan(v);
  const every = plotW / n < 34 ? 2 : 1, everyYoy = plotW / n < 44 ? 2 : 1;
  const path = arr => arr.map((v, i) => v == null ? "" : `${i === 0 || arr[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const partialPrev = t.partial > 0 ? t.now[t.partial - 1] : null;
  const s = [];
  s.push(`<svg class="bc-svg" width="${w}" height="${height}" role="img" aria-label="${ctx.year} 与 ${ctx.year - 1} 年逐月对比，${isPct ? "百分比" : "单位万元"}；按左右方向键逐月查看">`);
  sc.ticks.forEach(v => s.push(`<g><line class="bc-grid" x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${tick(v)}</text></g>`));
  if (!isPct) s.push(`<text x="${L - 6}" y="${T - 14}" text-anchor="end">万元</text>`);
  s.push(`<defs><pattern id="${dotsId}" width="8" height="8" patternUnits="userSpaceOnUse">${DOTS.map(([a, b]) => `<rect x="${a}" y="${b}" width="2" height="2" class="bc-dot"/>`).join("")}</pattern></defs>`);
  if (t.partial >= 0) s.push(`<rect x="${x(t.partial) - plotW / n / 2}" y="${T}" width="${plotW / n}" height="${plotH}" fill="url(#${dotsId})"/>`);
  // 新：悬停列的竖线（压在网点列上面、折线下面）
  if (active >= 0) s.push(`<line class="chart-cross" x1="${Math.round(x(active)) + 0.5}" x2="${Math.round(x(active)) + 0.5}" y1="${T}" y2="${T + plotH}"/>`);
  t.categories.forEach((c, i) => {
    // 月份隔月显示时，悬停到被省掉的那个月就把它补出来，并让开左右两个
    if (i !== active && (i % every || (every > 1 && active >= 0 && Math.abs(i - active) === 1))) return;
    const on = i === active;
    s.push(`<g class="${on ? "chart-xon" : ""}">${on ? `<rect x="${x(i) - 17}" y="${T + plotH + 4}" width="34" height="17"/>` : ""}<text x="${x(i)}" y="${T + plotH + 16}" text-anchor="middle" class="${i === t.cur ? "bc-ink bc-b" : ""}">${Number(c)}月</text></g>`);
  });
  s.push(`<path d="${path(t.last)}" fill="none" class="bc-last"/>`);
  t.last.forEach((v, i) => v != null && s.push(`<rect x="${x(i) - 2.5}" y="${y(v) - 2.5}" width="5" height="5" class="bc-last-dot"/>`));
  s.push(`<path d="${path(t.now.map((v, i) => i === t.partial ? null : v))}" fill="none" stroke="currentColor" stroke-width="2" style="color:${color}"/>`);
  if (t.partial >= 0 && partialPrev != null) s.push(`<line x1="${x(t.partial - 1)}" y1="${y(partialPrev)}" x2="${x(t.partial)}" y2="${y(t.now[t.partial])}" stroke="currentColor" stroke-width="2" stroke-dasharray="2 3" style="color:${color}"/>`);
  t.now.forEach((v, i) => {
    if (v == null) return;
    const part = i === t.partial;
    s.push(`<g style="color:${color}"><rect x="${x(i) - 4}" y="${y(v) - 4}" width="8" height="8" fill="${part ? "var(--panel)" : "currentColor"}" stroke="currentColor" stroke-width="${part ? 2 : 0}"/>`);
    if (part) s.push(`<text x="${x(i) + 8}" y="${y(v) + 4}" class="bc-sans bc-colored chart-val${i === active ? " is-on" : ""}">至今 ${fmt(v)}</text>`);
    s.push(`</g>`);
  });
  if (m.pace) s.push(`<g class="bc-pace"><line x1="${x(t.partial)}" x2="${x(t.partial)}" y1="${y(t.value) - 5}" y2="${m.pace.y + 5}" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" style="color:${color}"/><rect x="${x(t.partial) - 4}" y="${m.pace.y - 4}" width="8" height="8"/><text x="${x(t.partial) + 8}" y="${m.pace.y + 4}" class="bc-sans chart-val">${m.pace.text}</text></g>`);
  // 新：每点数值（今年墨色、去年灰色；放不下的不画，悬停卡里有）
  m.labels.forEach(l => { if (!l.hidden) s.push(`<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" class="chart-val ${l.kind === "now" ? "bc-ink" : "is-last"}${l.i === active ? " is-on" : ""}">${l.text}</text>`); });
  if (m.ia >= 0 && m.ia !== t.partial) s.push(`<text x="${x(m.ia) + 8}" y="${m.ya + 4}" class="bc-b bc-colored" style="color:${color}">${ctx.year}</text>`);
  if (m.ib >= 0) s.push(`<text x="${x(m.ib) + 6}" y="${m.yb + 4}">${ctx.year - 1}</text>`);
  // 新：悬停列每个点套一个方框
  if (active >= 0) {
    const ring = (v, cls, style = "") => v != null && s.push(`<rect class="chart-ring ${cls}" x="${x(active) - 6}" y="${y(v) - 6}" width="12" height="12" style="${style}"/>`);
    ring(t.last[active], "is-last");
    ring(t.now[active], "", `color:${color}`);
    if (active === t.partial && m.pace) ring(t.pace, "is-pace");
  }
  s.push(`<text x="${L - 6}" y="${T + plotH + 40}" text-anchor="end">${isPct ? "差" : "同比"}</text>`);
  t.categories.forEach((c, i) => {
    const r = i % everyYoy ? null : yoy(t, i);
    if (r) s.push(`<text x="${x(i)}" y="${T + plotH + 40}" text-anchor="middle" class="${r.value >= 0 ? "bc-up" : "bc-down"}${i === active ? " bc-b" : ""}">${yoyText(r.value, t.unit, r.estimated)}</text>`);
  });
  s.push(`<rect class="chart-hit" x="${L}" y="0" width="${plotW}" height="${height}"/>`);
  s.push(`</svg>`);
  return s.join("");
}

// 数据卡：一列所有线各一行（方点照图上的样子画），底下一行同比
export function trendTip(m, i, { color = "var(--text)" }) {
  const { t, ctx, isPct } = m;
  const part = i === t.partial, future = t.now[i] == null && t.cur >= 0 && i > t.cur;
  const main = v => v == null ? "—" : isPct ? exact(v, t.unit) : `${nf(v / 1e4, 1)} 万`;
  const sub = v => v == null ? "还没有数据" : isPct ? "" : exact(v, t.unit);
  const row = (mk, name, v, extra = "", mkStyle = "") => `<div class="chart-tip-row ${extra}"><i class="chart-tip-mk ${mk}" style="${mkStyle}"></i><span class="chart-tip-name">${name}</span><span class="chart-tip-v">${main(v)}</span>${sub(v) ? `<span class="chart-tip-x">${sub(v)}</span>` : ""}</div>`;
  const rows = [row(part ? "is-part" : "is-now", `${ctx.year} ${part ? "至今" : "今年"}`, t.now[i], "", `color:${color}`)];
  if (part && m.pace) rows.push(`<div class="chart-tip-row is-pace"><i class="chart-tip-mk is-pace"></i><span class="chart-tip-name">推算月底（示意）</span><span class="chart-tip-v">≈ ${wan(t.pace)} 万</span><span class="chart-tip-x">按日均外推，不含月底冲量</span></div>`);
  rows.push(row("is-last", `${ctx.year - 1} 去年`, t.last[i]));
  const r = yoy(t, i);
  const foot = r ? `<div class="chart-tip-foot"><span>${isPct ? "差" : "同比"}${r.estimated ? "（按推算）" : ""}</span><b class="${r.value >= 0 ? "bc-up" : "bc-down"}">${yoyText(r.value, t.unit, r.estimated)}${isPct ? " 个点" : ""}</b></div>` : "";
  const note = part ? `至今 · 第 ${ctx.day}/${ctx.daysInMonth} 天` : future ? "还没到" : "";
  return `<div class="chart-tip-head"><b>${Number(t.categories[i])} 月</b><span>${note}</span></div>${rows.join("")}${foot}`;
}

// ─── Voice TrendChart（viewBox 1000×220 缩放，坐标全按 viewBox 算）──────
export function voiceModel(topics) {
  const W = 1000, H = 220, L = 40, R = 260, T = 12, B = 26;
  const x = i => L + (i * (W - L - R)) / 6, y = val => T + (1 - val / 100) * (H - T - B);
  const text = tp => `${tp.title.length > 16 ? `${tp.title.slice(0, 16)}…` : tp.title} · ${tp.heat}`;
  const layout = labelLayout(topics, { H, T, B, h: 16 });
  const endPos = new Map(layout.mode === "labels" ? layout.labels.map(l => [l.id, l]) : []);
  const segments = [], marks = [], boxes = [];
  topics.forEach(tp => tp.spark.forEach((v, i) => {
    marks.push({ x: x(i) - 4, y: y(v) - 4, w: 8, h: 8 });
    if (i < tp.spark.length - 1) segments.push([x(i), y(v), x(i + 1), y(tp.spark[i + 1])]);
  }));
  topics.forEach(tp => { const p = endPos.get(tp.id); if (p) boxes.push({ x: W - R + 10, y: p.labelY - 6, w: tw(text(tp), 12, false), h: 13 }); });
  // 同一天里按高低排：上半往上标、下半往下标；第一名先摆。最后一天的值已写在线尾标签里（「标题 · 92」），不再重复标
  const items = [];
  topics.forEach((tp, k) => tp.spark.forEach((v, i) => {
    if (i === tp.spark.length - 1 && endPos.has(tp.id)) return;
    const rank = topics.map(o => o.spark[i]).filter(o => o > v).length;
    items.push({ key: `${tp.id}-${i}`, i, k, x: x(i), y: y(v), r: 4, text: String(v), side: rank < topics.length / 2 ? "up" : "down" });
  }));
  items.sort((a, b) => a.k - b.k || a.i - b.i);
  const pos = placeLabels(items, { segments, marks, boxes, bounds: { x: L - 4, y: 0, w: W - R - L + 8, h: H - B - 2 } });
  return { W, H, L, R, T, B, x, y, text, layout, endPos, topics, labels: items.map((it, n) => ({ ...it, ...pos[n] })) };
}

export function voiceSVG(m, { active = -1 }) {
  const { W, H, L, R, T, B, x, y, text, endPos, topics } = m;
  const s = [`<svg viewBox="0 0 ${W} ${H}" class="trend-chart" role="img" aria-label="话题热度趋势；按左右方向键逐天查看" shape-rendering="crispEdges">`];
  [0, 25, 50, 75, 100].forEach(v => s.push(`<g><line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid-line"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="axis">${v}</text></g>`));
  if (active >= 0) s.push(`<line class="chart-cross" x1="${x(active)}" x2="${x(active)}" y1="${T}" y2="${H - B}"/>`);
  (topics[0]?.sparkDates || []).forEach((l, i) => s.push(`<g class="${i === active ? "chart-xon" : ""}">${i === active ? `<rect x="${x(i) - 22}" y="${H - 19}" width="44" height="17"/>` : ""}<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="axis">${String(l).slice(5, 10)}</text></g>`));
  topics.map((tp, k) => {
    const p = endPos.get(tp.id);
    return `<g class="${k === 0 ? "series is-top" : "series"}"><polyline points="${tp.spark.map((v, i) => `${x(i)},${y(v)}`).join(" ")}"/>${tp.spark.map((v, i) => `<rect x="${x(i) - 4}" y="${y(v) - 4}" width="8" height="8" class="pt"/>`).join("")}${p && Math.abs(p.labelY - p.pointY) > 0.5 ? `<line x1="${W - R + 4}" y1="${p.pointY}" x2="${W - R + 8}" y2="${p.labelY}" class="leader"/>` : ""}${p ? `<text x="${W - R + 10}" y="${p.labelY + 4}" class="end-label">${esc(text(tp))}</text>` : ""}</g>`;
  }).reverse().forEach(g => s.push(g));
  m.labels.forEach(l => { if (!l.hidden) s.push(`<text x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" class="chart-val${l.k === 0 ? " is-top" : ""}${l.i === active ? " is-on" : ""}">${l.text}</text>`); });
  if (active >= 0) topics.forEach((tp, k) => s.push(`<rect class="chart-ring${k === 0 ? " is-top" : " is-last"}" x="${x(active) - 6}" y="${y(tp.spark[active]) - 6}" width="12" height="12"/>`));
  s.push(`<rect class="chart-hit" x="${L}" y="0" width="${W - R - L}" height="${H}"/>`);
  s.push(`</svg>`);
  return s.join("");
}

export function voiceTip(m, i) {
  const d = m.topics[0]?.sparkDates?.[i];
  const rows = m.topics.map((tp, k) => `<div class="chart-tip-row${k === 0 ? " is-top" : ""}"><i class="chart-tip-mk ${k === 0 ? "is-top" : "is-last"}"></i><span class="chart-tip-name" title="${esc(tp.title)}">${esc(tp.title)}</span><span class="chart-tip-v">${tp.spark[i]}</span></div>`);
  return `<div class="chart-tip-head"><b>${d ? String(d).slice(5, 10) : `第 ${i + 1} 天`}</b><span>热度 0–100</span></div>${rows.join("")}`;
}

// ─── 悬停 / 键盘：竖线 + 数据卡，卡片放在竖线右边，放不下换左边，始终夹在图框里 ──────
export function bindHover(host, { n, colX, colW, toPx = v => v, draw, tip, start }) {
  let active = -1;
  const card = document.createElement("div");
  card.className = "chart-tip";
  card.setAttribute("aria-live", "polite");
  card.hidden = true;
  card.innerHTML = `<div class="chart-tip-sh"></div><div class="chart-tip-card"></div>`;
  const set = i => {
    active = i;
    draw(active);
    host.append(card);
    if (i < 0) { card.hidden = true; return; }
    card.hidden = false;
    card.lastChild.innerHTML = tip(i);
    const W = host.clientWidth, H = host.clientHeight, cw = card.offsetWidth + 6, ch = card.offsetHeight + 6;
    // 让开这一列：竖线两侧各留半列宽（至少 14px），这一列的数值不被卡片盖住
    const cx = toPx(colX(i)), gap = Math.max(14, colW() / 2 + 2);
    let left = cx + gap;
    if (left + cw > W) left = cx - gap - cw;
    left = Math.max(0, Math.min(W - cw, left));
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(0, Math.min(H - ch, 8))}px`;
  };
  host.tabIndex = 0;
  host.addEventListener("pointermove", e => {
    if (!e.target.closest(".chart-hit")) return;
    const r = host.getBoundingClientRect(), px = e.clientX - r.left;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(toPx(colX(i)) - px) < Math.abs(toPx(colX(best)) - px)) best = i;
    if (best !== active) set(best);
  });
  host.addEventListener("pointerleave", () => { if (document.activeElement !== host) set(-1); });
  host.addEventListener("focus", () => { if (active < 0) set(start()); });
  host.addEventListener("blur", () => set(-1));
  host.addEventListener("keydown", e => {
    const k = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (k) { e.preventDefault(); set(active < 0 ? start() : Math.max(0, Math.min(n - 1, active + k))); }
    else if (e.key === "Home") { e.preventDefault(); set(0); }
    else if (e.key === "End") { e.preventDefault(); set(n - 1); }
    else if (e.key === "Escape") set(-1);
  });
  return { set, get active() { return active; } };
}
