import { test } from "node:test";
import assert from "node:assert/strict";
import { readRevenueSource, REVENUE_SOURCE } from "../server/revenue.mjs";

const ok = (data) => ({ stdout: JSON.stringify({ ok: true, identity: "user", data }) });
const NAMES = ["当月总营收进度", "当月新签营收进度", "当月续费营收进度", "大学辅导 - 总营收", "国际课程 - 总营收", "申诉 - 总营收", "总转化率趋势", "当月大学营收占比 - 学校"];
const conv = (rows) => ({
  dimensions: [{ alias: "dm", field_name: "月份" }, { alias: "dy", field_name: "年份" }],
  main_data: rows.map(([y, m, v]) => ({ dy: { value: y }, dm: { value: m }, me_x: { value: v } })),
});

// 假 lark-cli：组件列表 + 每个组件的数据；记下调用过的命令。
function fakeLark({ missing, convRows = [["2026", "09", 0.34], ["2026", "10", 0.38], ["2025", "10", 0.31]] } = {}) {
  const calls = [];
  const run = async (cmd, args) => {
    calls.push(args);
    if (args[3] === "+dashboard-block-list") return ok({ blocks: NAMES.filter((n) => n !== missing).map((name, i) => ({ block_id: `b${i}`, name })) });
    const i = Number(args[args.indexOf("--block-id") + 1].slice(1));
    if (NAMES[i] === "总转化率趋势") return ok(conv(convRows));
    return ok({ dimensions: [], measures: [], main_data: [{ cur: { value: (i + 1) * 100 }, target: { value: (i + 1) * 1000 } }] });
  };
  return { run, calls };
}
const now = () => new Date(2026, 9, 20, 18, 40).getTime();

test("营收：按组件名读仪表盘「当月策略盘」，整理成页面要的形状", async () => {
  const { run, calls } = fakeLark();
  const v = await readRevenueSource(REVENUE_SOURCE, { run, now });
  assert.equal(v.period, "2026 年 10 月");
  assert.equal(v.timePct, 20 / 31);
  assert.equal(v.updatedAt, "10-20 18:40");
  assert.deepEqual(v.groups.map((g) => [g.label, g.items.map((it) => it.key)]), [["总进度", ["total", "new", "renew", "conv"]], ["业务线", ["uni", "intl", "appeal"]]]);
  assert.deepEqual(v.groups[0].items[0], { key: "total", name: "总营收", current: 100, target: 1000 });
  assert.deepEqual(v.groups[1].items[2], { key: "appeal", name: "申诉", current: 600, target: 6000 });
  assert.deepEqual(v.groups[0].items[3], { key: "conv", name: "总转化率", rate: 0.38, lastMonthRate: 0.34 });
  assert.ok(!calls.some((a) => a.includes("--block-id") && a[a.indexOf("--block-id") + 1] === "b7"), "饼图不读");
  assert.ok(calls.every((a) => ["+dashboard-block-list", "+dashboard-block-get-data"].includes(a[3]) && a.includes("user")), "只用读命令、用户身份");
});

test("营收：1 月的上月取去年 12 月；本月还没有转化率就不显示这一块", async () => {
  const jan = () => new Date(2027, 0, 5).getTime();
  const v = await readRevenueSource(REVENUE_SOURCE, { run: fakeLark({ convRows: [["2026", "12", 0.3], ["2027", "01", 0.32]] }).run, now: jan });
  assert.deepEqual(v.groups[0].items[3], { key: "conv", name: "总转化率", rate: 0.32, lastMonthRate: 0.3 });
  const none = await readRevenueSource(REVENUE_SOURCE, { run: fakeLark({ convRows: [["2026", "09", 0.34]] }).run, now });
  assert.deepEqual(none.groups[0].items.map((it) => it.key), ["total", "new", "renew"]);
});

test("营收：仪表盘少了进度组件就报错，不返回半截数据", async () => {
  await assert.rejects(readRevenueSource(REVENUE_SOURCE, { run: fakeLark({ missing: "申诉 - 总营收" }).run, now }), (e) => e.status === 502 && /申诉 - 总营收/.test(e.message));
});

test("营收：飞书偶发错误码 1 时自动重试；一直失败就说清是哪个组件、哪个错误码", async () => {
  const flaky = (times) => {
    const { run, calls } = fakeLark();
    let left = times;
    return { calls, run: async (cmd, args) => {
      if (args.includes("b1") && left-- > 0) { calls.push(args); throw Object.assign(new Error("exit 1"), { stderr: JSON.stringify({ ok: false, error: { type: "api", subtype: "unknown", code: 1 } }) }); }
      return run(cmd, args);
    } };
  };
  const pauses = [];
  const pause = async (ms) => { pauses.push(ms); };
  const once = flaky(2);
  const v = await readRevenueSource(REVENUE_SOURCE, { run: once.run, now, pause });
  assert.equal(v.groups[0].items[1].current, 200, "重试后读到新签进度");
  assert.equal(once.calls.filter((a) => a.includes("b1")).length, 3);
  assert.deepEqual(pauses, [1500, 1500]);
  await assert.rejects(readRevenueSource(REVENUE_SOURCE, { run: flaky(3).run, now, pause }),
    (e) => e.status === 502 && e.message === "读取仪表盘组件「当月新签营收进度」时飞书接口出错（错误码 1），已重试 2 次，请稍后点「重新读取」");
  const denied = async (cmd, args) => { throw Object.assign(new Error("exit 1"), { stderr: JSON.stringify({ ok: false, error: { type: "api", subtype: "permission_denied", code: 91403 } }) }); };
  pauses.length = 0;
  await assert.rejects(readRevenueSource(REVENUE_SOURCE, { run: denied, now, pause }), (e) => e.status === 403);
  assert.deepEqual(pauses, [], "无权限不重试");
});
