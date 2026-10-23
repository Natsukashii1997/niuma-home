import { test } from "node:test";
import assert from "node:assert/strict";
import { createReportReader } from "../server/reports.mjs";

// 日/周报解析结果落库（2026-10-23 审核第 3 条）：persist.load / save 由路由层接到 v3_snapshots。
// 新实例（相当于服务重启）先回存下的结果；超过十分钟才后台重读；没有快照时照旧现读。

const link = "https://example.feishu.cn/docx/test";
const doc = (n) => `## 日报 2026-10-1${n}\n正文${n}`;
const store = () => { const m = new Map(); return { m, load: (url) => m.get(url) || null, save: (url, r) => m.set(url, JSON.parse(JSON.stringify(r))) }; };

test("第一次读取后写快照；新实例直接回快照，不读文档", async () => {
  const persist = store();
  let calls = 0, version = 1, at = 1_000_000;
  const make = () => createReportReader(() => link, { now: () => at, staleWhileRevalidate: true, persist, readDocument: async () => { calls++; return doc(version); } });
  const first = await make()();
  assert.equal(calls, 1);
  assert.ok(persist.m.has(link), "已落快照");
  version = 2; at += 1000;
  const restarted = make();
  assert.deepEqual(await restarted(), first);
  assert.equal(calls, 1, "十分钟内不重读");
});

test("快照过期：先回旧结果并后台重读，读完换新并更新快照；refresh 仍现读", async () => {
  const persist = store();
  let calls = 0, version = 1, at = 1_000_000;
  const make = () => createReportReader(() => link, { now: () => at, staleWhileRevalidate: true, persist, readDocument: async () => { calls++; return doc(version); } });
  const first = await make()();
  version = 2; at += 600_001;
  const reader = make();
  assert.deepEqual(await reader(), first, "重启后过期的快照先回旧结果");
  assert.equal(calls, 2, "后台已发起重读");
  await new Promise((r) => setTimeout(r, 0));
  const fresh = await reader();
  assert.notDeepEqual(fresh, first);
  assert.equal(persist.m.get(link).reports[0].title, fresh[0].title, "快照跟着更新");
  version = 3;
  await reader({ refresh: true });
  assert.equal(calls, 3);
});

test("快照内容不合法时忽略，照旧现读", async () => {
  const persist = store();
  persist.m.set(link, { reports: "坏掉的", time: 1 });
  let calls = 0;
  const reader = createReportReader(() => link, { now: () => 5_000_000, staleWhileRevalidate: true, persist, readDocument: async () => { calls++; return doc(1); } });
  assert.equal((await reader()).length, 1);
  assert.equal(calls, 1);
});
