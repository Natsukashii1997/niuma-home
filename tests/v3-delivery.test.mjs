import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb, saveSetting } from '../server/db.mjs';
import { getRecord, putRecord, fingerprint } from '../server/local-records.mjs';
import { deliveryRoutes, deliveryView } from '../server/routes/delivery.mjs';
import { generatedBrief } from '../server/briefs.mjs';
import { match } from '../server/http.mjs';
import { saveSnapshot } from '../server/v3-common.mjs';
import { NAS_DEFAULT_ROOT } from '../server/nas-materials.mjs';

function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '必须使用隔离数据');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'delivery-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}
const step = (view, key) => view.steps.find(s => s.key === key);
const matrix = () => ({ sku: 'uni-lite', line: '大学辅导', name: '灵活学Lite', unitOrig: 990, tiers: [5], schemes: [{ id: 'official', name: '已核对价格', kind: '常规', status: '生效中', from: '2026-11-01', to: '2026-11-30', prices: [6000], gifts: [0] }] });

test('交付月接口返回四环节（主线需求已去掉，方案录入由前端补），方案录入不重复；未配置不伪装done，未扫描NAS时物料为todo', async t => {
  const db = setup(t);
  const routes = deliveryRoutes(db);
  const found = match(routes, 'GET', '/api/v3/months/2026-11');
  let result, status;
  await found.handler({}, { writeHead: s => status = s, end: body => result = JSON.parse(body) }, { params: found.params });
  assert.equal(status, 200);
  assert.deepEqual(result.steps.map(s => s.key), ['prices', 'materials', 'brief', 'campaign']);
  assert.equal(result.campaign, null); assert.ok(result.steps.every(s => s.state !== 'done')); assert.equal(step(result, 'materials').state, 'todo'); assert.equal(step(result, 'materials').meta, '尚未扫描 NAS');
  const invalid = match(routes, 'GET', '/api/v3/months/2026-13');
  await invalid.handler({}, { writeHead: s => status = s, end: body => result = JSON.parse(body) }, { params: invalid.params });
  assert.equal(status, 400);
});

test('价格完成按当月正式有效已存方案判定，演示成本、草稿、过期不算done；低于底线只在说明里标出，不挡完成（#72）', t => {
  const db = setup(t), value = matrix();
  putRecord(db, 'price-schemes', 'uni-lite', value);
  assert.equal(step(deliveryView(db, '2026-11'), 'prices').state, 'part');
  saveSetting(db, 'price_floor_margin', '.25'); saveSetting(db, 'price_cost_per_hour', '440');
  assert.equal(step(deliveryView(db, '2026-11'), 'prices').state, 'done');
  assert.equal(step(deliveryView(db, '2026-12'), 'prices').state, 'todo');
  value.origin = 'demo'; putRecord(db, 'price-schemes', 'uni-lite', value); assert.equal(step(deliveryView(db, '2026-11'), 'prices').state, 'todo'); delete value.origin;
  value.schemes[0].status = '草稿'; putRecord(db, 'price-schemes', 'uni-lite', value); assert.equal(step(deliveryView(db, '2026-11'), 'prices').state, 'part');
  // 破底线原因 2026-10-21 已从价格方案里移除（保存时会被清掉），交付判定不能再等它。
  value.schemes[0].status = '生效中'; value.schemes[0].gifts = [10]; putRecord(db, 'price-schemes', 'uni-lite', value);
  const breach = step(deliveryView(db, '2026-11'), 'prices');
  assert.equal(breach.state, 'done'); assert.match(breach.meta, /1 套低于毛利底线/); assert.doesNotMatch(breach.meta, /待复核/);
});

test('活动价格不再要求关联需求（保存时该字段已被清掉）；结构不完整仍不计完成（#72）', t => {
  const db = setup(t), value = matrix(); saveSetting(db, 'price_floor_margin', '.25'); saveSetting(db, 'price_cost_per_hour', '440');
  value.schemes[0].kind = '活动'; putRecord(db, 'price-schemes', 'uni-lite', value);
  const view = step(deliveryView(db, '2026-11'), 'prices');
  assert.equal(view.state, 'done'); assert.doesNotMatch(view.meta, /低于毛利底线|待复核/);
  value.schemes[0].gifts = []; putRecord(db, 'price-schemes', 'uni-lite', value);
  const broken = step(deliveryView(db, '2026-11'), 'prices');
  assert.equal(broken.state, 'part'); assert.match(broken.meta, /1 套待复核/);
});

test('物料交付只读NAS快照：固定物料齐即done，活动海报只计数，缺月与换根目录不误报', t => {
  const db = setup(t), items = n => Array.from({ length: n }, (_, i) => ({ id: `x${i}` }));
  const nas = (cells, months = ['2026-11'], root = NAS_DEFAULT_ROOT) => saveSnapshot(db, 'nas', { root, scannedAt: Date.parse('2026-10-23T10:27:00+08:00'), months, lines: {
    大学辅导: { cells: Object.fromEntries(Object.entries(cells.uni || {}).map(([k, n]) => [`2026-11|${k}`, items(n)])) },
    国际课程: { cells: Object.fromEntries(Object.entries(cells.intl || {}).map(([k, n]) => [`2026-11|${k}`, items(n)])) },
  } }, new Date().toISOString());
  const m = () => step(deliveryView(db, '2026-11'), 'materials');
  nas({}, ['2026-10']); assert.deepEqual([m().state, m().meta, m().note], ['todo', 'NAS 暂无 11 月物料', '按 NAS 扫描 10-23 10:27']);
  nas({ uni: { 价格图: 1 }, intl: { 活动海报: 2 } }); assert.equal(m().state, 'part'); assert.equal(m().meta, '固定物料 1/4 · 活动海报 2 张');
  assert.equal(m().note, '缺 大学辅导选课指导、大学辅导试听海报、国际课程价格图 · 按 NAS 扫描 10-23 10:27');
  nas({ uni: { 价格图: 1, 选课指导: 1, 试听海报: 1 }, intl: { 价格图: 1 } }); assert.equal(m().state, 'done'); assert.equal(m().meta, '固定物料 4/4 · 活动海报 0 张');
  nas({ uni: { 活动海报: 3 } }); assert.equal(m().state, 'todo');
  nas({ uni: { 价格图: 1, 选课指导: 1, 试听海报: 1 }, intl: { 价格图: 1 } }, ['2026-11'], '/Volumes/别的目录'); assert.equal(m().meta, '尚未扫描 NAS');
  saveSetting(db, 'nas_root', '/Volumes/别的目录'); assert.equal(m().state, 'done');
});

test('brief只有实际保存且七节完成、来源指纹未变才算done', t => {
  const db = setup(t), month = '2026-11';
  assert.equal(step(deliveryView(db, month), 'brief').state, 'todo');
  const stored = { overrides: { status: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(n => [n, 'done'])) }, revision: 1, editedAt: '2026-10-16 14:00', sourceFingerprint: fingerprint(generatedBrief(db, month)) };
  putRecord(db, 'brief', month, stored); assert.equal(step(deliveryView(db, month), 'brief').state, 'done');
  putRecord(db, 'user-strategy', month, {month,summary:{judgement:'策略更新'}}); assert.equal(step(deliveryView(db, month), 'brief').state, 'part'); assert.match(step(deliveryView(db, month), 'brief').meta, /来源已变化/);
  stored.sourceFingerprint = fingerprint(generatedBrief(db, month)); stored.overrides.status[7] = 'part'; putRecord(db, 'brief', month, stored); assert.equal(step(deliveryView(db, month), 'brief').state, 'part');
});

test('战役模板不计实例，月份必须匹配，含子节点真实完成后才算done', t => {
  const db = setup(t);
  putRecord(db, 'marketing-source', 'campaign-template', { rows: [{ done: true }] }); assert.equal(step(deliveryView(db, '2026-11'), 'campaign').state, 'todo');
  const value = { id: 'actual1', name: '已确认战役', start: '2026-10-01', end: '2026-11-30', months: ['2026-10', '2026-11'], phases: [{ name: '计划', nodes: [{ n: 10, done: true, kids: [['普通子项', false]] }] }] };
  putRecord(db, 'campaign', 'current', value);
  let view = deliveryView(db, '2026-11'); assert.equal(view.campaign.name, '已确认战役'); assert.equal(step(view, 'campaign').state, 'part'); assert.equal(step(view, 'campaign').meta, '1/2 节点完成');
  value.phases[0].nodes[0].kids[0][1] = true; putRecord(db, 'campaign', 'current', value); assert.equal(step(deliveryView(db, '2026-11'), 'campaign').state, 'done');
  assert.equal(deliveryView(db, '2026-12').campaign, null);
  value.origin = 'demo'; putRecord(db, 'campaign', 'current', value); assert.equal(deliveryView(db, '2026-11').campaign, null);
  assert.equal(getRecord(db, 'campaign', 'current').origin, 'demo');
});
