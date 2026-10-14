import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePlan } from "../server/plan-parser.mjs";

const fixture = (line) => readFileSync(new URL(`../fixtures/2026-09-${line}.txt`, import.meta.url), "utf8");
const empty = { trial: "无", price: "无", newDeal: "无", renewal: "无" };

test("未知行保留原始行号；未知板块与无归属字段不猜测", () => {
  assert.deepEqual(parsePlan("【未知板块】\n试听: 99\n  普通说明\n* 游离条目"), {
    line: null, rows: [], unrecognized: [
      { lineNo: 1, text: "【未知板块】" }, { lineNo: 2, text: "试听: 99" },
      { lineNo: 3, text: "  普通说明" }, { lineNo: 4, text: "* 游离条目" },
    ],
  });
});

test("英文冒号、字母编号、各种列表符号与 CRLF；空 SKU 字段全部为无", () => {
  assert.deepEqual(parsePlan("【申诉服务板块】\r\na. 方案甲\r\ni. 试听: 99\r\n• 正价：\r\n- 一\r\n▪ 二\r\n◦ 三\r\n9. 方案乙\r\n*\r\n4."), {
    line: "申诉服务", rows: [
      { sku: "方案甲", ...empty, trial: "99", price: "一\n二\n三" },
      { sku: "方案乙", ...empty },
    ], unrecognized: [],
  });
});

test("去掉组合列表前缀；混入另一业务线的板块不能静默合并", () => {
  const result = parsePlan("【大学辅导板块】\n• 1. 产品甲\n  - a. 正价: 100\n【国际课程板块】\n2. 产品乙");
  assert.equal(result.line, "大学辅导");
  assert.deepEqual(result.rows[0], { sku: "产品甲", ...empty, price: "100" });
  assert.deepEqual(result.unrecognized, [{ lineNo: 4, text: "【国际课程板块】" }]);
});

test("行内已有值不吞后续游离列表，大学辅导不使用国际课程别名", () => {
  const result = parsePlan("【大学辅导板块】\n1. 课时卡\n正价: 100\n* 额外说明", {
    aliases: [{ line: "国际课程", alias: "课时卡", sku: "灵活学Lite" }],
  });
  assert.deepEqual(result.rows, [{ sku: "课时卡", ...empty, price: "100" }]);
  assert.deepEqual(result.unrecognized, [{ lineNo: 4, text: "* 额外说明" }]);
});

test("别名归一后重复的 SKU 标记原文行，不能静默覆盖", () => {
  const result = parsePlan("【国际课程板块】\n1. 课时卡\n2. 灵活学Lite", {
    aliases: [{ line: "国际课程", alias: "课时卡", sku: "灵活学Lite" }],
  });
  assert.deepEqual(result.unrecognized, [{ lineNo: 3, text: "2. 灵活学Lite" }]);
});

test("SKU 的英文点号与字段列表的小数属于正文，不再剥成编号", () => {
  assert.deepEqual(parsePlan("【大学辅导板块】\n1. A.B辅导\n新签活动：\n* 1.5小时试听\n- 2.5折\n2. ABC.课程"), {
    line: "大学辅导", rows: [
      { sku: "A.B辅导", ...empty, newDeal: "1.5小时试听\n2.5折" },
      { sku: "ABC.课程", ...empty },
    ], unrecognized: [],
  });
});

test("大学辅导样例逐字段还原六个 SKU，未写活动填无", () => {
  assert.deepEqual(parsePlan(fixture("大学辅导"), { aliases: [] }), {
    line: "大学辅导",
    rows: [
      { sku: "灵活学Lite", ...empty, trial: "¥199", price: "¥4300（赠课版）" },
      { sku: "安心学Max", ...empty, trial: "¥599", price: "1门85折，2门及以上8折" },
      { sku: "学考无忧Pass", ...empty, trial: "¥599", price: "1门85折，2门及以上8折" },
      { sku: "补考护航Pass", ...empty, trial: "¥599", price: "单门8折" },
      { sku: "选课指导", ...empty, price: "¥599" },
      { sku: "论文稳Pass", ...empty, price: "全款立减¥1000" },
    ],
    unrecognized: [],
  });
});

test("国际课程样例忽略空项与重复编号，同业务线别名归一，保留活动换行", () => {
  const aliases = [
    { line: "大学辅导", alias: "课时卡", sku: "不能跨业务线使用" },
    { line: "国际课程", alias: "课时卡", sku: "灵活学Lite" },
  ];
  assert.deepEqual(parsePlan(fixture("国际课程"), { aliases }), {
    line: "国际课程",
    rows: [{
      sku: "灵活学Lite", alias: "课时卡", trial: "¥99首课试听", price: "¥8500版",
      newDeal: "试听后48小时内首尾，购买课时20小时及以上30小时及以下，赠送1小时；50小时及以上送2小时；100小时及以上赠送3小时；150小时及以上赠送5小时",
      renewal: "老价格用户：购买课时30小时及以上赠送1小时；50小时及以上送2小时\n新价格用户：购买课时20小时及以上30小时及以下，赠送1小时；50小时及以上送2小时；100小时及以上赠送3小时；150小时及以上赠送5小时",
    }],
    unrecognized: [],
  });
  assert.equal(aliases[1].sku, "灵活学Lite");
});

test("编号行带「未知标签：」时记为未识别，不当成新 SKU", () => {
  const result = parsePlan("🟥【大学辅导板块】\n1. 论文稳Pass\n   1. 正价：全款立减¥1000\n   2. 赠品：电子书\n2. 选课指导");
  assert.deepEqual(result.rows.map((row) => row.sku), ["论文稳Pass", "选课指导"]);
  assert.deepEqual(result.unrecognized, [{ lineNo: 4, text: "   2. 赠品：电子书" }]);
});
