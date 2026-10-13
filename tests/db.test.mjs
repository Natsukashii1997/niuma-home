import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { toPromo } from "../server/feishu-import.mjs";
import { openDb, savePromo, listPromos } from "../server/db.mjs";

const fields = ["月份", "业务线", "续费活动", "SKU名称", "正价价格", "新签活动", "试听价格", "填写日期"];
const row = ["09", ["大学辅导"], "", ["学考无忧Pass"], "1门85折，2门及以上8折", "无", "¥599", "2026-09-01T00:00:00.000+08:00"];

test("飞书行转换：月份带年份、选项去数组、空值填「无」", () => {
  assert.deepEqual(toPromo(fields, row), {
    month: "2026-09",
    line: "大学辅导",
    sku: "学考无忧Pass",
    trial: "¥599",
    price: "1门85折，2门及以上8折",
    newDeal: "无",
    renewal: "无",
  });
});

test("重复导入按 月份+业务线+SKU 覆盖，不重复插入", () => {
  const db = openDb(mkdtempSync(path.join(tmpdir(), "work-desk-")));
  savePromo(db, toPromo(fields, row));
  savePromo(db, { ...toPromo(fields, row), price: "单门8折" });
  const rows = listPromos(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price, "单门8折");
});

test("建库时补齐预置数据：课时卡别名、文案助手，重复打开不重复插入", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "work-desk-"));
  openDb(dir);
  const db = openDb(dir);
  assert.deepEqual(db.prepare("SELECT line, alias, sku FROM sku_aliases").all().map((r) => ({ ...r })), [
    { line: "国际课程", alias: "课时卡", sku: "灵活学Lite" },
  ]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM assistants WHERE kind = 'copywriter'").get().n, 1);
});
