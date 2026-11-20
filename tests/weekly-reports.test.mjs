import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import * as parser from "../server/report-parser.mjs";
import * as service from "../server/reports.mjs";
import { openDb, saveSetting, getSettings } from "../server/db.mjs";
import { pageRoutes as routes } from "../server/app-routes.mjs";
import { json, match } from "../server/http.mjs";

const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const daily = "https://team.feishu.cn/docx/Daily";
const weekly = "https://team.feishu.cn/wiki/Weekly";
const dailyText = "## 2026-10-13\n日报正文\n## 周报 2026-10-05\n旧格式周报";
const weeklyText = "## 第41周 2026.41（2026.10.05 - 10.09）\n周报正文\n## 2026-10-13\n需忽略的日报";
const denied = () => Object.assign(new Error("周报文档无权限"), { status: 403 });

test("T05B 日报 ID 固定基线：改动前从两个既有 fixture 提取，旧日期规则不变", () => {
  assert.deepEqual(parser.parseReports(fixture("reports-real-redacted.md")).map(r => r.id), ["686da59ae2ba50efa898-1", "b7fc823babbbf5c5371c-1"]);
  assert.deepEqual(parser.parseReports(fixture("reports-boundaries.md")).map(r => r.id), ["b7fc823babbbf5c5371c-1", "7f6bc0ae04cf9c858aad-1"]);
});

test("真实脱敏周报三篇：标题原文、起止日、周次、周年和表格正文", () => {
  const rows = parser.parseReports(fixture("weekly-real-redacted.md"));
  assert.deepEqual(rows.map(r => [r.date, r.startDate, r.endDate, r.week, r.weekYear]), [
    ["2026-10-05", "2026-10-05", "2026-10-09", 41, 2026],
    ["2026-09-28", "2026-09-28", "2026-10-02", 40, 2026],
    ["2026-08-31", "2026-08-31", "2026-09-04", 36, 2026],
  ]);
  assert.equal(rows[0].title, "第41周 2026.41（2026.10.05 - 10.09）");
  assert.match(rows[0].body, /内容已脱敏/);
  assert.doesNotMatch(rows[0].body, /<table|<td/);
});

test("周报边界：括号、分隔符、空白、跨月年、七天、无效标题、警告及层级", () => {
  const text = fixture("weekly-boundaries.md");
  const { reports, unrecognized } = parser.parseReportDocument(text);
  assert.equal(reports.length, 7); assert.equal(unrecognized.length, 5);
  assert.equal(reports.filter(r => r.warnings?.length).length, 3);
  for (const item of unrecognized) assert.equal(text.split("\n")[item.lineNo - 1], "## " + item.title);
  const crossYear = reports.find(r => r.title.includes("–"));
  assert.equal(crossYear.endDate, "2026-01-02"); assert.equal(crossYear.weekYear, 2026);
  assert.equal(reports.find(r => r.weekYear === 2024).endDate, "2024-03-03");
  assert.match(reports.find(r => r.title.startsWith("📋")).body, /代码内标题不切篇/);
  assert.ok(reports.every(r => !r.body.includes("无效起日")));
  assert.equal(parser.parseReportDocument("## 第9周 2026.9（2026.02.30 - 03.02）\n正文").unrecognized[0].lineNo, 1);
});

test("同链接规范化读一次、清空回退、双来源角色过滤及旧 ID", async () => {
  let settings = { report_doc_url: daily }; let calls = 0;
  const reader = service.createReportReader(() => settings, { readDocument: async url => { calls++; return url === daily ? dailyText : weeklyText; } });
  const old = await reader(); assert.equal(old.length, 2);
  settings.weekly_doc_url = "https://TEAM.feishu.cn/docx/Daily/?x=1#part";
  let result = await reader({ withSources: true }); assert.equal(calls, 1); assert.equal(result.sources.length, 1);
  assert.ok(result.reports.every(r => r.source === "daily"));
  settings.weekly_doc_url = weekly;
  result = await reader({ withSources: true }); assert.equal(calls, 2);
  assert.deepEqual(result.sources.map(s => [s.role, s.count, s.ignored]), [["daily", 1, 1], ["weekly", 1, 1]]);
  assert.equal(result.reports[0].id, old[0].id); assert.match(result.reports[1].id, /^w-[a-f0-9]{20}-1$/);
  delete settings.weekly_doc_url;
  assert.deepEqual(await reader(), old); assert.equal(calls, 2);
  assert.notEqual(service.reportDocumentUrl(daily), service.reportDocumentUrl(daily.toLowerCase()));
});

test("无效周报候选仍界定层级，不漏记，也不把日期子章节当成日报", () => {
  const result = parser.parseReportDocument("## 第9周 2026.9（2026.02.30 - 03.02）\n无效正文\n### 2026-03-01 复盘事项\n子章节正文");
  assert.deepEqual(result.reports, []);
  assert.deepEqual(result.unrecognized, [{ lineNo: 1, title: "第9周 2026.9（2026.02.30 - 03.02）" }]);
});

test("普通第N周汇总标题不改变有效日报或周报的报告层级", () => {
  assert.equal(parser.parseReports("# 第41周工作汇总\n" + weeklyText).length, 2);
  assert.deepEqual(parser.parseReports("# 第41周工作汇总\n" + fixture("reports-real-redacted.md")).map(r => r.id), ["686da59ae2ba50efa898-1", "b7fc823babbbf5c5371c-1"]);
});

test("缓存十分钟边界、只清理变更来源、预览不影响缓存", async () => {
  let settings = { report_doc_url: daily, weekly_doc_url: weekly }, now = 0;
  const calls = [];
  const reader = service.createReportReader(() => settings, { now: () => now, readDocument: async url => { calls.push(url); return url === daily ? dailyText : weeklyText; } });
  await reader(); now = 599999; await reader(); assert.equal(calls.length, 2);
  await reader.preview({ role: "weekly", url: weekly }); assert.equal(calls.length, 3);
  await reader(); assert.equal(calls.length, 3);
  now = 600000; await reader(); assert.equal(calls.length, 5);
  settings.weekly_doc_url = weekly + "2"; await reader(); assert.equal(calls.length, 6); assert.equal(calls.at(-1), weekly + "2");
  settings.report_doc_url = daily + "2"; await reader({ withSources: true }); assert.equal(calls.length, 7);
});

test("双来源并行刷新；失败清缓存，下次恢复；旧数组整体失败与全部失败", async () => {
  const settings = { report_doc_url: daily, weekly_doc_url: weekly }; let failDaily = false, failWeekly = false;
  let active = 0, maxActive = 0;
  const reader = service.createReportReader(() => settings, { readDocument: async url => {
    active++; maxActive = Math.max(active, maxActive); await new Promise(resolve => setTimeout(resolve, 5)); active--;
    if (url === daily && failDaily) throw Object.assign(new Error("日报未登录"), { status: 401 });
    if (url === weekly && failWeekly) throw denied(); return url === daily ? dailyText : weeklyText;
  } });
  const first = await reader({ withSources: true }); assert.equal(maxActive, 2);
  failWeekly = true;
  const partial = await reader({ refresh: true, withSources: true }); assert.equal(partial.reports.length, 1); assert.equal(partial.sources[1].status, 403);
  await assert.rejects(reader(), { status: 403 });
  assert.equal((await reader({ id: first.reports[0].id })).kind, "日报");
  await assert.rejects(reader({ id: first.reports[1].id }), { status: 403 });
  failWeekly = false; assert.equal((await reader({ withSources: true })).reports.length, 2);
  failDaily = true;
  const reverse = await reader({ refresh: true, withSources: true }); assert.equal(reverse.sources[0].status, 401); assert.equal(reverse.reports[0].kind, "周报");
  failWeekly = true;
  await assert.rejects(reader({ refresh: true, withSources: true }), e => e.status === 401 && e.sources.length === 2);
});

test("角色无匹配为失败并显示前五个标题；空文档可成功为空", async () => {
  const text = Array.from({ length: 7 }, (_, i) => `## 无效标题${i}\n正文`).join("\n");
  const reader = service.createReportReader(() => ({ report_doc_url: daily, weekly_doc_url: weekly }), { readDocument: async url => url === daily ? dailyText : text });
  const result = await reader({ withSources: true });
  assert.equal(result.sources[1].ok, false); assert.equal(result.sources[1].unrecognized.length, 7);
  assert.match(result.sources[1].error, /未识别到周报标题/); assert.match(result.sources[1].error, /无效标题4/); assert.doesNotMatch(result.sources[1].error, /无效标题5/);
  const empty = service.createReportReader(() => daily, { readDocument: async () => "" }); assert.deepEqual(await empty(), []);
});

test("迟到的无效标题响应不能清除新缓存；失败预览不影响已成功缓存", async () => {
  const pending = [];
  const reader = service.createReportReader(() => daily, { readDocument: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) });
  const old = reader(); const oldFailure = assert.rejects(old, { status: 502 });
  const fresh = reader({ refresh: true });
  pending[1].resolve(dailyText); const expected = await fresh;
  pending[0].resolve("## 第9周 2026.9（2026.02.30 - 03.02）\n无效正文"); await oldFailure;
  assert.deepEqual(await reader(), expected); assert.equal(pending.length, 2);
  const preview = reader.preview({ role: "weekly", url: weekly });
  pending[2].reject(denied()); await assert.rejects(preview, { status: 403 });
  assert.deepEqual(await reader(), expected); assert.equal(pending.length, 3);
});

test("周报 ID 与链接、正文无关；同日先日报、同标题按出现顺序；重复 ID 拒绝", async () => {
  let settings = { report_doc_url: daily, weekly_doc_url: weekly }, text = "## 周报 2026-10-13\n甲\n## 周报 2026-10-13\n乙";
  const reader = service.createReportReader(() => settings, { readDocument: async url => url === daily ? dailyText : text });
  const first = await reader(); assert.deepEqual(first.map(r => r.kind), ["日报", "周报", "周报"]);
  assert.equal(first[1].id, "w-" + parser.parseReports(text)[0].id);
  text = text.replace("甲", "更新"); settings.weekly_doc_url = weekly + "2";
  assert.deepEqual((await reader()).map(r => r.id), first.map(r => r.id));
  text = "## 周报 2026-10-20\n新篇\n" + text;
  const added = await reader({ refresh: true });
  assert.deepEqual(added.slice(1).map(r => r.id), first.map(r => r.id));
  const row = first[0]; assert.throws(() => service.mergeReports([[row], [row]]), { status: 500, message: "日报周报编号冲突" });
});

async function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, "weekly-")), db = openDb(dir);
  const handlers = routes(db, { readDocument: async url => { if (url.endsWith("Denied")) throw denied(); return url === daily ? dailyText : weeklyText; } });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost"), found = match(handlers, req.method, url.pathname);
    if (!found) return json(res, 404, { error: "接口不存在" });
    await found.handler(req, res, { params: found.params, url });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { db, request: (endpoint, method = "GET", body) => fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }) };
}

test("隔离 HTTP：周报保存严格校验/清空，日报保存旧规则不变，预览只读", async t => {
  const { db, request } = await setup(t);
  const save = async (key, value) => {
    const preview = await request(`/api/settings/${key}/preview`, "POST", { value });
    assert.equal(preview.status, 200);
    const { previewId } = await preview.json();
    return request(`/api/settings/${key}`, "PUT", { previewId, confirm: true });
  };
  saveSetting(db, "report_doc_url", daily); const baseline = getSettings(db);
  let response = await request("/api/reports/source-preview", "POST", { role: "weekly", url: weekly });
  assert.equal(response.status, 200); let body = await response.json(); assert.equal(body.count, 1); assert.equal(body.latest.date, "2026-10-05"); assert.deepEqual(getSettings(db), baseline);
  response = await request("/api/reports/source-preview", "POST", { role: "weekly", url: daily + "/?x=1" });
  assert.equal(response.status, 200); assert.equal((await response.json()).sameAsDaily, true);
  for (const url of [weekly + "Denied", "http://team.feishu.cn/docx/x", "https://evil.com/docx/x"]) {
    assert.ok((await request("/api/reports/source-preview", "POST", { role: "weekly", url })).status >= 400);
    assert.deepEqual(getSettings(db), baseline);
  }
  for (const value of ["https://feishu.cn/base/x", "https://user@feishu.cn/docx/x", "https://feishu.cn:443/docx/x", "https://feishu.cn:444/docx/x", " " + weekly, weekly + " ", " ", null]) {
    assert.equal((await request("/api/settings/weekly_doc_url/preview", "POST", { value })).status, 400);
  }
  assert.equal((await save("weekly_doc_url", weekly)).status, 200);
  response = await save("weekly_doc_url", ""); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { key: "weekly_doc_url", value: "" }); assert.deepEqual(getSettings(db), baseline);
  assert.equal((await save("report_doc_url", "https://feishu.cn/base/x")).status, 200);
  assert.equal((await request("/api/settings/report_doc_url/preview", "POST", { value: "" })).status, 400);
});

test("隔离 HTTP：新旧列表、失败来源详情、全部失败 sources 与预览参数校验", async t => {
  const { db, request } = await setup(t);
  saveSetting(db, "report_doc_url", daily); saveSetting(db, "weekly_doc_url", weekly);
  const full = await (await request("/api/reports?withSources=1")).json(); assert.equal(full.sources.length, 2);
  saveSetting(db, "weekly_doc_url", weekly + "Denied");
  let response = await request("/api/reports?withSources=1"); assert.equal(response.status, 200); assert.equal((await response.json()).sources[1].ok, false);
  assert.equal((await request("/api/reports")).status, 403);
  assert.equal((await request("/api/reports/" + full.reports[1].id)).status, 403);
  assert.equal((await request("/api/reports/" + full.reports[0].id)).status, 200);
  saveSetting(db, "report_doc_url", daily + "Denied");
  response = await request("/api/reports?withSources=1"); assert.equal(response.status, 403); assert.equal((await response.json()).sources.length, 2);
  for (const body of [{ role: "bad", url: daily }, { role: "daily", url: 42 }, null]) assert.equal((await request("/api/reports/source-preview", "POST", body)).status, 400);
});
