import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { createConfiguredReader, createProjectService } from '../server/projects.mjs';
import { createReportReader } from '../server/reports.mjs';

const turn = () => new Promise(resolve => setImmediate(resolve));
function database(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'audit-cache-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); }); return db;
}

test('过期快照明确标记更新/失败，失败冷却不重复读取，恢复后清除旧状态', async t => {
  const db = database(t), events = []; let at = 1000, calls = 0, reject, value = 1;
  const read = createConfiguredReader(db, 'audit', () => ({ url: 'same' }), async () => {
    calls++; if (calls === 2) await new Promise((_, no) => { reject = no; }); return { value };
  }, { now: () => at, ttl: 10, staleWhileRevalidate: true, withStatus: true, onSource: e => events.push(e) });
  assert.equal((await read()).stale, false);
  at += 11; const stale = await read(); assert.equal(stale.value, 1); assert.equal(stale.refreshing, true); assert.equal(stale.stale, true);
  reject(new Error('offline')); await turn();
  for (let i = 0; i < 3; i++) { const old = await read(); assert.equal(old.value, 1); assert.equal(old.refreshing, false); assert.equal(old.sourceError, 'offline'); }
  assert.equal(calls, 2); assert.equal(events.length, 2); assert.equal(events[1].at, undefined);
  value = 2; const fresh = await read({ refresh: true }); assert.equal(fresh.value, 2); assert.equal(fresh.sourceError, ''); assert.equal(fresh.stale, false);
});

test('读取来源变化不能复用另一来源旧快照', async t => {
  const db = database(t); let source = 'old';
  const read = createConfiguredReader(db, 'audit-source', () => ({ source }), async cfg => {
    if (cfg.source === 'new') throw new Error('new unavailable'); return { from: cfg.source };
  }, { staleWhileRevalidate: true, withStatus: true });
  await read(); source = 'new'; await assert.rejects(read(), /new unavailable/);
});

test('日报后台失败即时报告来源错误、保留旧内容，轮询遵守冷却且成功后可读新结果', async () => {
  let at = 1000, calls = 0, reject, version = 1; const events = [];
  const read = createReportReader(() => 'https://example.feishu.cn/docx/source', { now: () => at, staleWhileRevalidate: true, onSource: e => events.push(e), readDocument: async () => {
    calls++; if (calls === 2) await new Promise((_, no) => { reject = no; }); return `## 日报 2026-10-2${version}\n第${version}版`;
  } });
  const first = await read({ withSources: true }); assert.equal(first.sources[0].ok, true);
  at += 600001; const stale = await read({ withSources: true }); assert.equal(stale.sources[0].refreshing, true); assert.equal(events.length, 1);
  reject(Object.assign(new Error('offline'), { status: 503 })); await turn();
  assert.equal(events.at(-1).ok, false); assert.equal(events.at(-1).fetchedAt, undefined);
  for (let i = 0; i < 3; i++) {
    const back = await read({ withSources: true }); assert.equal(back.sources[0].ok, false); assert.equal(back.sources[0].retained, true); assert.equal(back.sources[0].refreshing, false); assert.deepEqual(back.reports, first.reports);
  }
  assert.equal(calls, 2); await assert.rejects(read(), { status: 503 });
  version = 2; const recovered = await read({ refresh: true, withSources: true }); assert.equal(recovered.sources[0].ok, true); assert.equal(recovered.sources[0].stale, false); assert.match(recovered.reports[0].body, /第2版/);
});

test('日报后台返回无效标题不覆盖完整内容，快速完成后台更新也能回到新结果', async () => {
  let at = 1000, invalid = false, version = 1;
  const read = createReportReader(() => 'https://example.feishu.cn/docx/source', { now: () => at, staleWhileRevalidate: true, readDocument: async () => invalid ? '无日期标题的非空内容' : `## 日报 2026-10-2${version}\n第${version}版` });
  const first = await read({ withSources: true }); at += 600001; invalid = true;
  await read({ withSources: true }); await turn(); const failed = await read({ withSources: true });
  assert.equal(failed.sources[0].ok, false); assert.deepEqual(failed.reports, first.reports);
  invalid = false; version = 2; await read({ refresh: true, withSources: true });
  at += 600001; version = 3; await read({ withSources: true }); await turn();
  assert.match((await read({ withSources: true })).reports[0].body, /第3版/);
});

test('复制项目只带结构，父子节点历史日期、逾期和交付物均清空，原项目不变', async t => {
  const db = database(t), source = { people: [], projects: [{ id: 'p', '项目名称': '原项目' }], nodes: ['a', 'b'].map((id, i) => ({
    id, '所属项目': [{ id: 'p' }], '任务事项': `任务${i}`, '父记录': i ? [{ id: 'a' }] : [], '节点类型': ['里程碑'], '环节阶段': ['实施阶段'],
    '是否完成': true, '开始时间': '2026-07-01', '截止时间': '2026-07-02', '实际完成时间': '2026-07-03', '逾期状态': '已逾期', '交付物': '[旧资料](https://example.com/old)',
  })) };
  const service = createProjectService(db, { readSource: async () => source });
  const before = await service.list(), preview = await service.createPreview({ name: '新项目', basedOn: 'p' });
  for (const n of [preview.value.nodes[0], ...preview.value.nodes[0].childNodes]) {
    assert.equal(n.done, false); assert.equal(n.milestone, true);
    for (const key of ['startDate', 'doneDate', 'dueDate', 'due', 'overdue']) assert.equal(n[key], '');
    assert.deepEqual(n.deliverables, []);
  }
  assert.deepEqual(await service.list(), before);
  service.createConfirm({ previewId: preview.previewId, confirm: true });
  assert.deepEqual((await service.list())[0], before[0]);
});
