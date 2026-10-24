import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { apiRead } from "../../api.js";
import { Button, Card, Loadable, Placeholder, Segmented, Tag } from "../../ui/components.jsx";
import { LINES } from "../../constants.js";
import { placeLabels } from "../../ui/chart-labels.js";
import { ChartTip, ChartTipRow, useChartHover } from "../../ui/chart-hover.jsx";
import { monthContext, niceScale, shareItems, squarify, topN, yearTrend, yoy } from "./chart-math.js";
import "./business-charts.css";

// 业务页 V3 聚焦式（用户 2026-10-23 选定，稿件 docs/design-drafts/business/v3.html）：
// 顶部切换总营收 / 三条业务线，整块跟着换——左边趋势大图，右边读数栏，下方是构成。
const VIEWS = {
  total: { name: "总营收", chart: "总营收" },
  uni: { name: LINES[0], short: "大学", chart: "大学辅导趋势 - 总营收", pie: "当月大学营收占比", third: "学校", color: "var(--bc-uni)" },
  intl: { name: LINES[1], short: "国课", chart: "国际课程趋势 - 总营收", pie: "当月国课营收占比", third: "科目一级", color: "var(--bc-intl)" },
  appeal: { name: LINES[2], short: "申诉", chart: "申诉趋势 - 总营收", pie: "当月申诉营收占比", third: "学校", color: "var(--bc-appeal)" },
};
const PARTS = ["uni", "intl", "appeal"];
// 当月列的浅网点（与 --dither-2 同一 Bayer 4×4 阈值）：SVG 填充不能用 CSS 图片变量，单独画成 pattern
const DOTS = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].flatMap((v, i) => v < 4 ? [[(i % 4) * 2, Math.floor(i / 4) * 2]] : []);
const CONV = "总转化率趋势";

const exact = (value, unit) => value == null ? "无数据" : unit === "percent" ? `${(value * 100).toFixed(2)}%` : `${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`;
const nf = (n, d = 0) => n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
const wan = n => nf(n / 1e4);
const money = n => Math.abs(n) >= 1e8 ? `${nf(n / 1e8, 2)} 亿` : `${wan(n)} 万`;
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
// 同比文字：翻倍以上写成倍数（国课 ×25 比 +2393% 好读）；转化率写百分点差
const yoyText = (r, unit, estimated) => {
  const sign = r >= 0 ? "+" : "−";
  if (unit === "percent") return `${sign}${Math.abs(r * 100).toFixed(1)}`;
  return `${estimated ? "≈" : ""}${r >= 1 ? `×${nf(r + 1, r >= 9 ? 0 : 1)}` : `${sign}${Math.abs(r * 100).toFixed(0)}%`}`;
};
const ytdText = t => t.unit === "percent" ? `${t.ytdYoY >= 0 ? "+" : "−"}${Math.abs(t.ytdYoY * 100).toFixed(1)} 个点` : yoyText(t.ytdYoY, t.unit);

// 显式刷新直达飞书；后台刷新期间保留旧图，刷新完成后自动回读页面。
function useCharts() {
  const [state, setState] = useState({ loading: true });
  const [request, setRequest] = useState({ tick: 0, refresh: false });
  const reload = useCallback(() => setRequest(r => ({ tick: r.tick + 1, refresh: true })), []);
  useEffect(() => {
    let active = true, timer;
    setState(s => ({ ...s, loading: !s.data, busy: true, error: undefined }));
    async function read(force) {
      try {
        const data = await apiRead(`/api/v3/business/charts${force ? "?refresh=1" : ""}`);
        if (!active) return;
        setState({ data, busy: data.refreshing });
        if (data.refreshing) timer = setTimeout(() => read(false), 2000);
      } catch (error) {
        if (active) setState(s => ({ ...s, loading: false, busy: false, error: error.message }));
      }
    }
    read(request.refresh);
    return () => { active = false; clearTimeout(timer); };
  }, [request]);
  return { ...state, reload };
}

// 按容器真实宽度画 SVG：用 viewBox 缩放会把 11px 的字一起缩小
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function BusinessCharts() {
  const state = useCharts(), data = state.data;
  const [view, setView] = useState("total");
  return <section className="business-charts" aria-label="营收与转化趋势">
    <div className="section-head bc-bar">
      <Segmented options={Object.entries(VIEWS).map(([k, v]) => [k, v.name])} value={view} onChange={setView} />
      <span className="spacer" />
      {data && <span className="small muted">{data.charts.length} 张图 · 更新 {data.updatedAt}</span>}
      <Button onClick={state.reload} disabled={state.busy}>{state.busy ? "读取中…" : "重新读取图表"}</Button>
      {data && <a className="small bc-source-link" href={data.source} target="_blank" rel="noreferrer">在飞书查看 ↗</a>}
    </div>
    {data && (state.error || data.sourceError || data.stale) && <p className="warn" role="status">{state.error || data.sourceError ? `更新未完成：${state.error || data.sourceError}。` : "正在更新图表。"} 当前显示 {data.updatedAt} 的上次完整结果。</p>}
    {!data ? <Loadable state={state} name="业务图表">{() => null}</Loadable> : <FocusView data={data} view={view} />}
  </section>;
}

function FocusView({ data, view }) {
  const ctx = monthContext(data.period, data.updatedAt);
  const find = name => data.charts.find(c => c.name === name);
  const chart = find(VIEWS[view].chart);
  if (!chart) return <Placeholder icon="trend" title={`飞书里没有找到「${VIEWS[view].chart}」`} />;
  const t = yearTrend(chart, ctx);
  const totalChart = find(VIEWS.total.chart), total = totalChart && yearTrend(totalChart, ctx);
  return <>
    <div className="bc-focus">
      <Card className="bc-trend" title={<>{view !== "total" && <i className="bc-swatch" style={{ background: VIEWS[view].color }} />}{VIEWS[view].name} · 月度</>} extra={<span className="small muted">每点标金额（万元）：黑字今年、灰字去年；下排为同比 · 实线今年、虚线去年、网点列为当月</span>}>
        <TrendChart t={t} ctx={ctx} color={VIEWS[view].color} height={320} labels projection />
        <SourceDetails chart={chart} />
      </Card>
      <Readout t={t} ctx={ctx} share={view === "total" || !total?.value ? null : t.value / total.value} />
    </div>
    {view === "total" ? <TotalBelow data={data} ctx={ctx} find={find} total={total} /> : <Composition data={data} view={view} ctx={ctx} />}
  </>;
}

// 今年 vs 去年折线：今年实线 + 实心方点，去年灰色虚线；线尾直接写年份，不用图例。
// 当月未过完：空心方点 +「至今」，同一列虚线连到橙色「推算」空心点（示意，用户 2026-10-23 同意保留）。
// 每点标数值（今年墨色、去年灰色）；悬停或 Tab 后按 ← → 看一列：竖线、方框、月份反色 + 数据卡（用户 2026-10-24 选定，稿件 docs/design-drafts/charts/hover.html）。
function TrendChart({ t, ctx, color = "var(--text)", height = 240, labels = false, projection = false }) {
  const [ref, w] = useWidth(), dotsId = `bc-dots-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const isPct = t.unit === "percent", n = t.categories.length;
  const { active, setActive, hostProps } = useChartHover(n, () => t.cur >= 0 ? t.cur : t.now.reduce((a, v, i) => v != null ? i : a, 0));
  const vals = [...t.now, ...t.last, ...(projection && t.pace != null ? [t.pace] : [])].filter(v => v != null);
  if (!vals.length) return <Placeholder icon="trend" title="原图暂无可绘制数据" />;
  const L = 44, R = 48, T = labels ? 26 : 22, B = 54, plotW = Math.max(0, w - L - R), plotH = height - T - B;
  const sc = isPct ? niceScale(Math.min(...vals) - 0.02, Math.max(...vals) + 0.01) : niceScale(0, Math.max(...vals));
  const x = i => L + plotW * (i + 0.5) / n, y = v => T + plotH * (1 - (v - sc.min) / (sc.max - sc.min));
  const fmt = v => isPct ? pct(v) : wan(v);
  const tick = v => isPct ? `${Math.round(v * 100)}%` : wan(v);
  const every = plotW / n < 34 ? 2 : 1, everyYoy = plotW / n < 44 ? 2 : 1;
  const path = arr => arr.map((v, i) => v == null ? "" : `${i === 0 || arr[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const lastIdx = arr => arr.reduce((a, v, i) => v != null ? i : a, -1);
  const ia = lastIdx(t.now), ib = lastIdx(t.last);
  let ya = ia >= 0 ? y(t.now[ia]) : 0, yb = ib >= 0 ? y(t.last[ib]) : 0;
  if (ia !== t.partial && Math.abs(ya - yb) < 14) [ya, yb] = ya < yb ? [ya - 7, yb + 7] : [ya + 7, yb - 7];
  const partialPrev = t.partial > 0 ? t.now[t.partial - 1] : null;
  const pace = projection ? t.pace : null, colW = plotW / n;
  const vl = labels && w > 0 ? valueLabels(t, { x, y, fmt, w, L, T, plotH, pace, ia, ib, ya, yb }) : [];
  const pick = e => setActive(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - e.currentTarget.ownerSVGElement.getBoundingClientRect().left - L) / colW))));
  const ring = (v, cls, style) => v != null && <rect className={`chart-ring ${cls}`} x={x(active) - 6} y={y(v) - 6} width="12" height="12" style={style} />;
  return <div ref={ref} className="bc-chart-host" role="group" aria-label={`${ctx.year} 与 ${ctx.year - 1} 年逐月数值，按左右方向键逐月查看`} {...hostProps}>{w > 0 && <svg className="bc-svg" width={w} height={height} role="img" aria-label={`${ctx.year} 与 ${ctx.year - 1} 年逐月对比，${isPct ? "百分比" : "单位万元"}；完整数值在下方展开`}>
    {sc.ticks.map(v => <g key={v}><line className="bc-grid" x1={L} x2={w - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{tick(v)}</text></g>)}
    {!isPct && <text x={L - 6} y={T - 14} textAnchor="end">万元</text>}
    <defs><pattern id={dotsId} width="8" height="8" patternUnits="userSpaceOnUse">{DOTS.map(([a, b]) => <rect key={`${a}-${b}`} x={a} y={b} width="2" height="2" className="bc-dot" />)}</pattern></defs>
    {t.partial >= 0 && <rect x={x(t.partial) - plotW / n / 2} y={T} width={plotW / n} height={plotH} fill={`url(#${dotsId})`} />}
    {active >= 0 && <line className="chart-cross" x1={Math.round(x(active)) + 0.5} x2={Math.round(x(active)) + 0.5} y1={T} y2={T + plotH} />}
    {/* 月份隔月显示时，悬停到被省掉的那个月就补出来，并让开左右两个 */}
    {t.categories.map((c, i) => i !== active && (i % every || (every > 1 && active >= 0 && Math.abs(i - active) === 1)) ? null : <g key={c} className={i === active ? "chart-xon" : undefined}>
      {i === active && <rect x={x(i) - 17} y={T + plotH + 4} width="34" height="17" />}
      <text x={x(i)} y={T + plotH + 16} textAnchor="middle" className={i === t.cur ? "bc-ink bc-b" : undefined}>{Number(c)}月</text>
    </g>)}
    <path d={path(t.last)} fill="none" className="bc-last" />
    {t.last.map((v, i) => v == null ? null : <rect key={i} x={x(i) - 2.5} y={y(v) - 2.5} width="5" height="5" className="bc-last-dot" />)}
    <path d={path(t.now.map((v, i) => i === t.partial ? null : v))} fill="none" stroke="currentColor" strokeWidth="2" style={{ color }} />
    {t.partial >= 0 && partialPrev != null && <line x1={x(t.partial - 1)} y1={y(partialPrev)} x2={x(t.partial)} y2={y(t.now[t.partial])} stroke="currentColor" strokeWidth="2" strokeDasharray="2 3" style={{ color }} />}
    {t.now.map((v, i) => {
      if (v == null) return null;
      const part = i === t.partial;
      return <g key={i} style={{ color }}>
        <rect x={x(i) - 4} y={y(v) - 4} width="8" height="8" fill={part ? "var(--panel)" : "currentColor"} stroke="currentColor" strokeWidth={part ? 2 : 0} />
        {part && <text x={x(i) + 8} y={y(v) + 4} className={`bc-sans bc-colored chart-val${i === active ? " is-on" : ""}`}>{labels || projection ? `至今 ${fmt(v)}` : "至今"}</text>}
      </g>;
    })}
    {pace != null && <g className="bc-pace">
      <line x1={x(t.partial)} x2={x(t.partial)} y1={y(t.value) - 5} y2={y(pace) + 5} stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" style={{ color }} />
      <rect x={x(t.partial) - 4} y={y(pace) - 4} width="8" height="8" />
      <text x={x(t.partial) + 8} y={y(pace) + 4} className="bc-sans chart-val">推算 {fmt(pace)}</text>
    </g>}
    {vl.map(l => !l.hidden && <text key={`${l.kind}${l.i}`} x={l.x.toFixed(1)} y={l.y.toFixed(1)} className={`chart-val ${l.kind === "now" ? "bc-ink" : "is-last"}${l.i === active ? " is-on" : ""}`}>{l.text}</text>)}
    {ia >= 0 && ia !== t.partial && <text x={x(ia) + 8} y={ya + 4} className="bc-b bc-colored" style={{ color }}>{ctx.year}</text>}
    {ib >= 0 && <text x={x(ib) + 6} y={yb + 4}>{ctx.year - 1}</text>}
    {active >= 0 && <>{ring(t.last[active], "is-last")}{ring(t.now[active], "", { color })}{active === t.partial && ring(pace, "is-pace")}</>}
    <text x={L - 6} y={T + plotH + 40} textAnchor="end">{isPct ? "差" : "同比"}</text>
    {t.categories.map((c, i) => {
      const r = i % everyYoy ? null : yoy(t, i);
      return r && <text key={c} x={x(i)} y={T + plotH + 40} textAnchor="middle" className={`${r.value >= 0 ? "bc-up" : "bc-down"}${i === active ? " bc-b" : ""}`}>{yoyText(r.value, t.unit, r.estimated)}</text>;
    })}
    <rect className="chart-hit" x={L} y="0" width={plotW} height={height} onPointerMove={pick} />
  </svg>}
    {w > 0 && <ChartTip x={active >= 0 ? x(active) : null} gap={Math.max(14, colW / 2 + 2)}>{active >= 0 && <TrendTip t={t} ctx={ctx} i={active} color={color} pace={pace} />}</ChartTip>}
  </div>;
}

// 每点数值的摆放：两条线的每一段、每个方点、「至今 / 推算」与线尾年份都算障碍；同一列高的点往上标、低的往下标，今年先摆
function valueLabels(t, { x, y, fmt, w, L, T, plotH, pace, ia, ib, ya, yb }) {
  const segments = [], marks = [], boxes = [];
  const w11 = s => [...s].reduce((a, c) => a + (/[　-鿿＀-￯]/.test(c) ? 11 : 6.6), 0); // 11px 字宽估算
  [t.now, t.last].forEach(arr => arr.forEach((v, i) => { if (v != null && arr[i + 1] != null) segments.push([x(i), y(v), x(i + 1), y(arr[i + 1])]); }));
  t.now.forEach((v, i) => v != null && marks.push({ x: x(i) - 4, y: y(v) - 4, w: 8, h: 8 }));
  t.last.forEach((v, i) => v != null && marks.push({ x: x(i) - 2.5, y: y(v) - 2.5, w: 5, h: 5 }));
  if (t.partial >= 0) boxes.push({ x: x(t.partial) + 8, y: y(t.now[t.partial]) - 5, w: w11(`至今 ${fmt(t.now[t.partial])}`), h: 11 });
  if (pace != null) {
    segments.push([x(t.partial), y(t.value) - 5, x(t.partial), y(pace) + 5]);
    marks.push({ x: x(t.partial) - 4, y: y(pace) - 4, w: 8, h: 8 });
    boxes.push({ x: x(t.partial) + 8, y: y(pace) - 5, w: w11(`推算 ${fmt(pace)}`), h: 11 });
  }
  if (ia >= 0 && ia !== t.partial) boxes.push({ x: x(ia) + 8, y: ya - 5, w: 27, h: 11 });
  if (ib >= 0) boxes.push({ x: x(ib) + 6, y: yb - 5, w: 27, h: 11 });
  const items = [];
  t.now.forEach((v, i) => v != null && i !== t.partial && items.push({ i, kind: "now", x: x(i), y: y(v), r: 4, text: fmt(v), side: t.last[i] == null || v >= t.last[i] ? "up" : "down" }));
  t.last.forEach((v, i) => v != null && items.push({ i, kind: "last", x: x(i), y: y(v), r: 4, text: fmt(v), side: t.now[i] != null && i !== t.partial && t.now[i] < v ? "up" : "down" }));
  const pos = placeLabels(items, { segments, marks, boxes, bounds: { x: L - 4, y: 4, w: w - L, h: T + plotH - 4 } });
  return items.map((it, k) => ({ ...it, ...pos[k] }));
}

// 数据卡：一列里每条线一行（方点照图上画法），金额写万元一位小数 + 精确到分的元，底行同比
function TrendTip({ t, ctx, i, color, pace }) {
  const isPct = t.unit === "percent", part = i === t.partial, future = t.now[i] == null && t.cur >= 0 && i > t.cur;
  const main = v => v == null ? "—" : isPct ? exact(v, t.unit) : `${nf(v / 1e4, 1)} 万`;
  const sub = v => v == null ? "还没有数据" : isPct ? null : exact(v, t.unit);
  const r = yoy(t, i);
  return <>
    <div className="chart-tip-head"><b>{Number(t.categories[i])} 月</b><span>{part ? `至今 · 第 ${ctx.day}/${ctx.daysInMonth} 天` : future ? "还没到" : ""}</span></div>
    <ChartTipRow mark={part ? "is-part" : "is-now"} color={color} name={`${ctx.year} ${part ? "至今" : "今年"}`} value={main(t.now[i])} sub={sub(t.now[i])} />
    {part && pace != null && <ChartTipRow className="is-pace" mark="is-pace" name="推算月底（示意）" value={`≈ ${wan(pace)} 万`} sub="按日均外推，不含月底冲量" />}
    <ChartTipRow mark="is-last" name={`${ctx.year - 1} 去年`} value={main(t.last[i])} sub={sub(t.last[i])} />
    {r && <div className="chart-tip-foot"><span>{isPct ? "差" : "同比"}{r.estimated ? "（按推算）" : ""}</span><b className={r.value >= 0 ? "bc-up" : "bc-down"}>{yoyText(r.value, t.unit, r.estimated)}{isPct ? "%" : ""}</b></div>}
  </>;
}

// 右侧读数栏：只有第一格用像素大数字（每卡最多 1 个主数字）
function Readout({ t, ctx, share }) {
  const isPct = t.unit === "percent", range = t.ytdMonths ? `1–${ctx.month - 1} 月` : "";
  return <div className="bc-readout card">
    <div className="bc-rk is-hero"><span className="label">{ctx.month} 月{t.partial >= 0 ? `至今 · 第 ${ctx.day}/${ctx.daysInMonth} 天` : ""}</span><span className="num">{t.value == null ? "—" : isPct ? pct(t.value) : wan(t.value)}{t.value != null && !isPct && <small>万</small>}</span></div>
    {t.pace != null && <div className="bc-rk"><span className="label">按日均推算月底</span><span className="bc-v bc-pace-text">≈ {wan(t.pace)}<small>万（示意）</small></span>{t.lastSame != null && <span className="small muted">去年 {ctx.month} 月 {wan(t.lastSame)} 万 · <span className={t.pace >= t.lastSame ? "bc-up" : "bc-down"}>{yoyText(t.pace / t.lastSame - 1, t.unit)}</span></span>}</div>}
    {t.ytd != null && <div className="bc-rk"><span className="label">{range}{isPct ? "均值" : "累计"}</span><span className="bc-v">{isPct ? pct(t.ytd) : money(t.ytd)}</span><span className="small muted">同比 <span className={t.ytdYoY >= 0 ? "bc-up" : "bc-down"}>{ytdText(t)}</span> · 去年同期 {isPct ? pct(t.ytdLast) : money(t.ytdLast)}</span></div>}
    {t.best >= 0 && <div className="bc-rk is-last"><span className="label">今年最高</span><span className="bc-v">{Number(t.categories[t.best])} 月 · {isPct ? pct(t.now[t.best]) : `${wan(t.now[t.best])}`}{!isPct && <small>万</small>}</span>{share != null && <span className="small muted">占 {ctx.month} 月总营收 {pct(share, 0)}</span>}</div>}
  </div>;
}

// 总营收视图下方：转化率 + 当月三条业务线占比
function TotalBelow({ data, ctx, find, total }) {
  const conv = find(CONV), ct = conv && yearTrend(conv, ctx);
  const parts = PARTS.map(k => ({ k, chart: find(VIEWS[k].chart) })).filter(p => p.chart).map(p => ({ ...p, t: yearTrend(p.chart, ctx) }));
  const sum = parts.reduce((a, p) => a + (p.t.value || 0), 0);
  return <div className="bc-pair">
    {ct ? <Card className="bc-conv" title="总转化率" extra={ct.ytd != null && <span className="small muted">今年 1–{ctx.month - 1} 月均值 {pct(ct.ytd)} · 去年 {pct(ct.ytdLast)}</span>}>
      <TrendChart t={ct} ctx={ctx} height={220} labels />
      <SourceDetails chart={conv} />
    </Card> : <Placeholder icon="trend" title={`飞书里没有找到「${CONV}」`} />}
    <Card className="bc-mix" title={`${ctx.month} 月${total?.partial >= 0 ? "至今" : ""} · 三条业务线`} extra={<span className="small muted">条长 = 占三线合计的比例</span>}>
      {sum > 0 ? <>
        <div className="bc-mix-bar">{parts.map(p => <div key={p.k} style={{ flex: `${p.t.value || 0} 0 0`, background: VIEWS[p.k].color }} title={`${VIEWS[p.k].name} ${exact(p.t.value, "currency")}`}><b>{VIEWS[p.k].short}</b><span>{pct((p.t.value || 0) / sum, 0)}</span></div>)}</div>
        <div className="bc-mix-rows">{parts.map(p => <div key={p.k} style={{ borderColor: VIEWS[p.k].color }}>
          <b>{VIEWS[p.k].name}</b>
          <span>{total?.partial >= 0 ? "至今" : "当月"} {wan(p.t.value || 0)} 万</span>
          {p.t.pace != null && <span>推算 {wan(p.t.pace)} 万 · 去年同月 {p.t.lastSame == null ? "—" : `${wan(p.t.lastSame)} 万`}</span>}
          {p.t.pace != null && p.t.lastSame ? <span className={p.t.pace >= p.t.lastSame ? "bc-up" : "bc-down"}>推算较去年同月 {yoyText(p.t.pace / p.t.lastSame - 1, "currency")}</span> : null}
        </div>)}</div>
        <p className="small muted bc-hint">选上方业务线，看该线的地区、SKU、学校构成。</p>
      </> : <Placeholder icon="trend" title="当月暂无营收数据" />}
    </Card>
  </div>;
}

// 业务线视图下方：SKU、地区画面积块，名字和占比写在块里；学校太分散只列前 10，国课的科目一级源表未反写时显示空状态
function Composition({ data, view, ctx }) {
  const v = VIEWS[view];
  const pie = dim => data.charts.find(c => c.type === "pie" && c.name.startsWith(`${v.pie} - ${dim}`));
  const sku = pie("SKU"), region = pie("地区"), third = pie(v.third);
  const base = sku || region || third;
  return <>
    <div className="section-head"><h2>{ctx.month} 月构成</h2><Tag>{data.period}</Tag>{base?.total != null && <span className="small muted">实收 {exact(base.total, base.unit)} · 按原图的实收金额、业务分组和本月收款日期筛选；与上方营收进度的汇总来源不同</span>}</div>
    <div className="bc-pair bc-pair-flush">
      <ShareCard chart={sku} title="SKU" color={v.color} />
      <ShareCard chart={region} title="地区" color={v.color} />
    </div>
    <div className="bc-third">{third ? <ThirdCard chart={third} /> : <Placeholder icon="trend" title={`飞书里没有找到「${v.pie} - ${v.third}」`} />}</div>
  </>;
}

function ShareCard({ chart, title, color }) {
  if (!chart) return <Placeholder icon="trend" title={`飞书里没有找到「${title}」占比图`} />;
  const s = shareItems(chart);
  return <Card className="bc-share" title={title} extra={<span className="small muted">{s.count} 项 · 面积 = 占比</span>}>
    {s.onlyBlank ? <p className="empty bc-blank">源表「{chart.dimension}」还没有填写，当月 {exact(s.total, chart.unit)} 全部计为「未填写」</p>
      : s.available ? <Treemap items={s.items} color={color} />
      : <p className="empty bc-blank">{s.items.some(i => i.value == null || i.value < 0) ? "含缺失或负值，不绘制占比；请查看完整数值。" : "原图暂无非零数据"}</p>}
    <SourceDetails chart={chart} />
  </Card>;
}

// 面积块：前 9 项 +「其他」一起按真实占比排成方块（其他放最后、铺网点）；块太小写不下名字的，名字写在块下（不用图例对照）
function Treemap({ items, color, height = 260 }) {
  const [ref, w] = useWidth();
  const tiles = w ? squarify(topN(items, 9), w, height) : [];
  const unnamed = [];
  return <div ref={ref} className="bc-tm-host">
    <div className="bc-tm" style={{ height }}>{tiles.map(({ item: p, x, y, w: tw, h }, rank) => {
      const gx = x ? 2 : 0, gy = y ? 2 : 0, nameFits = tw - 12 >= Math.min(textWidth(p.label), 72);
      const full = nameFits && h >= 56, mid = !full && nameFits && h >= 36, pctOnly = !full && !mid && tw >= 36 && h >= 22;
      const chip = p.other && tw >= 64 && h >= 40;
      if (p.other ? !chip : !full && !mid) unnamed.push(p);
      const tip = `${p.label} · ${exact(p.value, "currency")} · ${pct(p.share, 2)}`;
      // 大字（名称 14、占比 18 加粗）固定给占比最大的两块（用户 2026-10-24）；块小到放不下（宽 < 84 或高 < 90）才退回普通字号。tiles 与 items 同序，rank 即名次
      const big = full && !p.other && rank < 2 && tw >= 84 && h >= 90;
      return <div key={p.label} className={`bc-tile${p.other ? " is-other" : ""}${big ? " is-big" : ""}`} title={tip} style={{ left: x + gx, top: y + gy, width: tw - gx, height: h - gy, ...(p.other ? { color } : { background: color }) }}>
        {p.other ? chip && <span className="bc-chip">{p.label}<br />{pct(p.share)}</span>
          : full ? <><b>{p.label}</b><span className="bc-tile-pct">{pct(p.share)}</span><span>{nf(p.value / 1e4, 1)} 万</span></>
          : mid ? <><b>{p.label}</b><span>{pct(p.share)}</span></>
          : pctOnly ? <span>{pct(p.share, 0)}</span> : null}
      </div>;
    })}</div>
    {unnamed.length > 0 && <p className="small bc-tm-rest">块里没写名字的：{unnamed.map((p, i) => <span key={p.label}>{i > 0 && " · "}{p.label} <span className="tnum muted">{pct(p.share)}</span></span>)}</p>}
  </div>;
}
// 中文按 1 个字号、其他字符按 0.62 个字号估算宽度（12px 字）
const textWidth = s => [...s].reduce((a, c) => a + (/[\u3000-\u9fff\uff00-\uffef]/.test(c) ? 12 : 7.4), 0);

function ThirdCard({ chart }) {
  const s = shareItems(chart), school = chart.dimension.includes("学校");
  const rest = s.items.slice(10);
  return <Card className="bc-share" title={school ? "学校 · 前 10" : chart.dimension} extra={school && <span className="small muted">{s.count} 所，非常分散，不画面积</span>}>
    {s.onlyBlank ? <p className="empty bc-blank">源表「{chart.dimension}」还没有反写，当月 {exact(s.total, chart.unit)} 全部计为「未填写」</p>
      : <><ol className="bc-top10">{s.items.slice(0, 10).map((i, n) => <li key={i.label} title={`${i.label} · ${exact(i.value, chart.unit)}`}>
          <span className="bc-rank">{String(n + 1).padStart(2, "0")}</span><span className="bc-name">{i.label}</span><span className="bc-p">{i.share == null ? "—" : pct(i.share)}</span><span className="bc-a">{i.value == null ? "—" : `${nf(i.value / 1e4, 1)} 万`}</span>
        </li>)}</ol>
        {rest.length > 0 && <p className="small muted bc-hint">其余 {rest.length} {school ? "所" : "项"}合计 {s.available ? pct(rest.reduce((a, i) => a + i.share, 0), 0) : "—"}。</p>}</>}
    <SourceDetails chart={chart} />
  </Card>;
}

function SourceDetails({ chart }) {
  return <details className="bc-source"><summary>数据口径与完整数值</summary>
    <p className="small muted">来源：{chart.sourceTable} · {chart.dimension} · {chart.measure.field}（{({ sum: "求和", max: "最大值", avg: "平均值", min: "最小值" })[chart.measure.aggregation] || chart.measure.aggregation}）</p>
    {chart.filter ? <p className="small muted">筛选：{(chart.filter.conditions || []).map(f => `${f.field_name}${({ is: " = ", contains: "包含" })[f.operator] || ` ${f.operator} `}${(Array.isArray(f.value) ? f.value : [f.value]).map(v => v === "CurrentMonth" ? "本月" : String(v)).join("、")}`).join(chart.filter.conjunction === "or" ? "；或 " : "；且 ")}</p> : <p className="small muted">筛选：沿用原图全部数据</p>}
    <div className="bc-table-scroll"><table className="bc-data"><caption>{chart.name}的完整数值</caption>
      {/* 数字列表头与数值一起右对齐；占比表按实收金额从高到低（用户 2026-10-24），折线表保持月份顺序 */}
      {chart.type === "line" ? <><thead><tr><th>{chart.dimension}</th>{chart.series.map(s => <th className="tnum" key={s.name}>{s.name}</th>)}</tr></thead><tbody>{chart.categories.map((x, i) => <tr key={x}><td>{x}</td>{chart.series.map(s => <td className="tnum" key={s.name}>{exact(s.values[i], chart.unit)}</td>)}</tr>)}</tbody></> : <><thead><tr><th>{chart.dimension}</th><th className="tnum">实收金额</th><th className="tnum">占比</th></tr></thead><tbody>{[...chart.items].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)).map((item, i) => <tr key={i}><td>{item.label}</td><td className="tnum">{exact(item.value, chart.unit)}</td><td className="tnum">{chart.pieAvailable ? `${(item.value / chart.total * 100).toFixed(2)}%` : "—"}</td></tr>)}</tbody></>}
    </table></div>
  </details>;
}
