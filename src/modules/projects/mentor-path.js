// 带教「培养路径」V7 远征登山的纯计算：周次换算、山形与营地（layout）、标牌避让（placePlates）、绳桥弧度与说明位置。
// 只算坐标，不碰 DOM：标牌和文字的尺寸由页面实测后传进来。前山 = 业务线（biz），后山 = AI 线（ai），两条路在山顶汇合。
// 规则照定稿 docs/design-drafts/mentor-path/v7.html：一关是一段坡，坡顶的营地是通关点；营地横坐标 = 那一关计划结束的周。

const DAY = 864e5;
const utc = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const md = (t) => { const d = new Date(t); return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; };

// 季度时钟：start 是第 1 周起点（入职日）；nowW 是今天的连续周数（09-01 为 0），week 是今天所在的整数周
export function seasonClock({ start, weeks }, today) {
  const t0 = utc(start), nowW = (utc(today) - t0) / DAY / 7;
  const week = Math.min(weeks, Math.max(1, Math.floor(nowW) + 1));
  const day = (n) => md(t0 + n * DAY);
  const months = [];
  for (let k = 0; ; k++) {
    const d = new Date(t0), first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1), w = Math.max(0, (first - t0) / DAY / 7);
    if (w > weeks) break;
    months.push({ name: `${new Date(first).getUTCMonth() + 1} 月`, w });
  }
  return { nowW, week, weeks, today: md(utc(today)), weekStart: (w) => day((w - 1) * 7), weekEnd: (w) => day(w * 7 - 1), months };
}

/* ---------- 关卡 ---------- */
export const stars = (score, pass) => (score == null ? 0 : score >= 90 ? 3 : score >= 80 ? 2 : score >= pass ? 1 : 0);
export const isLate = (n, week) => n.status === "doing" && n.week[1] < week;
export const lateWeeks = (n, week) => week - n.week[1];
export const doneCount = (line) => line.nodes.filter((n) => n.status === "done").length;
export const lineStars = (line, pass) => line.nodes.reduce((s, n) => s + (n.status === "done" ? stars(n.score, pass) : 0), 0);
export const avgScore = (line) => { const d = line.nodes.filter((n) => n.status === "done"); return d.length ? (d.reduce((s, n) => s + n.score, 0) / d.length).toFixed(1) : "—"; };
export function findNode(lines, id) {
  for (const line of lines) { const i = line.nodes.findIndex((n) => n.id === id); if (i >= 0) return { n: line.nodes[i], line, i }; }
  return null;
}
// 前置：同一条线的上一关，加上跨线依赖（绳桥）给它的产出
export function prereqs(path, id) {
  const { line, i } = findNode(path.lines, id);
  return { prev: i > 0 ? line.nodes[i - 1] : null, feeds: path.links.filter((k) => k.to === id) };
}
export function unlockText(path, id, pass) {
  const { prev, feeds } = prereqs(path, id);
  return [prev && `${prev.id} 达到 ${pass} 分`, ...feeds.map((k) => `拿到 ${k.from} 的${k.note}`)].filter(Boolean).join("，");
}
// 地图上放得下的短说明；完整解锁条件在营地日志里
export function shortUnlock(path, id) {
  const { prev, feeds } = prereqs(path, id);
  return `需 ${[prev && `${prev.id} 达标`, ...feeds.map((k) => `${k.from} 产出`)].filter(Boolean).join(" + ")}`;
}
// 待评分：正在爬、已经交了产出的关
// 待评分由后端按记录给（进行中、交了产出、产出在最近一次评分之后又更新过或还没评过）
export const pendingReviews = (path) => path.lines.reduce((s, l) => s + l.nodes.filter((n) => n.review).length, 0);

/* ---------- 山形 ---------- */
export const LEDGE = 14;   // 营地平台半宽：图标立在这段平路上，不压线
// 地图按周定宽（用户 10-23：横向拉长到约 3 倍，每周固定宽度；随后嫌看不出坡度，压到 3/4）：左边大本营 170 + 每周 WEEK_W + 右边山顶 248；赛季周数变了地图跟着变长
export const WEEK_W = 105;
export const mapWidth = (weeks) => 170 + weeks * WEEK_W + 248;
export const SUN = { r: 30, glow: 54 };   // 太阳核心、光晕半径（用户 10-23：再大一点，原 22 / 40）
const KEYS = ["biz", "ai"];
function makeRng(seed) { const r = () => (r.seed = (r.seed * 9301 + 49297) % 233280) / 233280; r.seed = seed; return r; }
// 控制点之间插两处起伏（间距大于 min 才插，amp 控制幅度），控制点本身仍在山脊线上
// climb：上坡路不往回掉，两处起伏加起来不超过这段爬升的 3 成
function crest(points, rnd, { min = 60, amp = 1, climb = false } = {}) {
  const out = [points[0]];
  for (let k = 1; k < points.length; k++) {
    const [ax, ay] = points[k - 1], [bx, by] = points[k], dx = bx - ax;
    if (dx > min) {
      let up = (10 + rnd() * 26) * amp, dn = (4 + rnd() * 14) * amp;
      if (climb) { const s = Math.min(1, (0.3 * Math.abs(by - ay)) / (up + dn)); up *= s; dn *= s; }
      out.push([ax + dx * 0.32, ay + (by - ay) * 0.32 - up]);
      out.push([ax + dx * 0.66, ay + (by - ay) * 0.66 + dn]);
    }
    out.push([bx, by]);
  }
  return out;
}
export const yAt = (pts, x) => { for (let k = 1; k < pts.length; k++) if (x <= pts[k][0]) { const [ax, ay] = pts[k - 1], [bx, by] = pts[k]; return ay + ((x - ax) / (bx - ax || 1)) * (by - ay); } return pts.at(-1)[1]; };
export const poly = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
export const clip = (pts, x0, x1) => { const r = [[x0, yAt(pts, x0)]]; pts.forEach((p) => { if (p[0] > x0 && p[0] < x1) r.push(p); }); r.push([x1, yAt(pts, x1)]); return r; };
const hit = (a, b, m = 0) => a.l < b.r + m && a.r > b.l - m && a.t < b.b + m && a.b > b.t - m;
const box = (l, t, w, h) => ({ l, t, r: l + w, b: t + h });

// 整张图的坐标。size = 舞台宽高；path = { lines, links }；clock = seasonClock(...)
export function layout({ W, H }, path, clock) {
  const rnd = makeRng(7);
  const RB = 46, yg = H - RB;                 // 地平线（月份、周次）高 RB
  const X1 = 170, XS = W - 156, X24 = XS - 92; // 第 0 周、山顶、最后一周的横坐标
  const xw = (w) => X1 + (w / clock.weeks) * (X24 - X1);
  const lines = Object.fromEntries(path.lines.map((l) => [l.key, l]));
  // 营地高度按周数抬升：第一关、最后一关高度不变，中间同样的周数爬同样的高度，坡度一路均匀（按关数抬升时隔得久的两关之间近乎平路）
  const ends = { biz: [yg - 104, 290], ai: [yg - 280, 190] };
  const yOf = (k, w) => { const ns = lines[k].nodes, w0 = ns[0].week[1], w1 = ns.at(-1).week[1], [y0, y1] = ends[k]; return w1 > w0 ? y0 - ((w - w0) / (w1 - w0)) * (y0 - y1) : y0; };
  const summit = [XS, 118];
  const camps = Object.fromEntries(KEYS.map((k) => [k, lines[k].nodes.map((n, i) => ({ id: n.id, n, i, x: xw(n.week[1]), y: yOf(k, n.week[1]), line: k }))]));
  const base = { biz: [X1 - 24, yg - 62], ai: [X1 - 24, yg - 250] };
  // 山脊 = 山脚 + 路线 + 山顶另一侧。路线在大本营和每个营地处走一段平台，平台之间只在宽坡上加缓起伏
  const flat = ([x, y], w) => [[x - w, y], [x + w, y]];
  const ridgeOf = (k, foot, tail) => {
    const trail = [...flat(base[k], 16), ...camps[k].flatMap((c) => flat([c.x, c.y], LEDGE)), summit];
    return [...crest([foot, trail[0]], rnd).slice(0, -1), ...crest(trail, rnd, { min: 100, amp: 0.35, climb: true }), ...crest([summit, ...tail], rnd).slice(1)];
  };
  const ridge = { biz: ridgeOf("biz", [0, yg - 28], [[XS + 70, 250], [W, 330]]), ai: ridgeOf("ai", [0, yg - 220], [[XS + 60, 190], [W, 250]]) };
  const XE = XS - 22;   // 路线画到雪线为止，山顶只留旗子和雪
  // 远山：每 3 周宽一起一伏，高低随机，长图上不显得平
  const FAR = 3 * WEEK_W;
  const far = crest(Array.from({ length: Math.ceil(W / FAR) + 1 }, (_, k) => [Math.min(W, k * FAR), (k % 2 ? 214 : 286) + rnd() * 44]), rnd);
  const xNow = xw(clock.nowW), sun = [xNow, 132];

  // 现在在哪：在途的关按今天在计划周期里的位置；超期的停在营地前。没有在途的关就没有登山者，实线走到最后一个通关营地
  const me = {}, reach = {};
  KEYS.forEach((k) => {
    const c = camps[k].find((x) => x.n.status === "doing");
    const late = !!c && isLate(c.n, clock.week);
    const x = c && (late ? c.x - 34 : Math.min(c.x - 34, xNow));
    me[k] = c ? { id: c.id, late, x, y: yAt(ridge[k], x) } : null;
    reach[k] = c ? x : camps[k].filter((x) => x.n.status === "done").at(-1)?.x ?? base[k][0];
  });
  const trail = Object.fromEntries(KEYS.map((k) => [k, { done: clip(ridge[k], base[k][0], reach[k]), todo: clip(ridge[k], reach[k], XE) }]));

  // 山顶积雪：沿山顶轮廓往下 16px，下沿锯齿
  const top = (x) => Math.min(yAt(ridge.biz, x), yAt(ridge.ai, x));
  const snowTop = [], snowBot = [];
  for (let x = XS - 34; x <= XS + 30; x += 2) {
    const t = top(x), d = Math.max(0, 16 * (1 - Math.abs(x - XS) / 34)) + ((x / 2) % 3 === 0 ? 3 : 0);
    snowTop.push([x, t]); snowBot.unshift([x, t + d]);
  }

  // 绳桥（跨线依赖）：从平台边上、线的下方出发，弧度挑第一个不穿过别的营地的；pts 是悬停说明的候选锚点
  const all = [...camps.biz, ...camps.ai];
  const campBoxes = all.map((c) => ({ id: c.id, l: c.x - 18, t: c.y - 38, r: c.x + 18, b: c.y + 4 }));
  const ropes = path.links.map(({ from, to, note }) => {
    const a = all.find((c) => c.id === from), b = all.find((c) => c.id === to), d = Math.sign(b.x - a.x) || 1;
    const ax = a.x + d * (LEDGE + 2), ay = a.y + 4, bx = b.x - d * (LEDGE + 2), by = b.y + 4, mx = (ax + bx) / 2;
    const at = (my, t) => [(1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t * t * bx, (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * by];
    const clear = (my) => !campBoxes.some((o) => o.id !== from && o.id !== to && Array.from({ length: 41 }, (_, i) => at(my, i / 40)).some(([x, y]) => x > o.l && x < o.r && y > o.t && y < o.b));
    const my = [36, 60, 84, 12, -12].map((k) => (ay + by) / 2 + k).find(clear) ?? (ay + by) / 2 + 36;
    return { from, to, note, d: `M${ax} ${ay}Q${mx} ${my} ${bx} ${by}`, at: (t) => at(my, t), pts: [0.5, 0.35, 0.65, 0.2, 0.8].map((t) => at(my, t).map(Math.round)) };
  });

  // 地平线：月份分界、周次格、营地刻度
  const months = clock.months.map((m) => ({ ...m, x: xw(m.w) })).filter((m) => m.x < X24 + 1);
  const weeks = Array.from({ length: clock.weeks }, (_, k) => ({ w: k + 1, a: xw(k), b: xw(k + 1), cur: k + 1 === clock.week, from: clock.weekStart(k + 1) }));
  // 云每 4 周一朵、高低错开，不压太阳和右边「今天」那行字；鸟一群跟着太阳，另外两群散在后面
  const decor = {
    clouds: Array.from({ length: Math.floor(clock.weeks / 4) }, (_, k) => [xw(1.2 + k * 4 + (k % 2) * 1.4), [112, 96, 128][k % 3], k % 3 === 2 ? 3 : 4]).filter(([x]) => x < xNow - SUN.glow - 70 || x > xNow + SUN.glow + 260),
    birds: [[xNow - SUN.glow - 52, 104], [xNow - SUN.glow - 34, 116], [xw(clock.weeks * 0.55), 160], [xw(clock.weeks * 0.8), 140]],
  };
  return { W, H, RB, yg, X1, XS, X24, XE, xNow, sun, summit, base, camps, ridge, far, me, trail, snow: [...snowTop, ...snowBot], ropes, months, weeks, decor, seedAfter: rnd.seed };
}

// 高亮的那一段坡：营地 = 上一营地（或大本营）→ 这一营地；山顶 = 两条线最后一个营地 → 雪线
export function slopeOf(geo, id) {
  if (id === "summit") return KEYS.map((k) => clip(geo.ridge[k], geo.camps[k].at(-1).x, geo.XE));
  const c = [...geo.camps.biz, ...geo.camps.ai].find((x) => x.id === id);
  if (!c) return [];
  const x0 = c.i ? geo.camps[c.line][c.i - 1].x : geo.base[c.line][0];
  return [clip(geo.ridge[c.line], x0, c.x)];
}

/* ---------- 叠在图上的固定文字 ---------- */
// 尺寸 → 位置：山名牌在大本营上方，「今天」在太阳右边，山顶牌在旗子右下，「本周攀登」卡底边离地平线 14px，超期小牌挂在登山者脚下
export function fixedLabels(geo, sizes) {
  const { W, yg, base, sun, summit, ridge, me } = geo;
  const late = {};
  KEYS.forEach((k) => {
    const s = sizes.late?.[k];
    if (!s || !me[k]?.late) return;
    const l = me[k].x - 10;
    let low = 0;
    for (let x = l; x <= l + s.w; x += 4) low = Math.max(low, yAt(ridge[k], x));
    late[k] = box(l, low + 7, s.w, s.h);
  });
  return {
    ridge: { biz: box(24, base.biz[1] - 22, sizes.ridge.biz.w, sizes.ridge.biz.h), ai: box(24, base.ai[1] - 22, sizes.ridge.ai.w, sizes.ridge.ai.h) },
    today: box(sun[0] + SUN.glow + 8, sun[1] - 16, sizes.today.w, sizes.today.h),
    summit: box(summit[0] + 24, summit[1] + 10, sizes.summit.w, sizes.summit.h),
    // 「本周攀登」卡固定在可视区右下、不在图上时不传 week
    week: sizes.week ? box(W - 24 - sizes.week.w, yg - 14 - sizes.week.h, sizes.week.w, sizes.week.h) : null,
    late,
  };
}
export const labelBoxes = (fl) => [fl.ridge.biz, fl.ridge.ai, fl.today, fl.summit, ...KEYS.map((k) => fl.late[k]).filter(Boolean), fl.week].filter(Boolean);

/* ---------- 标牌自动摆放 ---------- */
// 标牌挂在自己的营地上：业务线默认在营地右下、AI 线默认在左上。放不下时依次试：
// 左右滑（营地始终在标牌宽度内）→ 往外推（引线变长）→ 换到营地另一侧 → 收成一行小牌（悬停或打开时展开）。正在爬的两关不收。
// 要避开别的标牌和引线、固定文字（labels）、太阳、山顶旗、大本营、营地、登山者、两条路。先按优先级逐块摆，再整体复查最多 5 轮。
// sizes = { [id]: { full: { w, h, bw }, mini: { w, h, bw } } }，bw 是边框宽。
// 图上不能压的东西：固定文字（留 6px）、太阳、山顶旗、大本营、登山者、营地（id 是营地自己的标牌可以挨着）
function obstacles(geo, labels) {
  const { base, sun, summit, me, camps } = geo;
  return [
    ...labels.map((b) => ({ ...b, m: 6 })),
    { l: sun[0] - SUN.glow - 2, t: sun[1] - SUN.glow - 2, r: sun[0] + SUN.glow + 2, b: sun[1] + SUN.glow + 2, m: 0 },
    { l: summit[0] - 12, t: summit[1] - 50, r: summit[0] + 42, b: summit[1] + 6, m: 2 },
    ...KEYS.map((k) => ({ l: base[k][0] - 18, t: base[k][1] - 36, r: base[k][0] + 18, b: base[k][1] + 2, m: 2 })),
    ...KEYS.filter((k) => me[k]).map((k) => ({ l: me[k].x - 16, t: me[k].y - 43, r: me[k].x + 16, b: me[k].y, m: 2 })),
    ...[...camps.biz, ...camps.ai].map((c) => ({ l: c.x - 18, t: c.y - 36, r: c.x + 18, b: c.y + 5, m: 2, id: c.id })),
  ];
}
const TOP = 64;   // 标牌上沿不进页头（页头 64px 高）；标牌多一行后，挨着山顶的最后一关往上挂才放得下
export function placePlates(geo, sizes, labels) {
  const { W, yg, base, ridge, XS, camps } = geo;
  const fixed = obstacles(geo, labels);
  const road = [];
  KEYS.forEach((k) => { for (let x = base[k][0]; x <= XS; x += 5) road.push([x, yAt(ridge[k], x), k]); });
  const plates = [...camps.biz, ...camps.ai].map((c) => {
    // 先摆正在爬的，再摆下一关、刚通关的，离现在越远越后
    const d = camps[c.line].findIndex((x) => x.n.status === "doing");
    const prio = c.i === d ? 0 : c.i === d + 1 ? 1 : c.i < d ? 1 + d - c.i : 2 + c.i - d;
    return { id: c.id, c, ...sizes[c.id], prio, side0: c.line === "ai" ? "up" : "down", canMini: c.n.status !== "doing", at: null };
  }).sort((a, b) => a.prio - b.prio);
  // 一个候选位置：标牌矩形 r + 引线 lead（营地到标牌的竖线）
  const spot = (p, side, mini, l, dy, cost) => {
    const { w, h } = mini ? p.mini : p.full, { x, y } = p.c;
    const t = side === "down" ? y + 12 + dy : y - 45 - h - dy;
    return { side, mini, l, t, w, h, cost, r: { l, t, r: l + w, b: t + h }, lead: side === "down" ? { l: x - 1, r: x + 1, t: y + 3, b: t } : { l: x - 1, r: x + 1, t: t + h, b: y - 37 } };
  };
  const spots = (p) => {
    const out = [];
    for (const mini of p.canMini ? [false, true] : [false]) for (const side of [p.side0, p.side0 === "up" ? "down" : "up"]) {
      const w = (mini ? p.mini : p.full).w, lo = p.c.x - w + 10, hi = p.c.x - 10;
      for (let dy = 0; dy <= 56; dy += 8) for (let k = 0; ; k++) {
        const l = side === "down" ? hi - 8 * k : lo + 8 * k;
        if (l < lo || l > hi) break;
        out.push(spot(p, side, mini, l, dy, 8 * k + 2 * dy + (side === p.side0 ? 0 : 90) + (mini ? (p.prio === 1 ? 360 : 160) : 0)));
      }
    }
    return out;
  };
  const score = (p, s, others) => {
    const { r, lead } = s;
    if (r.l < 8 || r.r > W - 8 || r.t < TOP || r.b > yg - 8) return Infinity;
    let bad = fixed.filter((o) => o.id !== p.id && (hit(r, o, o.m) || hit(lead, o))).length;
    if (road.some(([x, y, k]) => !(k === p.c.line && Math.abs(x - p.c.x) < 22) && x > r.l - 5 && x < r.r + 5 && y > r.t - 5 && y < r.b + 5)) bad++;
    others.forEach((q) => { if (hit(r, q.at.r, 4) || hit(lead, q.at.r, 1) || hit(r, q.at.lead, 1)) bad++; });
    return s.cost + bad * 1000;
  };
  for (let round = 0; round < 5; round++) {
    let moved = false;
    plates.forEach((p) => {
      const others = plates.filter((q) => q !== p && q.at);
      let best = p.at, bs = p.at ? score(p, p.at, others) : Infinity;
      spots(p).forEach((s) => { const v = score(p, s, others); if (v < bs) { bs = v; best = s; } });
      if (!best) best = spot(p, p.side0, false, p.side0 === "down" ? p.c.x - 10 : p.c.x + 10 - p.full.w, 0, 0);
      if (best !== p.at) { p.at = best; moved = true; }
    });
    if (!moved) break;
  }
  // 小牌展开（peek）时用完整尺寸：不出右边界，往上挂的保持底边不动
  return plates.map((p) => {
    const a = p.at, f = p.full;
    const peek = a.mini ? { ...a, mini: false, w: f.w, h: f.h, l: Math.min(a.l, W - 8 - f.w), t: a.side === "down" ? a.t : a.t + a.h - f.h } : a;
    return { id: p.id, c: p.c, full: p.full, mini: p.mini, at: a, peek };
  });
}
// 标牌的样式：位置 + 引线（--lx 横向位置，--lh 长度，--lt 起点）。引线从营地竖直连到标牌边上
export function plateStyle(p, a) {
  const { c } = p, bw = (a.mini ? p.mini : p.full).bw;
  const lh = a.side === "down" ? a.t - (c.y + 3) : c.y - 37 - (a.t + a.h);
  return { left: a.l, top: a.t, lx: c.x - a.l - bw - 1, lh, lt: -(bw + lh) };
}

// 绳桥说明（悬停才出现）：沿弧线从中点往两头试 4 个方向，避开标牌、营地、登山者和文字；都不行就挑压得最少的
export function placeRopeLabels(geo, sizes, busy) {
  const { W, yg } = geo;
  return Object.fromEntries(geo.ropes.map((rope) => {
    const key = `${rope.from}>${rope.to}`, { w, h } = sizes[key];
    const raw = rope.pts.flatMap(([x, y]) => [[x - w / 2, y + 6], [x - w / 2, y - h - 6], [x + 12, y - h / 2], [x - w - 12, y - h / 2]]).map(([l, t]) => box(l, t, w, h));
    const opts = raw.filter((o) => o.l >= 8 && o.r <= W - 8 && o.t >= 70 && o.b <= yg - 4);
    const cost = (o) => busy.filter((q) => hit(o, q, 3)).length;
    const r = opts.find((o) => !cost(o)) || (opts.length ? opts.reduce((a, b) => (cost(b) < cost(a) ? b : a)) : raw[0]);
    return [key, r];
  }));
}
// 绳桥说明要避开的：图上不能压的东西 + 摆好的标牌
export const busyBoxes = (geo, plates, labels) => [...obstacles(geo, labels), ...plates.map((p) => p.at.r)];

// 山脚松树：标牌摆好后再种，避开压到地平线附近的标牌、「本周攀登」卡和大本营
export function pines(geo, plates, cardLeft) {
  const rnd = makeRng(geo.seedAfter), out = [];
  for (let x = 18; x < geo.W - 16; x += 30 + Math.round(rnd() * 22)) {
    const bad = plates.some(({ at: { r } }) => x + 15 > r.l && x < r.r && r.b > geo.yg - 24) || x + 15 > cardLeft - 6 || Math.abs(x - geo.base.biz[0]) < 30;
    if (!bad) out.push(x);
  }
  return out;
}
