// 带教 · 培养路径（定稿 V11 框里的远征，用户 2026-10-26）的纯几何：输入接口给的一个人的路径（server/mentor-path.mjs derivePath 的形状）
// 和地图宽度，算出山、路、营地、地平线带、阶段条和标牌的位置。页面 MentorPath.jsx 只负责画；这里不碰 DOM，tests/mentor-path.test.mjs 直接测。
// 横轴按工作日：D1 在左、计划最后一天（结业）在右；今天超过计划结束时，「今天」钉在横轴右端（pinned）。

// 山整体往下挪 SKY，天上留出当前标牌的位置（用户 10-26「拉高一点，方框和山都重合了」）
export const SKY = 40;
export const H = 386 + SKY, GROUND = 280 + SKY, STRIP = 24, BAND1 = GROUND + STRIP + 12, BAND2 = BAND1 + 34, L = 70, R = 100;
export const SUN_Y = 26;
const PIN = 30;   // 钉在右端时太阳离右边的距离

export function rng(seed) { let s = seed; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }
export const polyline = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
export const yOn = (pts, x) => { for (let k = 1; k < pts.length; k++) if (x <= pts[k][0]) { const [ax, ay] = pts[k - 1], [bx, by] = pts[k]; return ay + ((x - ax) / (bx - ax || 1)) * (by - ay); } return pts.at(-1)[1]; };
export const clipPts = (pts, xa, xb) => [[xa, yOn(pts, xa)], ...pts.filter((p) => p[0] > xa && p[0] < xb), [xb, yOn(pts, xb)]];
export const mmdd = (ymd) => ymd.slice(5);
// 第几个工作日；还没入职（今天在 D1 之前）写「入职前」
export const dayLabel = (d) => (d < 1 ? "入职前" : `D${d}`);

/* ---------- 读法：一个人的路径 → 当前阶段、评审、同期 ---------- */

export function model(path) {
  const [biz, ai] = path.lines.map((l) => l.stages);
  const all = [...biz, ...ai], byId = Object.fromEntries(all.map((s) => [s.id, s])), aiIds = new Set(ai.map((s) => s.id));
  return {
    biz, ai, byId, days: path.days, todayD: path.todayD, over: Math.max(0, path.todayD - path.days),
    isAi: (id) => aiIds.has(id),
    cur: { biz: biz.find((s) => s.status === "doing") ?? null, ai: ai.find((s) => s.status === "doing") ?? null },
    reviews: all.filter((s) => s.review).sort((a, b) => a.d[1] - b.d[1]),
    pairOf: (s) => (s.with ? byId[s.with] : ai.find((t) => t.with === s.id)) ?? null,
    summitId: biz.at(-1).id,
  };
}

export const lenOf = (s) => s.d[1] - s.d[0] + 1;
// 这一段已经走了几天（超期算满；还没开始是 0）
export const walked = (s, todayD) => Math.max(0, Math.min(lenOf(s), Math.min(s.d[1], todayD) - s.d[0] + 1));
// 今天落在哪条安排里（只看写了日期的）
export const stepAt = (s, todayD) => s.steps.find((x) => x.d && todayD >= x.d[0] && todayD <= x.d[1]) ?? null;
// 安排的状态：整段完成全打勾、未开始全空框；正在做的按日期，超期的段过了日子的不打勾（带教还没确认完成）
export function stepState(x, s, todayD) {
  if (s.status === "done") return "is-done";
  if (s.status === "todo" || !x.d) return "is-next";
  if (todayD > x.d[1]) return s.late ? "" : "is-done";
  return todayD >= x.d[0] ? "is-now" : "is-next";
}
// 进度格：已走过的墨色、今天这格橙色
export const cellsOf = (s, todayD) => { const n = lenOf(s), dn = walked(s, todayD); return Array.from({ length: n }, (_, k) => (k < dn - 1 ? "on" : k === dn - 1 ? "now" : "")); };

/* ---------- 地图几何 ---------- */

export function geo(W, path) {
  const days = path.days, cw = (W - L - R) / days, x0 = (d) => L + (d - 1) * cw, x1 = (d) => L + d * cw;
  // 前山（业务线）越往后越陡，结业那天单独拔成山尖；后山（技术线）起点更高
  const yBiz = (d) => 262 + SKY - 168 * Math.pow(d / days, 1.15) - (d >= days ? 16 : 0);
  const yAi = (d) => 214 + SKY - 112 * Math.pow(d / days, 0.85);
  // 山脊：一段坡 + 一块营地平台；坡长时加一处小起伏，坡不往回掉
  const ridge = (stages, y, seed, summit) => {
    const r = rng(seed), base = [L - 8, y(0)], pts = [[0, y(0) + 26], [L - 34, y(0) + 8], [L - 18, y(0)], base];
    const camps = [];
    let prev = base[0] + 8;
    pts.push([prev, y(0)]);
    stages.forEach((x, k) => {
      const cx = x1(x.d[1]), cy = y(x.d[1]), last = summit && k === stages.length - 1;
      const half = last ? 0 : Math.max(2, Math.min(7, (cx - prev) / 4));
      const a = pts.at(-1), b = [cx - half, cy], dx = b[0] - a[0];
      if (dx > 70) { const rise = a[1] - b[1], bump = Math.min(10, rise * 0.25) * (0.6 + r() * 0.4); pts.push([a[0] + dx * 0.38, a[1] - rise * 0.38 - bump], [a[0] + dx * 0.62, a[1] - rise * 0.62 + bump * 0.5]); }
      pts.push(b);
      if (half) pts.push([cx + half, cy]);
      camps.push({ x, cx, cy, gap: cx - (camps.at(-1)?.cx ?? base[0]) });
      prev = cx + half;
    });
    return { pts, camps, base };
  };
  const biz = ridge(path.lines[0].stages, yBiz, 7, true), ai = ridge(path.lines[1].stages, yAi, 11, false);
  // 今天：计划内在当天那一格中间；过了计划结束日钉在右端；还没入职按第 1 天
  const pinned = path.todayD > days;
  const xNow = pinned ? W - PIN : x0(Math.max(1, path.todayD)) + cw / 2;
  return { W, days, cw, x0, x1, biz, ai, xNow, pinned };
}

// 登山者站哪：按期就在今天；超期停在当前营地前，和今天竖线之间的空当就是落后的距离；整条线走完站在终点
export function walkerAt(g, key, s) {
  const line = g[key], camp = s && line.camps.find((c) => c.x.id === s.id);
  const x = !camp ? line.camps.at(-1).cx - 4 : s.late ? camp.cx - 22 : Math.min(g.xNow, camp.cx - 22);
  return [x, yOn(line.pts, x)];
}

// 风景：三层山、松树、云、鸟。远山 / 后山 / 前山的轮廓都向右收到地平线
export function scenery(g) {
  const { W } = g, summit = g.biz.camps.at(-1), aiEnd = g.ai.camps.at(-1);
  const r = rng(5), far = [[0, 190 + SKY]];
  for (let x = 60; x < W + 80; x += 70 + r() * 70) far.push([x, 128 + SKY + r() * 58]);
  far.push([W, 170 + SKY]);
  const back = [...g.ai.pts, [aiEnd.cx + 70, aiEnd.cy + 18], [aiEnd.cx + 150, aiEnd.cy + 62], [summit.cx - 60, GROUND - 60], [W - 20, GROUND]].filter((p, k, a) => k === 0 || p[0] > a[k - 1][0]);
  const front = [...g.biz.pts, [summit.cx + 20, summit.cy + 20], [summit.cx + 44, summit.cy + 30], [summit.cx + 70, summit.cy + 56], [W, GROUND - 40]];
  // 山脚松树：疏密不一
  const pr = rng(23), pines = [];
  for (let x = L + 30; x < W - 40; x += 26 + pr() * 46) if (pr() > 0.25) pines.push(x);
  // 天上两朵云、一对鸟，避开太阳
  const clouds = [[W * 0.16, 30], [W * 0.62, 44], [W * 0.42, 24]].filter(([x]) => Math.abs(x + 16 - g.xNow) > 70).slice(0, 2).map(([x, y], k) => [x, y, k ? 2 : 3]);
  const birdX = W * 0.36 + (Math.abs(W * 0.36 - g.xNow) < 70 ? 120 : 0);
  return { far, back, front, pines, clouds, birdX, summit, aiEnd };
}

// 标牌摆好后，被标牌压住的云不画（只露半截不好看）
export const visibleClouds = (clouds, boxes) => clouds.filter(([x, y, cell]) => !boxes.some((b) => hit(boxOf(x, y, 16 * cell, 5 * cell), b, 0)));

// 地平线带：每月第一个工作日写月份、每 5 个工作日一个 D 刻度（离月份和今天太近的不写）；今天一个橙格
export function stripTicks(g, calendar, todayD) {
  const mon = (d) => calendar[d - 1].slice(5, 7), months = [], days = [];
  for (let d = 1; d <= g.days; d++) if (d === 1 || mon(d) !== mon(d - 1)) months.push({ d, x: g.x0(d), label: `${+mon(d)} 月` });
  const now = dayLabel(todayD), nowW = Math.max(g.cw, 12 + [...now].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 11 : 7), 0));
  for (let d = 5; d <= g.days; d += 5) {
    const x = g.x0(d) + g.cw / 2;
    if (Math.abs(x - g.xNow) > nowW / 2 + 14 && !months.some((m) => Math.abs(d - m.d) <= 3)) days.push({ d, x });
  }
  return { months, days, now, nowW };
}

// 阶段条：编号牌 + 名称（放得下才写）；正在做的那条用网点铺到今天
export function bandRects(g, stages, todayD) {
  return stages.map((x) => {
    const a = g.x0(x.d[0]) + 1, w = g.x1(x.d[1]) - g.x0(x.d[0]) - 2, idW = x.id.length * 6.2 + 8;
    return { x, a, w, idW, full: w > idW + x.short.length * 12 + 14, idOnly: w > idW + 2, prog: x.status === "doing" ? Math.min(w, (walked(x, todayD) / lenOf(x)) * w) : 0 };
  });
}

/* ---------- 标牌与小牌：先在页面里量尺寸，再挑不压东西的位置 ---------- */

const hit = (a, b, m = 4) => a.l < b.r + m && a.r > b.l - m && a.t < b.b + m && a.b > b.t - m;
const overlap = (a, b, m = 4) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l) + m) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t) + m);
export const boxOf = (l, t, w, h) => ({ l, t, r: l + w, b: t + h });
// 候选位置里挑第一个不压东西的；都压就挑压得最少的
const pickBox = (boxes, busy, m) => boxes.find((b) => !busy.some((o) => hit(b, o, m))) ?? boxes.reduce((best, b) => { const s = busy.reduce((t, o) => t + overlap(b, o, m), 0); return s < best.s ? { b, s } : best; }, { b: boxes[0], s: Infinity }).b;

// 两座山的名字立在大本营旁，位置固定
export const mountAt = (g) => [[g.ai.base[0] - 6, g.ai.base[1] - 44], [g.biz.base[0] + 16, g.biz.base[1] - 12]];

// sizes：{ mounts: [{w,h}×2], tags: [{w,h}]（按 m.reviews 顺序）, plates: { biz?, ai? }, end?: {w,h} }；walkers：{ biz: [x,y], ai: [x,y] }
// 返回各块左上角和标牌到登山者的引线（折线点）
export function placeLabels(g, m, sizes, walkers) {
  const W = g.W, busy = [boxOf(g.xNow - 24, 0, 48, SUN_Y + 24)];   // 太阳
  const summit = g.biz.camps.at(-1);
  busy.push(boxOf(summit.cx - 14, summit.cy - 20, 28, 24));
  const mounts = mountAt(g).map(([l, t], k) => { const b = boxOf(l, t, sizes.mounts[k].w, sizes.mounts[k].h); busy.push(b); return b; });
  // 钉在右端时的「计划已结束」：太阳左边，放不下就挪到太阳下面
  let end = null;
  if (sizes.end) {
    const { w, h } = sizes.end, x = g.xNow;
    end = pickBox([[x - 28 - w, SUN_Y - h / 2], [x - w + 10, SUN_Y + 30], [x - w - 30, SUN_Y + 30]].map(([l, t]) => boxOf(Math.max(4, Math.min(W - w - 4, l)), t, w, h)), busy, 4);
    busy.push(end);
  }
  // 评审小牌：营地下方偏右；放不下（出右界或压到别的牌）就挪到左边；结业放在山尖上方
  const tags = m.reviews.map((s, k) => {
    const c = g[m.isAi(s.id) ? "ai" : "biz"].camps.find((x) => x.x.id === s.id), { w, h } = sizes.tags[k];
    const cands = s.id === m.summitId ? [[c.cx - w / 2 - 30, c.cy - 46], [c.cx - w - 14, c.cy - 30], [c.cx - w - 14, c.cy + 8]]
      : [[c.cx - 8, c.cy + 12], [c.cx - w + 8, c.cy + 12], [c.cx - w - 12, c.cy - 8], [c.cx + 12, c.cy - h - 18]];
    const ok = pickBox(cands.map(([l, t]) => boxOf(Math.max(4, Math.min(W - w - 4, l)), t, w, h)), busy, 4);
    busy.push(ok);
    return ok;
  });
  // 两张当前标牌都放在天上，不压三层山（用户 10-26）：先贴着登山者、紧挨山顶那一档，再往两边挪，再往上一档到顶。登山者自己也占位
  Object.values(walkers).forEach(([x, y]) => busy.push(boxOf(x - 10, y - 22, 20, 22)));
  const sc = scenery(g), ridge = (l, r) => { let top = GROUND; for (let x = l; x <= r + 2; x += 2) for (const pts of [sc.far, sc.back, sc.front]) top = Math.min(top, yOn(pts, Math.min(x, r))); return top; };
  const plates = {}, leads = [];
  ["ai", "biz"].forEach((key) => {
    if (!sizes.plates[key]) return;
    const { w, h } = sizes.plates[key], [x, y] = walkers[key];
    // 再放不下（超期时两张都挤在起点附近）就往右多挪几档
    const xs = [x - w + 26, x - 26, x - w - 40, x + 40, x - w - 110, x + 110, x + 200, x + 290].map((l) => Math.max(4, Math.min(W - w - 4, l)));
    const cands = [0, 1, 2].flatMap((row) => xs.map((l) => { const low = ridge(l, l + w) - h - 8; return boxOf(l, row === 2 ? 6 : low - row * (h + 10), w, h); })).filter((b) => b.t >= 4);
    const ok = pickBox(cands.length ? cands : xs.map((l) => boxOf(l, 6, w, h)), busy, 6);
    busy.push(ok);
    plates[key] = ok;
    const lx = Math.max(ok.l + 10, Math.min(ok.r - 10, x)), [a, b, d] = ok.b <= y - 20 ? [lx, ok.b, y - 21] : [lx, ok.t, y + 2];
    leads.push({ key, pts: [[a, b], [a, (b + d) / 2], [x, (b + d) / 2], [x, d]] });
  });
  return { mounts, end, tags, plates, leads };
}

/* ---------- 调整安排的草稿（纯函数，弹窗 MentorPathEdit.jsx 用） ---------- */

// 一个人的路径 → 可以提交给 /plan 的 { start, lines }：只留接口约定的字段，去掉推导出来的日期、状态和记录
export const draftOf = (path) => ({
  start: path.start,
  lines: path.lines.map((l) => ({ key: l.key, stages: l.stages.map(({ id, short, title, d, review, pass, with: w, goal, steps, out }) => ({
    id, short, title, d: [...d], ...(review && { review, pass }), ...(w && { with: w }), goal, steps: steps.map((x) => ({ ...(x.d && { d: [...x.d] }), text: x.text })), out: [...out],
  })) })),
});

// 改一段的起（which = 0）或止（which = 1）。止日挪了 n 天、cascade 打开时，原来在这一段结束之后才开始的段（两条线都算）一起挪 n 天，
// 安排的日期跟着挪；这一段自己的安排日期收进新的起止里。
export function moveStage(draft, id, which, value, cascade) {
  const was = draft.lines.flatMap((l) => l.stages).find((x) => x.id === id).d, delta = which === 1 ? value - was[1] : 0;
  const shift = (x) => ({ ...x, d: [x.d[0] + delta, x.d[1] + delta], steps: x.steps.map((y) => (y.d ? { ...y, d: [y.d[0] + delta, y.d[1] + delta] } : y)) });
  const fit = (x) => ({ ...x, steps: x.steps.map((y) => (y.d ? { ...y, d: [Math.min(Math.max(y.d[0], x.d[0]), x.d[1]), Math.max(Math.min(y.d[1], x.d[1]), x.d[0])] } : y)) });
  return { ...draft, lines: draft.lines.map((l) => ({ ...l, stages: l.stages.map((x) => {
    if (x.id === id) return fit({ ...x, d: which ? [x.d[0], value] : [value, x.d[1]] });
    return cascade && delta && x.d[0] > was[1] ? shift(x) : x;
  }) })) };
}
