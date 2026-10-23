import { test } from "node:test";
import assert from "node:assert/strict";
import { SUN, WEEK_W, busyBoxes, fixedLabels, isLate, labelBoxes, layout, mapWidth, pendingReviews, pines, placePlates, placeRopeLabels, plateStyle, seasonClock, shortUnlock, slopeOf, unlockText, yAt } from "../src/modules/projects/mentor-path.js";
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

// 1232 宽（V7 原来的地图宽）下的规则检查，留作窄图的算法回归；页面 10-23 起按周定宽，定稿坐标见文件末尾
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

// 按周定宽（用户 10-23：横向拉长到约 3 倍，随后压到 3/4）：每周 WEEK_W，24 周地图 2938 宽；「本周攀登」卡固定在可视区，不在图上。
// 标牌按页面实测：完整 200×76（多一行待办 / 产出），小牌尺寸同上
const WIDE = Object.fromEntries(Object.entries(PLATES).map(([id, [w, h, bw = 1]]) => [id, { full: { w: 200, h: 76, bw }, mini: { w, h, bw } }]));
function placeWide(H) {
  const geo = layout({ W: mapWidth(clock.weeks), H }, path, clock);
  const fl = fixedLabels(geo, { ...LABELS, week: undefined }), labels = labelBoxes(fl);
  const plates = placePlates(geo, WIDE, labels);
  return { geo, fl, labels, plates, ropes: placeRopeLabels(geo, ROPES, busyBoxes(geo, plates, labels)) };
}

test("按周定宽：24 周 2938 宽，营地横坐标 = 170 + 结束周 × WEEK_W；云每 4 周一朵、让开太阳和「今天」；周次带起始日；本周攀登卡不在图上", () => {
  assert.equal(WEEK_W, 105);
  assert.equal(mapWidth(24), 2938);
  const { geo, fl, labels } = placeWide(810);
  assert.equal(geo.W, 2938);
  [...geo.camps.biz, ...geo.camps.ai].forEach((c) => assert.equal(c.x, 170 + c.n.week[1] * WEEK_W, c.id));
  assert.equal(geo.summit[0], 2938 - 156);
  // 6 朵（296 / 863 / 1136 / 1703 / 1976 / 2543）里第 2、3 朵落在太阳（950）左边光晕外 70px 到「今天」那行字右边之间，不画
  assert.deepEqual(geo.decor.clouds.map(([x]) => Math.round(x)), [296, 1703, 1976, 2543]);
  assert.equal(fl.today.l, geo.sun[0] + SUN.glow + 8);
  assert.equal(geo.weeks[7].from, "10-20");
  assert.equal(fl.week, null);
  assert.equal(labels.length, 5); // 两块山名、今天、山顶、A3 超期小牌
});

test("按周定宽：标牌全部完整摆开、两两不相交、不出框；绳桥说明不压标牌和文字，绳桥不穿过别的营地", () => {
  for (const H of [810, 699, 640]) {
    const { geo, labels, plates, ropes } = placeWide(H);
    plates.forEach((p, i) => {
      const r = p.at.r;
      assert.equal(p.at.mini, false, `${p.id}@${H} 收成了小牌`);
      assert.ok(r.l >= 8 && r.r <= geo.W - 8 && r.t >= 64 && r.b <= geo.yg - 8, `${p.id}@${H} 出框（上沿不进 64px 高的页头）`);
      labels.forEach((b) => assert.ok(!hit(r, b), `${p.id}@${H} 压到固定文字`));
      plates.slice(i + 1).forEach((q) => {
        assert.ok(!hit(r, q.at.r), `${p.id} × ${q.id}（${H}）`);
        assert.ok(!hit(p.at.lead, q.at.r) && !hit(r, q.at.lead), `${p.id} 引线 × ${q.id}（${H}）`);
      });
    });
    Object.entries(ropes).forEach(([k, r]) => [...labels, ...plates.map((p) => p.at.r)].forEach((b) => assert.ok(!hit(r, b), `${k}@${H}`)));
    const all = [...geo.camps.biz, ...geo.camps.ai];
    geo.ropes.forEach((r) => all.filter((c) => c.id !== r.from && c.id !== r.to).forEach((c) => {
      for (let i = 0; i <= 40; i++) {
        const [x, y] = r.at(i / 40);
        assert.ok(!(x > c.x - 18 && x < c.x + 18 && y > c.y - 38 && y < c.y + 4), `${r.from}→${r.to} 穿过 ${c.id}（${H}）`);
      }
    }));
  }
});

test("按周定宽：营地按周数抬升（首尾两关高度不变、每周爬升相同），两条路从大本营到雪线一路不往回掉", () => {
  for (const H of [810, 699, 640]) {
    const { geo } = placeWide(H);
    const ends = { biz: [geo.yg - 104, 290], ai: [geo.yg - 280, 190] };
    for (const k of ["biz", "ai"]) {
      const cs = geo.camps[k], c0 = cs[0], c1 = cs.at(-1), per = (c0.y - c1.y) / (c1.n.week[1] - c0.n.week[1]);
      assert.deepEqual([c0.y, c1.y], ends[k]);
      cs.forEach((c) => assert.ok(near(c.y, c0.y - (c.n.week[1] - c0.n.week[1]) * per, 1e-9), `${c.id}@${H}`));
      for (let x = geo.base[k][0] + 1; x <= geo.XE; x++) assert.ok(yAt(geo.ridge[k], x) <= yAt(geo.ridge[k], x - 1) + 1e-9, `${k}@${H} 在 ${x} 往回掉`);
    }
  }
});

// 本版定稿（用户 10-23 确认「按这版收尾」）在 2938 宽下的坐标：登山者、绳桥弧线、标牌 [左, 上]（全部完整牌）、绳桥说明、A3 超期小牌
const FINAL = {
  810: {
    me: { biz: [950, 565.5106432427112], ai: [871, 420.37053769612635] },
    ropes: ["M816 596.7272727272727Q852.5 544.9545454545455 889 421.1818181818182", "M1656 462.1818181818182Q2165 412.0909090909091 2674 194", "M1341 367.72727272727275Q1482.5 450.9545454545455 1624 462.1818181818182"],
    plates: { B1: [370, 672], B2: [580, 638.36], B3: [790, 604.73], B4: [1105, 554.27], B5: [1630, 470.18], B6: [2050, 402.91], B7: [2680, 302], A1: [190, 363], A2: [400, 336.27], A3: [715, 296.18], A4: [1135, 242.73], A5: [1660, 175.91], A6: [2500, 69] },
    ropeLabels: { "B3>A3": [784.5, 533], "B5>A6": [2091, 376], "A4>B5": [1403.5, 439] }, late: [861, 429],
  },
  699: {
    me: { biz: [950, 482.3181060377406], ai: [871, 333.3939061169766] },
    ropes: ["M816 505.9090909090909Q852.5 456.6590909090909 889 335.40909090909093", "M1656 411.72727272727275Q2165 386.8636363636364 2674 194", "M1341 302.1363636363636Q1482.5 392.9318181818182 1624 411.72727272727275"],
    plates: { B1: [370, 561], B2: [580, 537.45], B3: [790, 513.91], B4: [1105, 478.59], B5: [1630, 419.73], B6: [2050, 372.64], B7: [2680, 302], A1: [190, 252], A2: [400, 235.36], A3: [715, 210.41], A4: [1135, 177.14], A5: [1660, 135.55], A6: [2500, 69] },
    ropeLabels: { "B3>A3": [784.5, 414], "B5>A6": [2091, 320], "A4>B5": [1403.5, 381] }, late: [861, 341],
  },
};

test("按周定宽：与本版定稿一致（810 / 699 高的登山者、绳桥、标牌、绳桥说明、超期小牌）", () => {
  for (const H of [810, 699]) {
    const { geo, fl, plates, ropes } = placeWide(H), f = FINAL[H];
    for (const k of ["biz", "ai"]) assert.ok(near(geo.me[k].x, f.me[k][0], 1e-9) && near(geo.me[k].y, f.me[k][1], 1e-9), `${k} 登山者@${H}`);
    assert.deepEqual(geo.ropes.map((r) => r.d), f.ropes);
    plates.forEach((p) => {
      const [l, t] = f.plates[p.id];
      assert.ok(near(p.at.l, l, 0.01) && near(p.at.t, t, 0.01) && !p.at.mini, `${p.id}@${H}: ${p.at.l},${p.at.t} ≠ ${l},${t}`);
    });
    Object.entries(f.ropeLabels).forEach(([k, [l, t]]) => assert.ok(near(ropes[k].l, l, 0.5) && near(ropes[k].t, t, 0.5), `${k}@${H}`));
    assert.deepEqual([fl.late.ai.l, fl.late.ai.t].map(Math.round), f.late);
  }
});

test("按周定宽：绳桥说明不压营地、大本营和登山者；松树不种在压到地平线附近的标牌下、不挨着大本营", () => {
  for (const H of [810, 699, 640]) {
    const { geo, labels, plates, ropes } = placeWide(H);
    const icons = busyBoxes(geo, plates, labels).filter((b) => !labels.includes(b) && !plates.some((p) => p.at.r === b));
    Object.entries(ropes).forEach(([k, r]) => icons.forEach((b) => assert.ok(!hit(r, b), `${k}@${H} 压到 ${b.id ?? "图标"}`)));
    const xs = pines(geo, plates, geo.W);
    assert.ok(xs.length > 40, `松树太少（${H}）`);
    xs.forEach((x) => {
      assert.ok(Math.abs(x - geo.base.biz[0]) >= 30, `${x} 挨着大本营（${H}）`);
      plates.forEach(({ id, at: { r } }) => assert.ok(!(x + 15 > r.l && x < r.r && r.b > geo.yg - 24), `${x} 在 ${id} 下面（${H}）`));
    });
  }
});
