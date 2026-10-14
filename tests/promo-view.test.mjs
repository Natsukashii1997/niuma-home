import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPromoView, normalizePromoView, readPromoView, writePromoView, VIEW_KEY } from "../src/modules/marketing/promo-view.js";

const promo = (month, line, sku, price = "100", extra = {}) => ({ month, line, sku, trial: "无", price, newDeal: "无", renewal: "无", ...extra });
const rows = [
  promo("2026-10", "大学辅导", "同名", "120"),
  promo("2026-08", "大学辅导", "同名"),
  promo("2026-12", "大学辅导", "同名", "120", { updatedAt: "后来更新" }),
  promo("2026-12", "国际课程", "同名", "900"),
  promo("2026-08", "国际课程", "同名", "900"),
  promo("2026-12", "大学辅导", "大学专属"),
];
const defaultView = { group: "month", filter: { month: "", line: "", sku: "" } };

test("按 SKU 分组明确倒序，跨业务线独立比较，最近变化基于全量历史", () => {
  const view = buildPromoView(rows, { ...defaultView, group: "sku" });
  const university = view.groups.find((group) => group.name === "大学辅导 · 同名");
  assert.deepEqual(university.rows.map((row) => row.month), ["2026-12", "2026-10", "2026-08"]);
  assert.equal(university.latestChange, "2026-10");
  assert.equal(view.previous.get(rows[2]), rows[0]);
  assert.equal(view.previous.get(rows[0]), rows[1]);
  assert.equal(view.groups.find((group) => group.name === "国际课程 · 同名").latestChange, null);
  assert.equal(view.groups.find((group) => group.name === "大学辅导 · 大学专属").latestChange, null);
  const filtered = buildPromoView(rows, { group: "sku", filter: { month: "2026-12", line: "大学辅导", sku: "同名" } });
  assert.equal(filtered.groups[0].rows.length, 1);
  assert.equal(filtered.groups[0].latestChange, "2026-10");
});

test("业务线联动清除无效 SKU，保留可用同名 SKU；历史失效筛选回到全部", () => {
  assert.deepEqual(normalizePromoView({ group: "line", filter: { month: "已删除月份", line: "国际课程", sku: "大学专属" } }, rows), {
    group: "line", filter: { month: "", line: "国际课程", sku: "" },
  });
  assert.equal(normalizePromoView({ ...defaultView, filter: { month: "", line: "国际课程", sku: "同名" } }, rows).filter.sku, "同名");
  assert.deepEqual(normalizePromoView({ group: "other", filter: null }, rows), defaultView);
  assert.deepEqual(normalizePromoView({ group: "sku", filter: { month: "2026-12", line: "不存在", sku: "不存在" } }, rows), {
    group: "sku", filter: { month: "2026-12", line: "", sku: "" },
  });
});

test("视图读写回读一致；损坏数据、读取失败和写入失败不影响默认视图", () => {
  const store = new Map();
  const storage = () => ({ getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) });
  const view = { group: "sku", filter: { month: "2026-12", line: "国际课程", sku: "同名" } };
  writePromoView(view, storage);
  assert.deepEqual(readPromoView(storage), view);
  for (const value of ["{", "null", "[]", '{"group":"other"}', '{"group":"sku","filter":{"month":1}}']) {
    store.set(VIEW_KEY, value);
    assert.deepEqual(readPromoView(storage), defaultView);
  }
  const denied = () => { throw new Error("存储不可用"); };
  assert.deepEqual(readPromoView(denied), defaultView);
  assert.doesNotThrow(() => writePromoView(view, denied));
  assert.doesNotThrow(() => writePromoView(view, () => ({ setItem() { throw new Error("容量不足"); } })));
});
