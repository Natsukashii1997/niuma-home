import test from "node:test";
import assert from "node:assert/strict";
import { materialMonths } from "../src/modules/marketing/material-months.js";

test("月度物料预留当前自然月的下月，保留旧月且不改源快照", () => {
  const source = ["2026-08", "2026-09", "2026-10"];
  assert.deepEqual(materialMonths(source, "2026-10"), [...source, "2026-11"]);
  assert.deepEqual(source, ["2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(materialMonths(source, "2026-11"), [...source, "2026-11", "2026-12"]);
});

test("空缓存与旧缓存也预留当月及跨年下月", () => {
  assert.deepEqual(materialMonths([], "2026-12"), ["2026-12", "2027-01"]);
  assert.deepEqual(materialMonths(["2026-08"], "2026-12"), ["2026-08", "2026-12", "2027-01"]);
});

test("已存在的下月不重复，更远未来月份及其内容位置保留", () => {
  assert.deepEqual(materialMonths(["2027-02", "2026-11", "2026-10", "2026-11"], "2026-10"), ["2026-10", "2026-11", "2027-02"]);
});
