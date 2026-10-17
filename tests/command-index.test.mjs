import { test } from "node:test";
import assert from "node:assert/strict";
import { buildActions, buildDocs, buildNeeds, buildPages, buildSchools, buildSkus, parseQuery, pushRecent, readRecent, score, search } from "../src/modules/command/command-index.js";

const promo = (month, line, sku, price = "¥100") => ({ month, line, sku, trial: "¥99", price, newDeal: "无", renewal: "无" });
const promos = [promo("2026-08", "大学辅导", "灵活学Lite", "¥4300（赠课版）"), promo("2026-09", "大学辅导", "灵活学Lite", "¥4300（赠课版）"),
  promo("2026-09", "国际课程", "灵活学Lite", "¥8500版"), promo("2026-08", "大学辅导", "先修班课")];
const tl = {
  countries: [["AU", "澳洲"]],
  table: { AU: [{ school: "墨尔本大学", abbr: "UniMelb", cells: [] }] },
  agenda: [
    { from: "2026-11-09", to: "2026-11-15", c: "澳洲", school: "墨尔本大学 UniMelb", type: "Final" },
    { from: "2026-06-01", to: "2026-06-05", c: "澳洲", school: "墨尔本大学 UniMelb", type: "Final" },
  ],
};
const kb = { tree: [{ id: "a", name: "未命名", file: true }, { id: "c", name: "价格", kids: [{ id: "c2", name: "折扣口径说明", file: true }] }], docs: { c2: { tags: ["价格"], excerpt: "单价 = 总价 ÷ 课时" } } };

test("SKU 按业务线 + SKU 合并，预览取最近一个月", () => {
  const skus = buildSkus(promos);
  assert.equal(skus.length, 3);
  const lite = skus.find((s) => s.id === "sku:大学辅导|灵活学Lite");
  assert.equal(lite.preview.latest.month, "2026-09");
  assert.deepEqual(lite.preview.months, ["2026-09", "2026-08"]);
  assert.equal(lite.href, "#/marketing/sku/%E5%A4%A7%E5%AD%A6%E8%BE%85%E5%AF%BC/%E7%81%B5%E6%B4%BB%E5%AD%A6Lite");
});

test("学校只列今天以后的节点，链接带缩写", () => {
  const [s] = buildSchools(tl, "2026-10-16");
  assert.equal(s.title, "墨尔本大学 UniMelb");
  assert.equal(s.preview.next.length, 1);
  assert.equal(s.preview.next[0].from, "2026-11-09");
  assert.equal(s.href, "#/user/timeline/country/UniMelb");
});

test("文档只收文件，路径写到上一级目录", () => {
  const docs = buildDocs(kb);
  assert.deepEqual(docs.map((d) => [d.title, d.sub]), [["未命名", "根目录"], ["折扣口径说明", "价格"]]);
  assert.equal(buildDocs(undefined).length, 0);
});

test("打分：标题开头 > 标题包含 > 副标题或关键词；几个词都要命中", () => {
  const item = { title: "灵活学Lite · 大学辅导", sub: "正价 ¥4300", keys: "灵活学Lite 大学辅导" };
  assert.equal(score(item, "灵活"), 3);
  assert.equal(score(item, "大学"), 2);
  assert.equal(score(item, "4300"), 1);
  assert.equal(score(item, "LITE 大学"), 4);
  assert.equal(score(item, "灵活 国际"), 0);
});

test("「>」开头只搜操作；空输入返回 null", () => {
  assert.deepEqual(parseQuery("> 复制", "all"), { scope: "action", q: "复制" });
  const items = [...buildPages(), ...buildSkus(promos), ...buildActions(promos, "2026-11")];
  assert.equal(search(items, "  ", "all"), null);
  const only = search(items, ">灵活", "all");
  assert.deepEqual(only.map((g) => g.kind), ["action"]);
  assert.ok(only[0].items.every((it) => it.copy && it.copy.includes("灵活学Lite")));
});

test("全部范围按组排序、每组最多 5 条；单一范围不截到 5 条", () => {
  const items = [...buildPages(), ...buildSkus(promos), ...buildActions(promos, "2026-11"), ...buildNeeds({ needs: [] }), ...buildSchools(tl, "2026-10-16")];
  const groups = search(items, "灵活", "all");
  assert.deepEqual(groups.map((g) => g.kind), ["sku", "action"]);
  const pages = search(items, "·", "page"); // 「模块 · 页签」共 11 个
  assert.equal(pages.length, 1);
  assert.equal(pages[0].total, 11);
  assert.equal(pages[0].items.length, 11);
  assert.equal(search(items, "·", "all").find((g) => g.kind === "page").items.length, 5);
});

test("最近打开最多 5 条，重复的提到最前；存储不可用时当作没有记录", () => {
  const store = new Map();
  const storage = () => ({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
  const pages = buildPages();
  pages.slice(0, 6).forEach((p) => pushRecent(p, storage));
  pushRecent(pages[2], storage);
  const recent = readRecent(storage);
  assert.equal(recent.length, 5);
  assert.equal(recent[0].id, pages[2].id);
  assert.deepEqual(readRecent(() => { throw new Error("blocked"); }), []);
});
