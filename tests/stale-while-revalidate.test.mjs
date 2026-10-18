import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../server/db.mjs";
import { createConfiguredReader } from "../server/projects.mjs";
import { createReportReader } from "../server/reports.mjs";

const link = "https://example.feishu.cn/docx/test";
const doc = (n) => `## 日报 2026-10-1${n}\n正文${n}`;

test("日报：过期后先返回旧结果、后台重读；手动刷新仍现读", async () => {
  let at = 0, calls = 0, version = 1, release;
  const reader = createReportReader(() => link, { now: () => at, staleWhileRevalidate: true, readDocument: async () => {
    calls++;
    if (calls === 2) await new Promise((resolve) => { release = resolve; });
    return doc(version);
  } });
  const first = await reader();
  assert.equal(calls, 1);
  at = 600_001; version = 2;
  assert.deepEqual(await reader(), first); // 过期：立刻返回旧结果
  assert.equal(calls, 2);
  assert.deepEqual(await reader(), first); // 后台还没读完：不重复发起
  assert.equal(calls, 2);
  release(); await new Promise((resolve) => setTimeout(resolve, 0));
  assert.notDeepEqual(await reader(), first); // 后台读完：换成新结果
  assert.equal(calls, 2);
  version = 3;
  await reader({ refresh: true });
  assert.equal(calls, 3);
});

test("通用读取器：服务重启后用存下的快照先显示，过期才后台重读", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "swr-"));
  const db = openDb(dir); t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  let at = Date.parse("2026-10-18T00:00:00Z"), calls = 0;
  const read = async () => { calls++; return { n: calls }; };
  const config = () => ({ spaceId: "1" });
  await createConfiguredReader(db, "kb-test", config, read, { now: () => at })();
  assert.equal(calls, 1);
  const again = createConfiguredReader(db, "kb-test", config, read, { now: () => at, staleWhileRevalidate: true });
  assert.deepEqual(await again(), { n: 1 }); // 新实例：直接用快照
  assert.equal(calls, 1);
  at += 300_001;
  assert.deepEqual(await again(), { n: 1 }); // 过期：先返回快照，后台重读
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 2);
  assert.deepEqual(await again(), { n: 2 });
  assert.deepEqual(await again({ refresh: true }), { n: 3 });
});
