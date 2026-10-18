import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { labelLayout, slotHeight } from "../src/modules/voice/label-layout.js";

// 用 Codex 交付的 17 组手工预期（T10-B3）核对前端实际使用的实现。
const spec = JSON.parse(readFileSync(new URL("../docs/handoff/T10/B3-标签避让用例.json", import.meta.url), "utf8"));
const round = (v) => Math.round(v * 10) / 10;

for (const c of spec.cases) {
  test(`Voice 标签避让 · ${c.name}`, () => {
    const topics = c.topics.map((t) => ({ id: t.id, heat: t.heat, spark: [0, 0, 0, 0, 0, 0, t.lastValue] }));
    const before = structuredClone(topics);
    const opts = { ...spec.defaults.chart, h: c.labelHeight ?? spec.defaults.labelHeight, g: spec.defaults.gap, ...c.chartOverrides };
    const out = labelLayout(topics, opts);
    assert.deepEqual(topics, before, "不得改写输入（含 spark、heat、顺序）");
    assert.equal(out.mode, c.expected.mode);
    if (out.mode === "legend") return assert.deepEqual(out.ids, c.expected.legendIds);
    const got = Object.fromEntries(out.labels.map((l) => [l.id, round(l.labelY)]));
    assert.deepEqual(got, c.expected.labelYById);
    const ys = out.labels.map((l) => l.labelY);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= opts.h + opts.g - 1e-9, "相邻标签中心距不小于槽高+间距");
  });
}

test("Voice 标签槽高按实测字形取最大值，至少 16", () => {
  assert.equal(slotHeight([]), 16);
  assert.equal(slotHeight([{ a: -10, b: 2 }]), 16); // 12px 常规字形：顶 -10、底 +2 → 半槽 max(8, 6, 6)
  assert.equal(slotHeight([{ a: -10, b: 2 }, { a: -14.2, b: 3.5 }]), 22); // 半槽 max(8, ceil(10.2)=11, ceil(7.5)=8)
});
