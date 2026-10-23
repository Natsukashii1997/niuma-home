import { test } from "node:test";
import assert from "node:assert/strict";
import { busyBoxes, fixedLabels, isLate, labelBoxes, layout, pendingReviews, pines, placePlates, placeRopeLabels, plateStyle, seasonClock, shortUnlock, slopeOf, unlockText, yAt } from "../src/modules/projects/mentor-path.js";
import { MENTOR_PATH_SAMPLE } from "./helpers/mentor-path-sample.mjs";

const { today } = MENTOR_PATH_SAMPLE;
const path = MENTOR_PATH_SAMPLE.trainees[0].path, season = path.season;
const clock = seasonClock(season, today);

// 定稿 v7.html 在 Chrome 里实测的尺寸（Geist 字体）：标牌完整 184×60、小牌按文字宽；正在爬的两块边框 2px
const PLATES = {
  B1: [122, 25], B2: [122, 25], B3: [98, 25], B4: [85, 27, 2], B5: [98, 25], B6: [98, 25], B7: [98, 25],
  A1: [122, 25], A2: [110, 25], A3: [85, 27, 2], A4: [86, 25], A5: [110, 25], A6: [88, 25],
};
const plateSizes = Object.fromEntries(Object.entries(PLATES).map(([id, [w, h, bw = 1]]) => [id, { full: { w: 184, h: 60, bw }, mini: { w, h, bw } }]));
const LABELS = { ridge: { biz: { w: 86, h: 25 }, ai: { w: 77, h: 25 } }, today: { w: 183, h: 31 }, summit: { w: 94, h: 56 }, week: { w: 440, h: 230 }, late: { ai: { w: 65, h: 19 } } };
const ROPES = { "B3>A3": { w: 137, h: 19 }, "B5>A6": { w: 148, h: 19 }, "A4>B5": { w: 159, h: 19 } };

function place(W, H) {
  const geo = layout({ W, H }, path, clock);
  const fl = fixedLabels(geo, LABELS), labels = labelBoxes(fl);
  const plates = placePlates(geo, plateSizes, labels);
  const ropes = placeRopeLabels(geo, ROPES, busyBoxes(geo, plates, labels));
  return { geo, fl, labels, plates, ropes };
}
const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;

test("季度时钟：09-01 入职，10-23 落在第 8 周；周起止与月份分界", () => {
  assert.ok(near(clock.nowW, 52 / 7, 1e-9));
  assert.equal(clock.week, 8);
  assert.equal(clock.weekStart(8), "10-20");
  assert.equal(clock.weekEnd(8), "10-26");
  assert.equal(clock.weekEnd(24), "02-15");
  assert.deepEqual(clock.months.map((m) => m.name), ["9 月", "10 月", "11 月", "12 月", "1 月", "2 月"]);
  assert.equal(clock.months[0].w, 0);
  assert.ok(near(clock.months[1].w, 30 / 7, 1e-9));
  // 宿主时区不影响：日期按 UTC 算
  assert.equal(seasonClock({ start: "2026-12-28", weeks: 4 }, "2027-01-04").weekStart(2), "01-04");
});

test("关卡文字：超期、解锁条件、待评分", () => {
  const a3 = path.lines[1].nodes[2], b4 = path.lines[0].nodes[3];
  assert.equal(isLate(a3, clock.week), true);
  assert.equal(isLate(b4, clock.week), false);
  assert.equal(unlockText(path, "B5", season.pass), "B4 达到 70 分，拿到 A4 的进度自动化表");
  assert.equal(shortUnlock(path, "A6"), "需 A5 达标 + B5 产出");
  assert.equal(pendingReviews(path), 2);
});

test("layout：营地立在山脊的平台上，越往右越高；登山者在线上；超期的人停在营地前 34px", () => {
  for (const H of [814, 710]) {
    const { geo } = place(1232, H);
    for (const k of ["biz", "ai"]) {
      const cs = geo.camps[k];
      cs.forEach((c) => {
        for (const dx of [-14, 0, 14]) assert.ok(near(yAt(geo.ridge[k], c.x + dx), c.y, 1e-9), `${c.id} 平台 ${dx}`);
      });
      cs.slice(1).forEach((c, i) => assert.ok(c.y < cs[i].y && c.x > cs[i].x, `${c.id} 比上一营地高`));
      assert.ok(near(yAt(geo.ridge[k], geo.me[k].x), geo.me[k].y, 1e-9));
    }
    const a3 = geo.camps.ai.find((c) => c.id === "A3");
    assert.equal(geo.me.ai.late, true);
    assert.equal(geo.me.ai.x, a3.x - 34);
    assert.equal(geo.me.biz.late, false);
    assert.equal(geo.me.biz.x, Math.min(geo.camps.biz[3].x - 34, geo.xNow));
    // 已爬过的实线终点 = 登山者
    assert.equal(geo.trail.ai.done.at(-1)[0], geo.me.ai.x);
    assert.equal(geo.trail.ai.todo.at(-1)[0], geo.XE);
  }
});

test("layout：与定稿一致（1232×814 登山者坐标、绳桥弧线）", () => {
  const { geo } = place(1232, 814);
  assert.ok(near(geo.me.biz.x, 421.95238095238096, 1e-9) && near(geo.me.biz.y, 510.214258810869, 1e-9));
  assert.ok(near(geo.me.ai.x, 373.4166666666667, 1e-9) && near(geo.me.ai.y, 384.96271186440674, 1e-9));
  assert.deepEqual(geo.ropes.map((r) => r.d), [
    "M389.5 543.3333333333334Q390.45833333333337 494.0666666666667 391.4166666666667 372.8",
    "M660.8333333333334 418.66666666666663Q814.4166666666667 390.3333333333333 968 194",
    "M559.0833333333333 313.2Q593.9583333333333 401.9333333333333 628.8333333333334 418.66666666666663",
  ]);
});

test("绳桥：弧线不穿过别的营地", () => {
  for (const H of [814, 710]) {
    const { geo } = place(1232, H);
    const all = [...geo.camps.biz, ...geo.camps.ai];
    geo.ropes.forEach((r) => {
      all.filter((c) => c.id !== r.from && c.id !== r.to).forEach((c) => {
        for (let i = 0; i <= 40; i++) {
          const [x, y] = r.at(i / 40);
          assert.ok(!(x > c.x - 18 && x < c.x + 18 && y > c.y - 38 && y < c.y + 4), `${r.from}→${r.to} 穿过 ${c.id}（${H}）`);
        }
      });
    });
  }
});

// 定稿在 1232 宽（工作台 1440×900 / 1280×800 的地图宽）下摆出来的标牌位置：[左, 上, 是否小牌]
const DRAFT = {
  814: { B1: [228, 700, 0], B2: [296, 630, 0], B3: [364, 559, 0], B4: [465, 489, 0], B5: [635, 427, 1], B6: [771, 364, 0], B7: [974, 302, 0], A1: [126, 418, 1], A2: [206, 358, 1], A3: [233, 264, 0], A4: [369, 196, 0], A5: [667, 145, 0], A6: [810, 77, 0] },
  710: { B1: [64, 455, 0], B2: [296, 575, 0], B3: [364, 506, 0], B4: [465, 437, 0], B5: [527, 275, 0], B6: [771, 347, 0], B7: [974, 302, 0], A1: [126, 314, 1], A2: [206, 275, 1], A3: [233, 201, 0], A4: [465, 163, 0], A5: [667, 124, 0], A6: [858, 77, 0] },
};

test("placePlates：与定稿摆放一致（814 高 A1、A2、B5 小牌；710 高 A1、A2 小牌）", () => {
  for (const H of [814, 710]) {
    const { plates } = place(1232, H);
    plates.forEach((p) => {
      const [l, t, mini] = DRAFT[H][p.id];
      assert.ok(near(p.at.l, l) && near(p.at.t, t), `${p.id}@${H}: ${p.at.l},${p.at.t} ≠ ${l},${t}`);
      assert.equal(p.at.mini, !!mini, `${p.id}@${H} 小牌`);
    });
  }
});

test("placePlates：标牌、引线、固定文字两两不相交，不出框；正在爬的两关不收小牌", () => {
  for (const H of [814, 710, 680]) {
    const { geo, labels, plates } = place(1232, H);
    plates.forEach((p, i) => {
      const r = p.at.r;
      assert.ok(r.l >= 8 && r.r <= geo.W - 8 && r.t >= 70 && r.b <= geo.yg - 8, `${p.id}@${H} 出框`);
      labels.forEach((b) => assert.ok(!hit(r, b), `${p.id}@${H} 压到固定文字`));
      plates.slice(i + 1).forEach((q) => {
        assert.ok(!hit(r, q.at.r), `${p.id} × ${q.id}（${H}）`);
        assert.ok(!hit(p.at.lead, q.at.r) && !hit(r, q.at.lead), `${p.id} 引线 × ${q.id}（${H}）`);
      });
      if (p.c.n.status === "doing") assert.equal(p.at.mini, false, `${p.id} 正在爬`);
    });
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) assert.ok(!hit(labels[i], labels[j]), `固定文字 ${i} × ${j}（${H}）`);
    // 「本周攀登」卡底边离地平线 14px；超期小牌在登山者脚下
    assert.equal(labels.at(-1).b, geo.yg - 14);
  }
});

test("placePlates：小牌展开不出右边界，往上挂的底边不动；引线连到营地", () => {
  const { geo, plates } = place(1232, 814);
  plates.forEach((p) => {
    const a = p.at, k = p.peek;
    assert.ok(k.l + k.w <= geo.W - 8);
    if (a.side === "up") assert.equal(k.t + k.h, a.t + a.h); else assert.equal(k.t, a.t);
    const s = plateStyle(p, a);
    if (a.side === "down") assert.ok(near(s.top - s.lh, p.c.y + 3, 1e-9)); else assert.ok(near(s.top + a.h + s.lh, p.c.y - 37, 1e-9));
    assert.ok(near(s.left + s.lx + p.full.bw + 1, p.c.x, 1e-9) || near(s.left + s.lx + (a.mini ? p.mini : p.full).bw + 1, p.c.x, 1e-9));
  });
});

// 已知：1232×814 下 B3→A3 那条几乎竖直、夹在 B3 标牌、登山者和 A1/A2 小牌之间，沿线找不到空位，说明会压到 A1 旗子右边约 14px（只在悬停时出现）
test("绳桥说明与松树：与定稿一致，说明不压标牌和文字", () => {
  const expect = { 814: { "B3>A3": [241, 466.5], "B5>A6": [786, 286], "A4>B5": [503.5, 341] }, 710: { "B3>A3": [241, 400.5], "B5>A6": [786, 274], "A4>B5": [433, 351.5] } };
  const pine = { 814: [18, 52, 104, 179, 414, 446, 496, 531, 580, 620, 655, 698, 737], 710: [18, 52, 104, 179, 221, 258, 291, 338, 376, 414, 446, 496, 531, 580, 620, 655, 698, 737] };
  for (const H of [814, 710]) {
    const { geo, fl, labels, plates, ropes } = place(1232, H);
    Object.entries(expect[H]).forEach(([k, [l, t]]) => assert.ok(near(ropes[k].l, l, 0.5) && near(ropes[k].t, t, 0.5), `${k}@${H}`));
    Object.entries(ropes).forEach(([k, r]) => [...labels, ...plates.map((p) => p.at.r)].forEach((b) => assert.ok(!hit(r, b), `${k}@${H}`)));
    const icons = busyBoxes(geo, plates, labels).filter((b) => !labels.includes(b) && !plates.some((p) => p.at.r === b));
    Object.entries(ropes).forEach(([k, r]) => icons.forEach((b) => assert.ok(!hit(r, b) || (H === 814 && k === "B3>A3" && b.id === "A1"), `${k}@${H} 压到 ${b.id ?? "图标"}`)));
    assert.deepEqual(pines(geo, plates, fl.week.l), pine[H]);
    assert.deepEqual([fl.late.ai.l, fl.late.ai.t].map(Math.round), H === 814 ? [363, 400] : [363, 329]);
  }
});

test("高亮：营地 = 上一营地到这一营地的坡，第一关从大本营起；山顶 = 两条线最后一段", () => {
  const { geo } = place(1232, 814);
  const [b4] = slopeOf(geo, "B4");
  assert.equal(b4[0][0], geo.camps.biz[2].x);
  assert.equal(b4.at(-1)[0], geo.camps.biz[3].x);
  assert.equal(slopeOf(geo, "A1")[0][0][0], geo.base.ai[0]);
  const top = slopeOf(geo, "summit");
  assert.equal(top.length, 2);
  top.forEach((s) => assert.equal(s.at(-1)[0], geo.XE));
  assert.deepEqual(slopeOf(geo, "base"), []);
});

test("layout：一条线没有在途的关时没有登山者，实线走到最后一个通关营地", () => {
  const done = { ...path, lines: path.lines.map((l) => (l.key === "ai" ? { ...l, nodes: l.nodes.map((n, i) => ({ ...n, status: i < 3 ? "done" : "locked", score: i < 3 ? 80 : undefined })) } : l)) };
  const geo = layout({ W: 1232, H: 814 }, done, clock);
  assert.equal(geo.me.ai, null);
  assert.equal(geo.trail.ai.done.at(-1)[0], geo.camps.ai[2].x);
  const plates = placePlates(geo, plateSizes, labelBoxes(fixedLabels(geo, { ...LABELS, late: {} })));
  assert.equal(plates.length, 13);
});
