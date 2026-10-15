// 位图风基础件。规范见 docs/STYLE-GUIDE.md「位图风」：动效一律按帧跳变（约 15 帧/秒），不用缓动、弹簧、模糊；
// 像素只用于数字、图标、点阵图、抖动网点、1-bit 头像和方块光标。系统开启「减少动态效果」时直接显示终态。
import { useEffect, useRef, useState } from "react";

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

// 启动时调用一次：注入网点变量，并接管所有 [data-dither] 元素的悬停（四档逐帧加密 / 退回）。
export function installBitmap() {
  const root = document.documentElement.style;
  [2, 4, 6, 8].forEach((t, i) => root.setProperty(`--dither-${i + 1}`, ditherTile(t, "#C9CCD3")));
  [4, 8, 12, 16].forEach((t, i) => root.setProperty(`--dither-ink-${i + 1}`, ditherTile(t, "#0D0E10")));

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
export function DotMatrix({ data, rows = 10, highlight = -1, unit = "" }) {
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
      {visible.split(/(\d+(?:[.,:]\d+)*%?)/).map((part, i) => (i % 2 ? <span key={i} className="type-num">{part}</span> : part))}
      {!done && <span className={`type-cursor${!reduced && phase === "blink" && !blinkOn ? " off" : ""}`} aria-hidden="true" />}
    </span>
  );
}

/* ---------- ⑥ 按帧加载 ---------- */

// progress 为 0–1；为 null 时按帧自走到 95% 等待完成。done 时 100% 并显示像素对勾。全程无缓动。
export function StepProgress({ progress = null, done = false, error = "", label = "" }) {
  const reduced = useReducedMotion();
  const [auto, setAuto] = useState(0);
  useEffect(() => {
    if (done || error || progress !== null || reduced) return undefined;
    setAuto(0);
    return frames((frame) => {
      if (frame % 3 === 0) setAuto(Math.min(19, frame / 3));
      if (frame >= 57) return false;
    });
  }, [done, error, progress, reduced]);
  const fraction = progress === null ? null : Math.max(0, Math.min(1, progress));
  const cells = done ? 20 : fraction !== null ? Math.floor(fraction * 20) : reduced ? 19 : auto;
  const pct = done ? 100 : fraction !== null ? Math.floor(fraction * 100) : cells * 5;
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

/* ---------- 7×7 像素图标 ---------- */

const ICONS = {
  upload: ["...#...", "..###..", ".#.#.#.", "...#...", "#..#..#", "#.....#", "#######"],
  external: ["...####", ".....##", "....#.#", "#..#..#", "#.#....", "#......", "#####.."],
  home: ["...#...", "..###..", ".#####.", "#######", ".#...#.", ".#.#.#.", ".#.#.#."],
  marketing: [".....#.", "...###.", "####.#.", "#..#.#.", "####.#.", ".#.###.", ".#...#."],
  brand: ["...#...", "...#...", "..###..", "#######", "..###..", "...#...", "...#..."],
  business: ["......#", "....#.#", "....#.#", "..#.#.#", "..#.#.#", "#.#.#.#", "#######"],
  agent: ["...#...", ".#####.", "#.....#", "#.#.#.#", "#.....#", ".#####.", ".#...#."],
  reports: ["#####..", "#...##.", "#.....#", "#.###.#", "#.....#", "#.###.#", "#######"],
  settings: ["..#.#..", ".#####.", "##...##", ".#...#.", "##...##", ".#####.", "..#.#.."],
  calendar: [".#...#.", "#######", "#.....#", "#.#.#.#", "#.....#", "#.#.#.#", "#######"],
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
  image: ["#######", "#.....#", "#.##..#", "#.##..#", "#....##", "#.#####", "#######"],
  alert: ["...#...", "..#.#..", "..#.#..", ".#.#.#.", ".#...#.", "#..#..#", "#######"],
  search: [".###...", "#...#..", "#...#..", "#...#..", ".###...", "....##.", ".....##"],
};

export function PixelIcon({ name, size = 14, className = "" }) {
  const rows = ICONS[name];
  if (!rows) return null;
  return (
    <svg className={`pixel-icon ${className}`} width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">
      {rows.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null)))}
    </svg>
  );
}

/* ---------- 1-bit 头像 ---------- */

// 由名称生成左右对称的 5×5 黑白像素头像，外围留 1 格边。
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

/* ---------- ③ 像素溶解转场 ---------- */

// 在 area 可见范围上覆盖 16px 方格：前 3 帧按随机顺序盖住旧页面，调用 swap 换成新页面，后 3 帧按另一组随机顺序揭开。约 400ms。
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
  const cover = shuffled(), reveal = shuffled(), third = Math.ceil(count / 3);
  const cell = (i, fill) => {
    const x = (i % cols) * size, y = Math.floor(i / cols) * size;
    if (fill) ctx.fillRect(x, y, size, size); else ctx.clearRect(x, y, size, size);
  };
  const stop = frames((frame) => {
    if (prefersReducedMotion()) { if (frame <= 3) swap(); canvas.style.display = "none"; return false; }
    if (frame <= 3) cover.slice((frame - 1) * third, frame * third).forEach((i) => cell(i, true));
    if (frame === 3) swap();
    if (frame >= 4 && frame <= 6) reveal.slice((frame - 4) * third, (frame - 3) * third).forEach((i) => cell(i, false));
    if (frame === 6) { canvas.style.display = "none"; return false; }
  });
  return () => { stop(); canvas.style.display = "none"; };
}
