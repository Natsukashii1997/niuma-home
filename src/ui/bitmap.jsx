// 位图风基础件。规范见 docs/STYLE-GUIDE.md「位图风」：动效一律按帧跳变（约 15 帧/秒），不用缓动、弹簧、模糊；
// 像素只用于数字、图标、点阵图、抖动网点、1-bit 头像、方块光标和培养路径地图的插画。系统开启「减少动态效果」时直接显示终态。
import { useEffect, useRef, useState } from "react";
import { ICONS7 } from "./icons7.js";

export const FRAME = 1000 / 15;

export const prefersReducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

// 按帧计时：每帧回调一次，回调返回 false 时停止。返回取消函数。
export function frames(onFrame) {
  let frame = 0;
  const timer = setInterval(() => {
    frame += 1;
    if (onFrame(frame) === false) clearInterval(timer);
  }, FRAME);
  return () => clearInterval(timer);
}

/* ---------- 抖动网点（Bayer 4×4） ---------- */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// 生成 8×8 的平铺图：每个阈值格画一个 2px 像素。threshold 越大越密（16 为实心）。
function ditherTile(threshold, color) {
  const rects = BAYER.map((v, i) => (v < threshold ? `<rect x="${(i % 4) * 2}" y="${Math.floor(i / 4) * 2}" width="2" height="2"/>` : "")).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" shape-rendering="crispEdges" fill="${color}">${rects}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// SVG 里的网点填充（同一套 Bayer 阈值）：threshold 0–16 越大越密，px 为每个网点的边长
export function DitherPattern({ id, threshold, color, px = 2 }) {
  return (
    <pattern id={id} width={px * 4} height={px * 4} patternUnits="userSpaceOnUse">
      {BAYER.map((v, i) => (v < threshold ? <rect key={i} x={(i % 4) * px} y={Math.floor(i / 4) * px} width={px} height={px} fill={color} /> : null))}
    </pattern>
  );
}

// 启动时调用一次：注入网点变量，并接管所有 [data-dither] 元素的悬停（四档逐帧加密 / 退回）。
export function installBitmap() {
  const root = document.documentElement.style;
  [2, 4, 6, 8].forEach((t, i) => root.setProperty(`--dither-${i + 1}`, ditherTile(t, "#C9CCD3")));
  [4, 8, 12, 16].forEach((t, i) => root.setProperty(`--dither-ink-${i + 1}`, ditherTile(t, "#0D0E10")));
  [4, 8].forEach((t, i) => root.setProperty(`--dither-signal-${i + 1}`, ditherTile(t, "#FF4F1F")));

  const running = new WeakMap();
  const step = (el, target) => {
    running.get(el)?.();
    if (prefersReducedMotion()) { el.dataset.level = String(target); return; }
    running.set(el, frames(() => {
      if (prefersReducedMotion()) { el.dataset.level = String(target); return false; }
      const level = Number(el.dataset.level || 0);
      if (level === target) return false;
      el.dataset.level = String(level + Math.sign(target - level));
    }));
  };
  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest?.("[data-dither]");
    if (el && !el.contains(e.relatedTarget)) step(el, 4);
  });
  document.addEventListener("pointerout", (e) => {
    const el = e.target.closest?.("[data-dither]");
    if (el && !el.contains(e.relatedTarget)) step(el, 0);
  });
}

/* ---------- ① 点阵数字滚动 ---------- */

// 只滚动变化的位：个位先停、高位依次后停，每一位停住时闪一帧橙色。首次出现时从 0 滚到目标值。
export function FlipNumber({ value, className = "" }) {
  const reduced = useReducedMotion();
  const target = String(value ?? "—");
  const [cells, setCells] = useState(() => [...target].map((ch) => ({ ch: prefersReducedMotion() ? ch : /\d/.test(ch) ? "0" : ch })));
  const last = useRef(null);
  useEffect(() => {
    const from = last.current ?? target.replace(/\d/g, "0");
    last.current = target;
    if (reduced || from === target) {
      setCells([...target].map((ch) => ({ ch })));
      return undefined;
    }
    const len = Math.max(from.length, target.length);
    const a = from.padStart(len, " "), b = target.padStart(len, " ");
    return frames((frame) => {
      let moving = false;
      const next = [...b].map((ch, i) => {
        if (!/\d/.test(ch) || a[i] === ch) return { ch };
        const stopAt = 3 + (len - 1 - i) * 2; // 个位第 3 帧停，每高一位多 2 帧
        if (frame > stopAt) return { ch };
        if (frame === stopAt) return { ch, flash: true };
        moving = true;
        return { ch: String((Number(ch) - (stopAt - frame) + 100) % 10) };
      });
      setCells(next.filter((c, i) => c.ch !== " " || i >= len - target.length));
      if (!moving && frame > 3 + len * 2) return false;
    });
  }, [target, reduced]);
  return (
    <span className={`flip-number ${className}`} aria-label={target}>
      {cells.map((c, i) => <span key={i} aria-hidden="true" className={c.flash ? "flash" : undefined}>{c.ch}</span>)}
    </span>
  );
}

/* ---------- ② 点阵亮起 ---------- */

// data: [{ label, value, hint? }]。从左到右、自下而上逐点点亮，最新亮起的一批为橙色；highlight 列常亮橙色。
export function DotMatrix({ data, rows = 10, highlight = -1, unit = "", showValues = false }) {
  const reduced = useReducedMotion();
  const max = Math.max(1, ...data.map((d) => d.value));
  const filled = data.map((d) => (d.value > 0 ? Math.max(1, Math.round((d.value / max) * rows)) : 0));
  const total = filled.reduce((s, n) => s + n, 0);
  const batch = Math.max(1, Math.ceil(total / 15)); // 约 1 秒点完
  const [lit, setLit] = useState(prefersReducedMotion() ? total : 0);
  const [hover, setHover] = useState(-1);
  const key = filled.join(",");
  useEffect(() => {
    if (reduced) { setLit(total); return undefined; }
    setLit(0);
    return frames((frame) => {
      setLit(Math.min(total, frame * batch));
      if (frame * batch >= total) return false;
    });
  }, [key, reduced]); // key 概括了 data 的变化
  let order = 0;
  return (
    <div className="dot-matrix" onPointerLeave={() => setHover(-1)}>
      {showValues && (
        <div className="dot-matrix-labels is-values" style={{ "--cols": data.length }}>
          {data.map((d, col) => <span key={d.label + col} className={col === highlight || col === hover ? "hot" : undefined}>{d.value}</span>)}
        </div>
      )}
      <div className="dot-matrix-grid" style={{ "--cols": data.length, "--rows": rows }}>
        {data.map((d, col) => {
          const dots = [];
          for (let r = 0; r < rows; r += 1) {
            const isFilled = r < filled[col];
            const index = isFilled ? order++ : -1;
            const on = isFilled && index < lit;
            const fresh = on && lit < total && index >= lit - batch;
            const warm = on && (col === highlight || col === hover);
            dots.push(<i key={r} className={on ? (fresh || warm ? "on hot" : "on") : undefined} />);
          }
          return (
            <div key={d.label + col} className="dot-col" onPointerEnter={() => setHover(col)} title={`${d.hint || d.label}：${d.value}${unit}`}>
              {dots}
            </div>
          );
        })}
      </div>
      <div className="dot-matrix-labels" style={{ "--cols": data.length }}>
        {data.map((d, col) => <span key={d.label + col} className={col === highlight || col === hover ? "hot" : undefined}>{d.label}</span>)}
      </div>
      <div className="dot-matrix-readout label" aria-live="polite">
        {hover >= 0 ? `${data[hover].hint || data[hover].label} · ${data[hover].value}${unit}` : " "}
      </div>
    </div>
  );
}

/* ---------- ⑥ 像素格进度条：完成度拆成 N 格，进场按帧逐格点亮；marker 是时间进度竖线 ---------- */

export function PixelBar({ value, cells = 20, marker = null, className = "", label = "" }) {
  const reduced = useReducedMotion();
  const target = Math.round(Math.max(0, Math.min(1, value || 0)) * cells);
  const [lit, setLit] = useState(prefersReducedMotion() ? target : 0);
  useEffect(() => {
    if (reduced) { setLit(target); return undefined; }
    setLit(0);
    return frames((frame) => {
      setLit(Math.min(target, frame * 2));
      if (frame * 2 >= target) return false;
    });
  }, [target, reduced]);
  return (
    <span className={`pixel-bar ${className}`} role="img" aria-label={label || `${Math.round((value || 0) * 100)}%`} style={{ "--cells": cells }}>
      {Array.from({ length: cells }, (_, i) => <i key={i} className={i < lit ? (i === lit - 1 && lit < target ? "on hot" : "on") : undefined} />)}
      {marker != null && <b style={{ left: `${Math.max(0, Math.min(1, marker)) * 100}%` }} />}
    </span>
  );
}

/* ---------- ④ 抖动网点比例条 ---------- */

// 用网点疏密表达占比，不用透明度和渐变。value 为 0–1。
export function DitherBar({ value }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span className="dither-bar" role="img" aria-label={`${pct}%`}>
      <span className="dither-bar-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}

/* ---------- ⑤ 方块光标逐字打出 ---------- */

// text 可在流式过程中不断变长；streaming 为 false 且全部打完后光标消失。开始前光标闪两次；数字用橙色高亮。
export function TypeText({ text, streaming = false, className = "", onReveal }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? text.length : 0);
  const [phase, setPhase] = useState(reduced ? "typing" : "blink"); // blink → typing
  const [blinkOn, setBlinkOn] = useState(true);
  const live = useRef({ length: text.length, streaming, shown: 0 });
  live.current.length = text.length;
  live.current.streaming = streaming;
  useEffect(() => {
    if (reduced) { live.current.shown = text.length; return undefined; }
    return frames((frame) => {
      if (frame <= 16) { setBlinkOn(Math.floor((frame - 1) / 4) % 2 === 1); return true; } // 亮灭两次
      setPhase("typing");
      const now = live.current;
      now.shown = Math.min(now.length, now.shown + Math.max(1, Math.ceil((now.length - now.shown) / 12)));
      setShown(now.shown);
      if (!now.streaming && now.shown >= now.length) return false;
    });
  }, [reduced]); // 只在挂载时启动；流式状态经 live 引用读取，避免结束时重新闪烁
  const visible = text.slice(0, reduced ? text.length : shown);
  useEffect(() => { onReveal?.(); }, [shown, reduced ? text : "", onReveal]);
  const done = !streaming && visible.length >= text.length && (reduced || phase === "typing");
  return (
    <span className={`type-text ${className}`}>
      {withNums(visible)}
      {!done && <span className={`type-cursor${!reduced && phase === "blink" && !blinkOn ? " off" : ""}`} aria-hidden="true" />}
    </span>
  );
}

// 重点记号：**…** 包住的是重点，拆成 [{ t, hot }]；记号本身不显示。
export const markSegments = (text) => String(text || "").split(/\*\*([\s\S]+?)\*\*/).map((t, i) => ({ t, hot: i % 2 === 1 })).filter((x) => x.t);
export function MarkText({ text }) {
  return <>{markSegments(text).map((x, i) => (x.hot ? <mark key={i} className="type-hot">{x.t}</mark> : <span key={i}>{x.t}</span>))}</>;
}

// 机械邪龙兽回答的逐字输出（用户 2026-10-19）：开始前橙色方块光标闪两次，然后每 1 帧出一个字；
// **…** 包住的重点一出现就是橙色字；全部打完光标消失，调 onDone。减少动态效果时直接显示全文。
export function MarkType({ text, onDone }) {
  const reduced = useReducedMotion();
  const segs = markSegments(text);
  const total = segs.reduce((n, x) => n + x.t.length, 0);
  const [st, setSt] = useState({ shown: reduced ? total : 0, blinkOn: false, done: reduced });
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (reduced) { setSt({ shown: total, blinkOn: false, done: true }); done.current?.(); return undefined; }
    let shown = 0;
    return frames((frame) => {
      if (frame <= 16) { setSt({ shown: 0, blinkOn: Math.floor((frame - 1) / 4) % 2 === 1, done: false }); return true; } // 亮灭两次
      shown += 1;
      const end = shown >= total;
      setSt({ shown, blinkOn: true, done: end });
      if (end) { done.current?.(); return false; }
      return true;
    });
  }, [text, reduced, total]);
  let left = st.shown;
  return (
    <span className="type-text mark-type">
      {segs.map((x, i) => { const part = x.t.slice(0, Math.max(0, left)); left -= x.t.length; return part ? (x.hot ? <mark key={i} className="type-hot">{part}</mark> : <span key={i}>{part}</span>) : null; })}
      {!st.done && <span className={`type-cursor${st.blinkOn ? "" : " off"}`} aria-hidden="true" />}
    </span>
  );
}

// 数字（含 05:12、1.5、30% 这类）包成橙色。
const withNums = (s) => s.split(/(\d+(?:[.,:]\d+)*%?)/).map((part, i) => (i % 2 ? <span key={i} className="type-num">{part}</span> : part));

// 多段逐字输出：几段文字共用一个方块光标依次打出，每段仍放在页面原来的元素里（保留各自的样式和排版）。
// 开始前光标闪两次，之后每 every 帧出一个字；打完光标消失。打完后文字再变（如每分钟刷新的时长）直接显示全文。
// ready 为 false（数据还没到）时不开始。part(i) 返回第 i 段此刻该显示的内容；这段还没轮到时返回 null，调用方据此不渲染这一段。
export function useTypeOut(texts, { every = 2, ready = true } = {}) {
  const reduced = useReducedMotion();
  const total = texts.reduce((n, t) => n + t.length, 0);
  const totalRef = useRef(total);
  totalRef.current = total;
  const [state, setState] = useState({ shown: 0, blinkOn: true, done: false });
  useEffect(() => {
    if (!ready || reduced) return undefined;
    let shown = 0;
    return frames((frame) => {
      if (frame <= 16) { setState({ shown: 0, blinkOn: Math.floor((frame - 1) / 4) % 2 === 1, done: false }); return true; } // 亮灭两次
      if ((frame - 16) % every) return true;
      shown += 1;
      const done = shown >= totalRef.current;
      setState({ shown, blinkOn: true, done });
      if (done) return false;
    });
  }, [ready, reduced, every]);
  const finished = reduced || state.done;
  let start = 0;
  const parts = texts.map((t) => { const from = start; start += t.length; return from; });
  const current = finished ? -1 : Math.max(0, parts.findIndex((from, i) => state.shown < from + texts[i].length));
  const cursor = <span className={`type-cursor${state.blinkOn ? "" : " off"}`} aria-hidden="true" />;
  return {
    done: finished,
    part(i) {
      if (finished) return withNums(texts[i]);
      const visible = texts[i].slice(0, Math.max(0, state.shown - parts[i]));
      if (i !== current && !visible) return null;
      return <>{withNums(visible)}{i === current && cursor}</>;
    },
  };
}

/* ---------- ⑥ 按帧加载 ---------- */

// progress 为 0–1；为 null 时按帧自走到 95% 等待完成。done 时 100% 并显示像素对勾。全程无缓动。
export function StepProgress({ progress = null, done = false, error = "", label = "" }) {
  const reduced = useReducedMotion();
  const [auto, setAuto] = useState(0);
  useEffect(() => {
    if (done || error || progress !== null || reduced) return undefined;
    setAuto(0);
    // 进度未知时按 1% 一步有序前进，越往后每步隔得越久（用户 2026-10-19：不再冲到 95% 就停住）：
    // 0–50% 每帧一步（约 3 秒），到 80% 约 9 秒，到 90% 约 15 秒，到 95% 约 21 秒，之后每 4 秒一步，最多 99%，读完才到 100%。
    let pct = 0, wait = 0;
    return frames(() => {
      if (--wait > 0) return undefined;
      pct += 1;
      setAuto(pct);
      wait = pct < 50 ? 1 : pct < 80 ? 3 : pct < 90 ? 8 : pct < 95 ? 20 : 60;
      if (pct >= 99) return false;
      return undefined;
    });
  }, [done, error, progress, reduced]);
  const fraction = progress === null ? null : Math.max(0, Math.min(1, progress));
  const pct = done ? 100 : fraction !== null ? Math.floor(fraction * 100) : reduced ? 95 : auto;
  const cells = Math.floor(pct / 5);
  const unknown = !done && fraction === null;
  return (
    <div className={`step-progress${error ? " is-error" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={unknown ? undefined : pct} aria-valuetext={error || (unknown ? "处理中，进度未知" : `${pct}%`)} aria-label={label || "进度"}>
      <div className="step-progress-head">
        <span className="label">{error ? "ERROR" : done ? "DONE" : label || "LOADING"}</span>
        <span className="num">{done ? <><PixelIcon name="check" /> 100%</> : unknown && reduced ? "处理中" : `${pct}%`}</span>
      </div>
      <div className="step-progress-cells">
        {Array.from({ length: 20 }, (_, i) => <i key={i} className={i < cells ? "on" : undefined} />)}
      </div>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

/* ---------- 7×7 实心像素图标（v2.2） ---------- */

// 图标稿在 ./icons7.js。只按 14px 或 28px 渲染（每格 2 / 4 个屏幕像素），避免缩放后发虚；size > 20 时用大号。
export function PixelIcon({ name, size = 14, className = "" }) {
  const rows = ICONS7[name];
  if (!rows) return null;
  const px = size > 20 ? 28 : 14;
  return (
    <svg className={`pixel-icon ${className}`} width={px} height={px} viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      {rows.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null)))}
    </svg>
  );
}

/* ---------- 像素插画 ---------- */

// 插画不是图标：用在整张图里（培养路径地图的旗子、帐篷、城堡、登山者等），按格画，cell 为每格的屏幕像素（整数）。
// # = 主色，o = 底色（云的内部）。outline 时先在 8 个方向各错 2px 画一遍底色，像贴纸的白边，压在线和网点上也看得清。
export const SPRITES = {
  flag: ["#......", "#####..", "######.", "#####..", "#......", "#......", "#......"],
  tent: ["...#...", "..###..", "..#.#..", ".#...#.", ".#.#.#.", "#..#..#", "#######"],
  keep: ["#..#..#", "##.#.##", "#######", "#######", ".#####.", ".......", "......."],
  pine: ["..#..", ".###.", "..#..", ".###.", "#####", "..#..", "..#.."],
  bird: ["#...#", ".#.#."],
  cloud: ["......####......", "....##oooo##....", "..##oooooooo##..", ".#oooooooooooo#.", "################"],
  // 登山者两帧：放下手 / 举手挥
  climb: [
    ["...##..", "...##..", ".#####.", "#.###.#", "..###..", "..###..", "..#.#..", ".##.##.", ".#...#."],
    ["...##.#", "...##.#", ".######", "#.###..", "..###..", "..###..", "..#.#..", ".#..##.", ".#...#."],
  ],
};
const OUTLINE = [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2]];
const spriteCells = (rows, ch) => rows.flatMap((row, y) => [...row].map((c, x) => (c === ch ? `M${x} ${y}h1v1h-1z` : ""))).join("");

// 画在已有的 <svg> 里；左上角取整，格子不发虚
export function SpriteCells({ rows, x, y, cell, color, outline = false, bg = "var(--panel)" }) {
  const ink = spriteCells(rows, "#"), fill = spriteCells(rows, "o");
  const at = (dx, dy) => `translate(${Math.round(x) + dx} ${Math.round(y) + dy}) scale(${cell})`;
  return (
    <g shapeRendering="crispEdges">
      {outline && OUTLINE.map(([dx, dy]) => <path key={`${dx},${dy}`} d={ink + fill} transform={at(dx, dy)} fill={bg} />)}
      {fill && <path d={fill} transform={at(0, 0)} fill={bg} />}
      <path d={ink} transform={at(0, 0)} fill={color} />
    </g>
  );
}

// 单独一张（图例、抽屉标题旁）
export function PixelSprite({ rows, cell = 2, color = "currentColor", className = "" }) {
  const w = rows[0].length * cell, h = rows.length * cell;
  return (
    <svg className={`pixel-sprite ${className}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <SpriteCells rows={rows} x={0} y={0} cell={cell} color={color} />
    </svg>
  );
}

/* ---------- 1-bit 头像 ---------- */

// 由名称生成左右对称的 5×5 黑白像素头像，外围留 1 格边。
// 品牌标「牛马之家 · 低电量牛」：16×16，长了牛角和四条腿的电池，只剩一格橙色的电。浏览器标签页图标 public/favicon.svg 用同一张图。
const BRAND_WHITE = "M2 2h1v1h-1zM13 2h1v1h-1zM2 3h2v1h-2zM12 3h2v1h-2zM3 4h2v1h-2zM11 4h2v1h-2zM2 5h12v1h-12zM2 6h1v1h-1zM13 6h1v1h-1zM2 7h1v1h-1zM13 7h2v1h-2zM2 8h1v1h-1zM13 8h2v1h-2zM2 9h1v1h-1zM13 9h2v1h-2zM2 10h1v1h-1zM13 10h1v1h-1zM2 11h12v1h-12zM3 13h1v1h-1zM6 13h1v1h-1zM9 13h1v1h-1zM12 13h1v1h-1zM3 14h1v1h-1zM6 14h1v1h-1zM9 14h1v1h-1zM12 14h1v1h-1z";
const BRAND_ORANGE = "M4 7h2v1h-2zM4 8h2v1h-2zM4 9h2v1h-2z";
export function BrandMark({ size = 28, className = "" }) {
  return (
    <svg className={`brand-mark ${className}`} width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <rect width="16" height="16" fill="var(--text)" />
      <path d={BRAND_WHITE} fill="var(--panel)" />
      <path d={BRAND_ORANGE} fill="var(--signal)" />
    </svg>
  );
}

export function BitAvatar({ seed, size = 28 }) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  const cells = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if ((h >>> (y * 3 + x)) & 1) {
        cells.push([x, y]);
        if (x < 2) cells.push([4 - x, y]);
      }
    }
  }
  return (
    <svg className="bit-avatar" width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden="true">
      <rect width="7" height="7" fill="var(--panel)" />
      {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x + 1} y={y + 1} width="1" height="1" fill="var(--text)" />)}
    </svg>
  );
}

// 预设助手图标：16×16 黑底、白线、一处信号橙，各画一件代表职责的东西（用户 2026-10-18：不用牛的样式，简单一点）。
// # = 白线，o = 信号橙，. = 黑底。没有预设的助手用 BitAvatar。
const AGENT_SPRITES = {
  // 文案：一支笔，笔尖橙色
  copywriter: ["................", "............##..", "...........###..", "..........###...", ".........###....", "........###.....", ".......###......", "......###.......", ".....###........", "....###.........", "...###..........", "..oo............", "..o.............", ".....#########..", "................", "................"],
  // 面试：对话框 + 橙色问号
  interview: ["................", "................", "..############..", "..#..........#..", "..#...oooo...#..", "..#......o...#..", "..#....oo....#..", "..#....o.....#..", "..#..........#..", "..#....o.....#..", "..############..", "....##..........", "....#...........", "................", "................", "................"],
  // 绩效：逐级升高的柱，最高一根橙色
  performance: ["................", "................", "................", "............oo..", "............oo..", ".........##.oo..", ".........##.oo..", "......##.##.oo..", "......##.##.oo..", "...##.##.##.oo..", "...##.##.##.oo..", "...##.##.##.oo..", "................", "..#############.", "................", "................"],
  // 通知：喇叭 + 橙色声波
  notice: ["................", "................", "................", ".........#..o...", ".......###...o..", ".....#####...o..", "..########.o.o..", "..########.o.o..", "..########.o.o..", "..########.o.o..", ".....#####...o..", ".......###...o..", ".........#..o...", "................", "................", "................"],
};
export function AgentFace({ preset, seed, size = 28 }) {
  const rows = AGENT_SPRITES[preset];
  if (!rows) return <BitAvatar seed={seed || preset || ""} size={size} />;
  const cells = (ch) => rows.flatMap((row, y) => [...row].map((c, x) => (c === ch ? `M${x} ${y}h1v1h-1z` : ""))).join("");
  return (
    <svg className="agent-face" width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <rect width="16" height="16" fill="var(--text)" />
      <path d={cells("#")} fill="var(--panel)" />
      <path d={cells("o")} fill="var(--signal)" />
    </svg>
  );
}

/* ---------- ③ 像素溶解转场 ---------- */

// 在 area 可见范围上覆盖 16px 方格，随机顺序盖住旧页面后换页再揭开，共 3 帧，约 200ms。
export function dissolve(canvas, area, swap) {
  if (prefersReducedMotion()) { swap(); return () => {}; }
  const box = area.getBoundingClientRect();
  const left = Math.max(0, box.left), top = Math.max(0, box.top);
  const width = Math.min(innerWidth, box.right) - left, height = Math.min(innerHeight, box.bottom) - top;
  if (width <= 0 || height <= 0 || document.hidden) { swap(); return () => {}; } // 后台标签页计时会被降频，直接切换
  const dpr = devicePixelRatio || 1;
  Object.assign(canvas.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, display: "block" });
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#EDEEF1";
  const size = 16, cols = Math.ceil(width / size), count = cols * Math.ceil(height / size);
  const shuffled = () => {
    const list = Array.from({ length: count }, (_, i) => i);
    for (let i = list.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list;
  };
  const cover = shuffled(), half = Math.ceil(count / 2);
  const cell = (i, fill) => {
    const x = (i % cols) * size, y = Math.floor(i / cols) * size;
    if (fill) ctx.fillRect(x, y, size, size); else ctx.clearRect(x, y, size, size);
  };
  // v3：3 帧（约 200ms）。第 1 帧盖住一半，第 2 帧盖满并换页，第 3 帧整体揭开。
  let swapped = false;
  const doSwap = () => { if (!swapped) { swapped = true; swap(); } };
  const finish = () => { doSwap(); canvas.style.display = "none"; cleanup(); };
  const stop = frames((frame) => {
    if (prefersReducedMotion()) { finish(); return false; }
    if (frame === 1) cover.slice(0, half).forEach((i) => cell(i, true));
    if (frame === 2) { cover.slice(half).forEach((i) => cell(i, true)); doSwap(); }
    if (frame === 3) { finish(); return false; }
  });
  // 兜底（2026-10-23 审核第 5 条）：定时器被降频或窗口被遮住时画布不能一直盖着主区——超过 500ms 或页面重新可见就直接揭开。
  const guard = setTimeout(() => { stop(); finish(); }, 500);
  const onVisible = () => { if (!document.hidden) { stop(); finish(); } };
  document.addEventListener("visibilitychange", onVisible);
  function cleanup() { clearTimeout(guard); document.removeEventListener("visibilitychange", onVisible); }
  return () => { stop(); cleanup(); canvas.style.display = "none"; };
}
