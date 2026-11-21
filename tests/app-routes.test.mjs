import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { match, unmatched } from '../server/http.mjs';
import { appRoutes } from '../server/app-routes.mjs';

// 路由按注册顺序取第一个匹配（http.mjs 的 match）。这里用完整路由表查两件事：没有重复注册；每条路由用自己的样例路径都能命中自己，
// 即没有被排在前面的路由抢走（L-20 那类问题，#74）。新增路由组后不用改这个测试。
test('完整路由表：没有重复的「方法 + 路径」，每条路由都能命中自己', t => {
  assert.ok(process.env.WORKDESK_DATA_DIR, '必须使用隔离数据');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'app-routes-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const all = appRoutes(db), keys = all.map(r => `${r.method} ${r.pattern}`);
  assert.ok(all.length > 150, `路由数异常：${all.length}`);
  assert.deepEqual(keys.filter((key, i) => keys.indexOf(key) !== i), [], '重复注册');
  const shadowed = all.filter(r => match(all, r.method, r.pattern.replace(/:(\w+)/g, 'x1'))?.handler !== r.handler).map(r => `${r.method} ${r.pattern}`);
  assert.deepEqual(shadowed, [], '被前面的路由抢走');
});

// #84（2026-11-20）需求推导与手写草稿两组接口下线；#88（2026-11-21）策略导出那组也下线。
test('完整路由表：下线的 12 条需求接口匹配不到并回 501', t => {
  assert.ok(process.env.WORKDESK_DATA_DIR, '必须使用隔离数据');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'app-routes-needs-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const all = appRoutes(db);
  const removed = [
    ['GET', '/api/v3/needs'], ['POST', '/api/v3/needs/n1/preview'], ['POST', '/api/v3/needs/n1/adopt'], ['PATCH', '/api/v3/needs/n1/strategy'],
    ['GET', '/api/v3/manual-needs'], ['POST', '/api/v3/manual-needs/preview'], ['POST', '/api/v3/manual-needs/m1/remove-preview'], ['POST', '/api/v3/manual-needs/confirm'],
    ['POST', '/api/v3/needs/n1/strategy/export-preview'], ['POST', '/api/v3/needs/n1/strategy/export'],
    ['GET', '/api/v3/needs/n1/strategy/exports/op1'], ['POST', '/api/v3/needs/n1/strategy/exports/op1/reconcile'],
  ];
  for (const [method, pathname] of removed) {
    assert.equal(match(all, method, pathname), null, `${method} ${pathname} 应已下线`);
    let status; unmatched(method, pathname)({}, { writeHead: code => { status = code; }, end() {} });
    assert.equal(status, 501, `${method} ${pathname} 走 v3 兜底`);
  }
});
