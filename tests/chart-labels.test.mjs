import { test } from "node:test";
import assert from "node:assert/strict";
import { placeLabels, segmentHitsBox } from "../src/ui/chart-labels.js";

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const bounds = { x: 0, y: 0, w: 600, h: 300 };

test("线段与矩形相交：穿过、端点在内、擦边外、平行在外", () => {
  const b = { x: 10, y: 10, w: 20, h: 10 };
  assert.equal(segmentHitsBox([0, 15, 40, 15], b), true);
  assert.equal(segmentHitsBox([15, 15, 100, 100], b), true);
  assert.equal(segmentHitsBox([0, 0, 40, 5], b), false);
  assert.equal(segmentHitsBox([0, 25, 40, 25], b), false);
  assert.equal(segmentHitsBox([0, 30, 9, 0], b), false);
});

test("空地上：高的点标在正上方，低的点标在正下方", () => {
  const [up, down] = placeLabels([{ x: 100, y: 100, text: "2,564", side: "up" }, { x: 300, y: 100, text: "2,099", side: "down" }], { bounds });
  assert.equal(up.hidden, false);
  assert.ok(up.box.y + up.box.h <= 100 - 4 && Math.abs(up.box.x + up.box.w / 2 - 100) < 0.01);
  assert.ok(down.box.y >= 100 + 4 && Math.abs(down.box.x + down.box.w / 2 - 300) < 0.01);
});

test("折线穿过正上方时换位置，不压线", () => {
  const segments = [[60, 80, 140, 80]]; // 一条横线正好穿过点上方的标签位
  const [l] = placeLabels([{ x: 100, y: 100, text: "1,830", side: "up" }], { bounds, segments });
  assert.equal(l.hidden, false);
  assert.equal(segmentHitsBox(segments[0], l.box), false);
});

test("顶到图框上沿时换到旁边或下面，不出图框；四面都被挡住时不画", () => {
  const [top] = placeLabels([{ x: 100, y: 6, text: "960", side: "up" }], { bounds });
  assert.equal(top.hidden, false);
  assert.ok(top.box.y >= bounds.y);
  const wall = [{ x: 0, y: 0, w: 600, h: 300 }];
  const [boxed] = placeLabels([{ x: 100, y: 100, text: "1,920", side: "up" }], { bounds, boxes: wall });
  assert.equal(boxed.hidden, true);
});

test("两条线挨得很近：画出来的标签两两不重叠、不压方点、不出图框", () => {
  // 今年 / 去年两条线贴在一起，相邻列也挤（列宽 40，标签宽 33）
  const now = [52, 50, 49, 55, 48, 47, 60, 58, 51, 50], last = [50, 49, 51, 53, 50, 45, 58, 61, 49, 52];
  const x = i => 30 + i * 40, y = v => 300 - v * 4;
  const marks = [...now, ...last].map((v, k) => ({ x: x(k % 10) - 4, y: y(v) - 4, w: 8, h: 8 }));
  const segments = [now, last].flatMap(a => a.slice(1).map((v, i) => [x(i), y(a[i]), x(i + 1), y(v)]));
  const labels = [
    ...now.map((v, i) => ({ x: x(i), y: y(v), text: `${v}.0%`, side: v >= last[i] ? "up" : "down" })),
    ...last.map((v, i) => ({ x: x(i), y: y(v), text: `${v}.0%`, side: now[i] > v ? "down" : "up" })),
  ];
  const out = placeLabels(labels, { bounds, marks, segments });
  const shown = out.filter(l => !l.hidden).map(l => l.box);
  assert.ok(shown.length >= 12, `至少大半标签能画出来，实际 ${shown.length}`);
  shown.forEach((a, i) => {
    shown.slice(i + 1).forEach(b => assert.equal(overlaps(a, b), false));
    marks.forEach(m => assert.equal(overlaps(a, m), false));
    assert.ok(a.x >= bounds.x && a.y >= bounds.y && a.x + a.w <= bounds.x + bounds.w && a.y + a.h <= bounds.y + bounds.h);
  });
});
