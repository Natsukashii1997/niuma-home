import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePlan, PROMO_SKUS } from "../server/plan-parser.mjs";

const fixture = (name) => readFileSync(new URL(`../fixtures/${name}.txt`, import.meta.url), "utf8");
const empty = { trial: "无", price: "无", newDeal: "无", renewal: "无", special: "无" };
const none = (sku) => ({ sku, ...empty });
const UNI = PROMO_SKUS.大学辅导;
const aliases = [
  { line: "国际课程", alias: "课时卡", sku: "灵活学Lite" },
  { line: "大学辅导", alias: "课时卡", sku: "灵活学Lite" },
];
// 只给出方案里写到的行，其余固定 SKU 按清单顺序补全「无」
const expectRows = (line, given) => PROMO_SKUS[line].map((sku) => given.find((row) => row.sku === sku) || none(sku));

test("固定 SKU 清单：大学辅导 7 个，国际课程 2 个，没有申诉服务", () => {
  assert.deepEqual(PROMO_SKUS, {
    大学辅导: ["灵活学Lite", "安心学Max", "学考无忧Pass", "补考护航Pass", "选课指导", "论文稳Pass", "先修班课"],
    国际课程: ["灵活学Lite", "安心学Max"],
  });
  assert.deepEqual(parsePlan("【申诉服务板块】\n1. 安心学Max\n试听：99").unrecognized.map((item) => item.lineNo), [1, 2, 3]);
});

test("未知行保留原始行号；未知板块与无归属字段不猜测", () => {
  assert.deepEqual(parsePlan("【未知板块】\n试听: 99\n  普通说明\n* 游离条目"), {
    line: null, rows: [], special: "无", unrecognized: [
      { lineNo: 1, text: "【未知板块】" }, { lineNo: 2, text: "试听: 99" },
      { lineNo: 3, text: "  普通说明" }, { lineNo: 4, text: "* 游离条目" },
    ],
  });
});

test("英文冒号、字母编号、各种列表符号与 CRLF；未提到的固定 SKU 全部为无", () => {
  assert.deepEqual(parsePlan("【国际课程板块】\r\na. 安心学Max\r\ni. 试听: 99\r\n• 正价：\r\n- 一\r\n▪ 二\r\n◦ 三\r\n*\r\n4."), {
    line: "国际课程", rows: [none("灵活学Lite"), { sku: "安心学Max", ...empty, trial: "99", price: "一\n二\n三" }],
    special: "无", unrecognized: [],
  });
});

test("去掉组合列表前缀；混入另一业务线的板块不能静默合并", () => {
  const result = parsePlan("【大学辅导板块】\n• 1. 选课指导\n  - a. 正价: 100\n【国际课程板块】\n2. 安心学Max\n正价：1");
  assert.equal(result.line, "大学辅导");
  assert.deepEqual(result.rows[4], { sku: "选课指导", ...empty, price: "100" });
  assert.deepEqual(result.rows[1], none("安心学Max"));
  assert.deepEqual(result.unrecognized, [{ lineNo: 4, text: "【国际课程板块】" }, { lineNo: 5, text: "2. 安心学Max" }, { lineNo: 6, text: "正价：1" }]);
});

test("课时卡在两条业务线都记作灵活学Lite；行内已有值不吞后续游离列表", () => {
  const result = parsePlan("【大学辅导板块】\n1. 课时卡\n正价: 100\n* 额外说明", { aliases });
  assert.deepEqual(result.rows[0], { sku: "灵活学Lite", alias: "课时卡", ...empty, price: "100" });
  assert.deepEqual(result.unrecognized, [{ lineNo: 4, text: "* 额外说明" }]);
  assert.deepEqual(parsePlan("【大学辅导板块】\n1. 课时卡\n正价: 100", { aliases: aliases.slice(0, 1) }).unrecognized.map((item) => item.lineNo), [2, 3]);
});

test("别名归一后重复的 SKU 标记原文行，不能静默覆盖", () => {
  const result = parsePlan("【国际课程板块】\n1. 课时卡\n2. 灵活学Lite", { aliases });
  assert.deepEqual(result.unrecognized, [{ lineNo: 3, text: "2. 灵活学Lite" }]);
});

test("字段列表里的小数属于正文，不再剥成编号", () => {
  assert.deepEqual(parsePlan("【大学辅导板块】\n1. 安心学Max\n新签活动：\n* 1.5小时试听\n- 2.5折").rows[1],
    { sku: "安心学Max", ...empty, newDeal: "1.5小时试听\n2.5折" });
});

test("「A/B」合写的标题拆成两个 SKU，字段相同", () => {
  const result = parsePlan("【大学辅导板块】\n3. 学考无忧Pass/补考护航Pass\n  a. 试听：¥599\n  b. 限时赠课：送 1 课时");
  const same = { ...empty, trial: "¥599", special: "限时赠课：送 1 课时", alias: "学考无忧Pass/补考护航Pass" };
  assert.deepEqual(result.rows.slice(2, 4), [{ sku: "学考无忧Pass", ...same }, { sku: "补考护航Pass", ...same }]);
  assert.deepEqual(result.unrecognized, []);
});

test("SKU 下非四种标签的条目记进该 SKU 的特殊活动，可带列表", () => {
  const result = parsePlan("🟥【大学辅导板块】\n1. 论文稳Pass\n   1. 正价：全款立减¥1000\n   2. 赠品：电子书\n   3. 限时赠课：\n   * 第一条\n   * 第二条\n2. 选课指导");
  assert.deepEqual(result.rows[5], { sku: "论文稳Pass", ...empty, price: "全款立减¥1000", special: "赠品：电子书\n限时赠课：\n第一条\n第二条" });
  assert.deepEqual(result.unrecognized, []);
});

test("不在清单里的编号块记整月特殊活动；块里出现四种标签说明是清单外 SKU，挡下", () => {
  const ok = parsePlan("【大学辅导板块】\n1. 选课指导\n正价：¥599\n2. 国庆活动\n  a. 满减：满 1000 减 100\n  补充说明\n3. 双11活动\n  a. 赠课：1 课时");
  assert.equal(ok.special, "国庆活动\n满减：满 1000 减 100\n补充说明\n\n双11活动\n赠课：1 课时");
  assert.deepEqual(ok.unrecognized, []);
  const bad = parsePlan("【大学辅导板块】\n1. 新产品\n  a. 试听：99\n  b. 正价：100");
  assert.deepEqual(bad.unrecognized.map((item) => item.lineNo), [2, 3, 4]);
});

test("大学辅导 9 月样例：六个 SKU 照写，先修班课补无", () => {
  assert.deepEqual(parsePlan(fixture("2026-09-大学辅导"), { aliases }), {
    line: "大学辅导",
    rows: expectRows("大学辅导", [
      { sku: "灵活学Lite", ...empty, trial: "¥199", price: "¥4300（赠课版）" },
      { sku: "安心学Max", ...empty, trial: "¥599", price: "1门85折，2门及以上8折" },
      { sku: "学考无忧Pass", ...empty, trial: "¥599", price: "1门85折，2门及以上8折" },
      { sku: "补考护航Pass", ...empty, trial: "¥599", price: "单门8折" },
      { sku: "选课指导", ...empty, price: "¥599" },
      { sku: "论文稳Pass", ...empty, price: "全款立减¥1000" },
    ]),
    special: "无",
    unrecognized: [],
  });
});

test("国际课程 9 月样例：课时卡归一，忽略空项与重复编号，保留活动换行，安心学Max 补无", () => {
  assert.deepEqual(parsePlan(fixture("2026-09-国际课程"), { aliases }), {
    line: "国际课程",
    rows: [{
      sku: "灵活学Lite", alias: "课时卡", trial: "¥99首课试听", price: "¥8500版",
      newDeal: "试听后48小时内首尾，购买课时20小时及以上30小时及以下，赠送1小时；50小时及以上送2小时；100小时及以上赠送3小时；150小时及以上赠送5小时",
      renewal: "老价格用户：购买课时30小时及以上赠送1小时；50小时及以上送2小时\n新价格用户：购买课时20小时及以上30小时及以下，赠送1小时；50小时及以上送2小时；100小时及以上赠送3小时；150小时及以上赠送5小时",
      special: "无",
    }, none("安心学Max")],
    special: "无",
    unrecognized: [],
  });
});

test("大学辅导 10 月方案逐格核对：合写拆分、未提到记无、双11 记整月特殊活动", () => {
  const same = { trial: "¥599", price: "1门85折，2门及以上8折", alias: "学考无忧Pass/补考护航Pass" };
  assert.deepEqual(parsePlan(fixture("2026-10-大学辅导"), { aliases }), {
    line: "大学辅导",
    rows: [
      { sku: "灵活学Lite", ...empty, trial: "¥199", price: "¥4100（双11版）" },
      { sku: "安心学Max", ...empty, trial: "¥599", price: "1门85折，2门及以上8折" },
      { sku: "学考无忧Pass", ...empty, ...same },
      { sku: "补考护航Pass", ...empty, ...same },
      { sku: "选课指导", ...empty, price: "¥599" },
      none("论文稳Pass"),
      none("先修班课"),
    ],
    special: [
      "双11活动（10.15-11.11）",
      "购课权益：活动期购买常规辅导课时包，按实际购课课时档位申领权益，≥10h 任选 1 项、≥20h 任选 2 项、≥50h 任选 5 项、≥100h 领取权益池全部权益",
      "学习成长金：11.1–11.11 期间，学员每完成 1 节付费正价课时可获得 50 成长金；1 成长金等价抵扣 1 元后续续费订单，可累计，有效期至 12.31（仅可抵扣续费订单，不可抵扣本次订单，不可提现、转让）",
      "选课抵扣：本学期已选购课指导且未购买路觅正式课程的学员，购买≥10h 灵活学 / 安心学产品，可全额抵扣 599 元选课指导费；本权益不可与往期选课指导赠课活动叠加",
      "限时赠课：11.11 当日下单购买课时，≥20h 赠 1 课时，≥50h 赠 2 课时；两档名额独立核算，每档各限前 11 名",
    ].join("\n"),
    unrecognized: [],
  });
  assert.equal(UNI.length, 7);
});
