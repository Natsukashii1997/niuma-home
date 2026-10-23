import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryOf, pageInfo, sourceItem } from "../src/modules/statusbar/page-info.js";

const now = new Date(2026, 9, 18, 22, 27);
const ok = (at) => ({ state: "ok", at });
const data = { sources: { daily: ok("2026-10-18 22:16"), weekly: ok("2026-10-18 22:16"), timeline: ok("2026-10-18 22:14"), kb: ok("2026-10-18 22:15"), nas: { state: "off" }, voice: { state: "off" } } };
const text = (info) => info.segments.map((seg) => seg.map((p) => (typeof p === "string" ? p : p.hot)).join("")).join(" | ");

test("交付截止：交付月前一个月最后一天", () => {
  assert.deepEqual(deliveryOf(now), { month: "2026-11", label: "11 月", deadline: "10-31", days: 13 });
  assert.equal(deliveryOf(new Date(2026, 11, 5)).deadline, "12-31");
});

test("首页：全部来源汇总 + 交付倒数", () => {
  const info = pageInfo("home", { data, now });
  assert.equal(info.tone, "ok");
  assert.equal(text(info), "4/4 个来源正常 · 最近 22:16 | 交付 11 月 · 截止 10-31 · 剩 13 天");
  assert.deepEqual(info.keys, []);
});

test("没有专属来源的页面退回首页那套", () => {
  for (const page of ["brand", "business", "projects", "assistants", "settings"]) assert.equal(text(pageInfo(page, { data, now })), text(pageInfo("home", { data, now })));
});

test("用户页：时间线同步时间 + 异常数（数字高亮）", () => {
  const info = pageInfo("user", { data, now, todos: [{ kind: "时间线", text: "330 条异常待确认" }] });
  assert.equal(info.tone, "ok");
  assert.equal(text(info), "时间线 22:14 同步 | 330 条AI推测");
  assert.deepEqual(info.segments[1][0], { hot: "330" });
  assert.equal(text(pageInfo("user", { data, now })), "时间线 22:14 同步");
});

test("知识库页：同步时间 + 本页快捷键", () => {
  const info = pageInfo("kb", { data, now });
  assert.equal(text(info), "知识库 22:15 同步 | 只建快捷方式，不动原文");
  assert.deepEqual(info.keys.map(([k]) => k), ["拖动", "悬停层名"], "只列书柜里真能用的操作");
});

test("日/周报、营销、Voice", () => {
  assert.equal(text(pageInfo("reports", { data, now })), "日报 22:16 · 周报 22:16 同步");
  assert.equal(text(pageInfo("marketing", { data, now })), "交付 11 月 · 截止 10-31 · 剩 13 天");
  assert.equal(pageInfo("marketing", { data, now: new Date(2026, 9, 29) }).tone, "warn");
  const voice = pageInfo("voice", { data, now });
  assert.equal(voice.tone, "off");
  assert.equal(text(voice), "Voice 未接入");
  const used = pageInfo("voice", { data: { sources: { voice: { state: "ok", at: "2026-10-18 20:00", used: 8.5, limit: 10 } } }, now });
  assert.equal(used.tone, "warn");
  assert.equal(text(used), "Voice 本月 ¥8.50 / 10");
});

test("失败、太久没同步、接口读取失败", () => {
  const failed = { sources: { ...data.sources, kb: { state: "error", at: "2026-10-17 09:00", error: "飞书 403" } } };
  const kb = pageInfo("kb", { data: failed, now });
  assert.equal(kb.tone, "warn");
  assert.match(text(kb), /^知识库 失败 · 上次 10-17 09:00/);
  assert.match(kb.title, /飞书 403/);
  const home = pageInfo("home", { data: failed, now });
  assert.equal(home.tone, "warn");
  assert.match(text(home), /^1 个来源异常：知识库/);

  const stale = sourceItem("时间线", ok("2026-10-08 10:00"), { stale: true, now });
  assert.equal(stale.tone, "warn");
  assert.equal(stale.value, "10-08 10:00 · 10 天没同步");

  assert.deepEqual(pageInfo("home", { error: "HTTP 500", now }), { tone: "warn", segments: [["状态读取失败"]], title: "HTTP 500", keys: [] });
  assert.equal(pageInfo("home", { now }).tone, "off");
  assert.equal(text(pageInfo("home", { data: { sources: {} }, now })).split(" | ")[0], "数据源都还没读取");
});
