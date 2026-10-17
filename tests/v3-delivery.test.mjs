import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb, saveSetting } from '../server/db.mjs';
import { getRecord, putRecord, fingerprint } from '../server/local-records.mjs';
import { deliveryRoutes, deliveryView } from '../server/routes/delivery.mjs';
import { generatedBrief } from '../server/briefs.mjs';
import { match } from '../server/http.mjs';

function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '必须使用隔离数据');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'delivery-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}
const empty = { needs: [] };
const step = (view, key) => view.steps.find(s => s.key === key);
const matrix = () => ({ sku: 'uni-lite', line: '大学辅导', name: '灵活学Lite', unitOrig: 990, tiers: [5], schemes: [{ id: 'official', name: '已核对价格', kind: '常规', status: '生效中', from: '2026-11-01', to: '2026-11-30', prices: [6000], gifts: [0] }] });

test('交付月接口仍返回五环节，方案录入不重复；未配置不伪装done，NAS待接入', async t => {
  const db = setup(t), calls = [];
  const routes = deliveryRoutes({ list: async month => { calls.push(month); return empty; } }, db);
  const found = match(routes, 'GET', '/api/v3/months/2026-11');
  let result, status;
  await found.handler({}, { writeHead: s => status = s, end: body => result = JSON.parse(body) }, { params: found.params });
  assert.equal(status, 200); assert.deepEqual(calls, ['2026-11']);
  assert.deepEqual(result.steps.map(s => s.key), ['needs', 'prices', 'materials', 'brief', 'campaign']);
  assert.equal(result.campaign, null); assert.ok(result.steps.every(s => s.state !== 'done')); assert.equal(step(result, 'materials').state, 'pending');
  const invalid = match(routes, 'GET', '/api/v3/months/2026-13');
  await invalid.handler({}, { writeHead: s => status = s, end: body => result = JSON.parse(body) }, { params: invalid.params });
  assert.equal(status, 400); assert.equal(calls.length, 1);
});

test('价格完成按当月正式有效已存方案判定，演示成本、草稿、过期和破底线无原因不算done', t => {
  const db = setup(t), value = matrix();
  putRecord(db, 'price-schemes', 'uni-lite', value);
  assert.equal(step(deliveryView(db, '2026-11', empty), 'prices').state, 'part');
  saveSetting(db, 'price_floor_margin', '.25'); saveSetting(db, 'price_cost_per_hour', '440');
  assert.equal(step(deliveryView(db, '2026-11', empty), 'prices').state, 'done');
  assert.equal(step(deliveryView(db, '2026-12', empty), 'prices').state, 'todo');
  value.origin = 'demo'; putRecord(db, 'price-schemes', 'uni-lite', value); assert.equal(step(deliveryView(db, '2026-11', empty), 'prices').state, 'todo'); delete value.origin;
  value.schemes[0].status = '草稿'; putRecord(db, 'price-schemes', 'uni-lite', value); assert.equal(step(deliveryView(db, '2026-11', empty), 'prices').state, 'part');
  value.schemes[0].status = '生效中'; value.schemes[0].gifts = [10]; putRecord(db, 'price-schemes', 'uni-lite', value);
  assert.match(step(deliveryView(db, '2026-11', empty), 'prices').meta, /待复核/);
  value.schemes[0].breachReason = '专项补贴已核对'; putRecord(db, 'price-schemes', 'uni-lite', value); assert.equal(step(deliveryView(db, '2026-11', empty), 'prices').state, 'done');
});

test('活动价格关联需求失效、结构不完整不计完成；正常主线需求计算不变', t => {
  const db = setup(t), value = matrix(); saveSetting(db, 'price_floor_margin', '.25'); saveSetting(db, 'price_cost_per_hour', '440');
  value.schemes[0].kind = '活动'; value.schemes[0].needId = 'n1'; putRecord(db, 'price-schemes', 'uni-lite', value);
  const data = { needs: [{ id: 'n1', status: '已采纳' }] };
  let view = deliveryView(db, '2026-11', data); assert.equal(step(view, 'needs').state, 'done'); assert.equal(step(view, 'prices').state, 'done');
  data.needs[0].status = '待复核'; view = deliveryView(db, '2026-11', data); assert.equal(step(view, 'prices').state, 'part'); assert.match(step(view, 'needs').meta, /待复核/);
  data.needs[0].status = '已采纳'; value.schemes[0].gifts = []; putRecord(db, 'price-schemes', 'uni-lite', value); assert.equal(step(deliveryView(db, '2026-11', data), 'prices').state, 'part');
});

test('brief只有实际保存且七节完成、来源指纹未变才算done', t => {
  const db = setup(t), month = '2026-11';
  assert.equal(step(deliveryView(db, month, empty), 'brief').state, 'todo');
  const stored = { overrides: { status: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(n => [n, 'done'])) }, revision: 1, editedAt: '2026-10-16 14:00', sourceFingerprint: fingerprint(generatedBrief(db, month)) };
  putRecord(db, 'brief', month, stored); assert.equal(step(deliveryView(db, month, empty), 'brief').state, 'done');
  putRecord(db, 'price-schemes', 'uni-lite', matrix()); assert.equal(step(deliveryView(db, month, empty), 'brief').state, 'part'); assert.match(step(deliveryView(db, month, empty), 'brief').meta, /来源已变化/);
  stored.sourceFingerprint = fingerprint(generatedBrief(db, month)); stored.overrides.status[7] = 'part'; putRecord(db, 'brief', month, stored); assert.equal(step(deliveryView(db, month, empty), 'brief').state, 'part');
});

test('战役模板不计实例，月份必须匹配，含子节点真实完成后才算done', t => {
  const db = setup(t);
  putRecord(db, 'marketing-source', 'campaign-template', { rows: [{ done: true }] }); assert.equal(step(deliveryView(db, '2026-11', empty), 'campaign').state, 'todo');
  const value = { id: 'actual1', name: '已确认战役', start: '2026-10-01', end: '2026-11-30', months: ['2026-10', '2026-11'], phases: [{ name: '计划', nodes: [{ n: 10, done: true, kids: [['普通子项', false]] }] }] };
  putRecord(db, 'campaign', 'current', value);
  let view = deliveryView(db, '2026-11', empty); assert.equal(view.campaign.name, '已确认战役'); assert.equal(step(view, 'campaign').state, 'part'); assert.equal(step(view, 'campaign').meta, '1/2 节点完成');
  value.phases[0].nodes[0].kids[0][1] = true; putRecord(db, 'campaign', 'current', value); assert.equal(step(deliveryView(db, '2026-11', empty), 'campaign').state, 'done');
  assert.equal(deliveryView(db, '2026-12', empty).campaign, null);
  value.origin = 'demo'; putRecord(db, 'campaign', 'current', value); assert.equal(deliveryView(db, '2026-11', empty).campaign, null);
  assert.equal(getRecord(db, 'campaign', 'current').origin, 'demo');
});
