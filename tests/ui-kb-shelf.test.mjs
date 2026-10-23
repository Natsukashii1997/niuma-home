import { test } from "node:test";
import assert from "node:assert/strict";
import { breakColumns, cleanName, isLatin, isRecent, packRows, piles, seriesOf, shelfItems, spineName, spineText, splitNumber, tokenize, wordStarts } from "../src/modules/kb/kb-shelf.js";

// 假字宽，接近 13px 字号 + 1px 字距的实测：汉字、标点、横排压格 14，竖立的每个字 14，侧转的每个字母 7，半角「-」6，空格 4
const advOf = (t) => (t.k === "up" ? 14 * t.t.length : t.k === "side" ? 7 * t.t.length : t.k === "sp" ? 4 : t.t === "-" ? 6 : 14);
// 按给定切法模拟浏览器分词，返回每个词的起点
const seg = (...parts) => (str) => { assert.equal(parts.join(""), str); let at = 0; return parts.map((p) => { const i = at; at += p.length; return i; }); };
const everyChar = (str) => [...str].map((_, i) => i);
function cols(name, cap, segment) {
  const s = spineName(name), toks = tokenize(s), r = breakColumns(toks, toks.map(advOf), cap, wordStarts(s, segment));
  return { cols: r.segs.map(([i, j]) => toks.slice(i, j).map((t) => t.t).join("")), more: r.more };
}

test("书名：去彩色 emoji，书脊再去扩展名，拆出编号", () => {
  assert.equal(cleanName("🈷️月度物料文档"), "月度物料文档");
  assert.equal(cleanName("✅2025大学辅导-策略文档"), "2025大学辅导-策略文档");
  assert.equal(cleanName("设计  Brief 需求模板"), "设计 Brief 需求模板");
  assert.equal(spineName("2026路觅教育品牌手册.pdf"), "2026路觅教育品牌手册");
  assert.equal(spineText("00｜知识库使用说明"), "00·知识库使用说明", "书脊上「｜」换成「·」");
  assert.deepEqual(splitNumber(spineName("00｜知识库使用说明")), ["00", "知识库使用说明"], "拆编号仍认原名里的「｜」");
  assert.deepEqual(splitNumber("01｜公司与行业认知"), ["01", "公司与行业认知"]);
  assert.deepEqual(splitNumber("管培生带教工作台"), ["", "管培生带教工作台"]);
});

test("切词：两位以内横排一格，3–4 位数字和全大写缩写竖立，其余英文侧转；句点不并进英文", () => {
  const kinds = Object.fromEntries(tokenize("7月T1 AI 2025 FAQ Brief V1.3 1.0版").filter(isLatin).map((t) => [t.t, t.k]));
  assert.deepEqual(kinds, { 7: "tcy", T1: "tcy", AI: "tcy", 2025: "up", FAQ: "up", Brief: "side", "V1.3": "side", "1.0": "side" });
  assert.deepEqual(tokenize("2026-10").map((t) => t.k), ["up", "sep", "tcy"]);
  assert.deepEqual(tokenize("V1.").map((t) => [t.t, t.k]), [["V1", "tcy"], [".", "close"]]);
});

test("词起点：分词结果再把品牌名和常用复合词并成一个词", () => {
  const s = wordStarts("路觅教育丨新员工入职指南", seg("路", "觅", "教育", "丨", "新", "员工", "入", "职", "指南"));
  assert.deepEqual([...s].sort((a, b) => a - b), [0, 4, 5, 8, 9, 10]);
  assert.ok(wordStarts("产品迭代").has(0)); // 默认用 Intl.Segmenter
});

test("断列：一列放得下就一列；放不下优先在分隔符、中英文交界、词边界断开", () => {
  assert.deepEqual(cols("管培生入职与轮岗指南", 142, seg("管培生", "入职", "与", "轮岗", "指南")).cols, ["管培生入职与轮岗指南"]);
  assert.deepEqual(cols("路觅教育丨新员工入职指南", 142, seg("路觅", "教育", "丨", "新员工", "入职", "指南")).cols, ["路觅教育", "新员工入职指南"]);
  assert.deepEqual(cols("2026路觅教育品牌手册.pdf", 142, seg("2026", "路觅", "教育", "品牌", "手册")).cols, ["2026", "路觅教育品牌手册"]);
  assert.deepEqual(cols("路觅教育品牌公开数据总表", 142, seg("路觅", "教育", "品牌", "公开", "数据", "总表")).cols, ["路觅教育品牌", "公开数据总表"]);
  assert.deepEqual(cols("用户链路重塑方法论-V1.32", 142, seg("用户", "链路", "重塑", "方法论", "-", "V1.32")).cols, ["用户链路重塑方法论", "V1.32"]);
  assert.deepEqual(cols("产品迭代工作流说明文档", 142, seg("产品", "迭代", "工作", "流", "说明", "文", "档")).cols, ["产品迭代", "工作流说明文档"]);
  assert.deepEqual(cols("路觅成长学习空间-汇总", 142, seg("路觅", "成长", "学习", "空间", "-", "汇总")).cols, ["路觅成长学习空间", "汇总"]);
});

test("断列：日期连字符和「7月」不拆，空格处断开去掉空格；不留单字一列；三列放不下就截断", () => {
  assert.deepEqual(cols("2026-10 设计 brief", 100, seg("2026", "-", "10", " ", "设计", " ", "brief")).cols, ["2026-10", "设计 brief"]);
  assert.deepEqual(cols("7月营销物料对接文档", 100, seg("7", "月", "营销", "物料", "对接", "文档")).cols, ["7月营销", "物料对接文档"]);
  const odd = cols("一二三四五六七八九十甲", 142, everyChar).cols;
  assert.equal(odd.length, 2);
  assert.ok(odd.every((c) => c.length >= 2), odd.join(" / "));
  const long = cols("甲".repeat(45), 142, everyChar);
  assert.equal(long.more, true);
  assert.deepEqual(long.cols.map((c) => c.length), [10, 10, 9]);
});

test("系列：同前缀或同后缀的书并成一组，书脊只写不同的半截；档案盒在前；一本书只进一组", () => {
  const t1 = "T1 需求诊断、方案生成与提需一体化";
  const items = shelfItems([
    { id: "a", name: `${t1}-问题拆解文档` }, { id: "b", name: `${t1}-过程推进文档` }, { id: "c", name: `${t1}-项目交付文档` },
    { id: "d", name: `${t1}-项目原始文档`, kids: [{ id: "e", name: "T1 | 新规划报告调研" }] },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].label, t1);
  assert.deepEqual(items[0].members.map((m) => m.label), ["项目原始文档", "问题拆解文档", "过程推进文档", "项目交付文档"]);

  const tpl = shelfItems(["思考拆解文档", "过程推进文档", "项目交付文档"].map((x, i) => ({ id: `t${i}`, name: `${x}-标准模版` })));
  assert.deepEqual(tpl.map((x) => [x.kind, x.label]), [["series", "标准模版"]]);

  const misc = shelfItems(["产品部轮岗述职-常浩", "✅2025大学辅导-策略文档", "产品调研规划-常浩（自用）", "☑️2026申诉-策略文档", "2025全年日历"].map((name, i) => ({ id: `m${i}`, name })));
  assert.deepEqual(misc.map((x) => [x.kind, x.kind === "series" ? x.label : x.node.id]), [["one", "m0"], ["series", "策略文档"], ["one", "m2"], ["one", "m4"]]);
  assert.deepEqual(misc[1].members.map((m) => m.label), ["2025大学辅导", "2026申诉"]);

  const clash = seriesOf([{ id: 1, name: "甲乙-丙丁" }, { id: 2, name: "甲乙-戊己" }, { id: 3, name: "庚辛-丙丁" }]);
  assert.deepEqual([...clash.entries()].map(([id, s]) => [id, s.label]), [[1, "甲乙"], [2, "甲乙"]]);
  assert.equal(seriesOf([{ id: 1, name: "产品部轮岗述职-常浩" }]).size, 0);
  assert.ok(shelfItems([{ id: 1, name: "甲乙-丙丁" }, { id: 2, name: "甲乙-戊己" }], { series: false }).every((x) => x.kind === "one"));
});

test("装行：放不下就换一行，比整行还宽的单独一行", () => {
  assert.deepEqual(packRows([100, 100, 100], 250, 8), [[{ i: 0, x: 0, w: 100 }, { i: 1, x: 108, w: 100 }], [{ i: 2, x: 0, w: 100 }]]);
  assert.deepEqual(packRows([300, 50], 250, 8), [[{ i: 0, x: 0, w: 300 }], [{ i: 1, x: 0, w: 50 }]]);
  assert.deepEqual(packRows([], 250, 8), []);
});

test("柜顶书摞：每 3 本一摞、窄的在上；近 3 天更新含今天", () => {
  const ps = piles(["00｜知识库使用说明", "09｜AI管培生会议记录", "11｜常见问题与机器人答疑", "12｜机械邪龙兽已确认 FAQ", "管培生带教工作台", "路觅教育信息储存中心操作指南", "路觅教育公司级新人知识库：内容架构"].map((name, i) => ({ id: i, name })));
  assert.deepEqual(ps.map((p) => p.length), [3, 3, 1]);
  assert.deepEqual(ps[0].map((n) => n.id), [0, 1, 2]);
  assert.deepEqual(ps[1].map((n) => n.id), [4, 5, 3]);
  assert.equal(isRecent("2026-10-21", "2026-10-23"), true);
  assert.equal(isRecent("2026-10-23", "2026-10-23"), true);
  assert.equal(isRecent("2026-10-20", "2026-10-23"), false);
  assert.equal(isRecent("2026-10-24", "2026-10-23"), false);
  assert.equal(isRecent("", "2026-10-23"), false);
});
