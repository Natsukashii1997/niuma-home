import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUND, L, R, boxOf, cellsOf, draftOf, geo, model, moveStage, mountAt, placeLabels, scenery, stepState, stripTicks, visibleClouds, walked, walkerAt, yOn } from "../src/modules/projects/mentor-path.js";
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

test("地图：营地落在每段最后一天的右边线，越往右越高，结业是前山最高点", () => {
  for (const W of [1153, 993]) {
    const g = geo(W, onTrack().path), cw = (W - L - R) / 65;
    assert.ok(near(g.cw, cw));
    g.biz.camps.forEach((c) => assert.ok(near(c.cx, L + c.x.d[1] * cw)));
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
    const mounts = mountAt(g).map(([l, t]) => boxOf(l, t, MOUNT.w, MOUNT.h));
    const boxes = [...mounts, ...p.tags, ...Object.values(p.plates), ...(p.end ? [p.end] : [])];
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

test("云：被标牌压住的不画（标牌 10-26 起贴着山顶放，云在更高处，这里另放一块压住第一朵）", () => {
  const { g, p } = place(1153, overdue()), clouds = scenery(g).clouds, [cx, cy] = clouds[0];
  const boxes = [...Object.values(p.plates), ...p.tags, ...(p.end ? [p.end] : []), boxOf(cx + 10, cy + 2, 60, 20)];
  const shown = visibleClouds(clouds, boxes);
  assert.ok(!shown.includes(clouds[0]));
  shown.forEach(([x, y, cell]) => boxes.forEach((b) => assert.ok(!(x < b.r && x + 16 * cell > b.l && y < b.b && y + 5 * cell > b.t))));
  const a = place(1153, onTrack());
  assert.equal(visibleClouds(scenery(a.g).clouds, [...Object.values(a.p.plates), ...a.p.tags]).length, 2);
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
