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

// 两道山脊的地形（横轴是计划的几分之几，纵轴是离天顶的高度，再加 SKY）：
// 后山（技术线）前段陡升、中段起伏，T6 停在一处肩峰，过一道浅鞍部后沿主峰西脊继续往上；
// 前山（业务线）前段平缓、越往后越陡，D44 一个肩、过鞍部后上到主峰左肩；两道山脊在主峰汇合（「双脊合峰」，用户 10-27）
const FRONT = [[0, 240], [0.06, 238], [0.17, 234], [0.22, 228], [0.37, 216], [0.45, 216], [0.55, 200], [0.68, 178], [0.75, 186], [0.84, 170], [0.92, 146], [0.985, 100]];
const BACK = [[0, 198], [0.05, 190], [0.17, 164], [0.22, 156], [0.3, 152], [0.37, 146], [0.47, 154], [0.55, 140], [0.68, 118], [0.75, 130], [0.81, 118], [0.89, 100], [0.95, 80], [0.985, 66]];
const SUMMIT = 56;   // 主峰（结业）离天顶的高度
const lerp = (P, f) => { for (let k = 1; k < P.length; k++) if (f <= P[k][0]) { const [a, ya] = P[k - 1], [b, yb] = P[k]; return ya + ((f - a) / (b - a)) * (yb - ya); } return P.at(-1)[1]; };

export function geo(W, path) {
  const days = path.days, cw = (W - L - R) / days, x0 = (d) => L + (d - 1) * cw, x1 = (d) => L + d * cw, xf = (f) => L + f * days * cw;
  const top = [x1(days), SKY + SUMMIT];
  // 山脊：营地之间按地形走，营地是一小块平台；业务线最后一段（结业）就是主峰
  const ridge = (stages, P, summit) => {
    const y = (d) => SKY + lerp(P, d / days), base = [L - 8, y(0)], pts = [[0, y(0) + 26], [L - 34, y(0) + 8], [L - 18, y(0)], base];
    const camps = [], terrain = (from, to) => P.map(([f, yy]) => [xf(f), SKY + yy]).filter(([x]) => x > from + 8 && x < to - 8);
    let prev = base[0] + 8;
    pts.push([prev, y(0)]);
    stages.forEach((x, k) => {
      const last = summit && k === stages.length - 1, cx = last ? top[0] : x1(x.d[1]), cy = last ? top[1] : y(x.d[1]);
      const half = last ? 0 : Math.max(2, Math.min(7, (cx - prev) / 4)), right = summit && k === stages.length - 2 ? 2 : half;   // 主峰前一个营地：平台右半截收短，给峰尖让出坡
      pts.push(...terrain(prev, cx - half), [cx - half, cy]);
      if (half) pts.push([cx + right, cy]);
      camps.push({ x, cx, cy, gap: cx - (camps.at(-1)?.cx ?? base[0]) });
      prev = cx + right;
    });
    return { pts, camps, base, prev, terrain };
  };
  const biz = ridge(path.lines[0].stages, FRONT, true), ai = ridge(path.lines[1].stages, BACK, false);
  // 技术线最后一个单元之后还有零星小培训：沿主峰西脊按地形继续爬，最后和业务线在皇冠汇合
  ai.pts.push(...ai.terrain(ai.prev, top[0] - 6), [top[0] - 6, top[1]]);
  // 今天：计划内在当天那一格中间；过了计划结束日钉在右端；还没入职按第 1 天
  const pinned = path.todayD > days;
  const xNow = pinned ? W - PIN : x0(Math.max(1, path.todayD)) + cw / 2;
  return { W, days, cw, x0, x1, biz, ai, xNow, pinned };
}

// 登山者站哪：按期就在今天；超期停在当前营地前，和今天竖线之间的空当就是落后的距离；
// 一条线的单元都走完了，跟着今天继续往皇冠爬（技术线后面还有零星小培训），到皇冠左边停下（不挡皇冠）
export function walkerAt(g, key, s) {
  const line = g[key], camp = s && line.camps.find((c) => c.x.id === s.id);
  const x = !camp ? Math.min(g.xNow, g.biz.camps.at(-1).cx - 18) : s.late ? camp.cx - 22 : Math.min(g.xNow, camp.cx - 22);
  return [x, yOn(line.pts, x)];
}

// 风景：三层山、松树、云、鸟。远山 / 后山 / 前山的轮廓都向右收到地平线
export function scenery(g) {
  const { W } = g, summit = g.biz.camps.at(-1);
  const r = rng(5), far = [[0, 190 + SKY]];
  for (let x = 60; x < W + 80; x += 70 + r() * 70) far.push([x, 128 + SKY + r() * 58]);
  far.push([W, 170 + SKY]);
  // 后山过了皇冠往右：落在前山右坡后面，不另露一道线
  const back = [...g.ai.pts, ...[[6, 30], [30, 84]].map(([dx, dy]) => [summit.cx + dx, summit.cy + dy]), [W, GROUND]].filter((p, k, a) => k === 0 || p[0] > a[k - 1][0]);
  // 主峰右坡：峰尖下来先陡、再一级级缓下，落到画框外（不出断崖）
  const front = [...g.biz.pts, ...[[8, 22], [18, 44], [32, 66], [52, 90], [76, 110]].map(([dx, dy]) => [summit.cx + dx, summit.cy + dy]), [W, summit.cy + 132]].filter((p, k, a) => k === 0 || p[0] > a[k - 1][0]);
  // 山脚松树：疏密不一
  const pr = rng(23), pines = [];
  for (let x = L + 30; x < W - 40; x += 26 + pr() * 46) if (pr() > 0.25) pines.push(x);
  // 天上两朵云、一对鸟，避开太阳
  const clouds = [[W * 0.16, 30], [W * 0.62, 44], [W * 0.42, 24]].filter(([x]) => Math.abs(x + 16 - g.xNow) > 70).slice(0, 2).map(([x, y], k) => [x, y, k ? 2 : 3]);
  const birdX = W * 0.36 + (Math.abs(W * 0.36 - g.xNow) < 70 ? 120 : 0);
  return { far, back, front, pines, clouds, birdX, summit };
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

// 一块框压不压一条线（山脊、路线）：框的横向范围里每 2px 量一次线的高度
const inRange = (pts, x) => x >= pts[0][0] && x <= pts.at(-1)[0];
// hidden(x, y)：这一处的线被前山挡住、看不见（后山脊在前山脊下面的部分），不算
const crosses = (b, pts, hidden) => { for (let x = b.l; x <= b.r; x += 2) if (inRange(pts, x)) { const y = yOn(pts, x); if (y > b.t - 3 && y < b.b + 3 && !hidden?.(x, y)) return true; } return false; };
const span = (pts, l, r, pick) => { let v = pick === Math.max ? -Infinity : Infinity; for (let x = l; x <= r + 2; x += 2) v = pick(v, yOn(pts, Math.min(x, r))); return v; };

// sizes：{ mounts: [{w,h}×2], tags: [{w,h}]（按 m.reviews 顺序）, plates: { biz?, ai? }, end?: {w,h} }；walkers：{ biz: [x,y], ai: [x,y] }
// 返回各块左上角和标牌到登山者的引线（折线点）。先放天上的（太阳旁的「计划已结束」、两张当前标牌和引线），
// 再放山上的（评审小牌、山名）：山上的不压山脊线和路线，不压营地、登山者和引线（用户 10-27）
export function placeLabels(g, m, sizes, walkers) {
  const W = g.W, sc = scenery(g), summit = g.biz.camps.at(-1), behind = (x, y) => y >= yOn(sc.front, x) - 1;
  const lines = [[sc.front], [sc.back, behind]];
  const busy = [boxOf(g.xNow - 24, 0, 48, SUN_Y + 24), boxOf(summit.cx - 15, summit.cy - 21, 30, 24)];   // 太阳、皇冠
  [...g.biz.camps, ...g.ai.camps].forEach((c) => busy.push(boxOf(c.cx - 11, c.cy - 22, 22, 22)));
  [g.biz.base, g.ai.base].forEach(([x, y]) => busy.push(boxOf(x - 8, y - 16, 16, 16)));
  Object.values(walkers).forEach(([x, y]) => busy.push(boxOf(x - 10, y - 22, 20, 22)));
  const inside = (b) => b.l >= 4 && b.r <= W - 4 && b.t >= 4 && b.b <= GROUND - 4;
  // 候选里先挑不压线的，再挑不压东西的
  const pickOnHill = (cands, m) => { const ok = cands.filter((b) => inside(b) && !lines.some(([pts, hidden]) => crosses(b, pts, hidden))); return pickBox(ok.length ? ok : cands, busy, m); };
  // 钉在右端时的「计划已结束」：太阳左边，放不下就挪到太阳下面
  let end = null;
  if (sizes.end) {
    const { w, h } = sizes.end, x = g.xNow;
    end = pickBox([[x - 28 - w, SUN_Y - h / 2], [x - w + 10, SUN_Y + 30], [x - w - 30, SUN_Y + 30]].map(([l, t]) => boxOf(Math.max(4, Math.min(W - w - 4, l)), t, w, h)), busy, 4);
    busy.push(end);
  }
  // 评审小牌：营地下方偏右；放不下（出界、压线或压到别的东西）就挪到左边、再往下一档；结业放在皇冠左上方
  const tags = [], pins = [];
  const placeTag = (s, k) => {
    const c = g[m.isAi(s.id) ? "ai" : "biz"].camps.find((x) => x.x.id === s.id), { w, h } = sizes.tags[k];
    const cands = s.id === m.summitId ? [[c.cx - w - 22, c.cy - 30], [c.cx - w / 2 - 30, c.cy - 46], [c.cx - w / 2, c.cy - 50], [c.cx - w - 14, c.cy + 8], [c.cx - w - 20, c.cy + 30]]
      : [[c.cx - 8, c.cy + 12], [c.cx + 6, c.cy + 12], [c.cx - w + 8, c.cy + 12], [c.cx - 8, c.cy + 36], [c.cx - w + 8, c.cy + 36], [c.cx - w - 12, c.cy - 8], [c.cx + 12, c.cy - h - 18], [c.cx - 8, c.cy + 60], [c.cx - w + 8, c.cy + 60], [c.cx - w / 2, c.cy + 36], [c.cx - w / 2, c.cy + 60], [c.cx - w / 2, c.cy + 90],
        // 起点附近前山脚下放不下：贴着前山脊上方、在两道山脊之间
        ...[c.cx + 14, c.cx - w - 14, c.cx + 44, c.cx + 84].map((l) => [l, span(sc.front, l, l + w, Math.min) - h - 5]),
        ...[14, 44, 84, 124, 164, 204].map((dx) => [c.cx + dx, span(sc.back, c.cx + dx, c.cx + dx + w, Math.max) + 4])];   // 再高一档：贴着后山脊下面，让过前山脊上的帐篷
    const ok = pickOnHill(cands.map(([l, t]) => boxOf(Math.max(4, Math.min(W - w - 4, l)), t, w, h)), 4);
    busy.push(ok);
    tags[k] = ok;
    // 小牌离营地远、正好在营地下方时，画一根竖的短引线连上营地（审核 10-27：小牌对不上营地）
    if (ok.t > c.cy + 14 && ok.l + 12 < c.cx && c.cx < ok.r - 12) { pins.push([c.cx, c.cy + 3, ok.t]); busy.push(boxOf(c.cx - 2, c.cy + 3, 4, ok.t - c.cy - 3)); }
  };
  // 结业那块在皇冠左上方的天上，先放，当前标牌再避开它；其余评审小牌等当前标牌和引线放好再放
  m.reviews.forEach((s, k) => s.id === m.summitId && placeTag(s, k));
  // 两张当前标牌都放在天上，不压三层山（用户 10-26）：先贴着登山者、紧挨山顶那一档，再往两边挪，再往上一档到顶
  const ridge = (l, r) => Math.min(...[sc.far, sc.back, sc.front].map((pts) => span(pts, l, r, Math.min)));
  const plates = {}, leads = [];
  const camps = [...g.biz.camps, ...g.ai.camps];   // 标牌最低一档也让过山脊上的帐篷
  ["biz", "ai"].forEach((key) => {   // 业务线先放：两人叠在起点时，下面那个人的标牌离山近、引线短；上面那个人的标牌在更高一档，引线直着下来
    if (!sizes.plates[key]) return;
    const { w, h } = sizes.plates[key], [x, y] = walkers[key];
    // 再放不下（超期时两张都挤在起点附近）就往右多挪几档
    const xs = [x - w + 26, x - 26, x - w - 40, x + 40, x - w - 110, x + 110, x + 200, x + 290, x + 380, x + 470].map((l) => Math.max(4, Math.min(W - w - 4, l)));
    const cands = [0, 1, 2].flatMap((row) => xs.map((l) => { const low = Math.min(ridge(l, l + w), ...camps.filter((c) => c.cx > l - 12 && c.cx < l + w + 12).map((c) => c.cy - 22)) - h - 8; return boxOf(l, row === 2 ? 6 : low - row * (h + 10), w, h); })).filter((b) => b.t >= 4);
    // 引线：横的一段贴在登山者头顶上方，不在半空沿着别的山脊走、也不从另一个登山者身上穿过（审核 10-27）
    const leadOf = (ok) => {
      const lx = Math.max(ok.l + 10, Math.min(ok.r - 10, x)), [a, b, d] = ok.b <= y - 20 ? [lx, ok.b, y - 21] : [lx, ok.t, y + 2];
      const mid = a === x ? d : d > b ? Math.max((b + d) / 2, d - 9) : Math.min((b + d) / 2, d + 8);
      return [[a, b], [a, mid], [x, mid], [x, d]];
    };
    const segs = (pts) => pts.slice(1).map(([px, py], k) => ({ l: Math.min(px, pts[k][0]) - 2, r: Math.max(px, pts[k][0]) + 2, t: Math.min(py, pts[k][1]) - 2, b: Math.max(py, pts[k][1]) + 2 }));
    // 引线量的时候两头各收 4px（起点贴着标牌、终点贴着自己的登山者），去掉零长的段；引线不能穿过已经摆好的标牌、营地和另一个登山者
    const toward = ([px, py], [qx, qy], n) => [px + Math.sign(qx - px) * n, py + Math.sign(qy - py) * n];
    const clear = (ok) => {
      const pts = leadOf(ok).filter((p, k, a) => !k || p[0] !== a[k - 1][0] || p[1] !== a[k - 1][1]);
      if (pts.length < 2) return true;
      pts[0] = toward(pts[0], pts[1], 4);
      pts[pts.length - 1] = toward(pts.at(-1), pts.at(-2), 4);
      return !segs(pts).some((g) => busy.some((o) => hit(g, o, 0)));
    };
    const pool = cands.length ? cands : xs.map((l) => boxOf(l, 6, w, h)), free = pool.filter(clear);
    const ok = pickBox(free.length ? free : pool, busy, 6);
    busy.push(ok);
    plates[key] = ok;
    const pts = leadOf(ok);
    leads.push({ key, pts });
    busy.push(...segs(pts));
  });
  m.reviews.forEach((s, k) => s.id !== m.summitId && placeTag(s, k));
  // 山名：后山的写在两道山脊之间（后山坡面上），前山的写在前山脊下面；从大本营往右找第一个空处（评审小牌先放，它们要贴着自己的营地）
  const xs = Array.from({ length: Math.floor((W * 0.7 - g.ai.base[0]) / 24) }, (_, k) => g.ai.base[0] + 10 + k * 24);
  const mounts = [["ai", sc.back], ["biz", sc.front]].map(([key, pts], k) => {
    const { w, h } = sizes.mounts[k];
    const cands = xs.flatMap((l) => {
      const low = span(pts, l, l + w, Math.max);
      if (key === "biz") return [boxOf(l, low + 8, w, h)];
      const below = span(sc.front, l, l + w, Math.min);
      return below - low >= h + 14 ? [boxOf(l, low + 7, w, h)] : [boxOf(l, span(pts, l, l + w, Math.min) - h - 6, w, h)];
    });
    const ok = pickOnHill(cands, 4);
    busy.push(ok);
    return ok;
  });
  return { mounts, end, tags, plates, leads, pins };
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
