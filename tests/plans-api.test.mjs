import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { openDb, savePromo } from "../server/db.mjs";
import { routes } from "../server/routes/marketing.mjs";
import { match, json } from "../server/http.mjs";

const fields = { trial: "无", price: "100", newDeal: "无", renewal: "无" };
const rawText = "【大学辅导板块】\n1. 灵活学Lite\n正价：120\n2. 安心学Max\n正价：100\n3. 选课指导\n正价：100";

async function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, "必须设置隔离的 WORKDESK_DATA_DIR");
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, "plans-"));
  const db = openDb(dir);
  const handlers = routes(db);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const found = match(handlers, req.method, url.pathname);
    if (!found) return json(res, 404, { error: "接口不存在" });
    try { await found.handler(req, res, { params: found.params, url }); }
    catch (error) { json(res, 500, { error: error.message }); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const request = async (method, url, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method, headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const seed = (sku, month = "2026-09", line = "大学辅导", overrides = {}) =>
    savePromo(db, { month, line, sku, ...fields, ...overrides });
  return { db, request, seed };
}

test("预览只读：同月优先，逐字段对比，并仅列当月将删除的 SKU", async (t) => {
  const { request, seed } = await setup(t);
  seed("灵活学Lite"); seed("安心学Max"); seed("将删除");
  seed("灵活学Lite", "2026-08", "大学辅导", { price: "120" });
  seed("其他业务", "2026-09", "国际课程");
  const before = await request("GET", "/api/promos");
  const result = await request("POST", "/api/plans/parse", { month: "2026-09", line: "大学辅导", rawText });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.rows.map(({ sku, status, changed }) => ({ sku, status, changed })), [
    { sku: "灵活学Lite", status: "changed", changed: ["price"] },
    { sku: "安心学Max", status: "same", changed: [] },
    ...["学考无忧Pass", "补考护航Pass", "选课指导", "论文稳Pass", "先修班课"].map((sku) => ({ sku, status: "new", changed: [] })),
  ]);
  assert.equal(result.body.rows[0].previous.price, "100");
  assert.deepEqual(result.body.removed, ["将删除"]);
  assert.deepEqual(await request("GET", "/api/promos"), before);
  assert.deepEqual((await request("GET", "/api/plans")).body, []);
  const next = await request("POST", "/api/plans/parse", { month: "2026-11", line: "大学辅导", rawText });
  assert.equal(next.body.rows[0].previous.month, "2026-09");
  assert.deepEqual(next.body.removed, []);
});

test("确认后保存双格式原文、覆盖目标组并删除遗漏 SKU；重复确认不增行", async (t) => {
  const { request, seed } = await setup(t);
  seed("灵活学Lite"); seed("将删除"); seed("其他业务", "2026-09", "国际课程"); seed("历史", "2026-08");
  const preview = (await request("POST", "/api/plans/parse", { month: "2026-09", line: "大学辅导", rawText })).body;
  const url = `/api/plans/2026-09/${encodeURIComponent("大学辅导")}`;
  const rawHtml = "<p><strong>原文</strong></p>";
  const result = await request("PUT", url, { rawText, rawHtml, rows: preview.rows, special: preview.special });
  assert.deepEqual(result, { status: 200, body: { inserted: 6, updated: 1, removed: 1 } });
  const plan = (await request("GET", url)).body;
  assert.equal(plan.rawText, rawText);
  assert.equal(plan.rawHtml, rawHtml);
  assert.ok(plan.savedAt);
  const promos = (await request("GET", "/api/promos")).body;
  assert.equal(promos.length, 9);
  assert.ok(!promos.some((row) => row.sku === "将删除"));
  assert.equal(promos.find((row) => row.sku === "灵活学Lite").price, "120");
  assert.equal((await request("GET", "/api/plans")).body.length, 1);
  assert.deepEqual((await request("PUT", url, { rawText, rows: preview.rows, special: "无" })).body, { inserted: 0, updated: 7, removed: 0 });
  const after = (await request("POST", "/api/plans/parse", { month: "2026-09", line: "大学辅导", rawText })).body;
  assert.ok(after.rows.every((row) => row.status === "same"));
});

test("事务中途数据库拒绝第二行时，原文和促销行全部回滚", async (t) => {
  const { request, seed, db } = await setup(t);
  seed("灵活学Lite"); seed("将删除");
  const url = `/api/plans/2026-09/${encodeURIComponent("大学辅导")}`;
  const oldText = "【大学辅导板块】\n1. 灵活学Lite\n正价: 100";
  const oldPreview = (await request("POST", "/api/plans/parse", { month: "2026-09", line: "大学辅导", rawText: oldText })).body;
  assert.equal((await request("PUT", url, { rawText: oldText, rawHtml: "<p>旧原文</p>", rows: oldPreview.rows, special: "无" })).status, 200);
  const beforePlan = await request("GET", url);
  const beforePromos = await request("GET", "/api/promos");
  db.exec("CREATE TRIGGER fail_second BEFORE INSERT ON promos WHEN NEW.sku = '先修班课' BEGIN SELECT RAISE(ABORT, '模拟中途失败'); END;");
  const preview = (await request("POST", "/api/plans/parse", { month: "2026-09", line: "大学辅导", rawText })).body;
  assert.equal((await request("PUT", url, { rawText, rows: preview.rows, special: "无" })).status, 500);
  assert.deepEqual(await request("GET", url), beforePlan);
  assert.deepEqual(await request("GET", "/api/promos"), beforePromos);
});

test("不合法输入、未知行、业务线错配、重复 SKU、过期预览均拒绝写入", async (t) => {
  const { request } = await setup(t);
  const base = { month: "2026-09", line: "大学辅导", rawText };
  const preview = (await request("POST", "/api/plans/parse", base)).body;
  for (const input of [null, { ...base, month: "2026-13" }, { ...base, line: "其他" }, { ...base, rawText: 10 }]) {
    assert.equal((await request("POST", "/api/plans/parse", input)).status, 400);
  }
  const url = `/api/plans/2026-09/${encodeURIComponent("大学辅导")}`;
  for (const body of [
    { rawText: rawText + "\n未知行", rows: preview.rows },
    { rawText: rawText.replace("大学辅导", "国际课程"), rows: preview.rows },
    { rawText, rows: [] }, { rawText, rows: [null] },
    { rawText, rows: [preview.rows[0], preview.rows[0]] },
    { rawText: rawText.replace("120", "999"), rows: preview.rows },
    { rawText, rawHtml: 123, rows: preview.rows },
    { rawText, rows: preview.rows, special: "伪造的整月活动" },
    { rawText, rows: preview.rows.map((row, index) => index ? row : { ...row, special: "伪造" }), special: "无" },
  ]) {
    const result = await request("PUT", url, body);
    assert.equal(result.status, 400, JSON.stringify(result.body));
  }
  assert.deepEqual((await request("GET", "/api/plans")).body, []);
  assert.deepEqual((await request("GET", "/api/promos")).body, []);
});

test("大学辅导 10 月方案：预览 → 确认 → 回读，SKU 特殊活动与整月特殊活动都能读出", async (t) => {
  const { request } = await setup(t);
  const text = readFileSync(new URL("../fixtures/2026-10-大学辅导.txt", import.meta.url), "utf8");
  const preview = (await request("POST", "/api/plans/parse", { month: "2026-10", line: "大学辅导", rawText: text })).body;
  assert.deepEqual(preview.unrecognized, []);
  assert.match(preview.special, /^双11活动（10\.15-11\.11）\n购课权益：/);
  const url = `/api/plans/2026-10/${encodeURIComponent("大学辅导")}`;
  const saved = await request("PUT", url, { rawText: text, rows: preview.rows, special: preview.special });
  assert.deepEqual(saved, { status: 200, body: { inserted: 7, updated: 0, removed: 0 } });
  const promos = (await request("GET", "/api/promos")).body;
  assert.deepEqual(promos.map(({ sku, trial, price, newDeal, renewal, special }) => [sku, trial, price, newDeal, renewal, special]), [
    ["灵活学Lite", "¥199", "¥4100（双11版）", "无", "无", "无"],
    ["安心学Max", "¥599", "1门85折，2门及以上8折", "无", "无", "无"],
    ["学考无忧Pass", "¥599", "1门85折，2门及以上8折", "无", "无", "无"],
    ["补考护航Pass", "¥599", "1门85折，2门及以上8折", "无", "无", "无"],
    ["选课指导", "无", "¥599", "无", "无", "无"],
    ["论文稳Pass", "无", "无", "无", "无", "无"],
    ["先修班课", "无", "无", "无", "无", "无"],
  ]);
  const plans = (await request("GET", "/api/plans")).body;
  assert.deepEqual(plans.map(({ month, line, special }) => ({ month, line, special })), [{ month: "2026-10", line: "大学辅导", special: preview.special }]);
  assert.equal((await request("GET", url)).body.special, preview.special);
  const again = (await request("POST", "/api/plans/parse", { month: "2026-10", line: "大学辅导", rawText: text })).body;
  assert.ok(again.rows.every((row) => row.status === "same"));
});

test("解析可不带业务线：按原文【…板块】识别，并与识别出的业务线对比；识别不出时不对比", async (t) => {
  const { request, seed } = await setup(t);
  seed("灵活学Lite", "2026-09", "国际课程", { trial: "¥99" });
  const text = readFileSync(new URL("../fixtures/2026-10-国际课程.txt", import.meta.url), "utf8");
  const result = await request("POST", "/api/plans/parse", { month: "2026-10", rawText: text });
  assert.equal(result.status, 200);
  assert.equal(result.body.line, "国际课程");
  assert.deepEqual(result.body.rows.map(({ sku, status, changed }) => ({ sku, status, changed })), [
    { sku: "灵活学Lite", status: "changed", changed: ["trial", "price"] },
    { sku: "安心学Max", status: "new", changed: [] },
  ]);
  const unknown = (await request("POST", "/api/plans/parse", { month: "2026-10", rawText: "1. 灵活学Lite\n试听：1" })).body;
  assert.equal(unknown.line, null);
  assert.deepEqual(unknown.rows, []);
  assert.equal((await request("POST", "/api/plans/parse", { month: "2026-10", line: "其他", rawText: text })).status, 400);
});

test("申诉服务：只有整月特殊活动也能入库，原文可回读，促销表不增行", async (t) => {
  const { request } = await setup(t);
  const text = "【申诉服务板块】\n1. 双11活动（10.15-11.11）\na. 限时赠送：免费申诉专家诊断 1 次";
  const preview = (await request("POST", "/api/plans/parse", { month: "2026-10", rawText: text })).body;
  assert.equal(preview.line, "申诉服务");
  assert.deepEqual(preview.rows, []);
  const url = `/api/plans/2026-10/${encodeURIComponent("申诉服务")}`;
  assert.equal((await request("PUT", url, { rawText: text, rows: [], special: "伪造" })).status, 400);
  const saved = await request("PUT", url, { rawText: text, rows: preview.rows, special: preview.special });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal((await request("GET", url)).body.rawText, text);
  assert.deepEqual((await request("GET", "/api/promos")).body, []);
  // 原文为空的申诉服务（没有活动）仍拒绝
  assert.equal((await request("PUT", url, { rawText: "【申诉服务板块】", rows: [], special: "无" })).status, 400);
});
