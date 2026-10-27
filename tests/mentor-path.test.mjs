import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUND, L, R, boxOf, cellsOf, draftOf, geo, model, moveStage, placeLabels, scenery, stepState, stripTicks, visibleClouds, walked, walkerAt, yOn } from "../src/modules/projects/mentor-path.js";
import { onTrack, overdue } from "./helpers/mentor-path-sample.mjs";

// 隔离 5290 上 Chrome 里量的尺寸（Geist 字体，2026-10-26）：地图宽 1440 窗口 1153、1280 窗口 993；当前标牌 214×78、山名框签 77×20、
// 「计划已结束」191×23；评审小牌按没有结论时（写日期，比写分数宽）量
const MOUNT = { w: 77, h: 20 }, PLATE = { w: 214, h: 78 }, END = { w: 191, h: 23 };
const TAG_W = { 初轮筛选: 133, 二轮筛选: 139, "侧边栏 Demo 评审": 185, 首课项目结项: 161, 师资侧评审: 150, 结业答辩: 139 };
const tagSize = (s) => ({ w: TAG_W[s.review], h: 21 });
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

function place(W, { path }) {
  const g = geo(W, path), m = model(path), walkers = { biz: walkerAt(g, "biz", m.cur.biz), ai: walkerAt(g, "ai", m.cur.ai) };
  const sizes = { mounts: [MOUNT, MOUNT], tags: m.reviews.map(tagSize), plates: { ...(m.cur.biz && { biz: PLATE }), ...(m.cur.ai && { ai: PLATE }) }, end: g.pinned ? END : null };
  return { g, m, walkers, p: placeLabels(g, m, sizes, walkers) };
}

test("读法：按期的人停在 P7 / T6，评审 6 个、结业是 P10；超期的人停在 P1 / T1", () => {
  const a = model(onTrack().path), b = model(overdue().path);
  assert.equal(a.cur.biz.id, "P7");
  assert.equal(a.cur.ai.id, "T6");
  assert.equal(a.todayD, 35);
  assert.equal(a.over, 0);
  assert.deepEqual(a.reviews.map((s) => s.id), ["P1", "P5", "P6", "P7", "P9", "P10"]);
  assert.equal(a.summitId, "P10");
  assert.equal(a.pairOf(a.byId.P7).id, "T6");
  assert.equal(a.pairOf(a.byId.T6).id, "P7");
  assert.equal(a.pairOf(a.byId.P8), null);
  assert.equal(b.cur.biz.id, "P1");
  assert.equal(b.cur.biz.late, 113);
  assert.equal(b.todayD, 115);
  assert.equal(b.over, 50);
});

test("进度格与安排：按期的 P7 第 11 / 20 天；超期的 P1 走满、过了日子的安排不打勾", () => {
  const a = model(onTrack().path), b = model(overdue().path);
  assert.equal(walked(a.byId.P7, 35), 11);
  const cells = cellsOf(a.byId.P7, 35);
  assert.equal(cells.length, 20);
  assert.equal(cells.filter((c) => c === "on").length, 10);
  assert.equal(cells.indexOf("now"), 10);
  assert.deepEqual(a.byId.P7.steps.map((x) => stepState(x, a.byId.P7, 35)), ["is-done", "is-now", "is-next", "is-next"]);
  assert.equal(walked(a.byId.P8, 35), 0);
  assert.deepEqual(cellsOf(b.byId.P1, 115), ["on", "now"]);
  assert.deepEqual(b.byId.P1.steps.map((x) => stepState(x, b.byId.P1, 115)), ["", "", ""]);
  assert.equal(stepState(a.byId.P2.steps[0], a.byId.P2, 35), "is-done");
});

test("地图：营地落在每段最后一天的右边线（结业山尖再往右让出一截，见「山顶不挤」），越往右越高，结业是前山最高点", () => {
  for (const W of [1153, 993]) {
    const g = geo(W, onTrack().path), cw = (W - L - R) / 65;
    assert.ok(near(g.cw, cw));
    g.biz.camps.slice(0, -1).forEach((c) => assert.ok(near(c.cx, L + c.x.d[1] * cw)));
    for (const line of [g.biz, g.ai]) line.camps.slice(1).forEach((c, k) => { assert.ok(c.cx > line.camps[k].cx); assert.ok(c.cy < line.camps[k].cy); });
    const summit = g.biz.camps.at(-1);
    assert.equal(summit.x.id, "P10");
    assert.ok(g.biz.pts.every(([, y]) => y >= summit.cy));
    // 坡不往回掉：路线上的点从左到右
    for (const line of [g.biz, g.ai]) line.pts.slice(1).forEach((p, k) => assert.ok(p[0] >= line.pts[k][0]));
  }
});

test("今天：计划内落在当天格子中间；超过计划结束钉在右端，地平线带写 D115", () => {
  const a = onTrack(), b = overdue(), W = 1100;
  const ga = geo(W, a.path), gb = geo(W, b.path);
  assert.equal(ga.pinned, false);
  assert.ok(near(ga.xNow, ga.x0(35) + ga.cw / 2));
  assert.equal(gb.pinned, true);
  assert.equal(gb.xNow, W - 30);
  assert.ok(gb.xNow > gb.biz.camps.at(-1).cx);
  const t = stripTicks(gb, b.path.calendar, b.path.todayD);
  assert.equal(t.now, "D115");
  assert.ok(t.nowW >= 40);
});

test("登山者：按期站在今天；超期停在当前营地前 22px", () => {
  const a = place(1100, onTrack()), b = place(1100, overdue());
  assert.ok(near(a.walkers.biz[0], a.g.xNow));
  assert.ok(near(a.walkers.ai[0], a.g.xNow));
  const p1 = b.g.biz.camps.find((c) => c.x.id === "P1"), t1 = b.g.ai.camps.find((c) => c.x.id === "T1");
  assert.ok(near(b.walkers.biz[0], p1.cx - 22));
  assert.ok(near(b.walkers.ai[0], t1.cx - 22));
});

test("地平线带：每月第一个工作日写月份，D 刻度离月份和今天远一点", () => {
  const { path } = overdue(), g = geo(1100, path), t = stripTicks(g, path.calendar, path.todayD);
  assert.deepEqual(t.months.map((m) => m.label), ["5 月", "6 月", "7 月", "8 月"]);
  assert.deepEqual(t.months.map((m) => path.calendar[m.d - 1]), ["2026-05-12", "2026-06-01", "2026-07-01", "2026-08-03"]);
  t.days.forEach((d) => { assert.equal(d.d % 5, 0); assert.ok(t.months.every((m) => Math.abs(d.d - m.d) > 3)); assert.ok(Math.abs(d.x - g.xNow) > t.nowW / 2 + 14); });
  const a = onTrack(), ga = geo(1100, a.path), ta = stripTicks(ga, a.path.calendar, a.path.todayD);
  assert.ok(!ta.days.some((d) => d.d === 35));
});

test("标牌：按期和超期、1440 / 1280 两种宽度下互不相压，都在图内、地平线以上", () => {
  for (const sample of [onTrack, overdue]) for (const W of [1153, 993]) {
    const { g, m, p } = place(W, sample());
    const boxes = [...p.mounts, ...p.tags, ...Object.values(p.plates), ...(p.end ? [p.end] : [])];
    assert.equal(p.tags.length, m.reviews.length);
    assert.equal(Object.keys(p.plates).length, 2);
    assert.equal(Boolean(p.end), g.pinned);
    boxes.forEach((b, i) => {
      assert.ok(b.l >= 0 && b.r <= W && b.t >= 0 && b.b <= GROUND, `${sample.name} ${W}：第 ${i} 块出界 ${JSON.stringify(b)}`);
      boxes.slice(i + 1).forEach((o, j) => assert.ok(!hit(b, o), `${sample.name} ${W}：第 ${i} 块和第 ${i + 1 + j} 块相压`));
    });
    // 引线从标牌边出发、落到登山者头顶或脚下
    p.leads.forEach((l) => { const [x] = walkerAt(g, l.key, m.cur[l.key]); assert.ok(near(l.pts.at(-1)[0], x)); });
  }
});

test("当前标牌在天上：按期和超期、1440 / 1280 两种宽度下都不压远山、后山、前山的轮廓（用户 10-26）", () => {
  for (const sample of [onTrack, overdue]) for (const W of [1153, 993]) {
    const { g, p } = place(W, sample()), sc = scenery(g);
    Object.entries(p.plates).forEach(([key, b]) => {
      for (let x = b.l; x <= b.r; x += 2) [sc.far, sc.back, sc.front].forEach((pts) => assert.ok(b.b < yOn(pts, x), `${sample.name} ${W} ${key}：x=${x} 压到山 ${JSON.stringify(b)}`));
    });
  }
});

// 山的细节（用户 10-27「蓝色的技术线都没有通到山顶，半路没了。你注意细节」）
const SAMPLES = [onTrack, overdue], WIDTHS = [1153, 993];
const inRange = (pts, x) => x >= pts[0][0] && x <= pts.at(-1)[0];
// 后山脊在前山脊下面的部分被前山挡住，看不见，不算
const crosses = (b, pts, front) => { for (let x = b.l; x <= b.r; x += 2) if (inRange(pts, x)) { const y = yOn(pts, x); if (y > b.t - 2 && y < b.b + 2 && !(front && y >= yOn(front, x) - 1)) return true; } return false; };
const campBox = (c) => boxOf(c.cx - 11, c.cy - 22, 22, 22);

test("后山：技术线每个营地都比同一处的前山路高出 30px 以上，两条线的帐篷不叠", () => {
  for (const sample of SAMPLES) for (const W of WIDTHS) {
    const g = geo(W, sample().path);
    g.ai.camps.forEach((c) => assert.ok(yOn(g.biz.pts, c.cx) - c.cy >= 30, `${sample.name} ${W} ${c.x.id}：只高出 ${yOn(g.biz.pts, c.cx) - c.cy}`));
  }
});

test("技术线一路爬到皇冠：最后一个技术营地之后只过一道浅鞍部（≤ 14px），过了鞍部一路往上，在皇冠脚下和业务线汇合；皇冠以前后山路处处高于前山路（用户 10-27，同 V7 稿）", () => {
  for (const sample of SAMPLES) for (const W of WIDTHS) {
    const g = geo(W, sample().path), top = g.biz.camps.at(-1), end = g.ai.camps.at(-1), pts = g.ai.pts, last = pts.at(-1);
    assert.ok(Math.abs(last[0] - top.cx) <= 16 && last[1] <= top.cy + 6, `${sample.name} ${W}：后山路停在 ${last}，没到皇冠 ${[top.cx, top.cy]}`);
    const after = pts.filter(([x]) => x >= end.cx), low = after.reduce((k, p, i) => (p[1] > after[k][1] ? i : k), 0);
    assert.ok(after[low][1] - end.cy <= 14, `${sample.name} ${W}：T6 之后往下掉了 ${after[low][1] - end.cy}`);
    after.slice(low + 1).forEach(([x, y], k) => assert.ok(y <= after[low + k][1] + 0.01, `${sample.name} ${W}：过了鞍部 ${after[low + k]} → ${[x, y]} 又往下掉`));
    for (let x = L; x < top.cx - 14; x += 4) assert.ok(yOn(pts, x) < yOn(g.biz.pts, x), `${sample.name} ${W}：x=${x} 后山路不高于前山路`);
  }
});

test("山顶不挤：皇冠对准结业那天；前一个营地在主峰左肩，靠高低和皇冠拉开（帐篷顶比皇冠底低 ≥ 16px）；蓝线从帐篷上方 ≥ 8px 过去；两条线都爬到皇冠脚下（用户 10-27，审核 10-27：不挪日期）", () => {
  for (const sample of SAMPLES) for (const W of WIDTHS) {
    const g = geo(W, sample().path), top = g.biz.camps.at(-1), prev = g.biz.camps.at(-2);
    assert.ok(near(top.cx, g.x1(top.x.d[1])), `${sample.name} ${W}：皇冠没对准 D${top.x.d[1]}`);
    assert.ok(prev.cy - 22 - (top.cy + 3) >= 16, `${sample.name} ${W}：${prev.x.id} 帐篷离皇冠只低 ${prev.cy - 22 - (top.cy + 3)}`);
    assert.ok(prev.cy - 22 - yOn(g.ai.pts, prev.cx) >= 8, `${sample.name} ${W}：蓝线压在 ${prev.x.id} 帐篷上`);
    [g.biz.pts.at(-1), g.ai.pts.at(-1)].forEach(([x, y]) => assert.ok(Math.abs(x - top.cx) <= 16 && y <= top.cy + 8, `${sample.name} ${W}：路线停在 ${[x, y]}`));
  }
});

test("评审小牌和山名框：不压山脊线和路线，不压营地；引线不穿过山名框和评审小牌", () => {
  for (const sample of SAMPLES) for (const W of WIDTHS) {
    const { g, p } = place(W, sample()), sc = scenery(g), lines = [[sc.front], [sc.back, sc.front]];
    const camps = [...g.biz.camps, ...g.ai.camps].map(campBox);
    [...p.mounts, ...p.tags].forEach((b, i) => {
      lines.forEach(([pts, front], j) => assert.ok(!crosses(b, pts, front), `${sample.name} ${W}：第 ${i} 块压到第 ${j} 条线 ${JSON.stringify(b)}`));
      camps.forEach((c) => assert.ok(!hit(b, c), `${sample.name} ${W}：第 ${i} 块压到营地 ${JSON.stringify(c)}`));
    });
    p.leads.forEach((l) => l.pts.slice(1).forEach(([x, y], k) => {
      const [px, py] = l.pts[k], seg = { l: Math.min(x, px) - 1, r: Math.max(x, px) + 1, t: Math.min(y, py) - 1, b: Math.max(y, py) + 1 };
      [...p.mounts, ...p.tags].forEach((b) => assert.ok(!hit(seg, b), `${sample.name} ${W} ${l.key}：引线穿过 ${JSON.stringify(b)}`));
    }));
  }
});

test("当前标牌的引线：不穿过另一张标牌、营地和另一个登山者；评审小牌贴着自己的营地，离得远的有竖引线连上营地（审核 10-27）", () => {
  for (const sample of SAMPLES) for (const W of WIDTHS) {
    const { g, m, walkers, p } = place(W, sample()), camps = [...g.biz.camps, ...g.ai.camps];
    p.leads.forEach((l) => {
      const other = l.key === "biz" ? "ai" : "biz", [ox, oy] = walkers[other];
      const blocks = [...(p.plates[other] ? [p.plates[other]] : []), boxOf(ox - 10, oy - 22, 20, 22), ...camps.map(campBox)];
      l.pts.slice(1).forEach(([x, y], k) => {
        const [px, py] = l.pts[k], seg = { l: Math.min(x, px), r: Math.max(x, px), t: Math.min(y, py) + (k === 0 ? 4 : 0), b: Math.max(y, py) - (k === l.pts.length - 2 ? 4 : 0) };
        if (seg.t <= seg.b) blocks.forEach((b) => assert.ok(!hit(seg, b), `${sample.name} ${W} ${l.key}：引线穿过 ${JSON.stringify(b)}`));
      });
    });
    m.reviews.forEach((s, k) => {
      if (s.id === m.summitId) return;
      const c = camps.find((x) => x.x.id === s.id), b = p.tags[k];
      const close = b.t <= c.cy + 14 && b.l <= c.cx + 14 && b.r >= c.cx - 14, pin = p.pins.find(([x, , y1]) => near(x, c.cx) && near(y1, b.t));
      assert.ok(close || (pin && b.l < c.cx && c.cx < b.r), `${sample.name} ${W} ${s.id}：小牌 ${JSON.stringify(b)} 离营地 ${[c.cx, c.cy]} 远，又没有引线`);
    });
  }
});

test("山尖右侧缓下，没有断崖：皇冠往右每段坡度不超过 3", () => {
  for (const sample of SAMPLES) for (const W of WIDTHS) {
    const g = geo(W, sample().path), top = g.biz.camps.at(-1), tail = scenery(g).front.filter(([x]) => x >= top.cx);
    tail.slice(1).forEach(([x, y], k) => assert.ok(Math.abs(y - tail[k][1]) / (x - tail[k][0]) <= 3, `${sample.name} ${W}：${tail[k]} → ${[x, y]} 太陡`));
  }
});

test("云：被标牌压住的不画（标牌 10-26 起贴着山顶放，云在更高处，这里另放一块压住第一朵）", () => {
  const { g, p } = place(1153, overdue()), clouds = scenery(g).clouds, [cx, cy] = clouds[0];
  const boxes = [...Object.values(p.plates), ...p.tags, ...(p.end ? [p.end] : []), boxOf(cx + 10, cy + 2, 60, 20)];
  const shown = visibleClouds(clouds, boxes);
  assert.ok(!shown.includes(clouds[0]));
  shown.forEach(([x, y, cell]) => boxes.forEach((b) => assert.ok(!(x < b.r && x + 16 * cell > b.l && y < b.b && y + 5 * cell > b.t))));
  const a = place(1153, onTrack());
  assert.ok(visibleClouds(scenery(a.g).clouds, [...Object.values(a.p.plates), ...a.p.tags]).length >= 1);   // 按期时至少留一朵（10-27 起结业小牌先放，可能压掉一朵）
});

test("调整安排：止日推后 3 天时，后面开始的段（两条线）一起顺延，同期还没结束的不动；不顺延只改这一段，安排日期收进新起止", () => {
  const draft = draftOf(onTrack().path), at = (d, id) => d.lines.flatMap((l) => l.stages).find((x) => x.id === id);
  assert.deepEqual(Object.keys(at(draft, "P7")).sort(), ["d", "goal", "id", "out", "review", "pass", "short", "steps", "title"].sort());
  assert.equal(at(draft, "P7").record, undefined);
  const a = moveStage(draft, "P6", 1, 27, true);
  assert.deepEqual(at(a, "P6").d, [15, 27]);
  assert.deepEqual(at(a, "P6").steps.at(-1).d, [24, 24]);
  assert.deepEqual(at(a, "P7").d, [28, 47]);
  assert.deepEqual(at(a, "P7").steps[0].d, [28, 33]);
  assert.deepEqual(at(a, "T6").d, [28, 47]);
  assert.deepEqual(at(a, "T6").steps.map((x) => x.d), [[38, 38], [47, 47]]);
  assert.deepEqual(at(a, "P10").d, [68, 68]);
  assert.deepEqual(at(a, "T5").d, [15, 24]);
  assert.deepEqual(at(a, "P5").d, [12, 14]);
  const b = moveStage(draft, "P7", 1, 40, false);
  assert.deepEqual(at(b, "P7").d, [25, 40]);
  assert.deepEqual(at(b, "P7").steps.map((x) => x.d), [[25, 30], [31, 35], [36, 40], [40, 40]]);
  assert.deepEqual(at(b, "P8").d, [45, 54]);
  assert.deepEqual(at(moveStage(draft, "P8", 0, 46, true), "P9").d, [55, 64], "改起日不带动后面");
  assert.deepEqual(at(draft, "P7").d, [25, 44], "不改原草稿");
});
