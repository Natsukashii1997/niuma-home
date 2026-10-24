// 折线每点数值的摆放（2026-10-24 用户选定，稿件 docs/design-drafts/charts/hover.html）：业务页趋势图与 Voice 热度走势共用。
// 每个标签在点的四周按顺序试 8 个位置，选第一个不压别的标签、不压方点、不出图、不压折线的；都压就取代价最小的，
// 压到标签 / 方点 / 固定文字或出图的直接不画（悬停卡里有）。不依赖 React，测试见 tests/chart-labels.test.mjs。
// 坐标单位由调用方定（业务图是像素，Voice 是 viewBox 单位）；返回与 labels 同序的 { box, x, y, hidden }，x / y 是 start 锚点的基线。

const ORDER = {
  up: ["up", "upR", "upL", "right", "left", "down", "downR", "downL"],
  down: ["down", "downR", "downL", "right", "left", "up", "upR", "upL"],
};

function candidate(pos, l, w, h, gap) {
  const r = l.r ?? 4, cx = l.x - w / 2, top = l.y - r - gap - h, bottom = l.y + r + gap;
  switch (pos) {
    case "up": return { x: cx, y: top, w, h };
    case "down": return { x: cx, y: bottom, w, h };
    case "upR": return { x: l.x + r - 1, y: top + 2, w, h };
    case "upL": return { x: l.x - r + 1 - w, y: top + 2, w, h };
    case "downR": return { x: l.x + r - 1, y: bottom - 2, w, h };
    case "downL": return { x: l.x - r + 1 - w, y: bottom - 2, w, h };
    case "right": return { x: l.x + r + gap, y: l.y - h / 2, w, h };
    default: return { x: l.x - r - gap - w, y: l.y - h / 2, w, h };
  }
}

const overlaps = (a, b, pad = 0) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

// 线段与矩形相交（Liang–Barsky 裁剪）
export function segmentHitsBox([x1, y1, x2, y2], b) {
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - b.x, b.x + b.w - x1, y1 - b.y, b.y + b.h - y1];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

// labels: [{ x, y, text, side: "up" | "down", r（点的半边长）, w（可选，缺省按字数 × charW） }]
// segments: [[x1, y1, x2, y2]]；marks：方点的包围盒；boxes：「至今」「推算」、线尾年份这类固定文字的包围盒；bounds：标签能放的范围
export function placeLabels(labels, { segments = [], marks = [], boxes = [], bounds, charW = 6.6, h = 11, gap = 4 } = {}) {
  const placed = [];
  return labels.map(l => {
    const w = l.w ?? l.text.length * charW;
    let best = null;
    ORDER[l.side === "down" ? "down" : "up"].forEach((pos, k) => {
      const b = candidate(pos, l, w, h, gap);
      let cost = k * 0.1, hard = false;
      if (bounds && (b.x < bounds.x || b.y < bounds.y || b.x + b.w > bounds.x + bounds.w || b.y + b.h > bounds.y + bounds.h)) { cost += 1000; hard = true; }
      for (const o of placed) if (overlaps(b, o, 2)) { cost += 500; hard = true; }
      for (const o of boxes) if (overlaps(b, o, 2)) { cost += 500; hard = true; }
      for (const m of marks) if (overlaps(b, m, 1)) { cost += 300; hard = true; }
      for (const s of segments) if (segmentHitsBox(s, { x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 })) cost += 20;
      if (!best || cost < best.cost) best = { box: b, cost, hard };
    });
    if (!best.hard) placed.push(best.box);
    return { box: best.box, x: best.box.x, y: best.box.y + h - 2, hidden: best.hard };
  });
}
