import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../server/db.mjs";
import { BRAND_SOURCE, createBrandService, readBrandSource } from "../server/brand.mjs";

const url = "https://example.feishu.cn/base/BrandToken1?table=tbl1";
const ok = (data) => ({ stdout: JSON.stringify({ ok: true, identity: "user", data }) });
const matrix = (fields, rows, has_more = false) => ({ fields, data: rows, record_id_list: rows.map((_, i) => `rec${i}`), has_more });

// 假 lark-cli：两张版本表 + 物料表 + 汇总表；记下读过哪些表、有没有写入命令。
function fakeLark({ hasMore = false } = {}) {
  const calls = [];
  const run = async (cmd, args) => {
    calls.push(args);
    const op = args[3], table = args[args.indexOf("--table-id") + 1];
    if (op === "+table-list") return ok({ tables: [{ id: "tOld", name: "V2026.01.31" }, { id: "tMat", name: "🗄️物料更新" }, { id: "tNew", name: "V2026.09.01" }, { id: "tSum", name: "📊数据汇总" }] });
    if (op === "+record-list" && table === "tNew") return ok(matrix(["数据项ID", "排序号", "数据维度", "指标名称", "指标值", "业务线", "责任人", "数据核对"], [
      ["BRAND-002", 2, ["品牌通向"], "TOP100名校导师占比", "97.2%", ["品牌综合"], [{ id: "ou_1", name: "冯娇娇" }], ["保留"]],
      ["BRAND-001", 1, ["品牌通向"], " 全球认证导师数量 ", "9973", ["品牌综合"], [{ id: "ou_1", name: "冯娇娇" }, { id: "ou_2", name: "常浩" }], ["删减"]],
    ], hasMore));
    if (op === "+record-list" && table === "tOld") return ok(matrix(["数据项ID", "排序号", "数据维度", "指标名称", "指标值", "业务线", "责任人"], [
      ["BRAND-001", 1, ["品牌通向"], "全球认证导师数量", null, ["品牌综合"], null],
    ]));
    throw new Error(`unexpected ${args.join(" ")}`);
  };
  return { run, calls };
}

test("品牌数据：只读「V年.月.日」版本表，最新版在前，字段整理成页面要的形状", async () => {
  const { run, calls } = fakeLark();
  const value = await readBrandSource({ url }, { run, now: () => Date.parse("2026-10-18T12:00:00Z") });
  assert.deepEqual(value.versions.map((v) => [v.version, v.table, v.date]), [["V2026.09.01", "tNew", "2026-09-01"], ["V2026.01.31", "tOld", "2026-01-31"]]);
  assert.deepEqual(value.versions[0].items, [
    { id: "BRAND-001", sort: 1, dim: "品牌通向", line: "品牌综合", name: "全球认证导师数量", value: "9973", owner: "冯娇娇、常浩", check: "删减" },
    { id: "BRAND-002", sort: 2, dim: "品牌通向", line: "品牌综合", name: "TOP100名校导师占比", value: "97.2%", owner: "冯娇娇", check: "保留" },
  ]);
  assert.deepEqual(value.versions[1].items[0], { id: "BRAND-001", sort: 1, dim: "品牌通向", line: "品牌综合", name: "全球认证导师数量", value: "", owner: "" }); // 旧版没有「数据核对」
  assert.equal(value.readAt, "2026-10-18T12:00:00.000Z");
  const tablesRead = calls.filter((a) => a[3] === "+record-list").map((a) => a[a.indexOf("--table-id") + 1]);
  assert.deepEqual(tablesRead, ["tNew", "tOld"]); // 物料、汇总不读
  assert.ok(calls.every((a) => ["+table-list", "+record-list"].includes(a[3]) && a.includes("--as") && a.includes("user")), "只用读命令、用户身份");
});

test("品牌数据：版本表按每页 200 条分页读完", async () => {
  const offsets = [];
  const run = async (cmd, args) => {
    if (args[3] === "+table-list") return ok({ tables: [{ id: "tNew", name: "V2026.09.01" }] });
    const offset = Number(args[args.indexOf("--offset") + 1]); offsets.push([args[args.indexOf("--limit") + 1], offset]);
    const rows = Array.from({ length: offset ? 5 : 200 }, (_, i) => [`ID-${offset + i}`, offset + i]);
    return ok({ ...matrix(["数据项ID", "排序号"], rows, !offset), record_id_list: rows.map((_, i) => `rec${offset + i}`), rev: 7 });
  };
  const value = await readBrandSource({ url }, { run });
  assert.deepEqual(offsets, [["200", 0], ["200", 200]]);
  assert.equal(value.versions[0].items.length, 205);
});

test("品牌数据：版本表没读完整、没有版本表、链接不对，都报错，不返回半截数据", async () => {
  await assert.rejects(readBrandSource({ url }, { run: fakeLark({ hasMore: true }).run }), (e) => e.status === 502 && /没有读完整/.test(e.message));
  const none = async () => ok({ tables: [{ id: "tMat", name: "🗄️物料更新" }] });
  await assert.rejects(readBrandSource({ url }, { run: none }), (e) => e.status === 400 && /版本表/.test(e.message));
  await assert.rejects(readBrandSource({ url: "https://example.com/base/x" }, { run: none }), (e) => e.status === 400 && /品牌多维表格链接/.test(e.message));
});

test("品牌数据服务：设置为空时读默认品牌表；有旧结果时先返回旧结果", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "brand-"));
  try {
    const db = openDb(path.join(dir, "t.db"));
    let calls = 0, at = 0;
    const seen = [];
    const readSource = async (cfg) => { calls++; seen.push(cfg.url); return { source: cfg.url, readAt: String(calls), versions: [] }; };
    const brand = createBrandService(db, { readSource, now: () => at });
    assert.equal((await brand.list()).readAt, "1");
    assert.deepEqual(seen, [BRAND_SOURCE.url]);
    at = 600_001;
    assert.equal((await brand.list()).readAt, "1"); // 过期：先给旧结果，后台重读
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal((await brand.list()).readAt, "2");
    assert.equal((await brand.list({ refresh: true })).readAt, "3"); // 重新读取：现读
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
